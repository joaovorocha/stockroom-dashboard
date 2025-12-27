const express = require('express');
const router = express.Router();
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const dal = require('../utils/dal');

const DATA_DIR = dal.paths.dataDir;
const TIMEOFF_FILE = dal.paths.timeoffFile;
const GAMEPLAN_DAILY_DIR = dal.paths.gameplanDailyDir;
const SHIPMENTS_FILE = dal.paths.shipmentsFile;
const USERS_FILE = dal.paths.usersFile;
const AWARDS_CONFIG_FILE = path.join(DATA_DIR, 'awards-config.json');
const WORK_EXPENSES_CONFIG_FILE = path.join(DATA_DIR, 'work-expenses-config.json');

function getTomatoConfigDefaults() {
  const today = dal.getBusinessDate();
  return { tomatoStartDate: dal.addDaysToIsoDate(today, 1) };
}

function readTomatoConfig() {
  const defaults = getTomatoConfigDefaults();
  const cfg = readJson(AWARDS_CONFIG_FILE, null) || {};
  return {
    ...defaults,
    ...cfg,
    tomatoStartDate: (cfg.tomatoStartDate || defaults.tomatoStartDate || '').toString(),
    tomatoResetAt: cfg.tomatoResetAt || null
  };
}

function writeTomatoConfig(next) {
  dal.writeJsonAtomic(AWARDS_CONFIG_FILE, next, { pretty: true });
}

function getTimestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeFileName(value) {
  return (value || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function readJson(filePath, fallback) {
  return dal.readJson(filePath, fallback);
}

function readWorkExpensesConfig() {
  const cfg = readJson(WORK_EXPENSES_CONFIG_FILE, null) || {};
  return {
    // Policy default: €2,500 max retail value per calendar year (or local currency equivalent).
    // We store limits in local currency (LC) numbers (USD for SF).
    globalMonthlyLimit: Number.isFinite(Number(cfg.globalMonthlyLimit)) ? Number(cfg.globalMonthlyLimit) : null,
    globalYearlyLimit: Number.isFinite(Number(cfg.globalYearlyLimit)) ? Number(cfg.globalYearlyLimit) : 2500,
    overrides: cfg.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {},
    updatedAt: cfg.updatedAt || null,
    updatedBy: cfg.updatedBy || null
  };
}

function writeWorkExpensesConfig(next) {
  dal.writeJsonAtomic(WORK_EXPENSES_CONFIG_FILE, next, { pretty: true });
}

// GET /api/admin/store-config - Get store configuration (admin only; middleware enforced in server.js)
router.get('/store-config', (req, res) => {
  return res.json(dal.getStoreConfig());
});

// POST /api/admin/store-config - Update store configuration (admin only)
router.post('/store-config', express.json(), (req, res) => {
  try {
    const patch = req.body || {};
    if (Object.prototype.hasOwnProperty.call(patch, 'requireSaShift')) {
      patch.requireSaShift = patch.requireSaShift === true || patch.requireSaShift === 'true';
    }
    const actorName = req.user?.name || null;
    const next = dal.updateStoreConfig(patch, actorName);
    return res.json(next);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid store config' });
  }
});

// GET /api/admin/tomato-awards - Tomato awards configuration (admin only)
router.get('/tomato-awards', (req, res) => {
  const cfg = readTomatoConfig();
  // Persist if file didn't exist so awards start "tomorrow" by default.
  if (!fs.existsSync(AWARDS_CONFIG_FILE)) {
    writeTomatoConfig({ ...cfg, createdAt: new Date().toISOString(), createdBy: req.user?.name || null });
  }
  return res.json(cfg);
});

// POST /api/admin/tomato-awards/reset - Reset tomato awards (starts tomorrow)
router.post('/tomato-awards/reset', (req, res) => {
  const today = dal.getBusinessDate();
  const next = {
    ...readTomatoConfig(),
    // Reset immediately: numbers go back to 0 and start counting again from the current store day.
    tomatoStartDate: today,
    tomatoResetAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.name || null
  };
  writeTomatoConfig(next);
  return res.json(next);
});

// GET /api/admin/work-expenses-config - Work-related expenses limits (admin)
router.get('/work-expenses-config', (req, res) => {
  return res.json(readWorkExpensesConfig());
});

// POST /api/admin/work-expenses-config - Update limits (admin)
router.post('/work-expenses-config', express.json(), (req, res) => {
  try {
    const patch = req.body || {};
    const current = readWorkExpensesConfig();

    const next = {
      ...current,
      globalMonthlyLimit: Object.prototype.hasOwnProperty.call(patch, 'globalMonthlyLimit')
        ? (patch.globalMonthlyLimit === null || patch.globalMonthlyLimit === '' ? null : Number(patch.globalMonthlyLimit))
        : current.globalMonthlyLimit,
      globalYearlyLimit: Object.prototype.hasOwnProperty.call(patch, 'globalYearlyLimit')
        ? (patch.globalYearlyLimit === null || patch.globalYearlyLimit === '' ? null : Number(patch.globalYearlyLimit))
        : current.globalYearlyLimit,
      overrides: Object.prototype.hasOwnProperty.call(patch, 'overrides') && patch.overrides && typeof patch.overrides === 'object'
        ? patch.overrides
        : current.overrides,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || null
    };

    if (next.globalMonthlyLimit !== null && !Number.isFinite(next.globalMonthlyLimit)) {
      return res.status(400).json({ error: 'globalMonthlyLimit must be a number or null' });
    }
    if (next.globalYearlyLimit !== null && !Number.isFinite(next.globalYearlyLimit)) {
      return res.status(400).json({ error: 'globalYearlyLimit must be a number or null' });
    }

    writeWorkExpensesConfig(next);
    return res.json(next);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid work expenses config' });
  }
});

function buildTimeOffCsv(entries) {
  const esc = (v) => `"${String(v ?? '').replace(/\"/g, '""')}"`;
  const header = [
    'employeeId',
    'employeeName',
    'startDate',
    'endDate',
    'reason',
    'status',
    'notes',
    'submittedAt',
    'decidedAt',
    'decidedByName',
    'workdayStatus',
    'processedAt',
    'processedByName'
  ].join(',');

  const rows = (entries || []).map(e => [
    esc(e.employeeId),
    esc(e.employeeName),
    esc(e.startDate),
    esc(e.endDate),
    esc(e.reason),
    esc(e.status),
    esc(e.notes),
    esc(e.submittedAt),
    esc(e.decidedAt || ''),
    esc(e.decidedBy?.name || ''),
    esc(e.workdayStatus || 'pending'),
    esc(e.processedAt || ''),
    esc(e.processedBy?.name || '')
  ].join(','));

  return `${header}\n${rows.join('\n')}\n`;
}

// GET /api/admin/backup.zip - Download a ZIP of the data directory (admin only; middleware enforced in server.js)
router.get('/backup.zip', async (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return res.status(404).json({ error: 'No data directory found' });
    }

    const zip = new AdmZip();
    zip.addLocalFolder(DATA_DIR, 'data');

    const filename = `stockroom-dashboard-backup_${getTimestampForFilename()}.zip`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-backup-'));
    const tmpZipPath = path.join(tmpDir, filename);
    zip.writeZip(tmpZipPath);

    return res.download(tmpZipPath, filename, (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
      if (err) {
        console.error('Error sending backup zip:', err);
      }
    });
  } catch (error) {
    console.error('Error generating backup zip:', error);
    return res.status(500).json({ error: 'Failed to generate backup' });
  }
});

