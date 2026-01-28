/**
 * Looker Data Processor
 * 
 * Processes CSV files from Looker exports and updates:
 * - Store metrics (data/store-metrics/{date}.json)
 * - Employee metrics (data/employees-v2.json)
 * - Tailor productivity
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const { getDataDir, getFilesDir } = require('./paths');
const { parseEmailSubject, isMultiStoreCSV } = require('./multi-store-parser');

const DATA_DIR = getDataDir();
const FILES_DIR = getFilesDir();
const METRICS_DIR = path.join(DATA_DIR, 'store-metrics');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees-v2.json');

// CSV folder paths
const STORES_PERFORMANCE_DIR = path.join(FILES_DIR, 'dashboard-stores_performance');
const APPOINTMENTS_DIR = path.join(FILES_DIR, 'dashboard-appointment_booking_insights_v2');
const LOANS_DIR = path.join(FILES_DIR, 'dashboard-loan_dashboard');
const TAILOR_DIR = path.join(FILES_DIR, 'dashboard-tailor_myr');
const STORE_OPS_OVERDUE_AUDIT_DIR = path.join(FILES_DIR, 'dashboard-store_ops_overdue_audit');
const COUNT_PERFORMANCE_DIR = path.join(FILES_DIR, 'dashboard-store_count_performance_-_employee_level');
const COUNT_PERFORMANCE_STORE_DIR = path.join(FILES_DIR, 'dashboard-store_count_performance_-_store_level');
const WORK_EXPENSES_DIR = path.join(FILES_DIR, 'dashboard-work_related_expenses');
const GMAIL_IMPORTS_DIR = path.join(FILES_DIR, 'gmail-imports');
const DASHBOARD_DATA_FILE = path.join(DATA_DIR, 'dashboard-data.json');
const SCAN_PERFORMANCE_HISTORY_DIR = path.join(DATA_DIR, 'scan-performance-history');
const SYNC_RESULTS_DIR = path.join(DATA_DIR, 'sync-results');

class LookerDataProcessor {
  constructor() {
    this.errors = [];
    this.processedFiles = [];
    this.emailInfo = null; // Will be set in processAll() for multi-store detection
  }

  // Get today's date string
  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // Read JSON file safely
  readJsonFile(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
      this.errors.push(`Read error: ${filePath}`);
    }
    return defaultValue;
  }

  // Write JSON file
  writeJsonFile(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  // Save all processed data to dashboard-data.json for persistent storage
  // If no new data, keep existing data and return status
  saveToDashboardData(results, syncBy = 'scheduler', emailDate = null, importStats = null) {
    // Get existing data to merge with
    const existingData = LookerDataProcessor.getSavedDashboardData() || {};
    
    // Check if we have new meaningful data
    const hasNewMetrics = results.storeMetrics && results.storeMetrics.wtd;
    const hasNewWaitwhile = this.processWaitwhileData();
    const hasNewBestSellers = this.processBestSellers();
    
    // Track what was updated
    const updates = {
      metrics: hasNewMetrics,
      waitwhile: hasNewWaitwhile && Object.keys(hasNewWaitwhile).length > 0,
      bestSellers: hasNewBestSellers && (hasNewBestSellers.byRevenue?.length > 0 || hasNewBestSellers.byQuantity?.length > 0),
      operationsHealth: results.operationsHealth && Object.keys(results.operationsHealth).length > 0,
      customerOrders: results.customerReservedOrders && (results.customerReservedOrders.orders?.length > 0 || results.customerReservedOrders.total > 0),
      workRelatedExpenses: results.workRelatedExpenses && Array.isArray(results.workRelatedExpenses.orders) && results.workRelatedExpenses.orders.length > 0
    };
    
    const hasAnyNewData = Object.values(updates).some(v => v);
    
    const resolveSchedulerImportStats = () => {
      try {
        const dateKey = this.getTodayDate();
        const filePath = path.join(SYNC_RESULTS_DIR, `${dateKey}.json`);
        if (!fs.existsSync(filePath)) return null;
        const all = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(all) || all.length === 0) return null;
        const last = all[all.length - 1];
        const files = Array.isArray(last?.fetch?.filesExtracted) ? last.fetch.filesExtracted : [];
        const count = Number(last?.fetch?.filesExtracted?.length);
        return {
          recordsImported: Number.isFinite(count) ? count : files.length,
          files: files.map(f => path.basename(String(f)))
        };
      } catch (_) {
        return null;
      }
    };

    const statsFromParam =
      importStats && Number.isFinite(Number(importStats.recordsImported))
        ? {
            recordsImported: Number(importStats.recordsImported),
            files: Array.isArray(importStats.files) ? importStats.files : null
          }
        : null;

    const statsFromSyncResults = syncBy === 'scheduler' ? resolveSchedulerImportStats() : null;
    const finalStats = statsFromParam || statsFromSyncResults || null;

    const nextImported = finalStats?.recordsImported;
    const shouldOverrideImported = Number.isFinite(nextImported) && nextImported > 0;
    const nextImportedFiles = Array.isArray(finalStats?.files) ? finalStats.files : null;
    const shouldOverrideFiles = Array.isArray(nextImportedFiles) && nextImportedFiles.length > 0;

    const dashboardData = {
      lastSyncTime: new Date().toISOString(),
      lastSyncBy: syncBy,
      lastEmailReceived: emailDate || existingData.lastEmailReceived || null, // Track when email was actually received
      dataDate: this.getTodayDate(),
      hasNewData: hasAnyNewData,
      updatedSections: updates,
      // Persist the real import stats from the Looker fetch step (not computed in the browser).
      recordsImported: shouldOverrideImported ? nextImported : (existingData.recordsImported ?? null),
      recordsImportedFiles: shouldOverrideFiles ? nextImportedFiles : (existingData.recordsImportedFiles ?? null),
      
      // Merge: use new data if available, otherwise keep existing
      metrics: hasNewMetrics ? results.storeMetrics : (existingData.metrics || {}),
      
      // Appointments/Waitwhile data
      appointments: results.appointments || existingData.appointments || {},
      waitwhile: updates.waitwhile ? hasNewWaitwhile : (existingData.waitwhile || {}),
      
      // Best sellers
      bestSellers: updates.bestSellers ? hasNewBestSellers : (existingData.bestSellers || {}),
      
      // Customer orders
      customerOrders: updates.customerOrders ? results.customerReservedOrders : (existingData.customerOrders || {}),
      
      // Operations health
      operationsHealth: updates.operationsHealth ? results.operationsHealth : (existingData.operationsHealth || {}),
      
      // Inventory issues
      inventoryIssues: results.inventoryIssues || existingData.inventoryIssues || {},
      
      // Tailor trend
      tailorTrend: results.tailorProductivityTrend || existingData.tailorTrend || {},
      
      // Count performance
      countPerformance: results.employeeCountPerformance || existingData.countPerformance || {},
      storeCountPerformance: results.storeCountPerformance || existingData.storeCountPerformance || {},
      
      // Loans
      loans: results.loans || existingData.loans || {},

      // Work-related expenses / employee discounts
      workRelatedExpenses: updates.workRelatedExpenses ? results.workRelatedExpenses : (existingData.workRelatedExpenses || {}),

      // Store Ops Overdue Audit (PDF)
      storeOpsOverdueAudit: results.storeOpsOverdueAudit || existingData.storeOpsOverdueAudit || null
    };

    this.writeJsonFile(DASHBOARD_DATA_FILE, dashboardData);
    console.log(`Saved dashboard data to: ${DASHBOARD_DATA_FILE}`);
    console.log(`Has new data: ${hasAnyNewData}`);

    // Persist daily scan performance snapshots (Looker "Store Count Performance - Employee Level")
    // so BOH scan accuracy/history remains available even when Looker exports rotate.
    this.persistScanPerformanceSnapshot(results.employeeCountPerformance, dashboardData.dataDate, syncBy);
    
    // NEW: Also sync Looker data to PostgreSQL database for unified access
    if (results.employeeCountPerformance?.employees?.length > 0) {
      this.syncLookerDataToDatabase(results.employeeCountPerformance, dashboardData.dataDate)
        .then(syncResult => {
          console.log(`[LOOKER SYNC] Database sync complete: ${syncResult.synced} records synced`);
        })
        .catch(err => {
          console.error('[LOOKER SYNC] Database sync failed:', err);
        });
    }
    
    return dashboardData;
  }

  normalizeName(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  // NEW: Sync Looker snapshot data to PostgreSQL daily_scan_results table
  async syncLookerDataToDatabase(countPerformance, date) {
    try {
      if (!countPerformance || !Array.isArray(countPerformance.employees) || countPerformance.employees.length === 0) {
        console.log('[LOOKER SYNC] No employee count performance data to sync');
        return { synced: 0, errors: [] };
      }

      const { getPool } = require('./dal/pg');
      const pool = getPool();
      if (!pool) {
        console.log('[LOOKER SYNC] No database pool available');
        return { synced: 0, errors: [] };
      }
      
      // Get list of valid employee emails/names from users table
      const validUsersResult = await pool.query(
        `SELECT id, LOWER(email) as email, LOWER(name) as name FROM users WHERE is_active = true`
      );
      const validEmails = new Set(validUsersResult.rows.map(r => r.email));
      const validNames = new Set(validUsersResult.rows.map(r => r.name));
      console.log(`[LOOKER SYNC] Found ${validEmails.size} valid employees in database`);

      let synced = 0;
      let skipped = 0;
      const errors = [];
      const scanDate = date || new Date().toISOString().split('T')[0];

      for (const emp of countPerformance.employees) {
        try {
          const countedBy = emp.name || 'Unknown';
          const accuracy = parseFloat(emp.accuracy || 0);
          const countsDone = parseInt(emp.countsDone || 0);
          
          // Only sync if employee has actually done scans
          if (countsDone === 0) continue;
          
          // Skip if employee is not in the users table
          const lowerCountedBy = countedBy.toLowerCase();
          if (!validEmails.has(lowerCountedBy) && !validNames.has(lowerCountedBy)) {
            console.log(`[LOOKER SYNC] Skipping ${countedBy} - not a valid employee in database`);
            skipped++;
            continue;
          }
          
          // Skip generic store emails
          if (lowerCountedBy === 'sanfrancisco@suitsupply.com' || 
              lowerCountedBy.includes('store@') ||
              /^j\d+$/i.test(countedBy)) {
            console.log(`[LOOKER SYNC] Skipping ${countedBy} - generic/store identifier`);
            skipped++;
            continue;
          }

          // Check if this employee already has a scan record for this date
          const existing = await pool.query(
            `SELECT count_id FROM daily_scan_results 
             WHERE scan_date = $1 AND LOWER(counted_by) = LOWER($2)
             LIMIT 1`,
            [scanDate, countedBy]
          );

          if (existing.rows.length > 0) {
            // Record already exists - skip to avoid conflicts
            console.log(`[LOOKER SYNC] Skipping ${countedBy} - already has scan on ${scanDate}`);
            skipped++;
            continue;
          }

          // Create synthetic count_id for Looker data
          const countId = `LOOKER-${scanDate}-${countedBy.replace(/\s+/g, '-')}`;

          // Insert Looker-sourced scan result using correct column names
          await pool.query(
            `INSERT INTO daily_scan_results (
              count_id, status, scan_date, counted_by,
              expected_units, counted_units,
              missed_units_available, missed_units_reserved
            ) VALUES (
              $1, 'COMPLETED', $2, $3, 
              $4, $5,
              $6, $7
            )
            ON CONFLICT (count_id) DO NOTHING`,
            [
              countId, scanDate, countedBy,
              100, Math.round(accuracy),
              emp.missedAvailable || 0, emp.missedReserved || 0
            ]
          );
          synced++;
        } catch (err) {
          errors.push({ employee: emp.name, error: err.message });
          console.error(`[LOOKER SYNC] Error syncing ${emp.name}:`, err);
        }
      }

      console.log(`[LOOKER SYNC] Synced ${synced} Looker records to database (skipped ${skipped} invalid employees)`);
      return { synced, skipped, errors };
    } catch (error) {
      console.error('[LOOKER SYNC] Error in syncLookerDataToDatabase:', error);
      return { synced: 0, errors: [{ error: error.message }] };
    }
  }

  persistScanPerformanceSnapshot(countPerformance, date, source = 'scheduler') {
    try {
      if (!countPerformance || !Array.isArray(countPerformance.employees) || countPerformance.employees.length === 0) return;

      const employeesData = this.readJsonFile(EMPLOYEES_FILE, { employees: {} });
      const roster = []
        .concat(employeesData.employees?.BOH || [])
        .concat(employeesData.employees?.MANAGEMENT || [])
        .concat(employeesData.employees?.SA || [])
        .concat(employeesData.employees?.TAILOR || []);

      const rosterByName = new Map();
      roster.forEach(e => {
        if (e?.name) rosterByName.set(this.normalizeName(e.name), e);
      });

      const enriched = countPerformance.employees.map(e => {
        const match = rosterByName.get(this.normalizeName(e.name));
        return {
          ...e,
          employeeId: match?.employeeId || null,
          id: match?.id || null,
          type: match?.type || null,
          imageUrl: match?.imageUrl || null
        };
      });

      if (!fs.existsSync(SCAN_PERFORMANCE_HISTORY_DIR)) {
        fs.mkdirSync(SCAN_PERFORMANCE_HISTORY_DIR, { recursive: true });
      }

      const snapshot = {
        date: date || this.getTodayDate(),
        savedAt: new Date().toISOString(),
        source,
        summary: countPerformance.summary || {},
        employees: enriched
      };

      const filePath = path.join(SCAN_PERFORMANCE_HISTORY_DIR, `${snapshot.date}.json`);
      this.writeJsonFile(filePath, snapshot);
    } catch (e) {
      console.error('Error persisting scan performance snapshot:', e);
    }
  }

  // Get saved dashboard data
  static getSavedDashboardData() {
    try {
      if (fs.existsSync(DASHBOARD_DATA_FILE)) {
        const data = fs.readFileSync(DASHBOARD_DATA_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading dashboard data:', error);
    }
    return null;
  }

  // Parse CSV string to array of objects
  parseCSV(csvString) {
    if (!csvString || typeof csvString !== 'string') return [];
    
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];

    // Handle CSV with quoted fields containing commas
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      data.push(row);
    }

    return data;
  }

  findLatestFile(dir, exts = []) {
    try {
      if (!fs.existsSync(dir)) return null;
      const entries = fs.readdirSync(dir)
        .map(name => {
          const full = path.join(dir, name);
          let stat;
          try { stat = fs.statSync(full); } catch (_) { return null; }
          return stat.isFile() ? { name, full, mtimeMs: stat.mtimeMs } : null;
        })
        .filter(Boolean);

      const lowerExts = (exts || []).map(e => e.toLowerCase());
      const filtered = lowerExts.length
        ? entries.filter(e => lowerExts.some(x => e.name.toLowerCase().endsWith(x)))
        : entries;

      filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return filtered[0]?.full || null;
    } catch (e) {
      return null;
    }
  }

  extractFirstMatchNumber(text, regex, parser = (s) => Number(s)) {
    const m = (text || '').match(regex);
    if (!m) return null;
    const v = parser(m[1]);
    return Number.isFinite(Number(v)) ? Number(v) : null;
  }

  parsePercentNearLabel(text, labelRegex) {
    const s = (text || '').toString();
    const m = s.match(labelRegex);
    if (!m) return null;
    const idx = m.index ?? -1;
    if (idx < 0) return null;

    // Search a small window before the label for a percentage like "75%".
    const start = Math.max(0, idx - 80);
    const window = s.slice(start, idx);
    const pm = window.match(/(\d{1,3}(?:\.\d+)?)%\s*$/);
    if (pm && Number.isFinite(Number(pm[1]))) return Number(pm[1]);

    // Fallback: search a small window after label.
    const after = s.slice(idx, Math.min(s.length, idx + 120));
    const pm2 = after.match(/(\d{1,3}(?:\.\d+)?)%/);
    if (pm2 && Number.isFinite(Number(pm2[1]))) return Number(pm2[1]);
    return null;
  }

  parseStoreOpsOverdueAuditText(text) {
    const t = (text || '').toString();
    if (!t || !/Overdue\s+Audit/i.test(t)) return null;

    const locationMatch = t.match(/Location\s+Name\s+is\s+([^\n\r]+)/i);
    const locationName = locationMatch ? locationMatch[1].trim() : null;

    const generatedMatch = t.match(/Generated\s+by\s+Looker\s+on\s+([^\n\r]+)/i);
    const generatedByLookerAtText = generatedMatch ? generatedMatch[1].trim() : null;

    const dates = Array.from(t.matchAll(/20\d{2}-\d{2}-\d{2}/g)).map(m => m[0]);
    let finishedWeekStart = null;
    let finishedWeekEnd = null;
    if (dates.length) {
      const uniq = Array.from(new Set(dates)).sort();
      finishedWeekStart = uniq[0];
      finishedWeekEnd = uniq[uniq.length - 1];
    }

    const l3mSizePassPct = this.parsePercentNearLabel(t, /L3M\s+Size\s+Pass/i);
    const freeAlterationPct = this.parsePercentNearLabel(t, /Free\s+Alteratio/i);
    const apg = this.extractFirstMatchNumber(t, /\n\s*([0-9]+(?:\.[0-9]+)?)\s*\n\s*APG\b/i, (s) => Number(s));

    return {
      locationName,
      generatedByLookerAtText,
      finishedWeekStart,
      finishedWeekEnd,
      l3mSizePassPct,
      freeAlterationPct,
      apg
    };
  }

  getLastCompleteWeekRange() {
    try {
      const now = new Date();
      // Start of current week (Sunday)
      const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

      const toIso = (d) => d.toISOString().split('T')[0];
      return { start: toIso(lastWeekStart), end: toIso(lastWeekEnd) };
    } catch (_) {
      return { start: null, end: null };
    }
  }

  processStoreOpsOverdueAuditFromCSVs() {
    // Prefer the standard stores performance exports, but allow the dedicated store-ops folder too.
    const candidateDirs = [STORES_PERFORMANCE_DIR, STORE_OPS_OVERDUE_AUDIT_DIR];

    const readFirst = (fileName) => {
      for (const dir of candidateDirs) {
        const full = path.join(dir, fileName);
        const rows = this.readCSV(full);
        if (rows && rows.length) return { rows, full };
      }
      return { rows: [], full: null };
    };

    const apgData = readFirst('apg.csv');
    const freeAltData = readFirst('free_alterations.csv');
    const sizePassData = readFirst('l3m_size_passport_addoption_rate_1.csv');

    const apgRow = apgData.rows?.[0] || null;
    const apg = apgRow && Object.prototype.hasOwnProperty.call(apgRow, 'APG') ? Number(apgRow.APG) : null;

    const freeAltRow = (freeAltData.rows || []).slice().reverse().find(r => {
      const yes = (r?.Yes || '').toString();
      return /%/.test(yes);
    }) || null;
    const freeAlterationPct = freeAltRow ? this.parsePercent(freeAltRow.Yes) : null;

    const sizePassRow = (sizePassData.rows || []).slice().reverse().find(r => {
      const yes = (r?.Yes || '').toString();
      return /%/.test(yes);
    }) || null;
    const l3mSizePassPct = sizePassRow ? this.parsePercent(sizePassRow.Yes) : null;

    const hasAny = [apg, freeAlterationPct, l3mSizePassPct].some(v => Number.isFinite(Number(v)));
    if (!hasAny) return null;

    const week = this.getLastCompleteWeekRange();
    const sourceFiles = [apgData.full, freeAltData.full, sizePassData.full]
      .filter(Boolean)
      .map(p => path.basename(p));

    return {
      locationName: null,
      generatedByLookerAtText: null,
      finishedWeekStart: week.start,
      finishedWeekEnd: week.end,
      l3mSizePassPct: Number.isFinite(Number(l3mSizePassPct)) ? Number(l3mSizePassPct) : null,
      freeAlterationPct: Number.isFinite(Number(freeAlterationPct)) ? Number(freeAlterationPct) : null,
      apg: Number.isFinite(Number(apg)) ? Number(apg) : null,
      sourceFile: sourceFiles[0] || null,
      sourceFiles
    };
  }

  async processStoreOpsOverdueAudit() {
    // Prefer CSV exports (the most reliable format), then fall back to PDF parsing.
    const fromCsv = this.processStoreOpsOverdueAuditFromCSVs();
    if (fromCsv) return fromCsv;

    const pdfPath = this.findLatestFile(STORE_OPS_OVERDUE_AUDIT_DIR, ['.pdf']);
    if (!pdfPath) return null;

    try {
      const buf = fs.readFileSync(pdfPath);
      const parsed = await pdfParse(buf);
      const text = (parsed && parsed.text) ? parsed.text : '';
      const metrics = this.parseStoreOpsOverdueAuditText(text);
      if (!metrics) return null;
      return { ...metrics, sourceFile: path.basename(pdfPath) };
    } catch (e) {
      this.errors.push(`Store Ops Overdue Audit PDF parse failed: ${e?.message || e}`);
      return null;
    }
  }

  // Read and parse a CSV file
  readCSV(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        this.processedFiles.push(path.basename(filePath));
        return this.parseCSV(content);
      }
    } catch (error) {
      console.error(`Error reading CSV ${filePath}:`, error);
      this.errors.push(`CSV read error: ${filePath}`);
    }
    return [];
  }

  // Parse amount strings like "185.5K", "$1,234", etc.
  parseAmount(str) {
    if (!str) return 0;
    str = str.toString().replace(/[$,\s]/g, '');
    
    // Handle K suffix (thousands)
    if (str.toUpperCase().includes('K')) {
      return parseFloat(str.replace(/K/i, '')) * 1000;
    }
    // Handle M suffix (millions)
    if (str.toUpperCase().includes('M')) {
      return parseFloat(str.replace(/M/i, '')) * 1000000;
    }
    
    return parseFloat(str) || 0;
  }

  // Parse percentage strings
  parsePercent(str) {
    if (!str) return 0;
    str = str.toString().replace(/%/g, '');
    return parseFloat(str) || 0;
  }

  // Process store metrics from CSV files
  processStoreMetrics() {
    const metrics = {
      date: this.getTodayDate(),
      source: 'looker',
      importedAt: new Date().toISOString()
    };

    // Sales data
    const salesData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'sales.csv'));
    if (salesData.length > 0) {
      metrics.wtd = {
        salesAmount: this.parseAmount(salesData[0]['Retail Management - Metrics Sales Amount']),
        salesVsPY: this.parsePercent(salesData[0]['Retail Management - Metrics % Sales vs PY'])
      };
    }

    // Target data
    const targetData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'sales_target.csv'));
    if (targetData.length > 0 && metrics.wtd) {
      metrics.wtd.target = this.parseAmount(targetData[0]['Retail Management - Metrics Sales Amount Target']);
      metrics.wtd.vsTarget = this.parsePercent(targetData[0]['Retail Management - Metrics % Sales vs Target']);
    }

    // Initialize metrics object
    metrics.metrics = {};

    // SPH data
    const sphData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'sph.csv'));
    if (sphData.length > 0) {
      metrics.metrics.salesPerHour = parseFloat(sphData[0]['Retail Management - Metrics Sales per Hour']) || 0;
      metrics.metrics.sphVsPY = this.parsePercent(sphData[0]['Retail Management - Metrics % SPH vs PY']);
    }

    // IPC data
    const ipcData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'ipc.csv'));
    if (ipcData.length > 0) {
      metrics.metrics.itemsPerCustomer = parseFloat(ipcData[0]['Retail Management - Metrics # Items Per Customer']) || 0;
      metrics.metrics.ipcVsPY = this.parsePercent(ipcData[0]['Retail Management - Metrics % IPC vs PY']);
    }

    // IPC vs Target
    const ipcTargetData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'ipc_vs_target.csv'));
    if (ipcTargetData.length > 0) {
      metrics.metrics.itemsPerCustomerTarget = parseFloat((ipcTargetData[0]['Retail Management - Metrics # Items Per Customer Target'] || '').toString().replace(/[^0-9.-]/g, '')) || null;
      metrics.metrics.ipcVsTarget = this.parsePercent(ipcTargetData[0]['Retail Management - Metrics % IPC vs Target']);
    }

    // APC data
    const apcData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'apc.csv'));
    if (apcData.length > 0) {
      metrics.metrics.apc = this.parseAmount(apcData[0]['Retail Management - Metrics Average Per Customer']);
      metrics.metrics.apcVsPY = this.parsePercent(apcData[0]['Retail Management - Metrics % APC vs PY']);
    }

    // APC vs Target
    const apcTargetData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'apc_vs_target.csv'));
    if (apcTargetData.length > 0) {
      metrics.metrics.apcTarget = this.parseAmount(apcTargetData[0]['Retail Management - Metrics Average Per Customer Target']);
      metrics.metrics.apcVsTarget = this.parsePercent(apcTargetData[0]['Retail Management - Metrics % APC vs Target']);
    }

    // CPC data
    const cpcData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'cpc.csv'));
    if (cpcData.length > 0) {
      metrics.metrics.cpc = parseFloat(cpcData[0]['Retail Management - Metrics # Categories Per Customer']) || 0;
      metrics.metrics.cpcVsPY = this.parsePercent(cpcData[0]['Retail Management - Metrics % CPC vs PY']);
    }

    // CPC vs Target (this CSV has different headers)
    const cpcTargetData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'cpc_vs_target.csv'));
    if (cpcTargetData.length > 0) {
      metrics.metrics.cpcTarget = parseFloat((cpcTargetData[0]['CPC Target'] || '').toString().replace(/[^0-9.-]/g, '')) || null;
      metrics.metrics.cpcVsTarget = this.parsePercent(cpcTargetData[0]['Percentage']);
    }

    // Drop-offs data
    const dropoffData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'drop-offs.csv'));
    if (dropoffData.length > 0) {
      metrics.metrics.dropOffs = this.parsePercent(dropoffData[0]['Retail Management - Metrics % Drop-Off']);
      metrics.metrics.dropOffsVsPY = this.parsePercent(dropoffData[0]['Retail Management - Metrics % Drop-Off vs PY']);
    }

    // Product mix data
    const mixData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'stores_performance_product_mix_occassion.csv'));
    if (mixData.length > 0) {
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

    // Production mix data (CM vs RTW)
    const cmRtwData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'stores_performance_product_mix_cm_rtw.csv'));
    if (cmRtwData.length > 0) {
      const mix = {};
      cmRtwData.forEach(row => {
        const type = (row['Production Type'] || '').toString().trim();
        const share = this.parsePercent(row['Shares']);
        if (type) mix[type] = share;
      });
      metrics.productMixCmRtw = mix; // ex: { RTW: 85, CM: 15 }
    }

    // Customer Journey metrics
    metrics.customerJourney = {};

    const totalCustomersData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'total_customers.csv'));
    if (totalCustomersData.length > 0) {
      const row = totalCustomersData[0];
      metrics.customerJourney.totalCustomers = parseInt(row['Retail Management - Metrics # Orders'], 10) || 0;
      const vs = (row['% Customers vs PY formatted'] || '').toString().trim();
      metrics.customerJourney.totalCustomersVsPY = vs ? this.parsePercent(vs) : null;
    }

    const returningCustomersData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'returning_customers.csv'));
    if (returningCustomersData.length > 0) {
      const row = returningCustomersData[0];
      metrics.customerJourney.returningCustomers = parseInt(row['Retail Management - Metrics # Returning Customer Orders'], 10) || 0;
      const vs = (row['Returning Customers vs PY'] || '').toString().trim();
      metrics.customerJourney.returningCustomersVsPY = vs ? this.parsePercent(vs) : null;
    }

    const newCustomersData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'new_customers.csv'));
    if (newCustomersData.length > 0) {
      const row = newCustomersData[0];
      metrics.customerJourney.newCustomers = parseInt(row['Retail Management - Metrics # New Customer Orders'], 10) || 0;
      const vs = (row['New Customers vs PY'] || '').toString().trim();
      metrics.customerJourney.newCustomersVsPY = vs ? this.parsePercent(vs) : null;
    }

    if (Number(metrics.customerJourney.totalCustomers) > 0) {
      const total = Number(metrics.customerJourney.totalCustomers);
      const returning = Number(metrics.customerJourney.returningCustomers) || 0;
      const news = Number(metrics.customerJourney.newCustomers) || 0;
      metrics.customerJourney.returningPct = Math.round((returning / total) * 1000) / 10;
      metrics.customerJourney.newPct = Math.round((news / total) * 1000) / 10;
    }

    const visitsData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'visits.csv'));
    if (visitsData.length > 0) {
      const row = visitsData[0];
      metrics.customerJourney.visits = parseInt(row['Retail Management - Metrics # Store Visits'], 10) || 0;
      const vs = (row['Retail Management - Metrics % Visits vs PY'] || '').toString().trim();
      metrics.customerJourney.visitsVsPY = vs ? this.parsePercent(vs) : null;
    }

    const appointmentsData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'appointments.csv'));
    if (appointmentsData.length > 0) {
      const row = appointmentsData[0];
      const ty = (row['Appointments Share % TY'] || '').toString().trim();
      const py = (row['Appointments Share % PY'] || '').toString().trim();
      metrics.customerJourney.appointmentsShareTy = ty ? this.parsePercent(ty) : null;
      metrics.customerJourney.appointmentsSharePy = py ? this.parsePercent(py) : null;
    }

    const qrCheckinsData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'qr_check-ins.csv'));
    if (qrCheckinsData.length > 0) {
      const row = qrCheckinsData[0];
      const pct = (row['Retail Management - Metrics % QR Checkin'] || '').toString().trim();
      const vs = (row['Retail Management - Metrics % QR Checkin vs PY'] || '').toString().trim();
      metrics.customerJourney.qrCheckinsPct = pct ? this.parsePercent(pct) : null;
      metrics.customerJourney.qrCheckinsVsPY = vs ? this.parsePercent(vs) : null;
    }

    const npsData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'nps_score.csv'));
    if (npsData.length > 0) {
      const row = npsData[0];
      const score = (row['NPS Formatted without %'] || '').toString().trim();
      const vs = (row['NPS versus PY %'] || '').toString().trim();
      metrics.customerJourney.npsScore = score ? parseFloat(score) || 0 : null;
      metrics.customerJourney.npsVsPY = vs ? this.parsePercent(vs) : null;
    }

    const notesData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'notes_taken.csv'));
    if (notesData.length > 0) {
      const row = notesData[0];
      metrics.customerJourney.notesTaken = parseInt(row['Retail Management - Metrics # Notes Taken'], 10) || 0;
      const vs = (row['Notes Taken vs PY %'] || '').toString().trim();
      metrics.customerJourney.notesTakenVsPY = vs ? this.parsePercent(vs) : null;
    }

    const reachesData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'completed_reachs.csv'));
    if (reachesData.length > 0) {
      const row = reachesData[0];
      metrics.customerJourney.completedReaches = parseInt(row['Retail Management - Metrics # Completed Reachouts'], 10) || 0;
    }

    const newsletterPrimary = path.join(STORES_PERFORMANCE_DIR, 'newsletters_subscriptions_.csv');
    const newsletterFallback = path.join(STORES_PERFORMANCE_DIR, 'newsletters_subscriptions__.csv');
    const newsletterData = this.readCSV(fs.existsSync(newsletterPrimary) ? newsletterPrimary : newsletterFallback);
    if (newsletterData.length > 0) {
      const row = newsletterData[0];
      const pct = (row['Retail Management - Metrics % Orders with Newsletter'] || '').toString().trim();
      const vs = (row['Newsletter % versus PY %'] || '').toString().trim();
      metrics.customerJourney.newsletterPct = pct ? this.parsePercent(pct) : null;
      metrics.customerJourney.newsletterVsPY = vs ? this.parsePercent(vs) : null;
    }

    // Selling bookable vs non-bookable next 14 days
    const bookableData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'selling_bookable_vs_non-bookable_next_14_days.csv'));
    if (bookableData.length > 0) {
      const rows = bookableData
        .map(r => ({
          date: (r['Calendar Date'] || '').toString().trim(),
          bookable: this.parsePercent(r['% Selling Bookable']),
          bookableHoursBooked: this.parsePercent(r['% Selling Bookable Hours Booked']),
          nonBookable: this.parsePercent(r['% Selling Non-Bookable'])
        }))
        .filter(r => r.date);

      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000);
      const inRange = rows.filter(r => {
        const d = new Date(`${r.date}T00:00:00`);
        return d >= start && d <= end;
      });

      const avg = (key) => {
        const values = inRange.map(r => r[key]).filter(v => typeof v === 'number' && !Number.isNaN(v) && v !== 0);
        if (!values.length) return null;
        return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      };

      metrics.sellingBookableNext14Days = {
        rangeStart: start.toISOString().split('T')[0],
        rangeEnd: end.toISOString().split('T')[0],
        avgBookable: avg('bookable'),
        avgNonBookable: avg('nonBookable'),
        avgBookableHoursBooked: avg('bookableHoursBooked'),
        days: inRange
      };
    }

    // Sales by retail weeks (weekly totals + target)
    const weeklyData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'sales_by_retail_weeks.csv'));
    if (weeklyData.length > 0) {
      const rows = weeklyData
        .map(r => ({
          weekNumber: parseInt(r['Retail Week Number'], 10) || null,
          salesAmount: this.parseAmount(r['Sales']),
          salesAmountPY: this.parseAmount(r['Sales Amount PY']),
          target: this.parseAmount(r['Target'])
        }))
        .filter(r => r.weekNumber);

      const getRetailWeekNumberSundayStart = (date) => {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const firstSunday = new Date(jan1);
        const offset = (7 - jan1.getDay()) % 7;
        firstSunday.setDate(jan1.getDate() + offset); // first Sunday on/after Jan 1
        if (d < firstSunday) return 0; // treat as previous year's last week
        const diffDays = Math.floor((d - firstSunday) / 86400000);
        return Math.floor(diffDays / 7) + 1;
      };

      const now = new Date();
      const currentWeek = getRetailWeekNumberSundayStart(now);
      const currentRow = rows.find(r => r.weekNumber === currentWeek) || rows[rows.length - 1] || null;

      metrics.salesByRetailWeeks = rows;
      if (currentRow) {
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Saturday
        metrics.retailWeek = {
          weekNumber: currentRow.weekNumber,
          weekStart: weekStart.toISOString().split('T')[0],
          weekEnd: weekEnd.toISOString().split('T')[0],
          salesAmount: currentRow.salesAmount,
          salesAmountPY: currentRow.salesAmountPY,
          target: currentRow.target,
          targetPerDay: currentRow.target ? currentRow.target / 7 : null
        };
      }
    }

    // Store summary metrics (sales_by_retail_weeks_(copy))
    const storeSummary = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'sales_by_retail_weeks_(copy).csv'));
    if (storeSummary.length > 0) {
      const row = storeSummary.find(r => (r['Stores'] || '').toString().trim()) || storeSummary[0];
      metrics.storeWeekSummary = {
        store: (row['Stores'] || '').toString().trim() || null,
        salesAmount: this.parseAmount(row['Sales Amount']),
        salesVsPY: this.parsePercent(row['% Sales vs PY']),
        salesVsTarget: this.parsePercent(row['% Sales vs Target']),
        apc: this.parseAmount(row['APC']),
        apcVsPY: this.parsePercent(row['% APC vs PY']),
        apcVsTarget: this.parsePercent(row['% APC vs Target']),
        ipc: parseFloat((row['IPC'] || '').toString().replace(/[^0-9.-]/g, '')) || null,
        ipcVsPY: this.parsePercent(row['% IPC vs PY']),
        ipcVsTarget: this.parsePercent(row['% IPC vs Target'])
      };
    }

    return metrics;
  }

  // Process pickup appointments for today
  processAppointments() {
    const appointments = {
      pickups: null,
      shopping: null,
      consultation: null
    };

    // Get current retail week (Week 1 starts on first Sunday on/after Jan 1)
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() + ((7 - jan1.getDay()) % 7));
    const currentWeek = now < firstSunday ? 0 : (Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - firstSunday) / 86400000 / 7) + 1);

    // Pickup appointments
    const pickupData = this.readCSV(path.join(APPOINTMENTS_DIR, 'pickup_appointments_-_trend_over_week.csv'));
    if (pickupData.length > 0) {
      // Find current week's data
      const weekRow = pickupData.find(row => parseInt(row['Retail Week Number']) === currentWeek);
      if (weekRow) {
        appointments.pickups = parseInt(weekRow['# Visits']) || 0;
      }
    }

    // Shopping appointments
    const shoppingData = this.readCSV(path.join(APPOINTMENTS_DIR, 'shopping_appointments_-_trend_over_week.csv'));
    if (shoppingData.length > 0) {
      const weekRow = shoppingData.find(row => parseInt(row['Retail Week Number']) === currentWeek);
      if (weekRow) {
        appointments.shopping = parseInt(weekRow['# Visits']) || 0;
      }
    }

    // Consultation appointments
    const consultData = this.readCSV(path.join(APPOINTMENTS_DIR, 'consultation_appointments_-_trend_over_week.csv'));
    if (consultData.length > 0) {
      const weekRow = consultData.find(row => parseInt(row['Retail Week Number']) === currentWeek);
      if (weekRow) {
        appointments.consultation = parseInt(weekRow['# Visits']) || 0;
      }
    }

    return appointments;
  }

  // Process employee KPIs
  processEmployeeMetrics() {
    const kpiData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'kpis_per_employee.csv'));
    if (kpiData.length === 0) return null;

    const employees = this.readJsonFile(EMPLOYEES_FILE, { employees: {} });
    let updated = 0;

    kpiData.forEach(row => {
      const name = row['Employee'];
      if (!name) return;

      // Search in all employee types
      for (const type of Object.keys(employees.employees)) {
        const index = employees.employees[type].findIndex(e => e.name === name);
        if (index >= 0) {
          // Update image URL if available
          if (row['Employee Image']) {
            employees.employees[type][index].imageUrl = row['Employee Image'];
          }

          // Update metrics
          employees.employees[type][index].metrics = {
            salesAmount: this.parseAmount(row['Sales Amount']),
            apc: this.parseAmount(row['APC']),
            ipc: parseFloat(row['IPC']) || 0,
            cpc: parseFloat(row['CPC']) || 0,
            sph: parseFloat(row['Sales per Hour']) || 0,
            salesShare: this.parsePercent(row['Sales Shares'])
          };

          updated++;
          break;
        }
      }
    });

    if (updated > 0) {
      employees.lastUpdated = this.getTodayDate();
      employees.metricsUpdatedAt = new Date().toISOString();
      this.writeJsonFile(EMPLOYEES_FILE, employees);
    }

    return { employeesUpdated: updated };
  }

  // Process tailor productivity
  processTailorMetrics() {
    const tailorData = this.readCSV(path.join(TAILOR_DIR, 'ytd_average_productivity_per_tailor.csv'));
    if (tailorData.length === 0) return null;

    const employees = this.readJsonFile(EMPLOYEES_FILE, { employees: {} });
    let updated = 0;

    tailorData.forEach(row => {
      const name = row['Tailor Full Name'];
      if (!name) return;

      const tailorIndex = employees.employees.TAILOR?.findIndex(e => e.name === name);
      if (tailorIndex >= 0) {
        employees.employees.TAILOR[tailorIndex].productivity = 
          this.parsePercent(row['% Tailor Productivity']) || 
          parseInt(row['% Tailor Productivity']) || 0;
        updated++;
      }
    });

    if (updated > 0) {
      employees.lastUpdated = this.getTodayDate();
      this.writeJsonFile(EMPLOYEES_FILE, employees);
    }

    return { tailorsUpdated: updated };
  }

  // Process loans data
  processLoansData() {
    const result = {
      overdue: [],
      total: 0
    };

    // Retail due loans per employee
    const retailData = this.readCSV(path.join(LOANS_DIR, 'retail_due_loans_per_employee.csv'));
    if (retailData.length > 0) {
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

    // Total due loans
    const totalData = this.readCSV(path.join(LOANS_DIR, 'retail_due_loans.csv'));
    if (totalData.length > 0) {
      result.total = parseInt(Object.values(totalData[0])[0]) || 0;
    }

    return result;
  }

  parseLooseNumber(value) {
    if (value === null || value === undefined) return null;
    const n = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  processWorkRelatedExpenses() {
    // Support multiple possible filenames from Looker/email imports
    const candidates = [
      'full_dump.csv',
      'work_related_expenses.csv',
      'work_related_expenses (copy).csv'
    ];

    let filePath = null;
    let sourceFile = null;
    for (const fname of candidates) {
      const p = path.join(WORK_EXPENSES_DIR, fname);
      if (fs.existsSync(p)) {
        filePath = p;
        sourceFile = fname;
        break;
      }
    }

    if (!filePath) return null;

    const rows = this.readCSV(filePath);
    if (!rows.length) return null;

    // Enrich with employee photos from users.json (matched by work email / employee id / name).
    const userByEmail = new Map();
    const userByEmployeeId = new Map();
    const userByName = new Map();
    try {
      const usersFile = path.join(DATA_DIR, 'users.json');
      if (fs.existsSync(usersFile)) {
        const raw = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.users) ? raw.users : []);
        list.forEach(u => {
          const email = (u?.email || '').toString().trim().toLowerCase();
          if (email) userByEmail.set(email, u);
          const empId = (u?.employeeId || '').toString().trim();
          if (empId) userByEmployeeId.set(empId, u);
          const nameKey = (u?.name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
          if (nameKey) userByName.set(nameKey, u);
        });
      }
    } catch (_) {}

    const normalizeNameKey = (value) =>
      (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    const suggestWorkEmailFromName = (name) => {
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
    };

    const orders = rows
      .map(row => {
        const orderId = (row['Order ID'] || '').toString().trim();
        const date = (row['Calendar Date'] || '').toString().trim();
        const approverEmail = (row['Employee Work Email'] || '').toString().trim();
        const approverName = (row['Employee Full Name'] || '').toString().trim();
        const approverNumber = (row['Employee Number'] || '').toString().trim();

        // In this Looker export, "Customer Full Name" is the employee who BENEFITED from the discount.
        // The "Employee" fields represent the manager/approver who applied it.
        const beneficiaryName = (row['Customer Full Name'] || '').toString().trim();
        const reason = (row['Discount Reason'] || '').toString().trim();
        const contractLocationCode = (row['Contract Location Code'] || '').toString().trim();

        const lcFull = this.parseLooseNumber(row['LC Total Full Price Amount']);
        const lcNet = this.parseLooseNumber(row['LC Net Revenue Amount']);
        const lcDiscount = this.parseLooseNumber(row['LC Total Discount Amount']);

        const euroFull = this.parseLooseNumber(row['€ Total Full Price Amount']);
        const euroNet = this.parseLooseNumber(row['€ Net Revenue Amount']);
        const euroDiscount = this.parseLooseNumber(row['€ Total Discount Amount']);

        const pct = this.parsePercent(row['% Discounted Full Price (Euro)']);
        const approverUser =
          (approverEmail ? userByEmail.get(approverEmail.toLowerCase()) : null) ||
          (approverNumber ? userByEmployeeId.get(approverNumber) : null);

        const beneficiarySuggestedEmail = beneficiaryName ? suggestWorkEmailFromName(beneficiaryName) : null;
        const beneficiaryUser =
          (beneficiaryName ? userByName.get(normalizeNameKey(beneficiaryName)) : null) ||
          (beneficiarySuggestedEmail ? userByEmail.get(beneficiarySuggestedEmail.toLowerCase()) : null) ||
          null;

        const approverRole = (approverUser?.role || '').toString().trim().toUpperCase();
        const approverRoleIsManager = approverRole === 'MANAGEMENT' || approverRole === 'ADMIN';
        const approverRoleIsAdmin = approverRole === 'ADMIN';

        const approverAuthorized = !!(approverUser?.isAdmin || approverUser?.isManager || approverRoleIsManager);
        const unauthorized = !approverAuthorized;

        return {
          orderId: orderId || null,
          calendarDate: date || null,
          discountReason: reason || null,
          // Backward compatible (older UI used employee/customerName):
          // - employee = approver (manager)
          // - customerName = beneficiary (employee who used the discount)
          customerName: beneficiaryName || null,
          employee: {
            number: approverNumber || null,
            name: approverName || null,
            email: approverEmail || null,
            imageUrl: approverUser?.imageUrl || null
          },
          beneficiary: {
            name: beneficiaryName || null,
            email: beneficiaryUser?.email || null,
            employeeId: beneficiaryUser?.employeeId || null,
            imageUrl: beneficiaryUser?.imageUrl || null
          },
          approver: {
            number: approverNumber || null,
            name: approverName || null,
            email: approverEmail || null,
            imageUrl: approverUser?.imageUrl || null,
            isManager: !!approverUser?.isManager || approverRoleIsManager,
            isAdmin: !!approverUser?.isAdmin || approverRoleIsAdmin
          },
          unauthorized,
          location: {
            contractLocationCode: contractLocationCode || null,
            country: (row['Location Country'] || '').toString().trim() || null,
            countryRegion: (row['Location Country Region'] || '').toString().trim() || null
          },
          amounts: {
            lc: { fullPrice: lcFull, netRevenue: lcNet, discount: lcDiscount },
            eur: { fullPrice: euroFull, netRevenue: euroNet, discount: euroDiscount },
            percentDiscountedFullPriceEuro: Number.isFinite(pct) ? pct : null
          }
        };
      })
      .filter(o => o.orderId || o.calendarDate || o?.approver?.email || o?.beneficiary?.name);

    const today = new Date();
    const year = today.getFullYear();
    const monthKey = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const byEmployee = new Map();
    const storeTotals = {
      currentYear: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 },
      currentMonth: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 }
    };

    for (const o of orders) {
      // Aggregate limits by beneficiary (who used the discount), not the manager who approved it.
      const key = (o?.beneficiary?.email || o?.beneficiary?.employeeId || o?.beneficiary?.name || '').toString().trim().toLowerCase();
      if (!key) continue;

      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          key,
          employee: o.beneficiary,
          location: o.location,
          totals: {
            currentYear: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 },
            currentMonth: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 }
          }
        });
      }

      const entry = byEmployee.get(key);
      entry.employee = entry.employee?.email ? entry.employee : o.beneficiary;
      entry.location = entry.location?.contractLocationCode ? entry.location : o.location;

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

    return {
      type: 'employee-discounts',
      importedAt: new Date().toISOString(),
      sourceFile: sourceFile || path.basename(filePath),
      monthKey,
      year,
      orders,
      storeTotals,
      employees: Array.from(byEmployee.values())
        .sort((a, b) => (b.totals.currentYear.discountLc - a.totals.currentYear.discountLc))
    };
  }

  // Process operations health metrics (new)
  processOperationsHealth() {
    const health = {
      tailorProductivity: null,
      teamProductivity: null,
      workedHours: null,
      hoursOfAlterations: null,
      utilization: null,
      tailorsLastWeek: [],
      benchmarkTimesMinutes: [],
      onTimeAlterations: null,
      alterationsOnTimeBreakdown: null,
      overdueAlterations: 0,
      inventoryAccuracy: null
    };

    // Tailor Productivity
    const productivityData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'productivity_.csv'));
    if (productivityData.length > 0) {
      const row = productivityData[0];
      const value = row['Alterations % Tailor Productivity'] || Object.values(row)[0];
      health.tailorProductivity = this.parsePercent(value);
    }

    // Team Productivity % (same dashboard as "Store Ops Dashboard - Productivity")
    const teamProdData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'team_productivity_.csv'));
    if (teamProdData.length > 0) {
      const row = teamProdData[0];
      const value = row['Team Productivity %'] || Object.values(row)[0];
      health.teamProductivity = this.parsePercent(value);
    }

    // Worked hours + hours of alterations (last complete week)
    const workedHoursData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'worked_hours.csv'));
    if (workedHoursData.length > 0) {
      const row = workedHoursData[0];
      const value = row['Total Hours'] || Object.values(row)[0];
      const num = parseFloat((value || '').toString().replace(/[^0-9.\\-]/g, ''));
      health.workedHours = Number.isFinite(num) ? num : null;
    }

    const alterationsHoursData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'hours_of_alterations.csv'));
    if (alterationsHoursData.length > 0) {
      const row = alterationsHoursData[0];
      const value = row['Hours of Alterations'] || Object.values(row)[0];
      const num = parseFloat((value || '').toString().replace(/[^0-9.\\-]/g, ''));
      health.hoursOfAlterations = Number.isFinite(num) ? num : null;
    }

    // Scheduled vs alterations utilization (the export sometimes arrives blank; compute as fallback).
    const utilizationData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'scheduled_vs_alterations_.csv'));
    if (utilizationData.length > 0) {
      const row = utilizationData[0];
      const value = row['Utilization'] || row['Ulitilization'] || Object.values(row)[0];
      const parsed = this.parsePercent(value);
      health.utilization = Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
    }
    if (health.utilization === null && Number.isFinite(health.workedHours) && Number.isFinite(health.hoursOfAlterations) && health.workedHours > 0) {
      health.utilization = Math.round((health.hoursOfAlterations / health.workedHours) * 1000) / 10;
    }

    if (health.teamProductivity === null && Number.isFinite(health.utilization)) {
      health.teamProductivity = health.utilization;
    }

    // Tailor productivity last week (per-tailor + hours)
    const tailorProdLastWeek = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'tailor_productivity_.csv'));
    const tailorHoursLastWeek = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'tailor_productivity_last_week.csv'));

    const byName = new Map();
    tailorProdLastWeek.forEach(row => {
      const name = (row['Tailor Full Name'] || '').toString().trim();
      if (!name) return;
      byName.set(name, {
        name,
        productivityPercent: this.parsePercent(row['% Tailor Productivity']),
        benchmarkHours: null,
        workedHours: null
      });
    });

    tailorHoursLastWeek.forEach(row => {
      const name = (row['Tailor Full Name'] || '').toString().trim();
      if (!name) return;
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          productivityPercent: null,
          benchmarkHours: null,
          workedHours: null
        });
      }
      const entry = byName.get(name);
      const bench = parseFloat((row['# Benchmark time (hours)'] || '').toString().replace(/[^0-9.\\-]/g, ''));
      const worked = parseFloat((row['# Total Hours Worked Combined'] || '').toString().replace(/[^0-9.\\-]/g, ''));
      entry.benchmarkHours = Number.isFinite(bench) ? bench : entry.benchmarkHours;
      entry.workedHours = Number.isFinite(worked) ? worked : entry.workedHours;
    });

    health.tailorsLastWeek = Array.from(byName.values())
      .map(t => {
        const efficiency =
          Number.isFinite(t.benchmarkHours) && Number.isFinite(t.workedHours) && t.workedHours > 0
            ? Math.round((t.benchmarkHours / t.workedHours) * 1000) / 10
            : null;
        return { ...t, efficiency };
      })
      .sort((a, b) => (Number(b.productivityPercent || 0) - Number(a.productivityPercent || 0)));

    // Benchmark times (minutes) table
    const benchmarkTimes = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'benchmark_times_in_minutes.csv'));
    if (benchmarkTimes.length > 0) {
      health.benchmarkTimesMinutes = benchmarkTimes
        .map(r => ({
          difficultyLevel: parseInt((r['Difficulty Level'] || '').toString().replace(/[^0-9]/g, ''), 10) || null,
          description: (r['Description'] || '').toString().trim() || null,
          minutes: parseFloat((r['Benchmark Times  Min.'] || '').toString().replace(/[^0-9.\\-]/g, '')) || null
        }))
        .filter(r => r.description && Number.isFinite(r.minutes))
        .slice(0, 60);
    }

    // On-time Alterations
    const ontimeData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'on-time_.csv'));
    if (ontimeData.length > 0) {
      const row = ontimeData[0];
      const value = row['Ontime'] || Object.values(row)[0];
      health.onTimeAlterations = this.parsePercent(value);
    }

    // On-time breakdown (Overdue Yes/No) for donut charts
    try {
      const parseCount = (value) => {
        const n = parseInt((value ?? '').toString().replace(/[^0-9\-]/g, ''), 10);
        return Number.isFinite(n) ? n : null;
      };

      const computeSplit = (goodCount, lateCount) => {
        const good = Number(goodCount);
        const late = Number(lateCount);
        const total = (Number.isFinite(good) ? good : 0) + (Number.isFinite(late) ? late : 0);
        if (!Number.isFinite(total) || total <= 0) return null;
        const goodPct = Math.round((good / total) * 1000) / 10;
        const latePct = Math.round((late / total) * 1000) / 10;
        return {
          goodCount: Number.isFinite(good) ? good : null,
          lateCount: Number.isFinite(late) ? late : null,
          total,
          goodPct,
          latePct
        };
      };

      const overallRows = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'overall_on-time_.csv'));
      const overallNumericRow = (overallRows || []).slice().reverse().find(r => {
        const no = parseCount(r?.No);
        const yes = parseCount(r?.Yes);
        return Number.isFinite(no) && Number.isFinite(yes);
      }) || null;
      const overallNo = overallNumericRow ? parseCount(overallNumericRow.No) : null;
      const overallYes = overallNumericRow ? parseCount(overallNumericRow.Yes) : null;
      const overall = (Number.isFinite(overallNo) && Number.isFinite(overallYes)) ? computeSplit(overallNo, overallYes) : null;

      const perDurationRows = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'on-time_per_duration.csv'));
      const byDuration = {};
      (perDurationRows || []).forEach(r => {
        const duration = (r?.['Is Overdue (Yes / No)'] || '').toString().trim().toLowerCase();
        if (duration !== 'long' && duration !== 'short') return;
        const no = parseCount(r?.No);
        const yes = parseCount(r?.Yes);
        const split = (Number.isFinite(no) && Number.isFinite(yes)) ? computeSplit(no, yes) : null;
        if (split) byDuration[duration] = split;
      });

      if (overall || Object.keys(byDuration).length) {
        health.alterationsOnTimeBreakdown = {
          overall: overall || null,
          byDuration: {
            long: byDuration.long || null,
            short: byDuration.short || null
          },
          sourceFiles: ['overall_on-time_.csv', 'on-time_per_duration.csv']
        };
      }
    } catch (_) {
      // Ignore parsing failures; UI will fall back to simpler KPIs.
    }

    // Overdue Alterations
    const overdueData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'overdue_alterations.csv'));
    if (overdueData.length > 0) {
      const row = overdueData[0];
      const value = row['Alterations # Alterations'] || Object.values(row)[0];
      health.overdueAlterations = parseInt(value) || 0;
    }

    // Inventory Accuracy
    const accuracyData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'inv._accuracy.csv'));
    if (accuracyData.length > 0) {
      const row = accuracyData[0];
      const value = row['Store Counts % Inventory Accuracy'] || Object.values(row)[0];
      health.inventoryAccuracy = this.parsePercent(value);
    }

    return health;
  }

  // Process inventory issues (new)
  processInventoryIssues() {
    const issues = {
      missingItems: null,
      overdueReserved: null,
      unexpectedItems: null,
      duePullbacks: 0,
      dueLoans: 0
    };

    // Missing Items %
    const missingData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'missing.csv'));
    if (missingData.length > 0) {
      const row = missingData[0];
      const value = row['% Missing available'] || Object.values(row)[1] || Object.values(row)[0];
      issues.missingItems = this.parsePercent(value);
    }

    // Overdue Reserved %
    const overdueReservedData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'overdue_reserved.csv'));
    if (overdueReservedData.length > 0) {
      const row = overdueReservedData[0];
      const value = row['% Overdue reserved'] || Object.values(row)[2] || Object.values(row)[0];
      issues.overdueReserved = this.parsePercent(value);
    }

    // Unexpected Items %
    const unexpectedData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'unexpected.csv'));
    if (unexpectedData.length > 0) {
      const row = unexpectedData[0];
      const value = row['% Unexpected items'] || Object.values(row)[1] || Object.values(row)[0];
      issues.unexpectedItems = this.parsePercent(value);
    }

    // Due Pullbacks count
    const pullbacksData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'due_pullbacks.csv'));
    if (pullbacksData.length > 0) {
      const row = pullbacksData[0];
      const value = row['Count of Transfer Order ID'] || Object.values(row)[1] || Object.values(row)[0];
      issues.duePullbacks = parseInt(value) || 0;
    }

    // Due Loans count
    const loansData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'due_loans.csv'));
    if (loansData.length > 0) {
      const row = loansData[0];
      const value = row['Count Loan ID rows'] || Object.values(row)[1] || Object.values(row)[0];
      issues.dueLoans = parseInt(value) || 0;
    }

    return issues;
  }

  // Process customer reserved orders (new)
  processCustomerReservedOrders() {
    const result = {
      orders: [],
      missingReserved: [],
      summary: {
        total: 0,
        over30Days: 0,
        over60Days: 0,
        over90Days: 0,
        oldestDays: 0,
        missing: 0
      }
    };

    // Customer orders over 30 days
    const ordersData = this.readCSV(path.join(GMAIL_IMPORTS_DIR, 'customer_orders_30_days.csv'));
    if (ordersData.length > 0) {
      ordersData.forEach(row => {
        const daysOld = parseInt(row['Days old']) || 0;
        if (row['Fulfillment ID']) {
          result.orders.push({
            fulfillmentId: row['Fulfillment ID'],
            location: row['Location Name'],
            lastReadDate: row['EPC last read at (Local) Date'],
            createdDate: row['Fullfillment Created At Local Date'],
            daysOld: daysOld
          });
          
          result.summary.total++;
          if (daysOld >= 30) result.summary.over30Days++;
          if (daysOld >= 60) result.summary.over60Days++;
          if (daysOld >= 90) result.summary.over90Days++;
          if (daysOld > result.summary.oldestDays) result.summary.oldestDays = daysOld;
        }
      });
    }

    // Missing reserved orders
    const missingData = this.readCSV(path.join(GMAIL_IMPORTS_DIR, 'missing_customer_reserved_orders.csv'));
    if (missingData.length > 0) {
      missingData.forEach(row => {
        if (row['Fulfillment ID']) {
          result.missingReserved.push({
            fulfillmentId: row['Fulfillment ID'],
            location: row['Location Name'],
            status: row['EPC Status'],
            lastReadDate: row['EPC last read at (Local) Date'],
            createdDate: row['Fullfillment Created At Local Date']
          });
        }
      });
      result.summary.missing = result.missingReserved.length;
    }

    // Store level summary
    const storeData = this.readCSV(path.join(GMAIL_IMPORTS_DIR, 'store_level.csv'));
    if (storeData.length > 0) {
      const row = storeData[0];
      if (row['# Reserved Orders']) {
        result.summary.totalReserved = parseInt(row['# Reserved Orders']) || 0;
        result.summary.missing = parseInt(row['# Missing Reserved Orders']) || result.summary.missing;
      }
    }

    return result;
  }

  // Process best sellers data (new)
  processBestSellers() {
    const result = {
      byRevenue: [],
      byQuantity: []
    };

    try {
      const files = fs.readdirSync(GMAIL_IMPORTS_DIR).filter(f => 
        f.startsWith('best_seller') && f.endsWith('.csv')
      );

      for (const file of files) {
        const data = this.readCSV(path.join(GMAIL_IMPORTS_DIR, file));
        if (!data || data.length === 0) continue;

        const firstRow = data[0];
        
        // Check if this is revenue data
        if (firstRow['€ Sales Amount']) {
          data.forEach(row => {
            if (row['Parent Item Code'] && row['€ Sales Amount']) {
              const amount = this.parseAmount(row['€ Sales Amount'].replace('€', ''));
              if (amount > 0) {
                result.byRevenue.push({
                  code: row['Parent Item Code'],
                  description: row['Product Description'],
                  amount: amount
                });
              }
            }
          });
        }
        // Check if this is quantity data  
        else if (firstRow['# Sales Quantity']) {
          data.forEach(row => {
            if (row['Parent Item Code'] && row['# Sales Quantity']) {
              const qty = parseInt(row['# Sales Quantity']) || 0;
              if (qty > 0) {
                result.byQuantity.push({
                  code: row['Parent Item Code'],
                  description: row['Product Description'],
                  quantity: qty
                });
              }
            }
          });
        }
      }

      // Sort and dedupe by revenue
      const revenueMap = {};
      result.byRevenue.forEach(item => {
        if (!revenueMap[item.code] || item.amount > revenueMap[item.code].amount) {
          revenueMap[item.code] = item;
        }
      });
      result.byRevenue = Object.values(revenueMap)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 25);

      // Sort and dedupe by quantity
      const qtyMap = {};
      result.byQuantity.forEach(item => {
        if (!qtyMap[item.code] || item.quantity > qtyMap[item.code].quantity) {
          qtyMap[item.code] = item;
        }
      });
      result.byQuantity = Object.values(qtyMap)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 25);

    } catch (err) {
      console.error('Error processing best sellers:', err.message);
    }

    return result;
  }

  // Process Waitwhile/Appointments data (new)
  processWaitwhileData() {
    const result = {
      visitsByWeek: [],
      appointmentsByType: [],
      dropOffByWeek: [],
      currentWeek: {
        week: 50,
        appointments: 0,
        walkIns: 0,
        total: 0,
        shopping: 0,
        pickup: 0,
        consultation: 0,
        other: 0,
        dropOffRate: 0
      }
    };

    // Get current retail week (Week 1 starts on first Sunday on/after Jan 1)
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() + ((7 - jan1.getDay()) % 7));
    const currentWeekNum = now < firstSunday ? 0 : (Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - firstSunday) / 86400000 / 7) + 1);
    result.currentWeek.week = currentWeekNum;

    // Visits by type (appointment vs walk-in)
    // Note: CSV has dual header rows - first is column names, second is sub-headers
    const visitsData = this.readCSV(path.join(APPOINTMENTS_DIR, 'customer_visits_-_stacked_by_type.csv'));
    if (visitsData.length > 0) {
      visitsData.forEach(row => {
        // In this CSV format, first column header is "Visit Type" and data starts with week number
        const week = parseInt(row['Visit Type']) || 0;
        if (week > 0) {
          const appointments = parseInt(row['appointment']) || 0;
          const walkIns = parseInt(row['walk-in']) || 0;
          result.visitsByWeek.push({ week, appointments, walkIns, total: appointments + walkIns });
          
          if (week === currentWeekNum) {
            result.currentWeek.appointments = appointments;
            result.currentWeek.walkIns = walkIns;
            result.currentWeek.total = appointments + walkIns;
          }
        }
      });
    }

    // Appointments by type (consultation, shopping, pickup, other)
    // Note: CSV has dual header rows
    const typeData = this.readCSV(path.join(APPOINTMENTS_DIR, 'customer_visits_-_appointments_segment_-__stacked_by_type.csv'));
    if (typeData.length > 0) {
      typeData.forEach(row => {
        // First column header contains week data
        const weekField = Object.keys(row)[0];
        const week = parseInt(row[weekField]) || 0;
        if (week > 0) {
          const consultation = parseInt(row['Consultation']) || 0;
          const shopping = parseInt(row['Shopping']) || 0;
          const pickup = parseInt(row['Pickup']) || 0;
          const other = parseInt(row['Other']) || 0;
          result.appointmentsByType.push({ week, consultation, shopping, pickup, other });
          
          if (week === currentWeekNum) {
            result.currentWeek.consultation = consultation;
            result.currentWeek.shopping = shopping;
            result.currentWeek.pickup = pickup;
            result.currentWeek.other = other;
          }
        }
      });
    }

    // Drop-off rate by week
    // Note: CSV has dual header rows
    const dropOffData = this.readCSV(path.join(APPOINTMENTS_DIR, 'shopping_appointments_-_drop-off__.csv'));
    if (dropOffData.length > 0) {
      dropOffData.forEach(row => {
        // First column header is "Visit Type" and data contains week number
        const weekField = Object.keys(row)[0];
        const week = parseInt(row[weekField]) || 0;
        if (week > 0) {
          const dropOffRate = this.parsePercent(row['appointment']);
          result.dropOffByWeek.push({ week, dropOffRate });
          
          if (week === currentWeekNum) {
            result.currentWeek.dropOffRate = dropOffRate;
          }
        }
      });
    }

    return result;
  }

  // Process employee count performance (new)
  processStoreCountPerformance() {
    const result = {
      storeData: null,
      summary: {
        accuracy: 0,
        totalCounts: 0,
        missedAvailable: 0,
        missedReserved: 0,
        newUnits: 0,
        undecodable: 0
      }
    };

    const storeData = this.readCSV(path.join(COUNT_PERFORMANCE_STORE_DIR, 'store_level.csv'));
    if (storeData.length > 0) {
      const row = storeData[0];
      result.storeData = {
        location: row['Location Name'] || 'San Francisco',
        accuracy: this.parsePercent(row['% Inventory Accuracy']),
        totalCounts: parseInt(row['Count of Store RFID Count ID']) || 0,
        missedAvailable: parseInt(row['# Missed Available Quantity']) || 0,
        missedReserved: parseInt(row['# Missed Reserved Quantity']) || 0,
        newUnits: parseInt(row['# New Units']) || 0,
        undecodable: parseInt(row['# Un-decodable Units']) || 0,
        unmappedItems: parseInt(row['# Unmapped Item Units']) || 0,
        foundPrevMissing: parseInt(row['# Found previously missing']) || 0
      };
      result.summary = result.storeData;
    }

    return result;
  }

  processEmployeeCountPerformance() {
    const result = {
      employees: [],
      summary: {
        avgAccuracy: 0,
        totalCounts: 0
      }
    };

    const countData = this.readCSV(path.join(COUNT_PERFORMANCE_DIR, 'employee_level.csv'));
    if (countData.length > 0) {
      let totalAccuracy = 0;
      let validCount = 0;

      countData.forEach(row => {
        if (row['Employee Full Name']) {
          const accuracy = this.parsePercent(row['% Inventory Accuracy']);
          const counts = parseInt(row['Count of Store RFID Count ID']) || 0;
          const missedReserved = parseInt(row['# Missed Reserved Quantity']) || 0;

          const missedAvailable = parseInt(row['# Missed Available Quantity']) || 0;
          
          result.employees.push({
            name: row['Employee Full Name'],
            location: row['Location Name'],
            accuracy: accuracy,
            missedAvailable: missedAvailable,
            missedReserved: missedReserved,
            countsDone: counts,
            rankAccuracy: parseInt(row['Rank Inventory Acc.']) || 0,
            rankCounts: parseInt(row['Rank # of counts']) || 0,
            rankMissing: parseInt(row['Rank of # Missing reserved']) || 0
          });

          totalAccuracy += accuracy;
          result.summary.totalCounts += counts;
          validCount++;
        }
      });

      if (validCount > 0) {
        result.summary.avgAccuracy = Math.round(totalAccuracy / validCount * 10) / 10;
      }

      // Sort by accuracy descending
      result.employees.sort((a, b) => b.accuracy - a.accuracy);
    }

    return result;
  }

  // Process tailor productivity trend (new)
  processTailorProductivityTrend() {
    const result = {
      weeks: [],
      currentWeek: null,
      ytdAvg2024: 0,
      ytdAvg2025: 0
    };

    const trendData = this.readCSV(path.join(STORES_PERFORMANCE_DIR, 'tailor_productivity.csv'));
    if (trendData.length > 0) {
      let total2024 = 0, total2025 = 0, count2024 = 0, count2025 = 0;

      trendData.forEach(row => {
        // CSV has headers: "", "Retail Year", "2024", "2025"
        // But actual data: [index], [week num], [2024 %], [2025 %]
        // So "Retail Year" column contains the week number
        const week = parseInt(row['Retail Year']) || 0;
        const prod2024 = this.parsePercent(row['2024']);
        const prod2025 = this.parsePercent(row['2025']);

        if (week > 0 && week <= 52) {
          result.weeks.push({
            week: week,
            productivity2024: prod2024,
            productivity2025: prod2025
          });

          if (prod2024 > 0) { total2024 += prod2024; count2024++; }
          if (prod2025 > 0) { total2025 += prod2025; count2025++; }
        }
      });

      // Sort by week number
      result.weeks.sort((a, b) => a.week - b.week);

      // Calculate YTD averages
      if (count2024 > 0) result.ytdAvg2024 = Math.round(total2024 / count2024);
      if (count2025 > 0) result.ytdAvg2025 = Math.round(total2025 / count2025);

      // Get current week data (Week 1 starts on first Sunday on/after Jan 1)
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      const firstSunday = new Date(jan1);
      firstSunday.setDate(jan1.getDate() + ((7 - jan1.getDay()) % 7));
      const currentWeekNum = now < firstSunday ? 0 : (Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - firstSunday) / 86400000 / 7) + 1);
      result.currentWeek = result.weeks.find(w => w.week === currentWeekNum);
    }

    return result;
  }

  // Main processing function - process all data
  async processAll(options = {}) {
    console.log('=== Looker Data Processor ===');
    console.log(`Date: ${this.getTodayDate()}`);
    
    // Parse email subject for multi-store detection
    const emailSubject = options.emailSubject || '';
    const emailInfo = parseEmailSubject(emailSubject);
    
    if (emailInfo.isAllStores) {
      console.log('🌐 MULTI-STORE EMAIL DETECTED');
      console.log(`Subject: "${emailSubject}"`);
      console.log('Will process data for ALL stores');
    } else if (emailInfo.storeName) {
      console.log(`🏪 Single-store email: ${emailInfo.storeName} (${emailInfo.storeCode})`);
    } else {
      console.log('📧 Email subject not provided - defaulting to San Francisco (backward compatible)');
    }
    console.log('');

    // Store email info for use by other methods
    this.emailInfo = emailInfo;

    const results = {
      success: false,
      date: this.getTodayDate(),
      processedAt: new Date().toISOString(),
      emailSubject: emailSubject,
      isMultiStore: emailInfo.isAllStores,
      storeCode: emailInfo.storeCode || 'SF', // Default to SF for backward compatibility
      storeMetrics: null,
      appointments: null,
      employeeMetrics: null,
      tailorMetrics: null,
      loans: null,
      operationsHealth: null,
      inventoryIssues: null,
      customerReservedOrders: null,
      employeeCountPerformance: null,
      storeCountPerformance: null,
      tailorProductivityTrend: null,
      workRelatedExpenses: null,
      filesProcessed: [],
      errors: []
    };

    try {
      // Process store metrics
      console.log('Processing store metrics...');
      results.storeMetrics = this.processStoreMetrics();
      
      // Add appointments to metrics
      console.log('Processing appointments...');
      results.appointments = this.processAppointments();
      results.storeMetrics.todayPickups = results.appointments.pickups;

      // Process operations health (new)
      console.log('Processing operations health...');
      results.operationsHealth = this.processOperationsHealth();
      results.storeMetrics.operationsHealth = results.operationsHealth;

      // Process inventory issues (new)
      console.log('Processing inventory issues...');
      results.inventoryIssues = this.processInventoryIssues();
      results.storeMetrics.inventoryIssues = results.inventoryIssues;

      // Process customer reserved orders (new)
      console.log('Processing customer reserved orders...');
      results.customerReservedOrders = this.processCustomerReservedOrders();
      results.storeMetrics.customerReservedOrders = results.customerReservedOrders;

      // Process employee count performance (new)
      console.log('Processing employee count performance...');
      results.employeeCountPerformance = this.processEmployeeCountPerformance();
      results.storeCountPerformance = this.processStoreCountPerformance();
      results.storeMetrics.employeeCountPerformance = results.employeeCountPerformance;
      results.storeMetrics.storeCountPerformance = results.storeCountPerformance;

      // Process tailor productivity trend (new)
      console.log('Processing tailor productivity trend...');
      results.tailorProductivityTrend = this.processTailorProductivityTrend();
      results.storeMetrics.tailorProductivityTrend = results.tailorProductivityTrend;

      // Process work-related expenses (employee discounts)
      console.log('Processing work-related expenses...');
      results.workRelatedExpenses = this.processWorkRelatedExpenses();

      // Process Store Ops "Overdue Audit" metrics (CSV preferred; PDF fallback)
      console.log('Processing Store Ops overdue audit (CSV/PDF)...');
      results.storeOpsOverdueAudit = await this.processStoreOpsOverdueAudit();

      // Save metrics
      const metricsFile = path.join(METRICS_DIR, `${this.getTodayDate()}.json`);
      this.writeJsonFile(metricsFile, results.storeMetrics);
      console.log(`Saved metrics to: ${metricsFile}`);

      // Process employee metrics
      console.log('Processing employee metrics...');
      results.employeeMetrics = this.processEmployeeMetrics();

      // Process tailor metrics
      console.log('Processing tailor metrics...');
      results.tailorMetrics = this.processTailorMetrics();

      // Process loans
      console.log('Processing loans data...');
      results.loans = this.processLoansData();

      results.filesProcessed = this.processedFiles;
      results.errors = this.errors;
      results.success = this.errors.length === 0;

      // Also save to dashboard-data.json for persistent storage (after we know filesProcessed).
      const syncBy = options?.syncBy || 'manual';
      const emailDate = options?.emailDate || null;
      const importStats =
        options?.importStats && typeof options.importStats === 'object'
          ? options.importStats
          : {
              // Derive a stable-ish "records imported" for the UI from the processing step.
              // Exclude best-seller pagination CSVs to avoid inflated counts.
              recordsImported: results.filesProcessed.filter(f => !/^best_seller_/i.test(f)).length,
              files: results.filesProcessed.filter(f => !/^best_seller_/i.test(f))
            };

      const dashboardData = this.saveToDashboardData(results, syncBy, emailDate, importStats);
      results.dashboardDataSaved = true;
      results.hasNewData = dashboardData?.hasNewData || false;

      console.log('\n=== Processing Complete ===');
      console.log(`Files processed: ${this.processedFiles.length}`);
      console.log(`Errors: ${this.errors.length}`);

    } catch (error) {
      console.error('Processing error:', error);
      results.errors.push(error.message);
    }

    return results;
  }
}

// Export for use in routes
module.exports = { LookerDataProcessor };

// Run directly for testing
if (require.main === module) {
  const processor = new LookerDataProcessor();
  processor.processAll().then(results => {
    console.log('\nResults:', JSON.stringify(results, null, 2));
  });
}
