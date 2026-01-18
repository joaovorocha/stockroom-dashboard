const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { LookerDataProcessor } = require('../utils/looker-data-processor');
const dal = require('../utils/dal');
const { query: pgQuery } = require('../utils/dal/pg');
const { get: getCache, set: setCache } = require('../src/utils/cache');
const { withTransaction } = require('../utils/transaction');

const DATA_DIR = dal.paths.dataDir;
const USERS_FILE = dal.paths.usersFile;
const EMPLOYEES_FILE = dal.paths.employeesFile;
const GAMEPLAN_DIR = dal.paths.gameplanDailyDir;
const METRICS_DIR = dal.paths.storeMetricsDir;
const PRODUCT_IMAGE_CACHE_FILE = dal.paths.productImagesCacheFile;
const SCAN_PERFORMANCE_HISTORY_DIR = dal.paths.scanPerformanceHistoryDir;
const WEEKLY_GOAL_DISTRIBUTIONS_FILE = dal.paths.weeklyGoalDistributionsFile;
const NOTES_TEMPLATES_FILE = dal.paths.notesTemplatesFile;
const GAMEPLAN_TEMPLATES_FILE = path.join(DATA_DIR, 'gameplan-templates.json');
const WORK_EXPENSES_CONFIG_FILE = path.join(DATA_DIR, 'work-expenses-config.json');

// Multer for file uploads
const multer = require('multer');
const upload = multer({ dest: path.join(DATA_DIR, 'tmp') });
// Optional Postgres pool (if DATABASE_URL present)
let pgPool = null;
try {
  const { Pool } = require('pg');
  const conn = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || null;
  if (conn) pgPool = new Pool({ connectionString: conn });
} catch (e) {
  pgPool = null;
}

// Initialize Looker data processor
const lookerProcessor = new LookerDataProcessor();

function readWorkExpensesConfig() {
  try {
    const cfg = dal.readJson(WORK_EXPENSES_CONFIG_FILE, null) || {};
    return {
      globalMonthlyLimit: Number.isFinite(Number(cfg.globalMonthlyLimit)) ? Number(cfg.globalMonthlyLimit) : null,
      globalYearlyLimit: Number.isFinite(Number(cfg.globalYearlyLimit)) ? Number(cfg.globalYearlyLimit) : 2500,
      overrides: cfg.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {}
    };
  } catch {
    return { globalMonthlyLimit: null, globalYearlyLimit: 2500, overrides: {} };
  }
}

function normalizeEmail(value) {
  return (value || '').toString().trim().toLowerCase();
}

function attachExpenseLimits(exp) {
  if (!exp || !Array.isArray(exp.employees)) return exp;

  const cfg = readWorkExpensesConfig();
  const overrides = cfg?.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {};

  const withLimits = exp.employees.map(e => {
    const email = normalizeEmail(e?.employee?.email);
    const override = email && overrides[email] ? overrides[email] : null;
    const monthlyLimit = override && Number.isFinite(Number(override.monthlyLimit))
      ? Number(override.monthlyLimit)
      : (cfg.globalMonthlyLimit ?? null);
    const yearlyLimit = override && Number.isFinite(Number(override.yearlyLimit))
      ? Number(override.yearlyLimit)
      : (cfg.globalYearlyLimit ?? 2500);

    const totals = e.totals || {};
    const monthRetail = Number(totals?.currentMonth?.fullPriceLc || 0);
    const yearRetail = Number(totals?.currentYear?.fullPriceLc || 0);
    const overMonthly = Number.isFinite(monthlyLimit) ? monthRetail > monthlyLimit : false;
    const overYearly = Number.isFinite(yearlyLimit) ? yearRetail > yearlyLimit : false;

    return {
      ...e,
      limits: { monthlyLimit, yearlyLimit },
      overLimit: { monthly: overMonthly, yearly: overYearly }
    };
  });

  return { ...exp, employees: withLimits };
}

function requireManager(req, res, next) {
  const user = req.user;
  if (user?.isManager || user?.isAdmin || user?.role === 'MANAGEMENT' || user?.canEditGameplan) return next();
  return res.status(403).json({ error: 'Manager access required' });
}

// Helper to get today's date string
function getTodayDate() {
  return dal.getBusinessDate();
}

function getYesterdayDate() {
  return dal.getYesterdayBusinessDate();
}

// GET /api/gameplan/today - Store-day date info (timezone + dayStart aware)
router.get('/today', (req, res) => {
  try {
    const info = dal.getBusinessDayInfo ? dal.getBusinessDayInfo() : { date: getTodayDate(), weekdayIndex: null };
    return res.json(info);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to compute store day' });
  }
});

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue = {}) {
  return dal.readJson(filePath, defaultValue);
}

// Helper to write JSON file
function writeJsonFile(filePath, data) {
  dal.writeJsonAtomic(filePath, data, { pretty: true });
}

function readWeeklyGoalDistributions() {
  return readJsonFile(WEEKLY_GOAL_DISTRIBUTIONS_FILE, { weeks: {} });
}

function writeWeeklyGoalDistributions(next) {
  writeJsonFile(WEEKLY_GOAL_DISTRIBUTIONS_FILE, next);
}

function readNotesTemplates() {
  return readJsonFile(NOTES_TEMPLATES_FILE, { byUser: {} });
}

function writeNotesTemplates(next) {
  writeJsonFile(NOTES_TEMPLATES_FILE, next);
}

function readGameplanTemplates() {
  return readJsonFile(GAMEPLAN_TEMPLATES_FILE, { byStore: {} });
}

function writeGameplanTemplates(next) {
  writeJsonFile(GAMEPLAN_TEMPLATES_FILE, next);
}

function normalizeTemplateName(value) {
  return (value || '').toString().trim().slice(0, 80);
}

function normalizeWeekdayIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0 || i > 6) return null;
  return i;
}

function newTemplateId() {
  return `gpt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeWeekKey(value) {
  return (value || '').toString().trim().replace(/[^0-9A-Za-z_-]/g, '').slice(0, 32);
}

function isValidProductCode(value) {
  return /^[A-Za-z0-9-]{2,32}$/.test((value || '').toString().trim());
}

function getProductImageCache() {
  return readJsonFile(PRODUCT_IMAGE_CACHE_FILE, { items: {} });
}

function setProductImageCache(cache) {
  writeJsonFile(PRODUCT_IMAGE_CACHE_FILE, { ...cache, updatedAt: new Date().toISOString() });
}

function getCachedProductImage(code) {
  const cache = getProductImageCache();
  const entry = cache?.items?.[code];
  if (!entry?.imageUrl) return null;

  // Keep cache entries for 30 days.
  const fetchedAt = entry.fetchedAt ? Date.parse(entry.fetchedAt) : 0;
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return entry.imageUrl;
  const ageMs = Date.now() - fetchedAt;
  const ttlMs = 30 * 24 * 60 * 60 * 1000;
  if (ageMs > ttlMs) return null;
  return entry.imageUrl;
}

function saveCachedProductImage(code, imageUrl) {
  const cache = getProductImageCache();
  if (!cache.items) cache.items = {};
  cache.items[code] = { imageUrl, fetchedAt: new Date().toISOString() };
  setProductImageCache(cache);
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'stockroom-dashboard/1.0 (+internal)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractImageFromSuitsDevHtml(html, codeLower) {
  if (!html) return null;
  const re = new RegExp(`src=\"(https:\\/\\/cdn\\.suitsupply\\.com\\/image\\/upload[^\\\"]*\\/${codeLower}_[^\\\"\\s>]*)\"`, 'i');
  const m = html.match(re);
  return m?.[1] || null;
}

function extractImageFromSuitSupplySearchHtml(html, codeUpper) {
  if (!html) return null;
  const re = new RegExp(
    `https:\\/\\/(?:cdn\\.suitsupply\\.com|a\\.suitsupplycdn\\.com)\\/image\\/upload[^\"'\\s>]*\\/${codeUpper}_[^\"'\\s>]*\\.jpg`,
    'i'
  );
  const m = html.match(re);
  return m?.[0] || null;
}

function safeReadDir(dirPath) {
  return dal.safeReadDir(dirPath);
}

