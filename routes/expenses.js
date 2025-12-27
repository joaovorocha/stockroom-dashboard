const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const dal = require('../utils/dal');
const { LookerDataProcessor } = require('../utils/looker-data-processor');

const router = express.Router();

const DATA_DIR = dal.paths.dataDir;
const CONFIG_FILE = path.join(DATA_DIR, 'work-expenses-config.json');
const NOTES_FILE = path.join(DATA_DIR, 'expense-order-notes.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'expense-order-uploads');
const APPROVER_OVERRIDES_FILE = path.join(DATA_DIR, 'expense-approver-overrides.json');

function readJson(filePath, fallback) {
  return dal.readJson(filePath, fallback);
}

function writeJson(filePath, payload) {
  return dal.writeJsonAtomic(filePath, payload, { pretty: true });
}

function getConfig() {
  const cfg = readJson(CONFIG_FILE, null) || {};
  return {
    globalMonthlyLimit: Number.isFinite(Number(cfg.globalMonthlyLimit)) ? Number(cfg.globalMonthlyLimit) : null,
    globalYearlyLimit: Number.isFinite(Number(cfg.globalYearlyLimit)) ? Number(cfg.globalYearlyLimit) : 2500,
    overrides: cfg.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {},
    updatedAt: cfg.updatedAt || null,
    updatedBy: cfg.updatedBy || null
  };
}

function normalizeEmail(value) {
  return (value || '').toString().trim().toLowerCase();
}

function normalizeNameKey(value) {
  return (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function suggestWorkEmailFromName(name) {
  const raw = (name || '').toString().trim();
  if (!raw) return null;
  const cleaned = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z\s-]+/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '');
  if (!first || !last) return null;
  return `${first[0].toLowerCase()}${last.toLowerCase()}@suitsupply.com`;
}

function safeFileName(value) {
  return (value || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'unknown';
}

function readUsersIndex() {
  const byEmail = new Map();
  const byEmployeeId = new Map();
  const byName = new Map();
  try {
    const raw = readJson(dal.paths.usersFile, null);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.users) ? raw.users : []);
    list.forEach(u => {
      const email = normalizeEmail(u?.email);
      if (email) byEmail.set(email, u);
      const empId = (u?.employeeId || '').toString().trim();
      if (empId) byEmployeeId.set(empId, u);
      const nameKey = normalizeNameKey(u?.name);
      if (nameKey) byName.set(nameKey, u);
    });
  } catch (_) {}
  return { byEmail, byEmployeeId, byName };
}

function readApproverOverrides() {
  const raw = readJson(APPROVER_OVERRIDES_FILE, null) || {};
  const approvers = raw.approvers && typeof raw.approvers === 'object' ? raw.approvers : {};
  return { approvers };
}

function writeApproverOverrides(next) {
  writeJson(APPROVER_OVERRIDES_FILE, next);
}

function getSavedExpenses() {
  const saved = LookerDataProcessor.getSavedDashboardData();
  const exp = saved?.workRelatedExpenses;
  if (!exp || !Array.isArray(exp.orders)) return null;
  return exp;
}

function isManagerOrAdmin(user) {
  return !!(user?.isAdmin || user?.isManager);
}

