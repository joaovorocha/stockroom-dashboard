const express = require('express');
const router = express.Router();
const dal = require('../utils/dal');

const TIMEOFF_FILE = dal.paths.timeoffFile;
const USERS_FILE = dal.paths.usersFile;

function readJsonFile(filePath, defaultValue = {}) {
  return dal.readJson(filePath, defaultValue);
}

function writeJsonFile(filePath, data) {
  dal.writeJsonAtomic(filePath, data, { pretty: true });
}

function getSessionUser(req) {
  return req.user || null;
}

function normalizeId(value) {
  return (value === undefined || value === null) ? '' : String(value).trim();
}

function normalizeIdLoose(value) {
  return normalizeId(value).toLowerCase();
}

function coerceIsoDate(d) {
  if (!d) return '';
  const s = d.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function normalizeEntry(raw) {
  const now = new Date().toISOString();
  const employeeId = normalizeId(raw?.employeeId);
  const employeeName = (raw?.employeeName || '').toString().trim();
  const startDate = coerceIsoDate(raw?.startDate);
  const endDate = coerceIsoDate(raw?.endDate);
  const normalizedStatus = 'published';

  return {
    id: (raw?.id || `req-${Date.now()}`).toString(),
    employeeUserId: normalizeId(raw?.employeeUserId || raw?.userId),
    employeeId,
    employeeName,
    employeeImageUrl: raw?.employeeImageUrl || '',
    startDate,
    endDate,
    reason: (raw?.reason || 'vacation').toString(),
    notes: (raw?.notes || '').toString(),
    status: normalizedStatus,
    submittedAt: raw?.submittedAt || raw?.importedAt || now,
    decidedAt: null,
    decidedBy: null,
    workdayStatus: null,
    processedAt: null,
    processedBy: null
  };
}

function loadTimeOff() {
  const data = readJsonFile(TIMEOFF_FILE, { entries: [] });

  // LEGACY SUPPORT: Legacy formats supported:
  // 1) { entries: [...] }
  // 2) { requests: [], approved: [], denied: [] }
  const entries = [];
  if (Array.isArray(data?.entries)) {
    for (const e of data.entries) entries.push(normalizeEntry(e));
  } else {
    for (const e of (data?.requests || [])) entries.push(normalizeEntry({ ...e, status: 'published' }));
    for (const e of (data?.approved || [])) entries.push(normalizeEntry({ ...e, status: 'published' }));
    for (const e of (data?.denied || [])) entries.push(normalizeEntry({ ...e, status: 'published' }));
  }

  // LEGACY SUPPORT: Backfill employeeUserId/imageUrl for legacy entries (best-effort) so history links correctly.
  let changed = false;
  const usersData = readJsonFile(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData?.users) ? usersData.users : [];
  const byEmployeeId = new Map(users.map(u => [normalizeIdLoose(u.employeeId), u]));

  const backfilled = entries.map(e => {
    if (normalizeId(e.employeeUserId)) return e;
    const u = byEmployeeId.get(normalizeIdLoose(e.employeeId));
    if (!u) return e;
    changed = true;
    return normalizeEntry({
      ...e,
      employeeUserId: u.id,
      employeeImageUrl: e.employeeImageUrl || u.imageUrl || ''
    });
  });

  if (changed) {
    // Persist backfilled values so future reads are consistent.
    saveTimeOff(backfilled);
    return { entries: backfilled };
  }

  return { entries };
}

function saveTimeOff(entries) {
  const normalized = (entries || []).map(normalizeEntry);
  writeJsonFile(TIMEOFF_FILE, { entries: normalized });
}

// GET /api/timeoff - Get all time off data
router.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { entries: entriesRaw } = loadTimeOff();
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
  const mine = entries.filter(e => {
    const sameUserId = normalizeId(e.employeeUserId) && normalizeId(user.userId) && normalizeIdLoose(e.employeeUserId) === normalizeIdLoose(user.userId);
    if (sameUserId) return true;
    return normalizeIdLoose(e.employeeId) === normalizeIdLoose(user.employeeId);
  });

  return res.json({
    entries,
    myEntries: mine
  });
});