// GET /api/admin/export.zip - Structured export (admin only; middleware enforced in server.js)
router.get('/export.zip', async (req, res) => {
  try {
    const zip = new AdmZip();
    const stamp = getTimestampForFilename();

    // ===== Time Off =====
    const timeoff = readJson(TIMEOFF_FILE, { entries: [] });
    const entries = Array.isArray(timeoff?.entries) ? timeoff.entries : [];
    zip.addFile('export/time-off/time-off.json', Buffer.from(JSON.stringify(timeoff, null, 2)));
    zip.addFile('export/time-off/time-off.csv', Buffer.from(buildTimeOffCsv(entries)));

    // By employee
    const byEmployee = new Map();
    for (const e of entries) {
      const key = `${e.employeeId || ''}`.trim() || 'unknown';
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key).push(e);
    }
    for (const [employeeId, list] of byEmployee.entries()) {
      const name = safeFileName(list?.[0]?.employeeName || '');
      const file = `export/time-off/by-employee/${safeFileName(employeeId)}_${name}.json`;
      zip.addFile(file, Buffer.from(JSON.stringify({ employeeId, entries: list }, null, 2)));
    }

    // By start date
    const byDate = new Map();
    for (const e of entries) {
      const date = (e.startDate || '').toString().trim() || 'unknown-date';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(e);
    }
    for (const [date, list] of byDate.entries()) {
      zip.addFile(`export/time-off/by-date/${safeFileName(date)}.json`, Buffer.from(JSON.stringify({ date, entries: list }, null, 2)));
    }

    // ===== Gameplan (already by-date) =====
    if (fs.existsSync(GAMEPLAN_DAILY_DIR)) {
      zip.addLocalFolder(GAMEPLAN_DAILY_DIR, 'export/gameplan/by-date');
    }

    // ===== Shipments =====
    const shipments = readJson(SHIPMENTS_FILE, []);
    zip.addFile('export/shipments/shipments.json', Buffer.from(JSON.stringify(shipments, null, 2)));

    // ===== Users (redacted) =====
    const usersData = readJson(USERS_FILE, { users: [] });
    const redactedUsers = {
      ...usersData,
      users: (usersData?.users || []).map(u => ({ ...u, password: undefined }))
    };
    zip.addFile('export/users/users.redacted.json', Buffer.from(JSON.stringify(redactedUsers, null, 2)));

    // ===== Raw data folder (reference) =====
    // Keep this export safe-ish by still including raw data in a separate subtree.
    if (fs.existsSync(DATA_DIR)) zip.addLocalFolder(DATA_DIR, 'export/raw-data');

    const filename = `stockroom-dashboard-export_${stamp}.zip`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-export-'));
    const tmpZipPath = path.join(tmpDir, filename);
    zip.writeZip(tmpZipPath);

    return res.download(tmpZipPath, filename, (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
      if (err) console.error('Error sending export zip:', err);
    });
  } catch (error) {
    console.error('Error generating structured export zip:', error);
    return res.status(500).json({ error: 'Failed to generate structured export' });
  }
});

module.exports = router;