function parseIsoDate(value) {
  const s = (value || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function filterOrders(orders, { start, end, employeeEmail } = {}) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const raw = (employeeEmail || '').toString().trim();
  const email = raw.includes('@') ? normalizeEmail(raw) : '';
  const rawKey = !email ? normalizeNameKey(raw) : '';

  return (orders || []).filter(o => {
    if (email || rawKey) {
      const b = o?.beneficiary || {};
      const rowEmail = normalizeEmail(b?.email);
      const rowNameKey = normalizeNameKey(b?.name) || normalizeNameKey(o?.customerName);
      const rowEmpId = (b?.employeeId || '').toString().trim().toLowerCase();
      const rowKey = (b?.key || '').toString().trim().toLowerCase();

      if (email && rowEmail !== email) return false;
      if (!email && rawKey) {
        const matches =
          (rowEmpId && rowEmpId === rawKey) ||
          (rowNameKey && rowNameKey === rawKey) ||
          (rowKey && rowKey === rawKey);
        if (!matches) return false;
      }
    }

    const d = (o?.calendarDate || '').toString().trim();
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;
    return true;
  });
}

function sumLcFullPrice(orders) {
  return (orders || []).reduce((acc, o) => acc + Number(o?.amounts?.lc?.fullPrice || 0), 0);
}

function buildLimitStatus({ retailValueLc, limit } = {}) {
  const used = Number(retailValueLc || 0);
  const lim = Number(limit);
  if (!Number.isFinite(lim)) {
    return { limit: null, used, remaining: null, percentUsed: null, over: false };
  }
  const remaining = Math.max(0, lim - used);
  const percentUsed = lim > 0 ? Math.round((used / lim) * 1000) / 10 : null;
  const over = used > lim;
  return { limit: lim, used, remaining, percentUsed, over };
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isInMonth(order, monthKey) {
  const d = (order?.calendarDate || '').toString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d.slice(0, 7) === monthKey;
}

function isInYear(order, year) {
  const d = (order?.calendarDate || '').toString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return Number(d.slice(0, 4)) === year;
}

function resolveLimits(config, userEmail) {
  const email = normalizeEmail(userEmail);
  const override = email && config?.overrides && typeof config.overrides === 'object'
    ? config.overrides[email] || null
    : null;

  const monthlyLimit = override && Number.isFinite(Number(override.monthlyLimit))
    ? Number(override.monthlyLimit)
    : config.globalMonthlyLimit;

  const yearlyLimit = override && Number.isFinite(Number(override.yearlyLimit))
    ? Number(override.yearlyLimit)
    : config.globalYearlyLimit;

  return { monthlyLimit: monthlyLimit ?? null, yearlyLimit: yearlyLimit ?? null };
}

function normalizeOrder(order, usersIndex, overrides) {
  const o = order || {};
  const ov = overrides || { approvers: {} };

  const beneficiaryName = o?.beneficiary?.name || o?.customerName || null;
  const approverEmail = o?.approver?.email || o?.employee?.email || null;
  const approverNumber = o?.approver?.number || o?.employee?.number || null;

  const approverUser =
    (approverEmail ? usersIndex.byEmail.get(normalizeEmail(approverEmail)) : null) ||
    (approverNumber ? usersIndex.byEmployeeId.get(String(approverNumber).trim()) : null) ||
    null;

  const beneficiaryUser = beneficiaryName
    ? usersIndex.byName.get(normalizeNameKey(beneficiaryName)) || null
    : null;

  const approverRole = (approverUser?.role || '').toString().trim().toUpperCase();
  const approverRoleIsManager = approverRole === 'MANAGEMENT' || approverRole === 'ADMIN';
  const approverRoleIsAdmin = approverRole === 'ADMIN';

  const beneficiary = {
    name: beneficiaryName,
    email: o?.beneficiary?.email || beneficiaryUser?.email || null,
    employeeId: o?.beneficiary?.employeeId || beneficiaryUser?.employeeId || null,
    imageUrl: o?.beneficiary?.imageUrl || beneficiaryUser?.imageUrl || null
  };
  beneficiary.key = normalizeEmail(beneficiary.email) || (beneficiary.employeeId || '').toString().trim() || normalizeNameKey(beneficiary.name);

  const approver = {
    name: o?.approver?.name || o?.employee?.name || null,
    email: approverEmail || null,
    number: approverNumber || null,
    imageUrl: o?.approver?.imageUrl || o?.employee?.imageUrl || approverUser?.imageUrl || null,
    isManager: o?.approver?.isManager === true || approverUser?.isManager === true || approverRoleIsManager,
    isAdmin: o?.approver?.isAdmin === true || approverUser?.isAdmin === true || approverRoleIsAdmin
  };

  const overrideKey = normalizeEmail(approver.email);
  const forced = overrideKey && ov.approvers && ov.approvers[overrideKey] ? ov.approvers[overrideKey] : null;
  const forceManager = typeof forced?.forceManager === 'boolean' ? forced.forceManager : null;
  if (forceManager === true) approver.isManager = true;
  if (forceManager === false) {
    approver.isManager = false;
    approver.isAdmin = false;
  }

  // Only used for row-level “needs review” highlighting.
  const unauthorized = !(approver.isAdmin || approver.isManager);

  return {
    ...o,
    beneficiary,
    approver,
    // Keep legacy fields around for older UI bits.
    customerName: beneficiary.name || null,
    employee: {
      ...(o?.employee || {}),
      number: approver.number || o?.employee?.number || null,
      name: approver.name || o?.employee?.name || null,
      email: approver.email || o?.employee?.email || null,
      imageUrl: approver.imageUrl || o?.employee?.imageUrl || null
    },
    unauthorized
  };
}

function listApproversFromOrders(orders, usersIndex) {
  const overrides = readApproverOverrides();
  const byKey = new Map();

  (orders || []).forEach(raw => {
    const o = normalizeOrder(raw, usersIndex, overrides);
    const a = o?.approver || {};
    const name = (a.name || '').toString().trim();
    const email = normalizeEmail(a.email);
    const key = email || normalizeNameKey(name);
    if (!key) return;
    if (!byKey.has(key)) {
      const autoManager =
        !!(a?.isAdmin || a?.isManager) &&
        !(overrides.approvers?.[email]?.forceManager === false);

      byKey.set(key, {
        key,
        name: name || null,
        email: email || null,
        suggestedEmail: !email && name ? suggestWorkEmailFromName(name) : null,
        autoManager,
        forceManager: email && overrides.approvers?.[email] && typeof overrides.approvers[email].forceManager === 'boolean'
          ? overrides.approvers[email].forceManager
          : null,
        effectiveManager: !!(a?.isAdmin || a?.isManager),
        count: 0
      });
    }
    byKey.get(key).count += 1;
  });

  return Array.from(byKey.values()).sort((x, y) => (y.count - x.count));
}

function computeAggregatesFromOrders(orders, config) {
  const today = new Date();
  const year = today.getFullYear();
  const monthKey = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const byEmployee = new Map();
  const storeTotals = {
    currentYear: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 },
    currentMonth: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 }
  };

  for (const o of orders || []) {
    const emailKey = normalizeEmail(o?.beneficiary?.email);
    const empIdKey = (o?.beneficiary?.employeeId || '').toString().trim();
    const nameKey = normalizeNameKey(o?.beneficiary?.name);
    const normKey = emailKey || empIdKey || nameKey;
    if (!normKey) continue;

    if (!byEmployee.has(normKey)) {
      byEmployee.set(normKey, {
        key: normKey,
        employee: { ...(o.beneficiary || {}), key: normKey },
        known: !!emailKey,
        unauthorizedOrders: 0,
        totals: {
          currentYear: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 },
          currentMonth: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 }
        }
      });
    }

    const entry = byEmployee.get(normKey);
    entry.employee = entry.employee?.email ? entry.employee : { ...(o.beneficiary || {}), key: normKey };
    if (entry.known !== true && o?.beneficiary?.email) entry.known = true;
    if (o?.unauthorized) entry.unauthorizedOrders += 1;

    const d = o.calendarDate ? new Date(`${o.calendarDate}T00:00:00Z`) : null;
    const y = d && Number.isFinite(d.getTime()) ? d.getUTCFullYear() : null;
    const mk = d && Number.isFinite(d.getTime()) ? `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : null;

    const lc = o.amounts?.lc || {};
    const discount = Number(lc.discount || 0);
    const full = Number(lc.fullPrice || 0);
    const net = Number(lc.netRevenue || 0);

    if (y === year) {
      entry.totals.currentYear.orders += 1;
      entry.totals.currentYear.discountLc += discount;
      entry.totals.currentYear.fullPriceLc += full;
      entry.totals.currentYear.netRevenueLc += net;

      storeTotals.currentYear.orders += 1;
      storeTotals.currentYear.discountLc += discount;
      storeTotals.currentYear.fullPriceLc += full;
      storeTotals.currentYear.netRevenueLc += net;
    }

    if (mk === monthKey) {
      entry.totals.currentMonth.orders += 1;
      entry.totals.currentMonth.discountLc += discount;
      entry.totals.currentMonth.fullPriceLc += full;
      entry.totals.currentMonth.netRevenueLc += net;

      storeTotals.currentMonth.orders += 1;
      storeTotals.currentMonth.discountLc += discount;
      storeTotals.currentMonth.fullPriceLc += full;
      storeTotals.currentMonth.netRevenueLc += net;
    }
  }

  const employees = Array.from(byEmployee.values()).map(e => {
    const email = normalizeEmail(e?.employee?.email);
    const { monthlyLimit, yearlyLimit } = resolveLimits(config, email);

    const monthRetail = Number(e?.totals?.currentMonth?.fullPriceLc || 0);
    const yearRetail = Number(e?.totals?.currentYear?.fullPriceLc || 0);

    const month = buildLimitStatus({ retailValueLc: monthRetail, limit: monthlyLimit });
    const yearStatus = buildLimitStatus({ retailValueLc: yearRetail, limit: yearlyLimit });

    return {
      ...e,
      limits: { monthlyLimit, yearlyLimit },
      status: { monthly: month, yearly: yearStatus },
      overLimit: { monthly: month.over, yearly: yearStatus.over }
    };
  });

  return {
    monthKey,
    year,
    storeTotals,
    employees: employees.sort((a, b) => (Number(b?.totals?.currentYear?.fullPriceLc || 0) - Number(a?.totals?.currentYear?.fullPriceLc || 0)))
  };
}

function readNotesStore() {
  return readJson(NOTES_FILE, { orders: {} }) || { orders: {} };
}

function writeNotesStore(store) {
  return writeJson(NOTES_FILE, store);
}

function getOrderAccessKey(user) {
  const email = normalizeEmail(user?.email);
  const nameKey = normalizeNameKey(user?.name);
  return { email, nameKey };
}

function canAccessOrder(user, order) {
  if (isManagerOrAdmin(user) || user?.isAdmin) return true;
  const { email, nameKey } = getOrderAccessKey(user);
  const b = order?.beneficiary || {};
  const bEmail = normalizeEmail(b?.email);
  const bName = normalizeNameKey(b?.name);
  if (email && bEmail && email === bEmail) return true;
  if (nameKey && bName && nameKey === bName) return true;
  return false;
}

function ensureOrderUploadDir(orderId) {
  const safeOrder = safeFileName(orderId);
  const dir = path.join(UPLOADS_DIR, safeOrder);
  dal.ensureDir(dir);
  return dir;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, ensureOrderUploadDir(req.params.orderId));
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const id = crypto.randomUUID();
      const safe = safeFileName(file.originalname);
      req._expenseUploadIds = Array.isArray(req._expenseUploadIds) ? req._expenseUploadIds : [];
      req._expenseUploadIds.push(id);
      cb(null, `${id}_${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

// GET /api/expenses/config - read-only config for UI (all authed users)
router.get('/config', (req, res) => {
  const config = getConfig();
  const limits = resolveLimits(config, req.user?.email);
  return res.json({ ...config, limits });
});

// GET /api/expenses - list orders (employees: self only; managers/admin: can filter)
router.get('/', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.json({ success: true, source: null, orders: [], employees: [], storeTotals: null });

  const config = getConfig();
  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();
  const userEmail = normalizeEmail(req.user?.email);

  const requestedRaw = (req.query.employeeEmail || '').toString().trim();
  const effectiveEmployeeFilter = isManagerOrAdmin(req.user)
    ? (requestedRaw || '')
    : (userEmail || req.user?.name || '');

  const start = parseIsoDate(req.query.start);
  const end = parseIsoDate(req.query.end);

  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const filtered = filterOrders(normalizedOrders, {
    start,
    end,
    employeeEmail: effectiveEmployeeFilter || null
  });

  // Employees list + store totals are derived from orders to remain correct even if older saved payloads had inverted fields.
  const aggregates = computeAggregatesFromOrders(normalizedOrders, config);

  return res.json({
    success: true,
    source: { importedAt: exp.importedAt, sourceFile: exp.sourceFile },
    filters: { start: start || null, end: end || null, employeeEmail: effectiveEmployeeFilter || null },
    orders: filtered,
    storeTotals: aggregates.storeTotals || exp.storeTotals || null,
    employees: isManagerOrAdmin(req.user) ? aggregates.employees : [],
    currentYear: aggregates.year,
    currentMonthKey: aggregates.monthKey
  });
});