// POST /api/timeoff/request - Submit time off request
router.post('/request', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { startDate, endDate, reason, notes } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start and end dates are required' });
  }

  const { entries: entriesRaw } = loadTimeOff();
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];

  const newRequest = normalizeEntry({
    id: `req-${Date.now()}`,
    employeeUserId: user.userId,
    employeeId: user.employeeId,
    employeeName: user.name,
    employeeImageUrl: user.imageUrl || '',
    startDate: coerceIsoDate(startDate),
    endDate: coerceIsoDate(endDate),
    reason: reason || 'vacation',
    notes: notes || '',
    status: 'published',
    submittedAt: new Date().toISOString()
  });

  if (!newRequest.startDate || !newRequest.endDate) {
    return res.status(400).json({ error: 'Invalid start or end date' });
  }

  // Avoid accidental duplicates: if the same employee already has an identical pending entry for the same date range,
  // update that record instead of creating a new one.
  const existingIdx = entries.findIndex(e => {
    const sameEmployee =
      (normalizeId(e.employeeUserId) && normalizeId(user.userId) && normalizeIdLoose(e.employeeUserId) === normalizeIdLoose(user.userId)) ||
      normalizeIdLoose(e.employeeId) === normalizeIdLoose(user.employeeId);
    if (!sameEmployee) return false;
    return normalizeId(e.startDate) === normalizeId(newRequest.startDate) && normalizeId(e.endDate) === normalizeId(newRequest.endDate);
  });

  if (existingIdx !== -1) {
    entries[existingIdx] = normalizeEntry({
      ...entries[existingIdx],
      reason: newRequest.reason,
      notes: newRequest.notes,
      submittedAt: new Date().toISOString()
    });
  } else {
    entries.push(newRequest);
  }
  saveTimeOff(entries);

  res.json({ success: true, request: newRequest });
});

// PUT /api/timeoff/:id - Update own request
router.put('/:id', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { id } = req.params;
  const { startDate, endDate, reason, notes } = req.body || {};

  const nextStart = coerceIsoDate(startDate);
  const nextEnd = coerceIsoDate(endDate);
  if (!nextStart || !nextEnd) return res.status(400).json({ error: 'Invalid start or end date' });

  const { entries: entriesRaw } = loadTimeOff();
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
  const idx = entries.findIndex(e => {
    if (e.id !== id) return false;
    if (user.isAdmin) return true;
    const sameUserId = normalizeId(e.employeeUserId) && normalizeId(user.userId) && normalizeIdLoose(e.employeeUserId) === normalizeIdLoose(user.userId);
    if (sameUserId) return true;
    return normalizeIdLoose(e.employeeId) === normalizeIdLoose(user.employeeId);
  });
  if (idx === -1) return res.status(404).json({ error: 'Request not found or not yours' });

  const entry = entries[idx];

  entries[idx] = normalizeEntry({
    ...entry,
    employeeUserId: entry.employeeUserId || user.userId,
    startDate: nextStart,
    endDate: nextEnd,
    reason: reason !== undefined ? String(reason) : entry.reason,
    notes: notes !== undefined ? String(notes) : entry.notes,
    // Keep identity in sync if user profile changed
    employeeName: user.name || entry.employeeName,
    employeeImageUrl: user.imageUrl || entry.employeeImageUrl
  });

  saveTimeOff(entries);
  return res.json({ success: true, entry: entries[idx] });
});

// (manager-only approval/export endpoints removed; this is a shared calendar only)

// DELETE /api/timeoff/:id - Cancel own request
router.delete('/:id', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const { entries: entriesRaw } = loadTimeOff();
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });

  const entry = entries[idx];
  const isOwner = (() => {
    const sameUserId = normalizeId(entry.employeeUserId) && normalizeId(user.userId) && normalizeIdLoose(entry.employeeUserId) === normalizeIdLoose(user.userId);
    if (sameUserId) return true;
    return normalizeIdLoose(entry.employeeId) === normalizeIdLoose(user.employeeId);
  })();

  // Admins can remove any entry.
  if (user.isAdmin) {
    entries.splice(idx, 1);
    saveTimeOff(entries);
    return res.json({ success: true });
  }

  // Non-admins can only remove their own entries.
  if (!isOwner) return res.status(403).json({ error: 'Not allowed' });

  entries.splice(idx, 1);
  saveTimeOff(entries);
  return res.json({ success: true });
});

module.exports = router;