function readLatestScanPerformanceSnapshot() {
  const files = safeReadDir(SCAN_PERFORMANCE_HISTORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (!files.length) return null;
  return readJsonFile(path.join(SCAN_PERFORMANCE_HISTORY_DIR, files[0]), null);
}

function normalizeScanPersonKey(emp) {
  const id = emp?.employeeId ? emp.employeeId.toString().trim() : '';
  const name = normalizeName(emp?.name);
  return id ? `id:${id}` : `name:${name}`;
}

function normalizeName(value) {
  return (value || '').toString().trim().toLowerCase();
}

async function fetchUsersFromDB() {
  try {
    const result = await pgQuery('SELECT id, employee_id, name, email, role, image_url, is_active FROM users WHERE is_active = true ORDER BY role, name');
    return result.rows.map(row => ({
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      email: row.email,
      role: row.role,
      imageUrl: row.image_url,
      isActive: row.is_active
    }));
  } catch (error) {
    console.error('[GAMEPLAN] Error fetching users from database:', error);
    return [];
  }
}

async function pruneEmployeesFile() {
  console.log('[GAMEPLAN] Reading employees from:', EMPLOYEES_FILE);
  const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });
  const empCounts = {
    SA: (employees.employees?.SA || []).length,
    BOH: (employees.employees?.BOH || []).length,
    MANAGEMENT: (employees.employees?.MANAGEMENT || []).length,
    TAILOR: (employees.employees?.TAILOR || []).length
  };
  console.log('[GAMEPLAN] Read from file - SA:', empCounts.SA, 'BOH:', empCounts.BOH, 'MGMT:', empCounts.MANAGEMENT, 'TAILOR:', empCounts.TAILOR);
  
  // Fetch users from PostgreSQL database instead of users.json
  const dbUsers = await fetchUsersFromDB();
  console.log('[GAMEPLAN] Fetched', dbUsers.length, 'users from database');
  const usersData = { users: dbUsers };
  
  const today = getTodayDate();
  // We want each new store day to start clean until a game plan is published for today.
  // This also avoids UTC/local mismatches from older versions.
  const todayGameplanFile = path.join(GAMEPLAN_DIR, `${today}.json`);
  const hasTodayGameplan = fs.existsSync(todayGameplanFile);
  const alreadyResetToday = (employees?.lastDailyResetForDate || '') === today;
  const shouldResetDailyAssignments = !hasTodayGameplan && !alreadyResetToday;

  const usersByEmployeeId = new Map();
  const usersByName = new Map();
  (usersData.users || []).forEach(u => {
    if (u.employeeId) usersByEmployeeId.set(u.employeeId.toString().trim(), u);
    if (u.name) usersByName.set(normalizeName(u.name), u);
  });
  console.log('[GAMEPLAN] Created maps: usersByEmployeeId size=', usersByEmployeeId.size, 'usersByName size=', usersByName.size);

  const roleToType = {
    SA: 'SA',
    BOH: 'BOH',
    MANAGEMENT: 'MANAGEMENT',
    TAILOR: 'TAILOR',
    ADMIN: 'MANAGEMENT'
  };

  const canonical = {
    SA: [],
    BOH: [],
    MANAGEMENT: [],
    TAILOR: []
  };

  const seenEmployeeIds = new Set();
  const dailyFieldsReset = {
    isOff: true,
    zones: [],
    zone: '',
    fittingRoom: '',
    scheduledLunch: '',
    closingSections: [],
    shift: '',
    lunch: '',
    taskOfTheDay: '',
    role: '',
    station: ''
  };

  // Start from existing employee records, but:
  // - drop employees that no longer exist in users.json
  // - re-group employees by the user's current role (prevents ADMIN showing under SA, etc.)
  let processedCount = 0;
  let skippedCount = 0;
  for (const bucket of Object.keys(employees.employees || {})) {
    const list = employees.employees[bucket] || [];
    console.log('[GAMEPLAN] Processing bucket', bucket, 'with', list.length, 'employees');
    for (const emp of list) {
      const employeeIdRaw = (emp?.employeeId || '').toString().trim();
      const employeeIdLower = employeeIdRaw.toLowerCase();
      const nameKey = normalizeName(emp?.name);

      // LEGACY SUPPORT: Clean up legacy placeholder users (ex: old "admin" login)
      if (employeeIdLower === 'admin' || nameKey === 'admin') continue;

      const user = (employeeIdRaw && usersByEmployeeId.get(employeeIdRaw)) || (nameKey && usersByName.get(nameKey)) || null;
      if (!user) {
        console.log('[GAMEPLAN] Skipping employee', emp.name, '(ID:', employeeIdRaw, ') - not found in DB');
        skippedCount++;
        continue;
      }
      processedCount++;

      const targetType = roleToType[(user.role || '').toString().toUpperCase()] || 'SA';
      const targetList = canonical[targetType] || canonical.SA;

      const canonicalEmployeeId = user.employeeId?.toString?.().trim?.() || employeeIdRaw;
      if (canonicalEmployeeId && seenEmployeeIds.has(canonicalEmployeeId)) continue;
      if (canonicalEmployeeId) seenEmployeeIds.add(canonicalEmployeeId);

      const base = shouldResetDailyAssignments ? { ...emp, ...dailyFieldsReset } : emp;
      targetList.push({
        ...base,
        employeeId: canonicalEmployeeId || emp.employeeId,
        name: user.name || emp.name,
        imageUrl: user.imageUrl || emp.imageUrl || '',
        type: targetType,
        zones: shouldResetDailyAssignments
          ? []
          : (Array.isArray(emp.zones)
            ? emp.zones.map(z => (z || '').toString().trim()).filter(Boolean)
            : ((emp.zone || '').toString().trim() ? [(emp.zone || '').toString().trim()] : []))
      });
    }
  }

  // If the employees file contained no processed entries but we have users from DB,
  // populate the canonical lists from the DB users so the UI can render immediately.
  if (processedCount === 0 && (dbUsers || []).length > 0) {
    console.log('[GAMEPLAN] employees file empty - populating from DB users');
    for (const user of dbUsers) {
      if (!user) continue;
      // Skip legacy admin placeholder
      const nameKey = normalizeName(user.name);
      if ((user.employee_id || '').toString().toLowerCase() === 'admin' || nameKey === 'admin') continue;
      const targetType = roleToType[(user.role || '').toString().toUpperCase()] || 'SA';
      const canonicalEmployeeId = user.employee_id ? user.employee_id.toString().trim() : `u:${user.id}`;
      const entry = {
        id: canonicalEmployeeId,
        employeeId: user.employee_id || canonicalEmployeeId,
        name: user.name || '',
        imageUrl: user.imageUrl || user.image_url || '',
        type: targetType,
        isOff: true,
        zones: []
      };
      canonical[targetType].push(entry);
    }

    const nextFromDb = { ...employees, employees: canonical };
    nextFromDb.lastUpdated = today;
    nextFromDb.lastPrunedAt = new Date().toISOString();
    nextFromDb.lastDailyResetAt = new Date().toISOString();
    nextFromDb.lastDailyResetForDate = today;
    nextFromDb.lastSyncedFromDB = new Date().toISOString();
    nextFromDb.syncedUserCount = dbUsers.length;
    
    // SECURITY PATCH: CRITICAL-03 - Atomic file write
    const tempFile = EMPLOYEES_FILE + '.tmp';
    writeJsonFile(tempFile, nextFromDb);
    fs.renameSync(tempFile, EMPLOYEES_FILE);
    
    return nextFromDb;
  }
  console.log('[GAMEPLAN] Processed', processedCount, 'employees, skipped', skippedCount);
  console.log('[GAMEPLAN] Canonical counts: SA=', canonical.SA.length, 'BOH=', canonical.BOH.length, 'MANAGEMENT=', canonical.MANAGEMENT.length, 'TAILOR=', canonical.TAILOR.length);

  const next = { ...employees, employees: canonical };
  if (shouldResetDailyAssignments) {
    next.lastUpdated = today;
    next.lastDailyResetAt = new Date().toISOString();
    next.lastDailyResetForDate = today;
  }
  const beforeStr = JSON.stringify(employees.employees || {});
  const afterStr = JSON.stringify(next.employees);
  if (beforeStr !== afterStr || shouldResetDailyAssignments) {
    next.lastPrunedAt = new Date().toISOString();
    
    // SECURITY PATCH: CRITICAL-03 - Atomic file write
    const tempFile = EMPLOYEES_FILE + '.tmp';
    writeJsonFile(tempFile, next);
    fs.renameSync(tempFile, EMPLOYEES_FILE);
    
    return next;
  }

  return employees;
}