// GET /api/expenses/status - current user's limit status (for header/banner)
router.get('/status', (req, res) => {
  const exp = getSavedExpenses();
  const config = getConfig();
  const limits = resolveLimits(config, req.user?.email);
  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();

  if (!exp) {
    return res.json({
      success: true,
      available: false,
      totals: { currentMonthRetailLc: 0, currentYearRetailLc: 0 },
      limits
    });
  }

  const email = normalizeEmail(req.user?.email);
  const nameKey = normalizeNameKey(req.user?.name);
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const mine = normalizedOrders.filter(o => {
    const bEmail = normalizeEmail(o?.beneficiary?.email);
    const bName = normalizeNameKey(o?.beneficiary?.name);
    if (email && bEmail && email === bEmail) return true;
    if (nameKey && bName && nameKey === bName) return true;
    return false;
  });
  const monthKey = currentMonthKey();
  const year = new Date().getFullYear();

  const monthOrders = mine.filter(o => isInMonth(o, monthKey));
  const yearOrders = mine.filter(o => isInYear(o, year));

  const currentMonthRetailLc = sumLcFullPrice(monthOrders);
  const currentYearRetailLc = sumLcFullPrice(yearOrders);

  const monthly = buildLimitStatus({ retailValueLc: currentMonthRetailLc, limit: limits.monthlyLimit });
  const yearly = buildLimitStatus({ retailValueLc: currentYearRetailLc, limit: limits.yearlyLimit });

  return res.json({
    success: true,
    available: true,
    monthKey,
    year,
    totals: { currentMonthRetailLc, currentYearRetailLc, monthOrders: monthOrders.length, yearOrders: yearOrders.length },
    limits,
    status: { monthly, yearly },
    overLimit: { monthly: monthly.over, yearly: yearly.over }
  });
});

