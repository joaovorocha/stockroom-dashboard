const express = require('express');
const path = require('path');
const dal = require('../utils/dal');
const { LookerDataProcessor } = require('../utils/looker-data-processor');

const router = express.Router();

const DATA_DIR = dal.paths.dataDir;
const CONFIG_FILE = path.join(DATA_DIR, 'work-expenses-config.json');

function readJson(filePath, fallback) {
  return dal.readJson(filePath, fallback);
}

function getConfig() {
  const cfg = readJson(CONFIG_FILE, null) || {};
  return {
    globalMonthlyLimit: Number.isFinite(Number(cfg.globalMonthlyLimit)) ? Number(cfg.globalMonthlyLimit) : null,
    globalYearlyLimit: Number.isFinite(Number(cfg.globalYearlyLimit)) ? Number(cfg.globalYearlyLimit) : null,
    overrides: cfg.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {},
    updatedAt: cfg.updatedAt || null,
    updatedBy: cfg.updatedBy || null
  };
}

function normalizeEmail(value) {
  return (value || '').toString().trim().toLowerCase();
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
  const email = normalizeEmail(employeeEmail);

  return (orders || []).filter(o => {
    if (email) {
      const rowEmail = normalizeEmail(o?.employee?.email);
      if (rowEmail !== email) return false;
    }

    const d = (o?.calendarDate || '').toString().trim();
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;
    return true;
  });
}

function sumLcDiscount(orders) {
  return (orders || []).reduce((acc, o) => acc + Number(o?.amounts?.lc?.discount || 0), 0);
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
  const userEmail = normalizeEmail(req.user?.email);

  const requestedEmployeeEmail = normalizeEmail(req.query.employeeEmail);
  const effectiveEmployeeEmail = isManagerOrAdmin(req.user)
    ? (requestedEmployeeEmail || '')
    : userEmail;

  const start = parseIsoDate(req.query.start);
  const end = parseIsoDate(req.query.end);

  const filtered = filterOrders(exp.orders, {
    start,
    end,
    employeeEmail: effectiveEmployeeEmail || null
  });

  return res.json({
    success: true,
    source: { importedAt: exp.importedAt, sourceFile: exp.sourceFile },
    filters: { start: start || null, end: end || null, employeeEmail: effectiveEmployeeEmail || null },
    orders: filtered,
    storeTotals: exp.storeTotals || null,
    employees: isManagerOrAdmin(req.user) ? (exp.employees || []) : []
  });
});

// GET /api/expenses/status - current user's limit status (for header/banner)
router.get('/status', (req, res) => {
  const exp = getSavedExpenses();
  const config = getConfig();
  const limits = resolveLimits(config, req.user?.email);

  if (!exp) {
    return res.json({
      success: true,
      available: false,
      totals: { currentMonthDiscountLc: 0, currentYearDiscountLc: 0 },
      limits
    });
  }

  const email = normalizeEmail(req.user?.email);
  const mine = filterOrders(exp.orders, { employeeEmail: email });
  const monthKey = currentMonthKey();
  const year = new Date().getFullYear();

  const monthOrders = mine.filter(o => isInMonth(o, monthKey));
  const yearOrders = mine.filter(o => isInYear(o, year));

  const currentMonthDiscountLc = sumLcDiscount(monthOrders);
  const currentYearDiscountLc = sumLcDiscount(yearOrders);

  const overMonthly = Number.isFinite(limits.monthlyLimit) ? currentMonthDiscountLc > limits.monthlyLimit : false;
  const overYearly = Number.isFinite(limits.yearlyLimit) ? currentYearDiscountLc > limits.yearlyLimit : false;

  return res.json({
    success: true,
    available: true,
    monthKey,
    year,
    totals: { currentMonthDiscountLc, currentYearDiscountLc, monthOrders: monthOrders.length, yearOrders: yearOrders.length },
    limits,
    overLimit: { monthly: overMonthly, yearly: overYearly }
  });
});

module.exports = router;