function getLatestMetricsSnapshotBefore(dateStr) {
  try {
    if (!fs.existsSync(METRICS_DIR)) return null;
    const files = fs
      .readdirSync(METRICS_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    const target = `${dateStr}.json`;
    const eligible = files.filter(f => f < target);
    if (eligible.length === 0) return null;
    const latest = eligible[eligible.length - 1];
    return readJsonFile(path.join(METRICS_DIR, latest), null);
  } catch (e) {
    return null;
  }
}

function maybeBackfillLastWeekOverview(metrics) {
  const today = getTodayDate();
  const weekStart = metrics?.retailWeek?.weekStart;
  if (!weekStart || weekStart !== today) return metrics;

  const previous = getLatestMetricsSnapshotBefore(today);
  if (!previous) return metrics;

  const shouldBackfillWtd = metrics?.wtd?.salesAmount === 0 && (previous?.wtd?.salesAmount || 0) > 0;
  const shouldBackfillKpis =
    (!metrics?.metrics || Object.values(metrics.metrics).every(v => !v)) &&
    !!previous?.metrics;
  const shouldBackfillMix = !metrics?.lastWeekSales && !!previous?.lastWeekSales;

  if (!shouldBackfillWtd && !shouldBackfillKpis && !shouldBackfillMix) return metrics;

  return {
    ...metrics,
    wtd: shouldBackfillWtd ? previous.wtd : metrics.wtd,
    metrics: shouldBackfillKpis ? previous.metrics : metrics.metrics,
    lastWeekSales: shouldBackfillMix ? previous.lastWeekSales : metrics.lastWeekSales,
    lastWeekOverviewFromDate: previous?.date || null
  };
}

// GET /api/gameplan/employees - Get all employees
router.get('/employees', async (req, res) => {
  const employees = await pruneEmployeesFile();
  res.json(employees);
});

// GET /api/gameplan/employees/:type - Get employees by type
router.get('/employees/:type', async (req, res) => {
  const { type } = req.params;
  const employees = await pruneEmployeesFile();
  const typeEmployees = employees.employees[type.toUpperCase()] || [];
  res.json(typeEmployees);
});

// POST /api/gameplan/employees - Add or update employee
// SECURITY PATCH: CRITICAL-03 - Added atomic file write protection
router.post('/employees', requireManager, async (req, res) => {
  try {
    const employee = req.body;
    const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });

    if (!employee.id || !employee.type) {
      return res.status(400).json({ error: 'Employee ID and type are required' });
    }

    const type = employee.type.toUpperCase();
    if (!employees.employees[type]) {
      employees.employees[type] = [];
    }

    const index = employees.employees[type].findIndex(e => e.id === employee.id);
    if (index >= 0) {
      employees.employees[type][index] = { ...employees.employees[type][index], ...employee };
    } else {
      employees.employees[type].push(employee);
    }

    employees.lastUpdated = getTodayDate();
    
    // Write file atomically - create temp file, then rename
    const tempFile = EMPLOYEES_FILE + '.tmp';
    writeJsonFile(tempFile, employees);
    fs.renameSync(tempFile, EMPLOYEES_FILE);
    
    res.json({ success: true, employee });
  } catch (error) {
    console.error('[GAMEPLAN] Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// GET /api/gameplan/today - Get today's gameplan
router.get('/today', (req, res) => {
  const today = getTodayDate();
  const gameplanFile = path.join(GAMEPLAN_DIR, `${today}.json`);
  let gameplan = readJsonFile(gameplanFile, null);
  
  // If no gameplan for today, try to inherit closing sections from yesterday
  if (!gameplan) {
    gameplan = { date: today, notes: '', assignments: {} };
    
    const yesterdayStr = getYesterdayDate();
    const yesterdayFile = path.join(GAMEPLAN_DIR, `${yesterdayStr}.json`);
    const yesterdayPlan = readJsonFile(yesterdayFile, null);
    
    // Inherit closing sections assignments from yesterday
    if (yesterdayPlan && yesterdayPlan.assignments) {
      Object.keys(yesterdayPlan.assignments).forEach(empId => {
        const yesterdayAssignment = yesterdayPlan.assignments[empId];
        if (yesterdayAssignment.closingSections && yesterdayAssignment.closingSections.length > 0) {
          gameplan.assignments[empId] = {
            closingSections: yesterdayAssignment.closingSections
          };
        }
      });
      gameplan.inheritedFromDate = yesterdayStr;
    }
  }
  
  res.json(gameplan);
});

// GET /api/gameplan/yesterday - Get yesterday's gameplan for copy feature
router.get('/yesterday', (req, res) => {
  const yesterdayStr = getYesterdayDate();
  
  const gameplanFile = path.join(GAMEPLAN_DIR, `${yesterdayStr}.json`);
  const gameplan = readJsonFile(gameplanFile, null);
  
  if (!gameplan) {
    return res.status(404).json({ error: 'No gameplan found for yesterday' });
  }
  
  // Transform assignments into employees array format for client-side use
  const employees = [];
  const employeesData = readJsonFile(EMPLOYEES_FILE, { employees: {} });
  
  if (gameplan.assignments) {
    Object.keys(gameplan.assignments).forEach(empId => {
      const assignment = gameplan.assignments[empId];
      
      // Find the employee to get their type
      let empType = assignment.type;
      if (!empType) {
        for (const type of Object.keys(employeesData.employees || {})) {
          const found = (employeesData.employees[type] || []).find(e => e.id === empId);
          if (found) {
            empType = type;
            break;
          }
        }
      }
      
      employees.push({
        id: empId,
        type: empType,
        ...assignment
      });
    });
  }
  
  res.json({
    date: yesterdayStr,
    employees: employees,
    notes: gameplan.notes || ''
  });
});

// POST /api/gameplan/save - Save gameplan
router.post('/save', requireManager, (req, res) => {
  const gameplan = req.body;
  const today = gameplan.date || getTodayDate();
  const gameplanFile = path.join(GAMEPLAN_DIR, `${today}.json`);

  // Check if the gameplan is locked by another user
  const existingGameplan = readJsonFile(gameplanFile, null);
  if (existingGameplan && existingGameplan.locked && existingGameplan.lockedBy !== req.user?.name) {
    return res.status(409).json({
      error: 'Game plan is currently locked by another user',
      lockedBy: existingGameplan.lockedBy
    });
  }

  // LEGACY SUPPORT: Normalize assignments for backward compatibility:
  // - zones: array (employees can have 1+ zones)
  // - zone: keep first zone for legacy UIs
  // - fittingRoom: always single value
  if (gameplan.assignments && typeof gameplan.assignments === 'object') {
    Object.keys(gameplan.assignments).forEach(empId => {
      const assignment = gameplan.assignments[empId];
      if (!assignment || typeof assignment !== 'object') return;

      // isOff (boolean)
      if (assignment.isOff === 'true') assignment.isOff = true;
      if (assignment.isOff === 'false') assignment.isOff = false;

      // zones
      if (assignment.zones === undefined && assignment.zone !== undefined) {
        assignment.zones = assignment.zone ? [assignment.zone] : [];
      }
      if (assignment.zones !== undefined) {
        if (Array.isArray(assignment.zones)) {
          assignment.zones = assignment.zones.map(z => (z || '').toString().trim()).filter(Boolean);
        } else {
          const z = (assignment.zones || '').toString().trim();
          assignment.zones = z ? [z] : [];
        }
        assignment.zone = assignment.zones[0] || '';
      }

      // fittingRoom (single)
      if (Array.isArray(assignment.fittingRoom)) {
        assignment.fittingRoom = (assignment.fittingRoom[0] || '').toString().trim();
      } else if (assignment.fittingRoom !== undefined) {
        assignment.fittingRoom = (assignment.fittingRoom || '').toString().trim();
      }

      // closingSections (array)
      if (assignment.closingSections !== undefined && !Array.isArray(assignment.closingSections)) {
        const raw = (assignment.closingSections || '').toString();
        assignment.closingSections = raw
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
    });
  }

  gameplan.savedAt = new Date().toISOString();
  gameplan.lastEditedBy = req.user?.name || 'Unknown';

  // Handle publish/draft state
  if (req.body.publish === true) {
    gameplan.published = true;
    gameplan.publishedAt = new Date().toISOString();
    gameplan.publishedBy = req.user?.name || 'Unknown';
  } else if (req.body.publish === false) {
    gameplan.published = false;
  } else {
    // Default: if it's today, publish; if future, save as draft
    const isToday = today === getTodayDate();
    gameplan.published = isToday;
  }

  // Remove lock when saving
  gameplan.locked = false;
  gameplan.lockedBy = null;

  writeJsonFile(gameplanFile, gameplan);

  // Also update the main employees file with assignments
  if (gameplan.assignments) {
    const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });

    Object.keys(gameplan.assignments).forEach(id => {
      const assignment = gameplan.assignments[id];
      for (const type of Object.keys(employees.employees)) {
        // Use employeeId field since employees don't have 'id' field
        const index = employees.employees[type].findIndex(e => 
          e.employeeId === id || e.id === id
        );
        if (index >= 0) {
          // Update only daily assignment fields, not metrics
          const dailyFields = ['isOff', 'zones', 'zone', 'fittingRoom', 'scheduledLunch', 'closingSections',
                              'shift', 'lunch', 'taskOfTheDay', 'role', 'station'];
          dailyFields.forEach(field => {
            if (assignment[field] !== undefined) {
              employees.employees[type][index][field] = assignment[field];
            }
          });
          break;
        }
      }
    });

    employees.lastUpdated = getTodayDate();
    writeJsonFile(EMPLOYEES_FILE, employees);
  }

  // Broadcast real-time update to all connected clients
  const broadcastUpdate = req.app.get('broadcastUpdate');
  if (broadcastUpdate) {
    broadcastUpdate('gameplan_updated', {
      date: today,
      lastEditedBy: gameplan.lastEditedBy,
      lastEditedAt: gameplan.savedAt
    });
  }

  res.json({ success: true, date: today });
});

// POST /api/gameplan/lock/:date - Lock a gameplan for editing
router.post('/lock/:date', requireManager, (req, res) => {
  const { date } = req.params;
  const gameplanFile = path.join(GAMEPLAN_DIR, `${date}.json`);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const gameplan = readJsonFile(gameplanFile, {});

  // Check if already locked by someone else
  if (gameplan.locked && gameplan.lockedBy !== req.user?.name) {
    return res.status(409).json({
      error: 'Game plan is already locked by another user',
      lockedBy: gameplan.lockedBy
    });
  }

  // Lock the gameplan
  gameplan.locked = true;
  gameplan.lockedBy = req.user?.name || 'Unknown';
  gameplan.lockedAt = new Date().toISOString();

  writeJsonFile(gameplanFile, gameplan);

  res.json({ success: true, lockedBy: gameplan.lockedBy });
});

// POST /api/gameplan/unlock/:date - Unlock a gameplan
router.post('/unlock/:date', requireManager, (req, res) => {
  const { date } = req.params;
  const gameplanFile = path.join(GAMEPLAN_DIR, `${date}.json`);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const gameplan = readJsonFile(gameplanFile, {});

  // Check if locked by current user or allow force unlock for managers
  if (gameplan.locked && gameplan.lockedBy !== req.user?.name && !req.body.force) {
    return res.status(403).json({
      error: 'Cannot unlock game plan locked by another user'
    });
  }

  // Unlock the gameplan
  gameplan.locked = false;
  gameplan.lockedBy = null;
  gameplan.lockedAt = null;

  writeJsonFile(gameplanFile, gameplan);

  res.json({ success: true });
});

// GET /api/gameplan/date/:date - Get gameplan for a specific date
router.get('/date/:date', (req, res) => {
  const { date } = req.params;
  
  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }
  
  const gameplanFile = path.join(GAMEPLAN_DIR, `${date}.json`);
  const gameplan = readJsonFile(gameplanFile, null);
  
  if (!gameplan) {
    return res.status(404).json({ error: 'No gameplan found for this date' });
  }
  
  res.json(gameplan);
});

// POST /api/gameplan/import-shifts - upload a shift CSV and prepopulate future drafts
router.post('/import-shifts', requireManager, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const raw = fs.readFileSync(filePath, 'utf8');
    try { fs.unlinkSync(filePath); } catch(_) {}

    const rows = parseCsv(raw);
    if (!rows.length) return res.status(400).json({ error: 'CSV parse returned no rows' });

    // Determine date range: next N weeks (default 2)
    const weeks = Number.isFinite(Number(req.body.weeks)) ? Math.max(1, Math.floor(Number(req.body.weeks))) : 2;
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (weeks * 7) - 1);

    // Build map: dateStr -> array of row entries
    const map = {};
    rows.forEach(r => {
      const date = (r['Final Shift Date'] || r['Initial Shift Date'] || '').trim().replace(/\//g, '-');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (date < today.toISOString().split('T')[0] || date > endDate.toISOString().split('T')[0]) return;
      if (!map[date]) map[date] = [];
      map[date].push(r);
    });

    // Load canonical employees
    const employeesFile = readJsonFile(EMPLOYEES_FILE, { employees: {} });
    const allEmployees = [];
    Object.keys(employeesFile.employees || {}).forEach(t => {
      (employeesFile.employees[t] || []).forEach(e => allEmployees.push(e));
    });

    const results = { created: [], skipped: [] };

    for (const dateStr of Object.keys(map)) {
      const gameplanFile = path.join(GAMEPLAN_DIR, `${dateStr}.json`);
      let existing = readJsonFile(gameplanFile, null);

      // If already published and locked, skip
      if (existing && existing.published && existing.locked) {
        results.skipped.push({ date: dateStr, reason: 'published_locked' });
        continue;
      }

      // Start with existing plan or blank template
      const plan = existing && typeof existing === 'object' ? existing : { date: dateStr, notes: '', assignments: {} };

      // For each row, find employee and set assignment
      for (const row of map[dateStr]) {
        const empId = (row['Final TM Employee Id'] || row['Initial TM Employee Id'] || '').trim();
        const first = (row['Final TM First Name'] || row['Initial TM First Name'] || '').trim();
        const last = (row['Final TM Last Name'] || row['Initial TM Last Name'] || '').trim();
        const start = (row['Final Shift Start Time'] || row['Initial Shift Start Time'] || '').trim();
        const end = (row['Final Shift End Time'] || row['Initial Shift End Time'] || '').trim();

        // find employee by employeeId or name
        let found = null;
        if (empId) {
          found = allEmployees.find(e => (e.employeeId || e.id || '').toString().trim() === empId.toString().trim());
        }
        if (!found && first && last) {
          const name = `${first} ${last}`.trim().toLowerCase();
          found = allEmployees.find(e => (e.name || '').toLowerCase() === name || ((e.name || '').toLowerCase().includes(first.toLowerCase()) && (e.name || '').toLowerCase().includes(last.toLowerCase())));
        }

        const key = found ? (found.employeeId || found.id || found.id) : (empId || `${first} ${last}`);
        if (!key) continue;

        const shiftText = start && end ? `${start}-${end}` : (start || end || '');

        plan.assignments = plan.assignments || {};
        plan.assignments[key] = plan.assignments[key] || {};
        plan.assignments[key].shift = shiftText;
        plan.assignments[key].isOff = false;
        if (found && found.type) plan.assignments[key].type = found.type;
        plan.assignments[key].prepopulated = true;
        plan.assignments[key].prepopulatedBy = req.user?.name || 'importer';
      }

      plan.savedAt = new Date().toISOString();
      plan.published = false; // save as draft
      writeJsonFile(gameplanFile, plan);
      results.created.push({ date: dateStr });
    }

    // Return summary
    return res.json({ success: true, result: results });
  } catch (e) {
    console.error('Error importing shifts:', e);
    return res.status(500).json({ error: e?.message || 'Import failed' });
  }
});

// Helper: simple CSV parser supporting quoted fields
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headerLine = lines.shift();
  const headers = headerLine.match(/(?:\"([^\"]*)\")|([^,]+)/g).map(h => h.replace(/^\"|\"$/g, '').trim());
  return lines.map(line => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (cols[i] || '').trim();
    }
    return obj;
  });
}

// DELETE /api/gameplan/date/:date - Delete gameplan for a specific date
router.delete('/date/:date', requireManager, (req, res) => {
  const { date } = req.params;

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  const gameplanFile = path.join(GAMEPLAN_DIR, `${date}.json`);

  if (fs.existsSync(gameplanFile)) {
    try {
      fs.unlinkSync(gameplanFile);
      res.json({ success: true, message: `Game plan for ${date} deleted.` });
    } catch (error) {
      console.error(`Error deleting game plan for ${date}:`, error);
      res.status(500).json({ error: 'Failed to delete game plan.' });
    }
  } else {
    res.status(404).json({ error: 'No game plan found for this date' });
  }
});