// GET /api/expenses/approvers - list approvers + overrides (manager/admin)
router.get('/approvers', (req, res) => {
  if (!isManagerOrAdmin(req.user)) return res.status(403).json({ error: 'Manager access required' });
  const exp = getSavedExpenses();
  if (!exp) return res.json({ success: true, available: false, approvers: [], overrides: readApproverOverrides() });
  const usersIndex = readUsersIndex();
  const list = listApproversFromOrders(exp.orders || [], usersIndex);
  return res.json({ success: true, available: true, approvers: list, overrides: readApproverOverrides() });
});

// POST /api/expenses/approvers - update overrides (manager/admin)
router.post('/approvers', express.json(), (req, res) => {
  if (!isManagerOrAdmin(req.user)) return res.status(403).json({ error: 'Manager access required' });
  const patch = req.body || {};
  const items = Array.isArray(patch.approvers) ? patch.approvers : [];

  const next = readApproverOverrides();
  next.approvers = next.approvers && typeof next.approvers === 'object' ? next.approvers : {};

  items.forEach(it => {
    const email = normalizeEmail(it?.email);
    if (!email || !email.includes('@')) return;
    const force = it?.forceManager;
    if (force === null || force === undefined || force === '') {
      delete next.approvers[email];
      return;
    }
    if (force !== true && force !== false) return;
    next.approvers[email] = {
      forceManager: force,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || req.user?.email || null
    };
  });

  writeApproverOverrides(next);
  return res.json({ success: true, overrides: next });
});

