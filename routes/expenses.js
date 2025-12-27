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

function getSavedExpenses() {
  const saved = LookerDataProcessor.getSavedDashboardData();
  const exp = saved?.workRelatedExpenses;
  if (!exp || !Array.isArray(exp.orders)) return null;
  return exp;
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
  const rawLower = !email ? raw.toLowerCase() : '';
  const rawNameKey = !email ? normalizeNameKey(raw) : '';

  return (orders || []).filter(o => {
    if (email || rawLower || rawNameKey) {
      const b = o?.beneficiary || {};
      const rowEmail = normalizeEmail(b?.email);
      const rowNameKey = normalizeNameKey(b?.name) || normalizeNameKey(o?.customerName);
      const rowEmpId = (b?.employeeId || '').toString().trim().toLowerCase();
      const rowKey = (b?.key || '').toString().trim().toLowerCase();

      if (email && rowEmail !== email) return false;
      if (!email) {
        const matches =
          (rawLower && rowEmpId && rowEmpId === rawLower) ||
          (rawNameKey && rowNameKey && rowNameKey === rawNameKey) ||
          (rawLower && rowKey && rowKey === rawLower);
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
  if (limit === null || limit === undefined || limit === '') {
    return { limit: null, used, remaining: null, percentUsed: null, over: false };
  }
  const lim = Number(limit);
  if (!Number.isFinite(lim)) {
    return { limit: null, used, remaining: null, percentUsed: null, over: false };
  }
  const remaining = lim - used; // can be negative when overspent
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

  const yearlyLimit = override && Number.isFinite(Number(override.yearlyLimit))
    ? Number(override.yearlyLimit)
    : config.globalYearlyLimit;

  return { monthlyLimit: null, yearlyLimit: yearlyLimit ?? null };
}

function normalizeOrder(order, usersIndex) {
  const o = order || {};

  const beneficiaryName = o?.beneficiary?.name || o?.customerName || null;

  const beneficiaryUser = beneficiaryName
    ? usersIndex.byName.get(normalizeNameKey(beneficiaryName)) ||
      (suggestWorkEmailFromName(beneficiaryName)
        ? usersIndex.byEmail.get(normalizeEmail(suggestWorkEmailFromName(beneficiaryName)))
        : null) ||
      null
    : null;

  const beneficiary = {
    name: beneficiaryName,
    email: o?.beneficiary?.email || beneficiaryUser?.email || null,
    employeeId: o?.beneficiary?.employeeId || beneficiaryUser?.employeeId || null,
    imageUrl: o?.beneficiary?.imageUrl || beneficiaryUser?.imageUrl || null
  };
  beneficiary.key = normalizeEmail(beneficiary.email) || (beneficiary.employeeId || '').toString().trim() || normalizeNameKey(beneficiary.name);

  return {
    ...o,
    beneficiary,
    // Keep legacy field around for older UI bits.
    customerName: beneficiary.name || null
  };
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
        totals: {
          currentYear: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 },
          currentMonth: { orders: 0, discountLc: 0, fullPriceLc: 0, netRevenueLc: 0 }
        }
      });
    }

    const entry = byEmployee.get(normKey);
    entry.employee = entry.employee?.email ? entry.employee : { ...(o.beneficiary || {}), key: normKey };
    if (entry.known !== true && o?.beneficiary?.email) entry.known = true;

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
    const { yearlyLimit } = resolveLimits(config, email);

    const yearRetail = Number(e?.totals?.currentYear?.fullPriceLc || 0);

    const yearStatus = buildLimitStatus({ retailValueLc: yearRetail, limit: yearlyLimit });

    return {
      ...e,
      limits: { yearlyLimit },
      status: { yearly: yearStatus },
      overLimit: { yearly: yearStatus.over }
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
  // This page is intentionally visible to all logged-in users.
  return !!user;
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

// GET /api/expenses - list orders (visible to all authed users)
router.get('/', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.json({ success: true, source: null, orders: [], employees: [], storeTotals: null });

  const config = getConfig();
  const usersIndex = readUsersIndex();

  const requestedRaw = (req.query.employeeEmail || '').toString().trim();
  const effectiveEmployeeFilter = requestedRaw || '';

  const start = parseIsoDate(req.query.start);
  const end = parseIsoDate(req.query.end);

  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
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
    employees: aggregates.employees,
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

  if (!exp) {
    return res.json({
      success: true,
      available: false,
      totals: { currentYearRetailLc: 0, yearOrders: 0 },
      limits
    });
  }

  const email = normalizeEmail(req.user?.email);
  const nameKey = normalizeNameKey(req.user?.name);
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
  const mine = normalizedOrders.filter(o => {
    const bEmail = normalizeEmail(o?.beneficiary?.email);
    const bName = normalizeNameKey(o?.beneficiary?.name);
    if (email && bEmail && email === bEmail) return true;
    if (nameKey && bName && nameKey === bName) return true;
    return false;
  });
  const monthKey = currentMonthKey();
  const year = new Date().getFullYear();

  const yearOrders = mine.filter(o => isInYear(o, year));

  const currentYearRetailLc = sumLcFullPrice(yearOrders);

  const yearly = buildLimitStatus({ retailValueLc: currentYearRetailLc, limit: limits.yearlyLimit });

  return res.json({
    success: true,
    available: true,
    monthKey,
    year,
    totals: { currentYearRetailLc, yearOrders: yearOrders.length },
    limits,
    status: { yearly },
    overLimit: { yearly: yearly.over }
  });
});

// GET /api/expenses/orders/:orderId/notes - read notes + attachments
router.get('/orders/:orderId/notes', (req, res) => {
  const exp = getSavedExpenses();
  if (!exp) return res.status(404).json({ error: 'No expenses data available' });

  const usersIndex = readUsersIndex();
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
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
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
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
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
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
  const normalizedOrders = (exp.orders || []).map(o => normalizeOrder(o, usersIndex));
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