// GET /api/gameplan/metrics - Get today's store metrics (from saved data)
router.get('/metrics', async (req, res) => {
  try {
    // Check cache first
    // const cacheKey = 'api:gameplan:metrics';
    // const cached = await getCache(cacheKey);
    // if (cached) {
    //   return res.json(cached);
    // }

    const dataSources = {
      wtdSales: 'dashboard-stores_performance/sales.csv',
      wtdTarget: 'dashboard-stores_performance/sales_target.csv',
      retailWeek: 'dashboard-stores_performance/sales_by_retail_weeks.csv',
      storeWeekSummary: 'dashboard-stores_performance/sales_by_retail_weeks_(copy).csv',
      tailorTeamProductivity: 'dashboard-stores_performance/team_productivity_.csv',
      tailorProductivity: 'dashboard-stores_performance/productivity_.csv',
      tailorWorkedHours: 'dashboard-stores_performance/worked_hours.csv',
      tailorAlterationsHours: 'dashboard-stores_performance/hours_of_alterations.csv',
      tailorProductivityLastWeek: 'dashboard-stores_performance/tailor_productivity_.csv',
      tailorProductivityLastWeekHours: 'dashboard-stores_performance/tailor_productivity_last_week.csv',
      tailorBenchmarkTimes: 'dashboard-stores_performance/benchmark_times_in_minutes.csv'
    };

    // Work-related expenses source files (Looker/email exports)
    dataSources.workRelatedExpenses = 'dashboard-work_related_expenses/full_dump.csv';
    dataSources.workRelatedExpensesAlt = 'dashboard-work_related_expenses/work_related_expenses.csv';

    // First try to get saved dashboard data
    const savedData = LookerDataProcessor.getSavedDashboardData();
    
    // Always process current data from files
    const computed = lookerProcessor.processStoreMetrics();
    
    if (savedData) {
      // Return processed data with sync info from saved
      const metrics = {
        ...computed,
        source: 'saved',
        dataSources,
        workRelatedExpenses: attachExpenseLimits(savedData.workRelatedExpenses || null),
        lastSyncTime: savedData.lastSyncTime,
        lastSyncBy: savedData.lastSyncBy,
        lastEmailReceived: savedData.lastEmailReceived, // When the email was actually received
        recordsImported: savedData.recordsImported,
        recordsImportedFiles: savedData.recordsImportedFiles,
        dataDate: savedData.dataDate,
        // Include other saved data
        appointments: savedData.appointments,
        waitwhile: savedData.waitwhile,
        bestSellers: savedData.bestSellers,
        customerReservedOrders: savedData.customerOrders,
        operationsHealth: savedData.operationsHealth,
        inventoryIssues: savedData.inventoryIssues,
        tailorProductivityTrend: savedData.tailorTrend,
        employeeCountPerformance: savedData.countPerformance,
        loans: savedData.loans,
        storeOpsOverdueAudit: savedData.storeOpsOverdueAudit || null
      };

      // LEGACY SUPPORT: Backfill operations health details in older saved payloads.
      if (!metrics.operationsHealth?.tailorsLastWeek?.length || metrics.operationsHealth?.workedHours === undefined || metrics.operationsHealth?.hoursOfAlterations === undefined || metrics.operationsHealth?.alterationsOnTimeBreakdown === undefined) {
        try {
          const computedOps = lookerProcessor.processOperationsHealth();
          metrics.operationsHealth = metrics.operationsHealth || {};
          for (const [k, v] of Object.entries(computedOps || {})) {
            if (metrics.operationsHealth[k] === undefined || metrics.operationsHealth[k] === null || (Array.isArray(metrics.operationsHealth[k]) && metrics.operationsHealth[k].length === 0)) {
              metrics.operationsHealth[k] = v;
            }
          }
        } catch (_) {
          // Ignore.
        }
      }

      // If count performance is missing/empty for today, fall back to the latest persisted snapshot.
      if (!metrics.employeeCountPerformance?.employees?.length) {
        const snap = readLatestScanPerformanceSnapshot();
        if (snap?.employees?.length) {
          metrics.employeeCountPerformance = {
            employees: snap.employees,
            summary: snap.summary || {}
          };
          metrics.scanPerformanceFromDate = snap.date || null;
        }
      }

      // LEGACY SUPPORT: Backfill retail week target info if missing in older saved payloads.
      // This is used for "Target / SA Today" calculations across the UI.
      // Also backfill KPI target fields (APC/CPC/IPC vs target) from the latest CSVs.
      if (!metrics.retailWeek || !metrics.retailWeek.target || !metrics?.metrics?.apcVsTarget || !metrics?.metrics?.cpcVsTarget || !metrics?.metrics?.ipcVsTarget) {
        try {
          // Backfill from computed
          if (computed?.retailWeek) metrics.retailWeek = computed.retailWeek;
          if (!metrics.salesByRetailWeeks && computed?.salesByRetailWeeks) metrics.salesByRetailWeeks = computed.salesByRetailWeeks;
          if (!metrics.storeWeekSummary && computed?.storeWeekSummary) metrics.storeWeekSummary = computed.storeWeekSummary;
          if (computed?.metrics && metrics.metrics) {
            if (metrics.metrics.apcVsTarget === undefined && computed.metrics.apcVsTarget !== undefined) metrics.metrics.apcVsTarget = computed.metrics.apcVsTarget;
            if (metrics.metrics.apcTarget === undefined && computed.metrics.apcTarget !== undefined) metrics.metrics.apcTarget = computed.metrics.apcTarget;
            if (metrics.metrics.cpcVsTarget === undefined && computed.metrics.cpcVsTarget !== undefined) metrics.metrics.cpcVsTarget = computed.metrics.cpcVsTarget;
            if (metrics.metrics.cpcTarget === undefined && computed.metrics.cpcTarget !== undefined) metrics.metrics.cpcTarget = computed.metrics.cpcTarget;
            if (metrics.metrics.ipcVsTarget === undefined && computed.metrics.ipcVsTarget !== undefined) metrics.metrics.ipcVsTarget = computed.metrics.ipcVsTarget;
            if (metrics.metrics.itemsPerCustomerTarget === undefined && computed.metrics.itemsPerCustomerTarget !== undefined) metrics.metrics.itemsPerCustomerTarget = computed.metrics.itemsPerCustomerTarget;
          }
        } catch (e) {
          // Ignore; caller can show "--" when unavailable.
        }
      }

      // Cache the response
      // await setCache(cacheKey, metrics);

      return res.json(maybeBackfillLastWeekOverview(metrics));
    }
    
    // Fall back to processing live if no saved data
    const storeMetrics = lookerProcessor.processStoreMetrics();
    
    // Save store metrics to DB for history
    if (storeMetrics.wtd) {
      try {
        await pgQuery(`
          INSERT INTO store_metrics (
            date, sales_amount, sales_vs_py, target, vs_target, sph, sph_vs_py,
            ipc, ipc_vs_py, drop_offs, drop_offs_vs_py, apc, apc_vs_py, cpc, cpc_vs_py
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT (date) DO UPDATE SET
            sales_amount = EXCLUDED.sales_amount,
            sales_vs_py = EXCLUDED.sales_vs_py,
            target = EXCLUDED.target,
            vs_target = EXCLUDED.vs_target,
            sph = EXCLUDED.sph,
            sph_vs_py = EXCLUDED.sph_vs_py,
            ipc = EXCLUDED.ipc,
            ipc_vs_py = EXCLUDED.ipc_vs_py,
            drop_offs = EXCLUDED.drop_offs,
            drop_offs_vs_py = EXCLUDED.drop_offs_vs_py,
            apc = EXCLUDED.apc,
            apc_vs_py = EXCLUDED.apc_vs_py,
            cpc = EXCLUDED.cpc,
            cpc_vs_py = EXCLUDED.cpc_vs_py,
            updated_at = NOW()
        `, [
          storeMetrics.date || new Date().toISOString().split('T')[0],
          storeMetrics.wtd.salesAmount,
          storeMetrics.wtd.salesVsPY,
          storeMetrics.wtd.target,
          storeMetrics.wtd.vsTarget,
          storeMetrics.metrics?.salesPerHour,
          storeMetrics.metrics?.sphVsPY,
          storeMetrics.metrics?.itemsPerCustomer,
          storeMetrics.metrics?.ipcVsPY,
          storeMetrics.metrics?.dropOffs,
          storeMetrics.metrics?.dropOffsVsPY,
          storeMetrics.metrics?.apc,
          storeMetrics.metrics?.apcVsPY,
          storeMetrics.metrics?.cpc,
          storeMetrics.metrics?.cpcVsPY
        ]);
      } catch (dbError) {
        console.error('Error saving store metrics to DB:', dbError);
      }
    }
    
    const appointments = lookerProcessor.processAppointments();
    const operations = lookerProcessor.processOperationsHealth();
    const customerOrders = lookerProcessor.processCustomerReservedOrders();
    const tailorTrend = lookerProcessor.processTailorProductivityTrend();
    const countPerformance = lookerProcessor.processEmployeeCountPerformance();
    const workRelatedExpenses = typeof lookerProcessor.processWorkRelatedExpenses === 'function'
      ? lookerProcessor.processWorkRelatedExpenses()
      : null;
    
    // Merge all data
    const metrics = {
      ...storeMetrics,
      source: 'live',
      dataSources,
      workRelatedExpenses: attachExpenseLimits(workRelatedExpenses),
      importedAt: new Date().toISOString(),
      appointments: appointments,
      operationsHealth: operations.operationsHealth || {},
      inventoryIssues: operations.inventoryIssues || {},
      customerReservedOrders: customerOrders,
      tailorProductivityTrend: tailorTrend,
      employeeCountPerformance: countPerformance
    };

    // Live path: attempt to read the latest Store Ops overdue audit PDF metrics from persisted dashboard-data.
    // (Parsing is done in the scheduler/processor; this keeps live mode from needing to parse PDFs.)
    try {
      const saved = LookerDataProcessor.getSavedDashboardData();
      if (saved?.storeOpsOverdueAudit) metrics.storeOpsOverdueAudit = saved.storeOpsOverdueAudit;
    } catch (_) {}

    if (!metrics.employeeCountPerformance?.employees?.length) {
      const snap = readLatestScanPerformanceSnapshot();
      if (snap?.employees?.length) {
        metrics.employeeCountPerformance = {
          employees: snap.employees,
          summary: snap.summary || {}
        };
        metrics.scanPerformanceFromDate = snap.date || null;
      }
    }
    
    // Cache the response
    // await setCache(cacheKey, metrics);

    res.json(maybeBackfillLastWeekOverview(metrics));
  } catch (error) {
    console.error('Error loading metrics:', error);
    
    // Fall back to file-based metrics
    const today = getTodayDate();
    const metricsFile = path.join(METRICS_DIR, `${today}.json`);
    let metrics = readJsonFile(metricsFile, null);
    
    if (!metrics) {
      const files = fs.readdirSync(METRICS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
      
      if (files.length > 0) {
        metrics = readJsonFile(path.join(METRICS_DIR, files[0]), {});
      } else {
        metrics = {};
      }
    }

    // Backfill retail week + KPI target info if missing in stored metrics files.
    if (metrics && (!metrics.retailWeek || !metrics.retailWeek.targetPerDay || !metrics?.metrics?.apcVsTarget || !metrics?.metrics?.cpcVsTarget || !metrics?.metrics?.ipcVsTarget)) {
      try {
        const computed = lookerProcessor.processStoreMetrics();
        if (computed?.retailWeek) metrics.retailWeek = computed.retailWeek;
        if (!metrics.salesByRetailWeeks && computed?.salesByRetailWeeks) metrics.salesByRetailWeeks = computed.salesByRetailWeeks;
        if (!metrics.storeWeekSummary && computed?.storeWeekSummary) metrics.storeWeekSummary = computed.storeWeekSummary;
        if (computed?.metrics) {
          metrics.metrics = metrics.metrics || {};
          if (metrics.metrics.apcVsTarget === undefined && computed.metrics.apcVsTarget !== undefined) metrics.metrics.apcVsTarget = computed.metrics.apcVsTarget;
          if (metrics.metrics.apcTarget === undefined && computed.metrics.apcTarget !== undefined) metrics.metrics.apcTarget = computed.metrics.apcTarget;
          if (metrics.metrics.cpcVsTarget === undefined && computed.metrics.cpcVsTarget !== undefined) metrics.metrics.cpcVsTarget = computed.metrics.cpcVsTarget;
          if (metrics.metrics.cpcTarget === undefined && computed.metrics.cpcTarget !== undefined) metrics.metrics.cpcTarget = computed.metrics.cpcTarget;
          if (metrics.metrics.ipcVsTarget === undefined && computed.metrics.ipcVsTarget !== undefined) metrics.metrics.ipcVsTarget = computed.metrics.ipcVsTarget;
          if (metrics.metrics.itemsPerCustomerTarget === undefined && computed.metrics.itemsPerCustomerTarget !== undefined) metrics.metrics.itemsPerCustomerTarget = computed.metrics.itemsPerCustomerTarget;
        }
      } catch (e) {
        // Ignore; UI will show "--" when unavailable.
      }
    }

    if (metrics && !metrics.dataSources) {
      metrics.dataSources = dataSources;
    }
    
    res.json(maybeBackfillLastWeekOverview(metrics));
  }
});

// GET /api/gameplan/scan-performance/history?days=30 - persisted scan performance leaderboard
router.get('/scan-performance/history', (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
  const files = safeReadDir(SCAN_PERFORMANCE_HISTORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, days);

  const snapshots = files
    .map(f => readJsonFile(path.join(SCAN_PERFORMANCE_HISTORY_DIR, f), null))
    .filter(Boolean);

  const byPerson = new Map();

  snapshots.forEach(snap => {
    (snap.employees || []).forEach(emp => {
      const key = normalizeScanPersonKey(emp);
      if (!key) return;

      const countsDone = Number(emp.countsDone || 0);
      const accuracy = Number(emp.accuracy || 0);
      const missedReserved = Number(emp.missedReserved || 0);

      if (!byPerson.has(key)) {
        byPerson.set(key, {
          key,
          name: emp.name || 'Unknown',
          employeeId: emp.employeeId || null,
          id: emp.id || null,
          type: emp.type || null,
          imageUrl: emp.imageUrl || null,
          totals: { countsDone: 0, missedReserved: 0, accuracyWeightedSum: 0, accuracyDays: 0 },
          lastSeenDate: snap.date || null
        });
      }

      const entry = byPerson.get(key);
      entry.name = entry.name || emp.name;
      entry.imageUrl = entry.imageUrl || emp.imageUrl || null;
      entry.totals.countsDone += countsDone;
      entry.totals.missedReserved += missedReserved;
      if (countsDone > 0) {
        entry.totals.accuracyWeightedSum += accuracy * countsDone;
      } else {
        entry.totals.accuracyDays += 1;
        entry.totals.accuracyWeightedSum += accuracy;
      }
      entry.lastSeenDate = snap.date || entry.lastSeenDate;
    });
  });

  const people = Array.from(byPerson.values()).map(p => {
    const denom = p.totals.countsDone > 0 ? p.totals.countsDone : Math.max(1, p.totals.accuracyDays);
    const avgAccuracy = p.totals.accuracyWeightedSum / denom;
    return {
      ...p,
      avgAccuracy: Math.round(avgAccuracy * 10) / 10
    };
  });

  const byAccuracy = people
    .slice()
    .sort((a, b) => (b.avgAccuracy - a.avgAccuracy) || (b.totals.countsDone - a.totals.countsDone))
    .slice(0, 20);

  const byCounts = people
    .slice()
    .sort((a, b) => b.totals.countsDone - a.totals.countsDone)
    .slice(0, 20);

  const byPickupsCleared = people
    .slice()
    .sort((a, b) => (a.totals.missedReserved - b.totals.missedReserved) || (b.totals.countsDone - a.totals.countsDone))
    .slice(0, 20);

  res.json({
    success: true,
    days: snapshots.map(s => ({ date: s.date, savedAt: s.savedAt, source: s.source, summary: s.summary })),
    leaderboard: { byAccuracy, byCounts, byPickupsCleared }
  });
});

// GET /api/gameplan/best-sellers - Get best sellers data (from saved data)
router.get('/best-sellers', (req, res) => {
  try {
    // First try saved data
    const savedData = LookerDataProcessor.getSavedDashboardData();
    if (savedData && savedData.bestSellers && Object.keys(savedData.bestSellers).length > 0) {
      return res.json({
        success: true,
        timestamp: savedData.lastSyncTime,
        data: savedData.bestSellers
      });
    }
    
    // Fall back to live processing
    const bestSellers = lookerProcessor.processBestSellers();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: bestSellers
    });
  } catch (error) {
    console.error('Error fetching best sellers:', error);
    res.status(500).json({ error: 'Failed to fetch best sellers' });
  }
});

