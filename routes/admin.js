const express = require('express');
const router = express.Router();
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TIMEOFF_FILE = path.join(DATA_DIR, 'time-off.json');
const GAMEPLAN_DAILY_DIR = path.join(DATA_DIR, 'gameplan-daily');
const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {}
  return fallback;
}

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