// GET /api/expenses/orders/:orderId/notes - read notes + attachments
router.get('/orders/:orderId/notes', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.status(404).json({ error: 'No expenses data available' });

  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const orderId = (req.params.orderId || '').toString().trim();
  const order = normalizedOrders.find(o => String(o?.orderId || '') === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!canAccessOrder(req.user, order)) return res.status(403).json({ error: 'Not allowed' });

  const store = readNotesStore();
  const entry = store.orders[orderId] || { notes: [], attachments: [] };
  return res.json({ success: true, orderId, ...entry });
});

// POST /api/expenses/orders/:orderId/notes - add note
router.post('/orders/:orderId/notes', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.status(404).json({ error: 'No expenses data available' });

  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const orderId = (req.params.orderId || '').toString().trim();
  const order = normalizedOrders.find(o => String(o?.orderId || '') === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ error: 'Not allowed' });

  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Note text is required' });
  if (text.length > 4000) return res.status(400).json({ error: 'Note is too long' });

  const store = readNotesStore();
  store.orders[orderId] = store.orders[orderId] || { notes: [], attachments: [] };
  store.orders[orderId].notes = Array.isArray(store.orders[orderId].notes) ? store.orders[orderId].notes : [];
  const note = {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString(),
    createdBy: { name: req.user?.name || null, email: req.user?.email || null }
  };
  store.orders[orderId].notes.push(note);
  writeNotesStore(store);
  return res.json({ success: true, note });
});