// GET /api/gameplan/product-image/:code - Resolve a product image URL (cached)
router.get('/product-image/:code', async (req, res) => {
  const rawCode = (req.params.code || '').toString().trim();
  if (!isValidProductCode(rawCode)) {
    return res.status(400).json({ success: false, error: 'Invalid product code' });
  }

  const code = rawCode.toUpperCase();
  const cached = getCachedProductImage(code);
  if (cached) return res.json({ success: true, code, imageUrl: cached, source: 'cache' });

  const codeLower = code.toLowerCase();

  // Prefer internal suitsdev collections index (faster + stable URLs).
  const suitsDevHtml = await fetchText(
    `https://tools.suitsdev.nl/cloudinary_collections/index.php?search=${encodeURIComponent(codeLower)}`
  );
  const suitsDevImage = extractImageFromSuitsDevHtml(suitsDevHtml, codeLower);
  if (suitsDevImage) {
    saveCachedProductImage(code, suitsDevImage);
    return res.json({ success: true, code, imageUrl: suitsDevImage, source: 'tools.suitsdev.nl' });
  }

  // Fallback to public Suitsupply search results.
  const suitsupplyHtml = await fetchText(
    `https://suitsupply.com/en-us/search?q=${encodeURIComponent(code)}`
  );
  const suitsupplyImage = extractImageFromSuitSupplySearchHtml(suitsupplyHtml, code);
  if (suitsupplyImage) {
    saveCachedProductImage(code, suitsupplyImage);
    return res.json({ success: true, code, imageUrl: suitsupplyImage, source: 'suitsupply.com' });
  }

  return res.json({ success: false, code, imageUrl: null, source: 'none' });
});

// GET /api/gameplan/appointments - Get appointments/Waitwhile data (from saved data)
router.get('/appointments', (req, res) => {
  try {
    // First try saved data
    const savedData = LookerDataProcessor.getSavedDashboardData();
    if (savedData && savedData.waitwhile) {
      return res.json({
        success: true,
        timestamp: savedData.lastSyncTime,
        data: {
          summary: savedData.appointments,
          waitwhile: savedData.waitwhile
        }
      });
    }
    
    // Fall back to live processing
    const appointments = lookerProcessor.processAppointments();
    const waitwhile = lookerProcessor.processWaitwhileData();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        summary: appointments,
        waitwhile
      }
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// POST /api/gameplan/sync - Manually sync and save dashboard data
router.post('/sync', requireManager, async (req, res) => {
  try {
    const syncBy = req.body.syncBy || req.user?.name || 'manual';
    
    console.log(`[SYNC] Manual sync triggered by: ${syncBy}`);
    
    // Process all data and save to dashboard-data.json
    const processor = new LookerDataProcessor();
    const results = await processor.processAll();
    
    // Save with user info
    const dashboardData = processor.saveToDashboardData(results, syncBy);
    
    // Broadcast update to all connected clients
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('metrics_updated', {
        syncTime: dashboardData.lastSyncTime,
        syncBy: syncBy,
        hasNewData: dashboardData.hasNewData
      });
    }
    
    res.json({
      success: true,
      message: dashboardData.hasNewData 
        ? 'Dashboard data synced successfully' 
        : 'No new data available - keeping existing data',
      hasNewData: dashboardData.hasNewData,
      updatedSections: dashboardData.updatedSections,
      lastSyncTime: dashboardData.lastSyncTime,
      lastSyncBy: syncBy,
      filesProcessed: results.filesProcessed?.length || 0,
      errors: results.errors || []
    });
  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({ error: 'Failed to sync data', details: error.message });
  }
});

// GET /api/gameplan/sync-status - Get last sync status
router.get('/sync-status', (req, res) => {
  try {
    const savedData = LookerDataProcessor.getSavedDashboardData();
    
    if (savedData) {
      res.json({
        success: true,
        lastSyncTime: savedData.lastSyncTime,
        lastSyncBy: savedData.lastSyncBy,
        dataDate: savedData.dataDate,
        hasData: true
      });
    } else {
      res.json({
        success: true,
        lastSyncTime: null,
        lastSyncBy: null,
        dataDate: null,
        hasData: false
      });
    }
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// POST /api/gameplan/daily-scan/assign - assign or unassign an employee for today's daily scan
router.post('/daily-scan/assign', requireManager, async (req, res) => {
  console.log('Daily scan assign route called:', { employeeId: req.body?.employeeId, assign: req.body?.assign, date: req.body?.date, user: req.user?.email });
  try {
    const { employeeId, assign, date } = req.body || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

    // Use a canonical string id for comparisons (client may send numeric or string ids)
    const canonicalEmployeeId = (employeeId || '').toString().trim();
    const targetDate = date || getTodayDate();

      // If Postgres is available, persist assignment there
      if (pgPool) {
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          // First, clear all active assignments for today (enforce single-assignment)
          await client.query(
            `UPDATE daily_scan_assignments SET active = false WHERE date = $1 AND employee_id != $2`,
            [targetDate, canonicalEmployeeId]
          );
          // Then, upsert the new assignment
          await client.query(
            `INSERT INTO daily_scan_assignments (date, employee_id, assigned_by, assigned_at, active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (date, employee_id) DO UPDATE SET assigned_by = $3, assigned_at = $4, active = $5`,
            [targetDate, canonicalEmployeeId, req.user?.email || req.user?.name || 'system', new Date().toISOString(), !!assign]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        const broadcastUpdate = req.app.get('broadcastUpdate');
        if (broadcastUpdate) broadcastUpdate('daily_scan_assignment', { date: targetDate, employeeId: canonicalEmployeeId, assign });

        return res.json({ success: true, employeeId: canonicalEmployeeId, assign, source: 'postgres' });
      }

      // Fallback: file-based gameplan
      const gameplanFile = path.join(GAMEPLAN_DIR, `${targetDate}.json`);
      let gameplan = readJsonFile(gameplanFile, { date: targetDate, notes: '', assignments: {} });
      if (!gameplan.assignments) gameplan.assignments = {};

      // Clear dailyScanAssigned from all other employees (enforce single-assignment)
      Object.keys(gameplan.assignments).forEach(id => {
        const key = (id || '').toString().trim();
        if (key !== canonicalEmployeeId) {
          const existing = gameplan.assignments[id] || {};
          if (existing.dailyScanAssigned) {
            delete existing.dailyScanAssigned;
            delete existing.dailyScanAssignedBy;
            delete existing.dailyScanAssignedAt;
            gameplan.assignments[id] = existing;
          }
        }
      });

      const existing = gameplan.assignments[canonicalEmployeeId] || {};
      if (assign) {
        existing.dailyScanAssigned = true;
        existing.dailyScanAssignedBy = req.user?.email || req.user?.name || 'system';
        existing.dailyScanAssignedAt = new Date().toISOString();
        gameplan.assignments[canonicalEmployeeId] = existing;
      } else {
        if (existing.dailyScanAssigned) {
          delete existing.dailyScanAssigned;
          delete existing.dailyScanAssignedBy;
          delete existing.dailyScanAssignedAt;
          gameplan.assignments[canonicalEmployeeId] = existing;
        }
      }

      gameplan.savedAt = new Date().toISOString();
      writeJsonFile(gameplanFile, gameplan);

      // Also clear any stray dailyScanAssigned flags inside the employees file
      try {
        const employeesFile = EMPLOYEES_FILE;
        const employeesData = readJsonFile(employeesFile, { employees: {} });
        let mutated = false;
        for (const role of Object.keys(employeesData.employees || {})) {
          const list = employeesData.employees[role] || [];
          for (const emp of list) {
            if (emp && emp.dailyScanAssigned && (emp.employeeId || emp.id || '').toString().trim() !== canonicalEmployeeId) {
              delete emp.dailyScanAssigned;
              delete emp.dailyScanAssignedBy;
              delete emp.dailyScanAssignedAt;
              mutated = true;
            }
            // If this employee matches the canonical id, ensure the flag is set/cleared accordingly
            const empKey = (emp.employeeId || emp.id || '').toString().trim();
            if (empKey === canonicalEmployeeId) {
              if (assign) {
                emp.dailyScanAssigned = true;
                emp.dailyScanAssignedBy = req.user?.email || req.user?.name || 'system';
                emp.dailyScanAssignedAt = new Date().toISOString();
                mutated = true;
              } else if (emp.dailyScanAssigned) {
                delete emp.dailyScanAssigned;
                delete emp.dailyScanAssignedBy;
                delete emp.dailyScanAssignedAt;
                mutated = true;
              }
            }
          }
        }
        if (mutated) writeJsonFile(employeesFile, employeesData);
      } catch (err) {
        console.error('[GAMEPLAN] Failed to sanitize employees file dailyScan flags:', err);
      }

      const broadcastUpdate = req.app.get('broadcastUpdate');
      if (broadcastUpdate) {
        broadcastUpdate('daily_scan_assignment', { date: targetDate, employeeId, assign });
      }

      return res.json({ success: true, employeeId, assign, source: 'file' });
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'Failed to assign daily scan' });
    }
  });

// GET /api/gameplan/daily-scan/report - parse a StoreCount.csv in files/ if present and return summary
router.get('/daily-scan/report', (req, res) => {
  (async () => {
    try {
      // If Postgres is available, prefer aggregated data from DB tables
      if (pgPool) {
        const client = await pgPool.connect();
        try {
          const result = await client.query(`
            SELECT
              sc.id,
              sc.status,
              sc.count_id,
              sc.store_load,
              sc.location_id,
              sc.created_at,
              sc.employee_id,
              sc.employee_name,
              sc.scanned_at,
              sc.uploaded_at,
              sc.notes,
              sc.total_items,
              sc.total_value,
              sc.scan_duration_seconds,
              sc.device_info,
              dsa.employee_id as assigned_employee_id,
              dsa.assigned_by,
              dsa.assigned_at
            FROM store_counts sc
            LEFT JOIN daily_scan_assignments dsa ON sc.created_at::date = dsa.date::date AND dsa.active = true
            ORDER BY sc.created_at DESC
            LIMIT 50
          `);
          
          return res.json({
            success: true,
            source: 'postgres',
            counts: result.rows
          });
        } catch (err) {
          console.error('Postgres daily-scan report failed, falling back to CSV:', err?.message || err);
        } finally {
          client.release();
        }
      }

      // Fallback: parse StoreCount.csv from files/ directory
      const csvPath = path.join(__dirname, '..', 'files', 'StoreCount.csv');
      if (!fs.existsSync(csvPath)) {
        return res.json({ success: true, source: 'none', message: 'No StoreCount.csv found in files/' });
      }

      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.json({ success: true, source: 'csv', counts: [] });
      }

      const headers = lines[0].split(',');
      const counts = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
          obj[header.trim()] = values[i]?.trim() || '';
        });
        return obj;
      });

      res.json({ success: true, source: 'csv', counts });
    } catch (error) {
      console.error('Error in daily-scan report:', error);
      res.status(500).json({ error: 'Failed to generate daily scan report' });
    }
  })();
});

// POST /api/gameplan/import-looker - Import data from Looker CSV files
router.post('/import-looker', requireManager, (req, res) => {
  try {
    const lookerDir = path.join(__dirname, '..', 'files', 'dashboard-stores_performance');
    const tailorDir = path.join(__dirname, '..', 'files', 'dashboard-tailor_myr');

    // Parse CSV files and update metrics
    const metrics = {
      date: getTodayDate(),
      source: 'looker',
      importedAt: new Date().toISOString()
    };

    // Read sales data
    const salesFile = path.join(lookerDir, 'sales.csv');
    if (fs.existsSync(salesFile)) {
      const salesData = parseCSV(fs.readFileSync(salesFile, 'utf8'));
      if (salesData.length > 0) {
        metrics.wtd = {
          salesAmount: parseAmount(salesData[0]['Retail Management - Metrics Sales Amount']),
          salesVsPY: parseFloat(salesData[0]['Retail Management - Metrics % Sales vs PY']) || 0
        };
      }
    }

    // Read target data
    const targetFile = path.join(lookerDir, 'sales_target.csv');
    if (fs.existsSync(targetFile)) {
      const targetData = parseCSV(fs.readFileSync(targetFile, 'utf8'));
      if (targetData.length > 0 && metrics.wtd) {
        metrics.wtd.target = parseAmount(targetData[0]['Retail Management - Metrics Sales Amount Target']);
        metrics.wtd.vsTarget = parseFloat(targetData[0]['Retail Management - Metrics % Sales vs Target']) || 0;
      }
    }

    // Read SPH
    const sphFile = path.join(lookerDir, 'sph.csv');
    if (fs.existsSync(sphFile)) {
      const sphData = parseCSV(fs.readFileSync(sphFile, 'utf8'));
      if (sphData.length > 0) {
        metrics.metrics = metrics.metrics || {};
        metrics.metrics.salesPerHour = parseFloat(sphData[0]['Retail Management - Metrics Sales per Hour']) || 0;
        metrics.metrics.sphVsPY = parseFloat(sphData[0]['Retail Management - Metrics % SPH vs PY']) || 0;
      }
    }

    // Read IPC
    const ipcFile = path.join(lookerDir, 'ipc.csv');
    if (fs.existsSync(ipcFile)) {
      const ipcData = parseCSV(fs.readFileSync(ipcFile, 'utf8'));
      if (ipcData.length > 0) {
        metrics.metrics = metrics.metrics || {};
        metrics.metrics.itemsPerCustomer = parseFloat(ipcData[0]['Retail Management - Metrics # Items Per Customer']) || 0;
        metrics.metrics.ipcVsPY = parseFloat(ipcData[0]['Retail Management - Metrics % IPC vs PY']) || 0;
      }
    }

    // Read drop-offs
    const dropoffFile = path.join(lookerDir, 'drop-offs.csv');
    if (fs.existsSync(dropoffFile)) {
      const dropoffData = parseCSV(fs.readFileSync(dropoffFile, 'utf8'));
      if (dropoffData.length > 0) {
        metrics.metrics = metrics.metrics || {};
        metrics.metrics.dropOffs = parseFloat(dropoffData[0]['Retail Management - Metrics % Drop-Off']) || 0;
        metrics.metrics.dropOffsVsPY = parseFloat(dropoffData[0]['Retail Management - Metrics % Drop-Off vs PY']) || 0;
      }
    }

    // Read product mix
    const mixFile = path.join(lookerDir, 'stores_performance_product_mix_occassion.csv');
    if (fs.existsSync(mixFile)) {
      const mixData = parseCSV(fs.readFileSync(mixFile, 'utf8'));
      metrics.lastWeekSales = { formal: 0, casual: 0, tuxedo: 0, notDefined: 0 };
      mixData.forEach(row => {
        const occasion = row['Product Occasion'];
        const share = parseInt(row['Shares']) || 0;
        if (occasion === 'Formal') metrics.lastWeekSales.formal = share;
        else if (occasion === 'Casual') metrics.lastWeekSales.casual = share;
        else if (occasion === 'Tuxedo') metrics.lastWeekSales.tuxedo = share;
        else if (occasion === 'Not defined') metrics.lastWeekSales.notDefined = share;
      });
    }

    // Save metrics
    const metricsFile = path.join(METRICS_DIR, `${getTodayDate()}.json`);
    writeJsonFile(metricsFile, metrics);

    // Update employee data from KPIs
    const kpiFile = path.join(lookerDir, 'kpis_per_employee.csv');
    if (fs.existsSync(kpiFile)) {
      const kpiData = parseCSV(fs.readFileSync(kpiFile, 'utf8'));
      const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });

      kpiData.forEach(row => {
        const name = row['Employee'];
        if (!name) return;

        // Find employee in SA list
        const saIndex = employees.employees.SA?.findIndex(e => e.name === name);
        if (saIndex >= 0) {
          employees.employees.SA[saIndex].imageUrl = row['Employee Image'] || employees.employees.SA[saIndex].imageUrl;
          employees.employees.SA[saIndex].metrics = {
            salesAmount: parseAmount(row['Sales Amount']),
            apc: parseAmount(row['APC']),
            ipc: parseFloat(row['IPC']) || 0,
            cpc: parseFloat(row['CPC']) || 0,
            sph: parseFloat(row['Sales per Hour']) || 0,
            salesShare: parseInt(row['Sales Shares']) || 0
          };
        }
      });

      employees.lastUpdated = getTodayDate();
      writeJsonFile(EMPLOYEES_FILE, employees);
    }

    // Update tailor productivity
    const tailorFile = path.join(tailorDir, 'ytd_average_productivity_per_tailor.csv');
    if (fs.existsSync(tailorFile)) {
      const tailorData = parseCSV(fs.readFileSync(tailorFile, 'utf8'));
      const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });

      tailorData.forEach(row => {
        const name = row['Tailor Full Name'];
        if (!name) return;

        const tailorIndex = employees.employees.TAILOR?.findIndex(e => e.name === name);
        if (tailorIndex >= 0) {
          employees.employees.TAILOR[tailorIndex].productivity = parseInt(row['% Tailor Productivity']) || 0;
        }
      });

      employees.lastUpdated = getTodayDate();
      writeJsonFile(EMPLOYEES_FILE, employees);
    }

    res.json({ success: true, metrics, message: 'Looker data imported successfully' });
  } catch (error) {
    console.error('Error importing Looker data:', error);
    res.status(500).json({ error: 'Failed to import Looker data', details: error.message });
  }
});

// GET /api/gameplan/history/:days - Get gameplan history
router.get('/history/:days', (req, res) => {
  const days = parseInt(req.params.days) || 7;
  const history = [];

  const files = fs.readdirSync(GAMEPLAN_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, days);

  files.forEach(file => {
    const gameplan = readJsonFile(path.join(GAMEPLAN_DIR, file), null);
    if (gameplan) history.push(gameplan);
  });

  res.json(history);
});

// Helper functions
function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    data.push(row);
  }

  return data;
}

function parseAmount(str) {
  if (!str) return 0;
  str = str.toString().replace(/[^0-9.-]/g, '');
  // Handle K suffix
  if (str.includes('K')) {
    return parseFloat(str.replace('K', '')) * 1000;
  }
  return parseFloat(str) || 0;
}