// POST /api/expenses/orders/:orderId/attachments - upload attachments
router.post('/orders/:orderId/attachments', upload.array('files', 5), (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.status(404).json({ error: 'No expenses data available' });

  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const orderId = (req.params.orderId || '').toString().trim();
  const order = normalizedOrders.find(o => String(o?.orderId || '') === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ error: 'Not allowed' });

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const store = readNotesStore();
  store.orders[orderId] = store.orders[orderId] || { notes: [], attachments: [] };
  store.orders[orderId].attachments = Array.isArray(store.orders[orderId].attachments) ? store.orders[orderId].attachments : [];

  const safeOrder = safeFileName(orderId);
  const uploaded = [];
  for (const f of files) {
    const base = path.basename(f.filename || '');
    const id = base.split('_')[0] || crypto.randomUUID();
    const record = {
      id,
      originalName: f.originalname || base,
      mimeType: f.mimetype || null,
      size: Number(f.size || 0),
      storedName: base,
      storedPath: path.join(safeOrder, base),
      uploadedAt: new Date().toISOString(),
      uploadedBy: { name: req.user?.name || null, email: req.user?.email || null }
    };
    store.orders[orderId].attachments.push(record);
    uploaded.push(record);
  }

  writeNotesStore(store);
  return res.json({ success: true, attachments: uploaded });
});

// GET /api/expenses/orders/:orderId/attachments/:attachmentId - download
router.get('/orders/:orderId/attachments/:attachmentId', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.status(404).json({ error: 'No expenses data available' });

  const usersIndex = readUsersIndex();
  const overrides = readApproverOverrides();
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex, overrides));
  const orderId = (req.params.orderId || '').toString().trim();
  const order = normalizedOrders.find(o => String(o?.orderId || '') === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ error: 'Not allowed' });

  const attachmentId = (req.params.attachmentId || '').toString().trim();
  const store = readNotesStore();
  const entry = store.orders[orderId] || {};
  const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  const att = attachments.find(a => String(a?.id || '') === attachmentId);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  const safeOrder = safeFileName(orderId);
  const storedName = path.basename(att.storedName || '');
  const filePath = path.join(UPLOADS_DIR, safeOrder, storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  return res.download(filePath, att.originalName || storedName);
});

module.exports = router;