// POST /api/gameplan/fetch-gmail - Fetch Looker data from Gmail (enhanced)
router.post('/fetch-gmail', requireManager, async (req, res) => {
  try {
    const { GmailLookerFetcher } = require('../utils/gmail-looker-fetcher');
    const fetcher = new GmailLookerFetcher();
    const daysBack = req.body.daysBack || 1;
    const result = await fetcher.fetchLookerData(daysBack);
    res.json(result);
  } catch (error) {
    console.error('Error fetching from Gmail:', error);
    res.status(500).json({ error: 'Failed to fetch from Gmail', details: error.message });
  }
});

// POST /api/gameplan/fetch-microsoft - Fetch Looker data from Microsoft 365
router.post('/fetch-microsoft', requireManager, async (req, res) => {
  try {
    const { MicrosoftEmailFetcher } = require('../utils/microsoft-email-fetcher');
    const fetcher = new MicrosoftEmailFetcher();
    const hoursBack = req.body.hoursBack || 24;
    const result = await fetcher.fetchLookerEmails(hoursBack);
    res.json(result);
  } catch (error) {
    console.error('Error fetching from Microsoft:', error);
    res.status(500).json({ error: 'Failed to fetch from Microsoft', details: error.message });
  }
});

// GET /api/gameplan/microsoft-status - Check Microsoft login status
router.get('/microsoft-status', async (req, res) => {
  try {
    const { MicrosoftEmailFetcher } = require('../utils/microsoft-email-fetcher');
    const fetcher = new MicrosoftEmailFetcher();
    const loggedIn = await fetcher.hasValidCredentials();
    res.json({ loggedIn, email: loggedIn ? 'sanfrancisco@suitsupply.com' : null });
  } catch (error) {
    res.json({ loggedIn: false, error: error.message });
  }
});

// POST /api/gameplan/process-looker - Process CSV files and update metrics
router.post('/process-looker', requireManager, async (req, res) => {
  try {
    const { LookerDataProcessor } = require('../utils/looker-data-processor');
    const processor = new LookerDataProcessor();
    const result = await processor.processAll();
    res.json(result);
  } catch (error) {
    console.error('Error processing Looker data:', error);
    res.status(500).json({ error: 'Failed to process Looker data', details: error.message });
  }
});

// POST /api/gameplan/sync-looker - Full sync: Fetch from Gmail + Process
router.post('/sync-looker', requireManager, async (req, res) => {
  const results = {
    success: false,
    fetch: null,
    process: null,
    errors: []
  };

  try {
    // Step 1: Fetch emails from Gmail
    console.log('Step 1: Fetching Looker emails from Gmail...');
    const { GmailLookerFetcher } = require('../utils/gmail-looker-fetcher');
    const fetcher = new GmailLookerFetcher();
    const daysBack = req.body.daysBack || 1;
    results.fetch = await fetcher.fetchLookerData(daysBack);

    if (results.fetch.errors.length > 0) {
      results.errors.push(...results.fetch.errors);
    }

    // Step 2: Process the CSV files
    console.log('Step 2: Processing CSV files...');
    const { LookerDataProcessor } = require('../utils/looker-data-processor');
    const processor = new LookerDataProcessor();
    results.process = await processor.processAll();

    if (results.process.errors.length > 0) {
      results.errors.push(...results.process.errors);
    }

    results.success = results.errors.length === 0;
    results.message = results.success 
      ? 'Looker data synced successfully'
      : 'Sync completed with some errors';

    console.log('Sync complete:', results.message);
    res.json(results);

  } catch (error) {
    console.error('Error syncing Looker data:', error);
    results.errors.push(error.message);
    res.status(500).json(results);
  }
});

// GET /api/gameplan/sync-status - Check last sync status
router.get('/sync-status', (req, res) => {
  try {
    const logDir = path.join(DATA_DIR, 'import-logs');
    const today = getTodayDate();
    const logFile = path.join(logDir, `${today}.json`);

    if (fs.existsSync(logFile)) {
      const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      const lastLog = logs[logs.length - 1];
      res.json({
        lastSync: lastLog?.timestamp || null,
        emailsProcessed: lastLog?.emailsProcessed || 0,
        filesExtracted: lastLog?.filesExtracted?.length || 0,
        success: lastLog?.success || false
      });
    } else {
      res.json({
        lastSync: null,
        message: 'No sync performed today'
      });
    }
  } catch (error) {
    res.json({ lastSync: null, error: error.message });
  }
});

// GET /api/gameplan/settings - Get settings
router.get('/settings', (req, res) => {
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  const settings = readJsonFile(settingsFile, {
    zones: [],
    shifts: [],
    closingSections: [],
    fittingRooms: [],
    lunchTimes: [],
    tailorStations: []
  });
  res.json(settings);
});

// GET /api/gameplan/store-config - Read-only store configuration (authenticated users)
router.get('/store-config', (req, res) => {
  try {
    return res.json(dal.getStoreConfig());
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to load store config' });
  }
});

// GET /api/gameplan/weekly-goal-distribution/:weekKey - Read weekly % distribution (any authenticated user)
router.get('/weekly-goal-distribution/:weekKey', (req, res) => {
  const weekKey = normalizeWeekKey(req.params.weekKey);
  if (!weekKey) return res.status(400).json({ error: 'Invalid weekKey' });
  const all = readWeeklyGoalDistributions();
  const entry = all?.weeks?.[weekKey] || null;
  return res.json(entry || { weekKey, enabled: false, percents: [15, 15, 14, 14, 14, 14, 14] });
});

// POST /api/gameplan/weekly-goal-distribution/:weekKey - Update weekly % distribution (manager/admin)
router.post('/weekly-goal-distribution/:weekKey', requireManager, express.json(), (req, res) => {
  const weekKey = normalizeWeekKey(req.params.weekKey);
  if (!weekKey) return res.status(400).json({ error: 'Invalid weekKey' });

  const body = req.body || {};
  const enabled = body.enabled === true || body.enabled === 'true';
  const percents = Array.isArray(body.percents) ? body.percents.map(n => Number(n)) : null;
  const maxDaily = 40;
  if (!percents || percents.length !== 7 || percents.some(n => !Number.isFinite(n) || n < 0 || n > maxDaily)) {
    return res.status(400).json({ error: `percents must be an array of 7 numbers (0-${maxDaily})` });
  }

  const total = Math.round(percents.reduce((a, b) => a + b, 0) * 100) / 100;
  if (total !== 100) {
    return res.status(400).json({ error: `percents must total 100 (got ${total})` });
  }

  const all = readWeeklyGoalDistributions();
  if (!all.weeks) all.weeks = {};
  const next = {
    weekKey,
    enabled,
    percents,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.name || null
  };
  all.weeks[weekKey] = next;
  writeWeeklyGoalDistributions(all);
  const broadcastUpdate = req.app?.get?.('broadcastUpdate');
  if (typeof broadcastUpdate === 'function') {
    broadcastUpdate('weekly_goal_distribution_updated', { weekKey });
  }
  return res.json(next);
});

// GET /api/gameplan/notes-templates - Per-user notes templates (manager/admin)
router.get('/notes-templates', requireManager, (req, res) => {
  const userId = (req.user?.userId || '').toString();
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const data = readNotesTemplates();
  const list = Array.isArray(data?.byUser?.[userId]) ? data.byUser[userId] : [];
  return res.json({ templates: list });
});

// POST /api/gameplan/notes-templates - Create template (manager/admin)
router.post('/notes-templates', requireManager, express.json(), (req, res) => {
  const userId = (req.user?.userId || '').toString();
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const name = (req.body?.name || '').toString().trim();
  const html = (req.body?.html || '').toString();
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > 60) return res.status(400).json({ error: 'name too long' });
  if (html.length > 100_000) return res.status(400).json({ error: 'template too large' });

  const data = readNotesTemplates();
  if (!data.byUser) data.byUser = {};
  if (!Array.isArray(data.byUser[userId])) data.byUser[userId] = [];

  const now = new Date().toISOString();
  const template = {
    id: `nt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    html,
    createdAt: now,
    updatedAt: now
  };
  data.byUser[userId].push(template);
  writeNotesTemplates(data);
  return res.json({ success: true, template });
});

// PUT /api/gameplan/notes-templates/:id - Update template (manager/admin)
router.put('/notes-templates/:id', requireManager, express.json(), (req, res) => {
  const userId = (req.user?.userId || '').toString();
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const name = (req.body?.name || '').toString().trim();
  const html = (req.body?.html || '').toString();
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > 60) return res.status(400).json({ error: 'name too long' });
  if (html.length > 100_000) return res.status(400).json({ error: 'template too large' });

  const data = readNotesTemplates();
  const list = Array.isArray(data?.byUser?.[userId]) ? data.byUser[userId] : [];
  const idx = list.findIndex(t => t?.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });

  const now = new Date().toISOString();
  list[idx] = { ...list[idx], name, html, updatedAt: now };
  data.byUser[userId] = list;
  writeNotesTemplates(data);
  return res.json({ success: true, template: list[idx] });
});

// DELETE /api/gameplan/notes-templates/:id - Delete template (manager/admin)
router.delete('/notes-templates/:id', requireManager, (req, res) => {
  const userId = (req.user?.userId || '').toString();
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const data = readNotesTemplates();
  const list = Array.isArray(data?.byUser?.[userId]) ? data.byUser[userId] : [];
  const next = list.filter(t => t?.id !== id);
  if (next.length === list.length) return res.status(404).json({ error: 'Template not found' });
  data.byUser[userId] = next;
  writeNotesTemplates(data);
  return res.json({ success: true });
});

// ===== Game Plan Templates (store-scoped) =====

// GET /api/gameplan/templates - List templates for this store (manager/admin)
router.get('/templates', requireManager, (req, res) => {
  const cfg = dal.getStoreConfig();
  const storeId = (cfg?.storeId || 'sf').toString().trim() || 'sf';
  const data = readGameplanTemplates();
  const list = Array.isArray(data?.byStore?.[storeId]?.templates) ? data.byStore[storeId].templates : [];
  const sorted = list.slice().sort((a, b) => (b?.updatedAt || b?.createdAt || '').localeCompare(a?.updatedAt || a?.createdAt || ''));
  return res.json({ storeId, templates: sorted });
});

// POST /api/gameplan/templates - Create template (manager/admin)
router.post('/templates', requireManager, express.json({ limit: '1mb' }), (req, res) => {
  const cfg = dal.getStoreConfig();
  const storeId = (cfg?.storeId || 'sf').toString().trim() || 'sf';

  const body = req.body || {};
  const name = normalizeTemplateName(body.name);
  if (!name) return res.status(400).json({ error: 'name is required' });

  const weekdayIndex = normalizeWeekdayIndex(body.weekdayIndex);
  const fields = (body.fields && typeof body.fields === 'object') ? body.fields : {};
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

  const actor = {
    name: req.user?.name || null,
    employeeId: req.user?.employeeId || null,
    email: req.user?.email || null
  };

  const now = new Date().toISOString();
  const template = {
    id: newTemplateId(),
    name,
    weekdayIndex,
    storeId,
    fields,
    payload,
    createdBy: actor,
    createdAt: now,
    updatedBy: actor,
    updatedAt: now
  };

  const data = readGameplanTemplates();
  if (!data.byStore) data.byStore = {};
  if (!data.byStore[storeId]) data.byStore[storeId] = { templates: [] };
  if (!Array.isArray(data.byStore[storeId].templates)) data.byStore[storeId].templates = [];
  data.byStore[storeId].templates.push(template);
  writeGameplanTemplates(data);
  return res.json({ success: true, template });
});

// PUT /api/gameplan/templates/:id - Update template (manager/admin)
router.put('/templates/:id', requireManager, express.json({ limit: '1mb' }), (req, res) => {
  const cfg = dal.getStoreConfig();
  const storeId = (cfg?.storeId || 'sf').toString().trim() || 'sf';
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body || {};
  const name = normalizeTemplateName(body.name);
  if (!name) return res.status(400).json({ error: 'name is required' });

  const weekdayIndex = normalizeWeekdayIndex(body.weekdayIndex);
  const fields = (body.fields && typeof body.fields === 'object') ? body.fields : {};
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

  const data = readGameplanTemplates();
  const list = Array.isArray(data?.byStore?.[storeId]?.templates) ? data.byStore[storeId].templates : [];
  const idx = list.findIndex(t => (t?.id || '') === id);
  if (idx < 0) return res.status(404).json({ error: 'Template not found' });

  const actor = {
    name: req.user?.name || null,
    employeeId: req.user?.employeeId || null,
    email: req.user?.email || null
  };
  const now = new Date().toISOString();

  const cur = list[idx] || {};
  list[idx] = {
    ...cur,
    name,
    weekdayIndex,
    storeId,
    fields,
    payload,
    updatedBy: actor,
    updatedAt: now
  };

  if (!data.byStore) data.byStore = {};
  if (!data.byStore[storeId]) data.byStore[storeId] = { templates: list };
  data.byStore[storeId].templates = list;
  writeGameplanTemplates(data);
  return res.json({ success: true, template: list[idx] });
});

// DELETE /api/gameplan/templates/:id - Delete template (manager/admin)
router.delete('/templates/:id', requireManager, (req, res) => {
  const cfg = dal.getStoreConfig();
  const storeId = (cfg?.storeId || 'sf').toString().trim() || 'sf';
  const id = (req.params.id || '').toString().trim();
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const data = readGameplanTemplates();
  const list = Array.isArray(data?.byStore?.[storeId]?.templates) ? data.byStore[storeId].templates : [];
  const next = list.filter(t => (t?.id || '') !== id);
  if (next.length === list.length) return res.status(404).json({ error: 'Template not found' });

  if (!data.byStore) data.byStore = {};
  if (!data.byStore[storeId]) data.byStore[storeId] = { templates: [] };
  data.byStore[storeId].templates = next;
  writeGameplanTemplates(data);
  return res.json({ success: true });
});

// POST /api/gameplan/settings - Save settings
router.post('/settings', requireManager, (req, res) => {
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  const settings = req.body;
  settings.lastUpdated = getTodayDate();
  writeJsonFile(settingsFile, settings);
  res.json({ success: true });
});

// POST /api/gameplan/metrics - Save metrics manually
router.post('/metrics', requireManager, (req, res) => {
  const metricsData = req.body;
  const metricsFile = path.join(METRICS_DIR, `${getTodayDate()}.json`);
  writeJsonFile(metricsFile, metricsData);
  res.json({ success: true });
});

// GET /api/gameplan/loans - Get loans data
router.get('/loans', (req, res) => {
  try {
    const loansDir = path.join(__dirname, '..', 'files', 'dashboard-loan_dashboard');
    const result = { overdue: [], total: 0 };

    // Read retail due loans per employee
    const retailFile = path.join(loansDir, 'retail_due_loans_per_employee.csv');
    if (fs.existsSync(retailFile)) {
      const retailData = parseCSV(fs.readFileSync(retailFile, 'utf8'));
      retailData.forEach(row => {
        if (row['Employee Full Name']) {
          result.overdue.push({
            employeeName: row['Employee Full Name'],
            period: row['Period Name'],
            location: row['Contract Location Code']
          });
        }
      });
    }

    // Read total due loans
    const totalFile = path.join(loansDir, 'retail_due_loans.csv');
    if (fs.existsSync(totalFile)) {
      const totalData = parseCSV(fs.readFileSync(totalFile, 'utf8'));
      if (totalData.length > 0) {
        result.total = parseInt(Object.values(totalData[0])[0]) || 0;
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error reading loans data:', error);
    res.json({ overdue: [], total: 0 });
  }
});

// POST /api/gameplan/employees/move - Move employee to different type
router.post('/employees/move', requireManager, (req, res) => {
  const { employeeId, fromType, toType } = req.body;

  if (!employeeId || !fromType || !toType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });

  // Find and remove from original type
  const fromIndex = employees.employees[fromType]?.findIndex(e => e.id === employeeId);
  if (fromIndex === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const employee = employees.employees[fromType].splice(fromIndex, 1)[0];
  employee.type = toType;

  // Add to new type
  if (!employees.employees[toType]) {
    employees.employees[toType] = [];
  }
  employees.employees[toType].push(employee);

  employees.lastUpdated = getTodayDate();
  writeJsonFile(EMPLOYEES_FILE, employees);

  res.json({ success: true });
});

// GET /api/gameplan/unified - Unified game plan endpoint with role-based filtering
router.get('/unified', async (req, res) => {
  try {
    const { date, view } = req.query;
    const targetDate = date || getTodayDate();
    const user = req.user;
    
    // Determine which view to show based on user role and query param
    let filterType = view;
    if (!filterType) {
      // Auto-select based on user role
      if (user?.role === 'BOH') filterType = 'boh';
      else if (user?.role === 'SA') filterType = 'sa';
      else if (user?.role === 'TAILOR') filterType = 'tailors';
      else if (user?.role === 'MANAGEMENT' || user?.isManager || user?.isAdmin) filterType = 'all';
      else filterType = 'all';
    }
    
    // Read employees data
    const employeesData = readJsonFile(EMPLOYEES_FILE, { employees: {} });
    
    // Read game plan for the date
    const gameplanFile = path.join(GAMEPLAN_DIR, `${targetDate}.json`);
    const gameplan = readJsonFile(gameplanFile, { date: targetDate, employees: [] });
    
    // Read metrics
    const metricsFile = path.join(METRICS_DIR, `${targetDate}.json`);
    const metrics = readJsonFile(metricsFile, {});
    
    // Filter employees based on view
    let employees = gameplan.employees || [];
    if (filterType !== 'all') {
      const typeMap = {
        'boh': 'BOH',
        'sa': 'SA',
        'tailors': 'TAILOR',
        'management': 'MANAGEMENT'
      };
      const targetType = typeMap[filterType];
      if (targetType) {
        employees = employees.filter(e => e.type === targetType || e.role === targetType);
      }
    }
    
    // Enrich employee data with real-time performance
    const enrichedEmployees = employees.map(emp => {
      const actual = emp.actual || {};
      const goals = emp.goals || {};
      
      // Calculate progress
      const salesProgress = goals.sales ? (actual.sales || 0) / goals.sales : 0;
      const unitsProgress = goals.units ? (actual.units || 0) / goals.units : 0;
      const apptProgress = goals.appointments ? (actual.appointments || 0) / goals.appointments : 0;
      
      return {
        ...emp,
        performance: {
          salesProgress: Math.round(salesProgress * 100) / 100,
          unitsProgress: Math.round(unitsProgress * 100) / 100,
          appointmentsProgress: Math.round(apptProgress * 100) / 100,
          onTrack: salesProgress >= 0.5, // 50% of goal halfway through day
          lastUpdate: emp.lastUpdate || new Date().toISOString()
        },
        actual: {
          sales: actual.sales || 0,
          units: actual.units || 0,
          appointments: actual.appointments || 0,
          tasksCompleted: actual.tasksCompleted || 0
        }
      };
    });
    
    // Get appointments
    const appointments = gameplan.appointments || [];
    
    // Get best sellers
    const bestSellers = metrics.bestSellers || [];
    
    // Build response
    const response = {
      date: targetDate,
      store: 'SF', // TODO: Make this dynamic
      view: filterType,
      canEdit: user?.isManager || user?.isAdmin || user?.role === 'MANAGEMENT',
      metrics: {
        traffic: metrics.traffic || 0,
        conversion: metrics.conversion || 0,
        avgBasket: metrics.avgBasket || 0,
        totalSales: metrics.totalSales || 0,
        appointments: appointments.length
      },
      employees: enrichedEmployees,
      appointments: appointments,
      bestSellers: bestSellers.slice(0, 10), // Top 10
      availableViews: getAvailableViews(user),
      lastUpdated: gameplan.lastUpdated || metrics.lastUpdated || new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('[GAMEPLAN] Unified endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to load game plan',
      message: error.message 
    });
  }
});

// Helper function to determine available views based on user role
function getAvailableViews(user) {
  const views = [];
  
  if (user?.isManager || user?.isAdmin || user?.role === 'MANAGEMENT') {
    views.push(
      { id: 'all', label: 'All Employees', icon: '👥' },
      { id: 'boh', label: 'Back of House', icon: '📦' },
      { id: 'sa', label: 'Sales Associates', icon: '👔' },
      { id: 'tailors', label: 'Tailors', icon: '✂️' },
      { id: 'management', label: 'Management', icon: '👨‍💼' }
    );
  } else if (user?.role === 'BOH') {
    views.push({ id: 'boh', label: 'Back of House', icon: '📦' });
  } else if (user?.role === 'SA') {
    views.push({ id: 'sa', label: 'Sales Associates', icon: '👔' });
  } else if (user?.role === 'TAILOR') {
    views.push({ id: 'tailors', label: 'Tailors', icon: '✂️' });
  } else {
    views.push({ id: 'all', label: 'All Employees', icon: '👥' });
  }
  
  return views;
}

// GET /api/gameplan/calendar/:year/:month - Get calendar data for a month
router.get('/calendar/:year/:month', (req, res) => {
  const { year, month } = req.params;

  // Validate parameters
  const yearNum = parseInt(year);
  const monthNum = parseInt(month) - 1; // JS months are 0-based

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }

  try {
    const plans = {};
    const stats = { total: 0, published: 0, drafts: 0, upcoming: 0 };
    const upcomingPlans = [];

    // Get all game plan files for the month
    const fs = require('fs');
    const path = require('path');

    // Calculate date range for the month
    const startDate = new Date(yearNum, monthNum, 1);
    const endDate = new Date(yearNum, monthNum + 1, 0);

    // Check each day of the month
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const gameplanFile = path.join(GAMEPLAN_DIR, `${dateStr}.json`);

      try {
        if (fs.existsSync(gameplanFile)) {
          const gameplan = JSON.parse(fs.readFileSync(gameplanFile, 'utf8'));
          plans[dateStr] = {
            date: dateStr,
            published: gameplan.published || false,
            lastEditedAt: gameplan.savedAt,
            lastEditedBy: gameplan.lastEditedBy,
            locked: gameplan.locked || false,
            lockedBy: gameplan.lockedBy
          };

          stats.total++;

          if (gameplan.published) {
            stats.published++;
          } else {
            stats.drafts++;
          }

          // Check if it's upcoming (future date)
          if (new Date(dateStr) > new Date()) {
            stats.upcoming++;
            upcomingPlans.push(plans[dateStr]);
          }
        }
      } catch (error) {
        console.error(`Error reading gameplan for ${dateStr}:`, error);
      }
    }

    // Sort upcoming plans by date
    upcomingPlans.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      year: yearNum,
      month: monthNum + 1,
      plans,
      stats,
      upcomingPlans: upcomingPlans.slice(0, 10) // Limit to next 10
    });

  } catch (error) {
    console.error('Error loading calendar data:', error);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

module.exports = router;
