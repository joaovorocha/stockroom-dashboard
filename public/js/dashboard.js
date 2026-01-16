// Dashboard JavaScript
// Auto-add credentials: 'include' to all fetch requests
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    if (typeof url === 'string' && url.startsWith('/')) {
      options.credentials = options.credentials || 'include';
    }
    return originalFetch(url, options);
  };
})();

let currentUser = null;
let employees = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
let metrics = {};
let settings = {};
let storeConfig = { requireSaShift: false, currency: 'USD' };
let gameplanData = { notes: '', assignments: {}, published: false };
let loansData = [];
let currentClientDate;
let currentEditEmployee = null;
let showAllEmployees = { SA: false, BOH: false, MANAGEMENT: false, TAILOR: false };
let currentSettingsTab = 'zones';
let sseConnection = null;
let currentPageType = 'SA'; // Default to SA, will be determined by URL
let sseReconnectTimer = null;
let sseRetryDelayMs = 1000;
let lastFocusedElement = null;
let expandableControlsBound = false;
let closingDutiesToday = [];
let closingDutiesPollTimer = null;
const DEBUG = false;
let storeDayInfo = null;
let weeklyGoalDistribution = null;
let weeklyGoalWeekKey = null;
let renderAllTimer = null;

function isDesktopViewport() {
  try {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  } catch (_) {
    return false;
  }
}

function applyDesktopExpandDefaults() {
  if (!isDesktopViewport()) return;
  showAllEmployees.SA = true;
  showAllEmployees.BOH = true;
  showAllEmployees.MANAGEMENT = true;
  showAllEmployees.TAILOR = true;
}

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

function hideEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  if (picker) picker.style.display = 'none';
}

function closeOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    try { lastFocusedElement.focus(); } catch (e) {}
  }
  lastFocusedElement = null;
}

function openOverlay(id) {
  hideEmojiPicker();

  const ids = ['settingsModal', 'metricsModal', 'loansModal'];
  ids.forEach(otherId => {
    const el = document.getElementById(otherId);
    if (!el) return;
    if (otherId !== id) {
      el.classList.remove('active');
      el.setAttribute('aria-hidden', 'true');
    }
  });

  const overlay = document.getElementById(id);
  if (!overlay) return;
  lastFocusedElement = document.activeElement;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');

  const focusTarget = overlay.querySelector('input, select, textarea, button, [tabindex]:not([tabindex=\"-1\"])');
  if (focusTarget && typeof focusTarget.focus === 'function') {
    setTimeout(() => {
      try { focusTarget.focus(); } catch (e) {}
    }, 0);
  }
}

function closeTopLayer() {
  hideEmojiPicker();
  const ids = ['loansModal', 'metricsModal', 'settingsModal'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.classList?.contains('active')) {
      closeOverlay(id);
      return true;
    }
  }
  return false;
}

function normalizeEmployeeKey(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getDailyScanStatsForEmployee(emp) {
  const list = metrics?.employeeCountPerformance?.employees || [];
  if (!Array.isArray(list) || list.length === 0) return null;

  const employeeId = normalizeEmployeeKey(emp?.employeeId || emp?.id);
  const nameKey = normalizeEmployeeKey(emp?.name);

  // Prefer direct employeeId match
  let match = null;
  if (employeeId) {
    match = list.find(e => normalizeEmployeeKey(e?.employeeId || e?.id) === employeeId) || null;
  }
  // Fallback to name match
  if (!match && nameKey) {
    match = list.find(e => normalizeEmployeeKey(e?.name) === nameKey) || null;
  }
  if (!match) return null;

  const accuracy = Number(match.accuracy);
  const countsDone = Number(match.countsDone);
  const missedReserved = Number(match.missedReserved);

  return {
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    countsDone: Number.isFinite(countsDone) ? countsDone : null,
    missedReserved: Number.isFinite(missedReserved) ? missedReserved : null
  };
}

function getLocalISODate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftISODate(dateStr, deltaDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test((dateStr || '').toString())) return null;
  const [y, m, d] = dateStr.split('-').map(n => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

tDate = getLocalISODate();

function getEmployeeZones(emp) {
  if (!emp) return [];
  if (Array.isArray(emp.zones)) return emp.zones.map(z => (z || '').toString().trim()).filter(Boolean);
  if (typeof emp.zones === 'string') {
    const z = emp.zones.trim();
    if (!z) return [];
    return z.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (emp.zone) return [(emp.zone || '').toString().trim()].filter(Boolean);
  return [];
}

function normalizeEmployeeDailyFields(emp) {
  const zones = getEmployeeZones(emp);
  const fittingRoom = Array.isArray(emp.fittingRoom)
    ? (emp.fittingRoom[0] || '').toString().trim()
    : (emp.fittingRoom || '').toString().trim();
  const rawIsOff = emp?.isOff === true || emp?.isOff === 'true';
  const closingSections = Array.isArray(emp.closingSections)
    ? emp.closingSections.map(s => (s || '').toString().trim()).filter(Boolean)
    : ((emp.closingSections || '').toString().trim()
      ? (emp.closingSections || '').toString().split(',').map(s => s.trim()).filter(Boolean)
      : []);

  // If an employee has any daily assignment set, treat them as "On Duty" even if the toggle was left as Day Off.
  // This prevents BOH tasks (and similar fields) from being hidden in the Day Off group.
  const hasAnyAssignment =
    zones.length > 0 ||
    !!fittingRoom ||
    closingSections.length > 0 ||
    !!(emp?.scheduledLunch || '').toString().trim() ||
    !!(emp?.shift || '').toString().trim() ||
    !!(emp?.lunch || '').toString().trim() ||
    !!(emp?.taskOfTheDay || '').toString().trim() ||
    !!(emp?.role || '').toString().trim() ||
    !!(emp?.station || '').toString().trim();

  const isOff = rawIsOff && !hasAnyAssignment;

  return { ...emp, isOff, zones, zone: zones[0] || '', fittingRoom, closingSections };
}

function getWorkingSACount() {
  const list = employees.SA || [];
  return list.filter(e => {
    if (storeConfig?.requireSaShift) {
      const shift = (e?.shift || '').toString().trim();
      return !e.isOff && !!shift;
    }
    return !e.isOff;
  }).length;
}

function getWeekKeyFromRetailWeek(retailWeek) {
  const weekNumber = retailWeek?.weekNumber;
  const weekStart = (retailWeek?.weekStart || '').toString();
  const year = /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart.slice(0, 4) : '';
  const wk = Number(weekNumber);
  if (!year || !Number.isFinite(wk)) return null;
  return `${year}-W${String(wk).padStart(2, '0')}`;
}

async function loadWeeklyGoalDistributionFromMetrics() {
  const retailWeek = metrics?.retailWeek || null;
  const weekKey = getWeekKeyFromRetailWeek(retailWeek);
  weeklyGoalWeekKey = weekKey;
  if (!weekKey) {
    weeklyGoalDistribution = null;
    return;
  }

  try {
    const resp = await fetch(`/api/gameplan/weekly-goal-distribution/${encodeURIComponent(weekKey)}`, { credentials: 'include' });
    if (!resp.ok) {
      weeklyGoalDistribution = null;
      return;
    }
    const data = await resp.json().catch(() => null);
    if (!data || data.weekKey !== weekKey || !Array.isArray(data.percents) || data.percents.length !== 7) {
      weeklyGoalDistribution = null;
      return;
    }
    weeklyGoalDistribution = data;
  } catch (_) {
    weeklyGoalDistribution = null;
  }
}

function getDailyTargetValue() {
  const retailWeek = metrics?.retailWeek || null;
  const weekly = Number(retailWeek?.target || 0);
  const dayIndex = Number(storeDayInfo?.weekdayIndex);

  if (
    weeklyGoalDistribution?.enabled === true &&
    Number.isFinite(weekly) &&
    weekly > 0 &&
    Number.isFinite(dayIndex) &&
    dayIndex >= 0 &&
    dayIndex <= 6
  ) {
    const pct = Number(weeklyGoalDistribution?.percents?.[dayIndex]);
    if (Number.isFinite(pct)) return weekly * (pct / 100);
  }

  if (Object.prototype.hasOwnProperty.call(retailWeek || {}, 'targetPerDay')) {
    const direct = Number(retailWeek.targetPerDay);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }

  if (Number.isFinite(weekly) && weekly > 0) return weekly / 7;
  return null;
}

function getRetailWeekTargetPerPerson() {
  const dailyTarget = getDailyTargetValue();
  if (!Number.isFinite(dailyTarget) || !dailyTarget) return null;
  const working = getWorkingSACount();
  if (!working) return null;
  return dailyTarget / working;
}

function formatCurrencyOrDash(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '--';
  return formatCurrency(num);
}

function formatCurrencyFieldOrDash(obj, key) {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return '--';
  return formatCurrencyOrDash(obj[key]);
}

function isPrivilegedUser() {
  const role = (currentUser?.role || '').toString().toUpperCase();
  return !!(currentUser?.isAdmin || currentUser?.isManager || role === 'MANAGEMENT' || role === 'ADMIN');
}

function canEditGamePlan() {
  const role = (currentUser?.role || '').toString().toUpperCase();
  return !!(currentUser?.canEditGameplan || currentUser?.isManager || currentUser?.isAdmin || role === 'MANAGEMENT' || role === 'ADMIN');
}

function applyUnpublishedVisibility() {
  if (!currentUser) return;

  const shouldHide = !gameplanData?.published && !isPrivilegedUser();

  // Even when today's plan isn't published yet, employees should still be able to
  // see their own role page (which is already self-limited/collapsed).
  const keepVisible = new Set();
  if (currentPageType === 'SA') {
    keepVisible.add('saAssignmentStatus');
    keepVisible.add('saSection');
    keepVisible.add('bohSection');
    keepVisible.add('expandableAssignments');
  }
  if (currentPageType === 'BOH') {
    keepVisible.add('bohSection');
    keepVisible.add('saSection');
  }
  if (currentPageType === 'TAILOR') {
    keepVisible.add('tailorsSection');
  }

  const idsToHide = [
    'welcomeStoreInfo', // notes/briefing
    'expandableAssignments',
    'lunchTimelineSection',
    'saAssignmentStatus',
    'managementQuickSection',
    'saSection',
    'bohSection',
    'managementSection',
    'tailorsSection'
  ];

  idsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Many sections are intentionally initialized as display:none and then shown
    // dynamically by JS (e.g., lunch timeline, assignment status). If we cache
    // origDisplay as 'none', then restoring after publish will keep them hidden.
    if (el.dataset.origDisplay === undefined) {
      const orig = (el.style.display || '').toString();
      el.dataset.origDisplay = orig === 'none' ? '' : orig;
    }
    if (shouldHide && keepVisible.has(id)) {
      el.style.display = el.dataset.origDisplay;
      return;
    }
    el.style.display = shouldHide ? 'none' : el.dataset.origDisplay;
  });

  // Target depends on published headcount; never show to employees before publish.
  const targetValueEl = document.getElementById('kpiTarget');
  const targetBox = targetValueEl?.closest('.kpi-box');
  if (targetBox) {
    if (targetBox.dataset.origDisplay === undefined) targetBox.dataset.origDisplay = targetBox.style.display || '';
    targetBox.style.display = shouldHide ? 'none' : targetBox.dataset.origDisplay;
  }
}

function renderRetailWeekStoreInfo() {
  // Find the welcome KPIs row (Week to Date Store Overview section)
  const kpisRow = document.getElementById('welcomeKpisRow');
  if (!kpisRow) return;

  const retailWeek = metrics?.retailWeek;
  if (!retailWeek || !retailWeek.weekNumber) return;

  let box = document.getElementById('retailWeekInfo');
  if (!box) {
    box = document.createElement('div');
    box.id = 'retailWeekInfo';
    box.style.marginTop = '16px';
    box.style.padding = '12px 16px';
    box.style.background = 'var(--surface)';
    box.style.border = '1px solid var(--border)';
    box.style.borderRadius = '8px';
    box.style.fontSize = '13px';
    // Insert after the KPIs row in the welcome section
    kpisRow.insertAdjacentElement('afterend', box);
  }

  const perPerson = getRetailWeekTargetPerPerson();
  const saLine = perPerson
    ? `<span><strong>Target / SA Today:</strong> ${formatCurrencyOrDash(perPerson)}</span>
       <span style="color:var(--text-muted);">(${getWorkingSACount()} SA working)</span>`
    : `<span><strong>Target / SA Today:</strong> --</span>
       <span style="color:var(--text-muted);">(assign shifts to calculate)</span>`;

  const weekSalesText = formatCurrencyFieldOrDash(retailWeek, 'salesAmount');
  const weekTargetText = formatCurrencyFieldOrDash(retailWeek, 'target');
  const dailyTarget = getDailyTargetValue();
  const dailyTargetText = Number.isFinite(Number(dailyTarget)) ? formatCurrencyOrDash(dailyTarget) : '--';
  const isAdmin = !!currentUser?.isAdmin;
  const sourcesHint = '';

  box.innerHTML = `
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
      <strong>Retail Week ${retailWeek.weekNumber}</strong>
      <span style="color:var(--text-secondary);">${retailWeek.weekStart} → ${retailWeek.weekEnd}</span>
      <span>${weekSalesText}</span>
      <span><strong>Retail Week Target:</strong> ${weekTargetText}</span>
      <span><strong>Daily Target (Today):</strong> ${dailyTargetText}</span>
      ${saLine}
      ${sourcesHint}
    </div>
  `;
}

function renderRetailWeekWelcomeInfo() {
  // This function is now deprecated - retail week info is shown in renderRetailWeekStoreInfo
  // which places it in the Week to Date Store Overview section
  // Remove any old duplicate boxes
  const oldBox = document.getElementById('retailWeekWelcomeInfo');
  if (oldBox) {
    oldBox.remove();
  }
}

function formatZones(emp) {
  const zones = getEmployeeZones(emp);
  return zones.length ? zones.join(', ') : '-';
}

function shouldAutoInitDashboard() {
  const path = (window.location.pathname || '').toString();
  return (
    path.includes('/gameplan-sa') ||
    path.includes('/gameplan-tailors') ||
    path.includes('/gameplan-boh') ||
    path.includes('/gameplan-management') ||
    path.includes('/operations-metrics') ||
    path.includes('/gameplan-edit')
  );
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!shouldAutoInitDashboard()) return;
  determinePageType();
  applyDesktopExpandDefaults();
  await checkAuth();
  setCurrentDate();
  await Promise.all([
    getStoreDayInfo(),
    loadEmployees(),
    loadMetrics(),
    loadSettings(),
    loadGameplan(),
    loadStoreConfig(),
    loadLoansData(),
    loadPendingShipments()
  ]);
  if (['SA', 'MANAGEMENT', 'BOH', 'TAILOR'].includes(currentPageType)) {
    await loadClosingDutiesForToday();
    startClosingDutiesPolling();
  }
  renderAll();
  setupWelcomeSection();
  setupNotesPermissions();
  setupEventListeners();
  startDayRolloverWatcher();
  setupSSEConnection(); // Real-time updates
  updateLastSyncTime();
});

function determinePageType() {
  const path = window.location.pathname;
  if (path.includes('/gameplan-sa')) {
    currentPageType = 'SA';
  } else if (path.includes('/gameplan-tailors')) {
    currentPageType = 'TAILOR';
  } else if (path.includes('/gameplan-boh')) {
    currentPageType = 'BOH';
  } else if (path.includes('/gameplan-management')) {
    currentPageType = 'MANAGEMENT';
  } else if (path.includes('/operations-metrics')) {
    currentPageType = 'OPS_METRICS';
  } else if (path.includes('/gameplan-edit')) {
    currentPageType = 'EDIT';
  }
  document.body.dataset.pageType = currentPageType.toLowerCase();
  debugLog(`Current page type: ${currentPageType}`);
}

// ===== Server-Sent Events for Real-Time Updates =====
function setupSSEConnection() {
  if (!currentUser) return;

  // Close existing connection if any
  if (sseConnection) {
    sseConnection.close();
  }
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  sseConnection = new EventSource('/api/sse/updates');

  sseConnection.onopen = () => {
    console.log('SSE connection established');
    updateConnectionStatus(true);
    sseRetryDelayMs = 1000;
  };

  sseConnection.onmessage = (event) => {
    try {
      const update = JSON.parse(event.data);
      handleSSEUpdate(update);
    } catch (e) {
      console.error('Error parsing SSE message:', e);

    // OPS_METRICS: Per-tailor APG list
    try {
      const tbody = document.getElementById('tailorApgTableBody');
      if (tbody) {
        const tailors = Array.isArray(employees?.TAILOR) ? employees.TAILOR : [];
        const rows = tailors
          .map(t => {
            const apg = getTailorApgForEmployee(t);
            return {
              name: (t?.name || '').toString().trim(),
              apg,
              sortKey: Number.isFinite(Number(apg)) ? Number(apg) : -1
            };
          })
          .filter(r => r.name)
          .sort((a, b) => b.sortKey - a.sortKey);

        tbody.innerHTML = rows
          .map(r => {
            const apgText = Number.isFinite(Number(r.apg)) ? formatNumberOrDash(r.apg, 1) : '--';
            return `
              <tr>
                <td>${r.name}</td>
                <td>${apgText}</td>
              </tr>
            `;
          })
          .join('');
      }
    } catch (_) {
      // Ignore.
    }
    }
  };

  sseConnection.onerror = (error) => {
    console.error('SSE connection error:', error);
    updateConnectionStatus(false);
    // Avoid tight reconnect loops; confirm auth before retrying
    if (sseConnection) sseConnection.close();
    if (sseReconnectTimer) return;

    sseReconnectTimer = setTimeout(async () => {
      sseReconnectTimer = null;
      try {
        const resp = await fetch('/api/auth/check', { credentials: 'include' });
        const data = await resp.json();
        if (!data.authenticated) {
          window.location.href = '/login';
          return;
        }
        currentUser = data.user;
      } catch (_) {
        // ignore, try reconnect below
      }

      setupSSEConnection();
      sseRetryDelayMs = Math.min(sseRetryDelayMs * 2, 30000);
    }, sseRetryDelayMs);
  };
}

function handleSSEUpdate(update) {
  switch (update.type) {
    case 'connected':
      console.log('Real-time updates:', update.message);
      break;
    
    case 'heartbeat':
      // Connection is alive, no action needed
      break;
    
    case 'gameplan_updated':
      // Always reload gameplan so the page doesn't get stuck showing stale assignments.
      // If someone else edited, show a notification; if it was the current user, reload quietly.
      if (update.data?.lastEditedBy && update.data.lastEditedBy !== currentUser?.name) {
        showNotification(`Game Plan updated by ${update.data.lastEditedBy}`);
      }
      loadGameplan().then(() => debouncedRenderAll());
      break;
    
    case 'metrics_updated':
      loadMetrics().then(() => debouncedRenderAll());
      showNotification('Metrics updated from Looker');
      break;

    case 'weekly_goal_distribution_updated':
      if (update.data?.weekKey && weeklyGoalWeekKey && update.data.weekKey !== weeklyGoalWeekKey) break;
      loadWeeklyGoalDistributionFromMetrics().then(() => {
        renderRetailWeekStoreInfo();
        debouncedRenderAll();
      });
      break;
    
    case 'employee_updated':
      loadEmployees().then(() => debouncedRenderAll());
      break;
    
    default:
      console.log('Unknown SSE update type:', update.type);
  }
}

function updateConnectionStatus(connected) {
  // Could add a visual indicator here if desired
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusEl.textContent = connected ? '🟢 Live' : '🔴 Reconnecting...';
  }
}

// Auth check
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check', { credentials: 'include' });
    const data = await response.json();

    if (!data.authenticated) {
      window.location.href = '/login';
      return;
    }

    currentUser = data.user;
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (currentUser.imageUrl) {
      const avatarEl = document.getElementById('userAvatar');
      if (avatarEl) avatarEl.src = currentUser.imageUrl;
    }

    // Admin nav
    const adminLink = document.getElementById('adminLink') || document.getElementById('navAdmin');
    if (adminLink && currentUser.isAdmin) adminLink.style.display = 'inline';

    // Move "Edit Game Plan" into the welcome box (hide sidebar card)
    const managerActions = document.getElementById('managerActions');
    if (managerActions) managerActions.style.display = 'none';
    const welcomeActionRow = document.getElementById('welcomeActionRow');
    if (welcomeActionRow) {
      welcomeActionRow.style.display = canEditGamePlan() ? 'block' : 'none';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login';
  }
}

function setCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

// Data loading functions
async function loadEmployees() {
  try {
    const response = await fetch('/api/gameplan/employees', { credentials: 'include' });
    const data = await response.json();
    employees = data.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
    
    // Deduplicate employees by a stable key within each type (prefer employeeId, then id, then name)
    for (const type of Object.keys(employees)) {
      const seen = new Set();
      const filtered = [];
      (employees[type] || []).forEach((emp, idx) => {
        const key = emp?.employeeId ? String(emp.employeeId).trim()
                    : (emp?.id ? String(emp.id).trim() : (emp?.name ? String(emp.name).trim().toLowerCase() : `__idx_${idx}`));
        if (!seen.has(key)) {
          seen.add(key);
          filtered.push(emp);
        }
      });
      employees[type] = filtered;
    }

    // Normalize daily assignment fields
    for (const type of Object.keys(employees)) {
      employees[type] = (employees[type] || []).map(normalizeEmployeeDailyFields);
    }
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}

window.loadEmployees = loadEmployees;

async function loadMetrics() {
  try {
    debugLog('[DEBUG] Loading metrics...');
    const response = await fetch('/api/gameplan/metrics', { credentials: 'include' });
    metrics = await response.json();
    debugLog('[DEBUG] Metrics loaded:', metrics);
    await loadWeeklyGoalDistributionFromMetrics();
    updateLastUpdated(metrics.lastSyncTime || metrics.lastEmailReceived || metrics.importedAt);
    
    // Update import status card (both welcome section and sidebar)
    const lastLookerSyncEl = document.getElementById('lastLookerSync');
    const welcomeLastSyncEl = document.getElementById('welcomeLastSync');
    const sidebarLastSyncEl = document.getElementById('sidebarLastSync');
    const recordsImportedEl = document.getElementById('recordsImported');
    const welcomeRecordsImportedEl = document.getElementById('welcomeRecordsImported');
    // Prefer lastEmailReceived (actual email time) over lastSyncTime/importedAt (processing time)
    const syncTimestamp = metrics.lastEmailReceived || metrics.lastSyncTime || metrics.importedAt;
    if (syncTimestamp) {
      const syncDate = new Date(syncTimestamp);
      const formattedDate = syncDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      if (lastLookerSyncEl) lastLookerSyncEl.textContent = formattedDate;
      if (welcomeLastSyncEl) welcomeLastSyncEl.textContent = formattedDate;
      if (sidebarLastSyncEl) sidebarLastSyncEl.textContent = formattedDate;
    }
    if (recordsImportedEl || welcomeRecordsImportedEl) {
      const savedCount = Number(metrics.recordsImported);
      let txt = Number.isFinite(savedCount) && savedCount > 0 ? `${savedCount} metrics` : '--';

      // Backward-compatible fallback: older saved payloads didn't persist import counts.
      if (txt === '--') {
        let totalRecords = 0;
        if (metrics.wtd) totalRecords++;
        if (metrics.operationsHealth) totalRecords += Object.keys(metrics.operationsHealth).length;
        if (metrics.inventoryIssues) totalRecords += Object.keys(metrics.inventoryIssues).length;
        if (metrics.employeeCountPerformance?.employees?.length) totalRecords += metrics.employeeCountPerformance.employees.length;
        txt = totalRecords > 0 ? `${totalRecords} metrics` : '--';
      }
      if (recordsImportedEl) recordsImportedEl.textContent = txt;
      if (welcomeRecordsImportedEl) welcomeRecordsImportedEl.textContent = txt;
    }

    const welcomeImportCard = document.getElementById('importStatusCardWelcome');
    if (welcomeImportCard) welcomeImportCard.style.display = 'block';
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}

window.loadMetrics = loadMetrics;

async function loadSettings() {
  try {
    const response = await fetch('/api/gameplan/settings', { credentials: 'include' });
    settings = await response.json();
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = { zones: [], shifts: [], closingSections: [], fittingRooms: [] };
  }
}

window.loadSettings = loadSettings;

async function loadStoreConfig() {
  try {
    const response = await fetch('/api/gameplan/store-config', { credentials: 'include' });
    storeConfig = response.ok ? await response.json() : storeConfig;
  } catch (_) {
    // keep defaults
  }
}

window.loadStoreConfig = loadStoreConfig;

async function loadGameplan() {
  try {
    // Always load the current store-day date from server (timezone + dayStart aware).
    const today = await getStoreDayInfo();
    const clientDate = today?.date || getLocalISODate();

      const response = await fetch(`/api/gameplan/date/${clientDate}`, {
        credentials: 'include',
        cache: 'no-store'
      });
        if (response.ok) {
          gameplanData = await response.json();
      
      // Update notes in both sidebar and inline editors (whichever exists)
      const notesEditor = document.getElementById('notesEditor') || document.getElementById('notesEditorInline');
      if (notesEditor) notesEditor.innerHTML = gameplanData.notes || '';
      
      // Update "Last edited by" display
      const lastEditedBy = document.getElementById('lastEditedBy');
      if (lastEditedBy && gameplanData.lastEditedBy) {
        const editTime = gameplanData.lastEditedAt ? new Date(gameplanData.lastEditedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        lastEditedBy.textContent = `Last edited by ${gameplanData.lastEditedBy}${editTime ? ' at ' + editTime : ''}`;
      }

        // Clear previous day's daily fields, then merge today's assignments (if any).
        resetAllEmployeesDailyFields();
        if (gameplanData.assignments) mergeAssignments(gameplanData.assignments);
      } else {
          // If there is no game plan file yet for *today*, keep the day clean.
          // This prevents stale/yesterday assignments from showing before a manager publishes.
          gameplanData = { notes: '', assignments: {}, published: false, effectiveDate: clientDate };
          resetAllEmployeesDailyFields();
        }

	    // Banner at TOP if not published (whether file exists or not)
	    const statusBanner = document.getElementById('statusBanner');
	    if (statusBanner) {
	      statusBanner.style.display = gameplanData?.published ? 'none' : 'flex';
	    }

	    // Apply publish gating (hides management-dependent sections for employees when not published)
	    applyUnpublishedVisibility();
	  } catch (error) {
	    console.error('Error loading gameplan:', error);
	  }
		}

window.loadGameplan = loadGameplan;

async function loadClosingDutiesForToday() {
  try {
    const today = await getStoreDayInfo();
    const clientDate = today?.date || getLocalISODate();
    const res = await fetch(`/api/closing-duties/${clientDate}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    closingDutiesToday = Array.isArray(data?.submissions) ? data.submissions : [];
  } catch (_) {
    closingDutiesToday = [];
  }
}

function startClosingDutiesPolling() {
  if (closingDutiesPollTimer) return;
  // This endpoint doesn't emit SSE updates; poll on the pages that show the status block.
  if (!['SA', 'MANAGEMENT', 'BOH', 'TAILOR'].includes(currentPageType)) return;
  closingDutiesPollTimer = setInterval(async () => {
    await loadClosingDutiesForToday();
    renderSAAssignmentStatus();
  }, 30000);
}

function clearDailyAssignmentFields(emp) {
  if (!emp) return;
  emp.zones = [];
  emp.zone = '';
  emp.fittingRoom = '';
  emp.scheduledLunch = '';
  emp.closingSections = [];
  emp.shift = '';
  emp.lunch = '';
  emp.taskOfTheDay = '';
  emp.role = '';
  emp.station = '';
  // Leave metrics and identity fields intact.
}

function resetAllEmployeesDailyFields() {
  for (const type of Object.keys(employees || {})) {
    (employees[type] || []).forEach((emp) => {
      clearDailyAssignmentFields(emp);
      // New store-day default: everyone starts Day Off until assignments/publish.
      emp.isOff = true;
      const normalized = normalizeEmployeeDailyFields(emp);
      Object.assign(emp, normalized);
    });
  }
}

async function getStoreDayInfo() {
  try {
    const resp = await fetch('/api/gameplan/today', { credentials: 'include' });
    const data = resp.ok ? await resp.json() : null;
    if (data?.date) storeDayInfo = data;
    return data;
  } catch (_) {
    return storeDayInfo;
  }
}

window.getStoreDayInfo = getStoreDayInfo;

async function loadLoansData() {
  try {
    const response = await fetch('/api/gameplan/loans', { credentials: 'include' });
    if (response.ok) {
      loansData = await response.json();
      checkLoansOverdue();
    }
  } catch (error) {
    // Keep the UI quiet if loans data isn't available.
    debugLog('Error loading loans:', error);
  }
}

window.loadLoansData = loadLoansData;

async function loadPendingShipments() {
  // Only load for management/BOH/Admin
  if (!currentUser) return;
  const allowedRoles = ['MANAGEMENT', 'BOH', 'ADMIN'];
  if (!allowedRoles.includes(currentUser.role) && !currentUser.isManager && !currentUser.isAdmin) return;

  try {
    const response = await fetch('/api/shipments');
    if (response.ok) {
      const shipments = await response.json();
      const pendingCount = shipments.filter(s => s.status === 'pending' || s.status === 'requested').length;
      const badge = document.getElementById('shipmentsBadge');
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (error) {
    debugLog('Error loading shipments:', error);
  }
}

function setupNotesPermissions() {
  const notesEditor = document.getElementById('notesEditor');
  const notesToolbar = document.getElementById('notesToolbar');

  // If no editor elements exist (view-only mode), skip
  if (!notesEditor || !notesToolbar) return;

  // Only Admin can edit notes
  // Management can edit after published
  const canEdit = currentUser?.isAdmin ||
    (currentUser?.isManager && gameplanData.published);

  if (!canEdit) {
    notesEditor.contentEditable = 'false';
    notesEditor.classList.add('readonly');
    notesToolbar.classList.add('hidden');
  } else {
    notesEditor.contentEditable = 'true';
    notesEditor.classList.remove('readonly');
    notesToolbar.classList.remove('hidden');
  }
}

function updateLastSyncTime() {
  const syncEl = document.getElementById('lastSync');
  if (syncEl) {
    const now = new Date();
    syncEl.textContent = `Last sync: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

async function refreshAllData() {
  const refreshBtn = document.getElementById('refreshDataBtn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '↻ Refreshing...';
  }

  try {
	    await Promise.all([
	      loadEmployees(),
	      loadMetrics(),
	      loadSettings(),
	      loadGameplan(),
	      loadStoreConfig(),
	      loadLoansData(),
	      loadPendingShipments()
	    ]);
    renderAll();
    setupWelcomeSection();
    updateLastSyncTime();
    showNotification('Data refreshed successfully!');
  } catch (error) {
    console.error('Error refreshing data:', error);
    showNotification('Error refreshing data', 'error');
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Refresh Data';
    }
  }
}

function startDayRolloverWatcher() {
  if (window.__dayRolloverWatcher) return;
  window.__dayRolloverWatcher = true;
  // Initialize to the current store day so we don't show a "new day" banner on first tick.
  currentClientDate = storeDayInfo?.date || getLocalISODate();

  setInterval(async () => {
    const nextInfo = await getStoreDayInfo();
    const next = nextInfo?.date || getLocalISODate();
    if (next === currentClientDate) return;
    currentClientDate = next;

    // Remove any stale ?date= param so we never "stick" to yesterday.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('date')) {
        url.searchParams.delete('date');
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
      }
    } catch (_) {}

    await refreshAllData();
    showNotification('New day started — cleared for today');
  }, 60_000);
}

function mergeAssignments(assignments) {
  Object.keys(assignments).forEach(id => {
    const assignment = assignments[id];
    for (const type of Object.keys(employees)) {
      const emp = employees[type].find(e => e.id === id);
      if (emp) {
        Object.assign(emp, assignment);
        Object.assign(emp, normalizeEmployeeDailyFields(emp));
        break;
      }
    }
  });
}

function updateLastUpdated(timestamp) {
  if (!timestamp) return;
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);

  const el = document.getElementById('lastUpdated');
  if (!el) return; // Element doesn't exist, skip update
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (diffHours < 12) {
    el.textContent = `Updated ${timeStr}`;
    el.className = 'last-updated recent';
  } else {
    el.textContent = `Updated ${date.toLocaleDateString()} ${timeStr}`;
    el.className = 'last-updated stale';
  }
}

function checkLoansOverdue() {
  const totalEl = document.getElementById('loansOverdueTotal');
  const namesEl = document.getElementById('loansOverdueNames');
  const cardEl = document.getElementById('loansCard');

  // Some pages don't render the loans card; keep the console clean.
  if (!totalEl || !namesEl || !cardEl) return;

  if (!loansData.overdue || loansData.overdue.length === 0) {
    totalEl.textContent = '0';
    namesEl.textContent = 'None';
    cardEl.classList.remove('warning');
    return;
  }

  const total = loansData.overdue.length;
  const overdueNames = loansData.overdue.map(l => l.employeeName).join(', ');

  // Update metrics card only (loans alert banner removed per spec)
  totalEl.textContent = total;
  namesEl.textContent = overdueNames.length > 30 ? overdueNames.substring(0, 30) + '...' : overdueNames;
  cardEl.classList.add('warning');
}

window.checkLoansOverdue = checkLoansOverdue;

function showLoansModal() {
  const modalBody = document.getElementById('loansModalBody');
  const modalEl = document.getElementById('loansModal');
  if (!modalBody || !modalEl) return;

  if (!loansData.overdue || loansData.overdue.length === 0) {
    modalBody.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No overdue loans at this time.</p>';
  } else {
    let html = `
      <table class="loans-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Period</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
    `;

    loansData.overdue.forEach(loan => {
      html += `
        <tr>
          <td><strong>${loan.employeeName}</strong></td>
          <td>${loan.periodName || '-'}</td>
          <td>${loan.locationCode || '-'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // Add summary
    html += `
      <div style="margin-top: 16px; padding: 12px; background: var(--surface); border-radius: 6px; font-size: 13px;">
        <strong>Total Overdue:</strong> ${loansData.overdue.length} loan(s)<br>
        <span style="color: var(--text-muted);">Please follow up with these employees to return their loaned items.</span>
      </div>
    `;

    modalBody.innerHTML = html;
  }

  modalEl.classList.add('active');

  // Add close button listener
  const closeBtn = document.getElementById('closeLoans');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modalEl.classList.remove('active');
    };
  }
}

// Setup Welcome Section
function setupWelcomeSection() {
  if (!currentUser) return;
  const welcomeNameEl = document.getElementById('welcomeName');
  const welcomeRoleEl = document.getElementById('welcomeRole');
  if (!welcomeNameEl || !welcomeRoleEl) return; // Not all pages have the welcome box

  const rawName = currentUser?.name || '';
  const displayName = rawName.trim() ? rawName.trim().split(' ')[0] : (currentUser?.email?.split('@')[0] || 'there');
  welcomeNameEl.textContent = displayName;
  welcomeRoleEl.textContent = getRoleName(currentUser?.role) || 'Team Member';

  // Find current user's employee data first (to get their photo)
  let userEmployee = null;
  for (const type of Object.keys(employees)) {
    userEmployee = employees[type].find(e =>
      e.name?.toLowerCase() === currentUser.name?.toLowerCase() ||
      e.employeeId?.toString?.() === currentUser.employeeId?.toString?.()
    );
    if (userEmployee) break;
  }

  // Set avatar with fallback to initials - prefer employee imageUrl over currentUser
  const avatarEl = document.getElementById('welcomeAvatar');
  const placeholderEl = document.getElementById('avatarPlaceholder');
  const imageUrl = userEmployee?.imageUrl || currentUser.imageUrl;
  
  if (imageUrl) {
    avatarEl.src = imageUrl;
    avatarEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';
  } else {
    avatarEl.style.display = 'none';
    if (placeholderEl) {
      placeholderEl.style.display = 'flex';
      placeholderEl.textContent = getInitials(currentUser.name);
    }
  }

  const detailsEl = document.getElementById('welcomeDetails');
  const kpisRowEl = document.getElementById('welcomeKpisRow');
  const storeInfoEl = document.getElementById('welcomeStoreInfo');
  const sidebarCard = document.getElementById('importStatusCard');
  if (sidebarCard) sidebarCard.style.display = 'none';

  if (userEmployee) {
    // Don't show duplicate assignment info - it's in expandable boxes
    let detailsHtml = '';

    switch (userEmployee.type) {
      case 'SA':
        // Show KPIs row for SA (on top)
        kpisRowEl.style.display = 'flex';
        if (userEmployee.metrics) {
          if (document.getElementById('kpiSales')) document.getElementById('kpiSales').textContent = formatCurrency(userEmployee.metrics.salesAmount || 0);
          if (document.getElementById('kpiIPC')) document.getElementById('kpiIPC').textContent = userEmployee.metrics.ipc?.toFixed(2) || '--';
          if (document.getElementById('kpiUPT')) document.getElementById('kpiUPT').textContent = userEmployee.metrics.upt?.toFixed(2) || userEmployee.metrics.ipc?.toFixed(2) || '--';
          if (document.getElementById('kpiATV')) document.getElementById('kpiATV').textContent = formatCurrency(userEmployee.metrics.apc || 0);
          if (document.getElementById('kpiSPH')) document.getElementById('kpiSPH').textContent = userEmployee.metrics.sph ? Math.round(userEmployee.metrics.sph) : '--';
        }
        if (document.getElementById('kpiTarget')) {
          const perPerson = (!userEmployee.isOff) ? getRetailWeekTargetPerPerson() : null;
          document.getElementById('kpiTarget').textContent = perPerson ? formatCurrency(perPerson) : '--';
        }

        // For SA, all metrics are shown in the KPI row, so no need to add to detailsHtml
        // Store info/notes preview will be shown separately
        storeInfoEl.style.display = 'block';
        
        break;

      case 'BOH':
        if (userEmployee.shift) detailsHtml += `<div class="assignment-item"><span class="label">Shift:</span> <span class="value">${userEmployee.shift}</span></div>`;
        if (userEmployee.lunch) detailsHtml += `<div class="assignment-item"><span class="label">Lunch:</span> <span class="value">${userEmployee.lunch}</span></div>`;
        if (userEmployee.taskOfTheDay) detailsHtml += `<div class="assignment-item"><span class="label">Task:</span> <span class="value">${userEmployee.taskOfTheDay}</span></div>`;

        // Show BOH metrics
        if (userEmployee.metrics) {
          detailsHtml += `<div class="assignment-item"><span class="label">Inventory Accuracy:</span> <span class="value">${userEmployee.metrics.inventoryAccuracy || '--'}%</span></div>`;
          detailsHtml += `<div class="assignment-item"><span class="label">Counts Completed:</span> <span class="value">${userEmployee.metrics.storeCountsCompleted || 0}</span></div>`;
        }
        storeInfoEl.style.display = 'block';
        break;

      case 'MANAGEMENT':
        if (userEmployee.role) detailsHtml += `<div class="assignment-item"><span class="label">Role:</span> <span class="value">${userEmployee.role}</span></div>`;
        if (userEmployee.shift) detailsHtml += `<div class="assignment-item"><span class="label">Shift:</span> <span class="value">${userEmployee.shift}</span></div>`;
        if (userEmployee.lunch) detailsHtml += `<div class="assignment-item"><span class="label">Lunch:</span> <span class="value">${userEmployee.lunch}</span></div>`;
        storeInfoEl.style.display = 'block';
        break;

      case 'TAILOR':
        if (userEmployee.station) detailsHtml += `<div class="assignment-item"><span class="label">Station:</span> <span class="value">${userEmployee.station}</span></div>`;
        if (userEmployee.lunch) detailsHtml += `<div class="assignment-item"><span class="label">Lunch:</span> <span class="value">${userEmployee.lunch}</span></div>`;
        {
          const apg = getTailorApgForEmployee(userEmployee);
          const apgText = apg !== null ? formatNumberOrDash(apg, 1) : '--';
          detailsHtml += `<div class="assignment-item"><span class="label">APG:</span> <span class="value">${apgText}</span></div>`;
        }
        if (userEmployee.productivity) {
          detailsHtml += `<div class="assignment-item"><span class="label">YTD Productivity:</span> <span class="value ${userEmployee.productivity >= 100 ? 'positive' : 'negative'}">${userEmployee.productivity}%</span></div>`;
        }
        storeInfoEl.style.display = 'block';
        break;
    }

    // Managers/admins: show daily scan % in the top details box (grey "--" if missing).
    if (isPrivilegedUser() && userEmployee.type !== 'SA') {
      const scan = getDailyScanStatsForEmployee(userEmployee);
      const pct = scan?.accuracy;
      const hasPct = Number.isFinite(pct);
      const pctText = hasPct ? `${pct}%` : '--';
      const cls = hasPct ? (pct >= 99.5 ? 'positive' : pct >= 99 ? 'warning' : 'negative') : 'muted';
      detailsHtml += `<div class="assignment-item"><span class="label">Daily Scan %:</span> <span class="value ${cls}">${pctText}</span></div>`;
    }

    if (detailsHtml) {
      detailsEl.innerHTML = `<div class="welcome-assignments">${detailsHtml}</div>`;
    } else {
      detailsEl.innerHTML = '';
    }

    // Personal expandable assignment boxes removed (Zones/Fitting Room/Closing Duties)
    // in favor of the single Assignments & Status block below the lunch schedule.
  } else {
    detailsEl.innerHTML = '<p class="no-assignments">No assignments for today yet.</p>';
  }

  // Ensure game plan is hidden for employees if not published
  applyUnpublishedVisibility();

  // Show Retail Week info in the Week to Date Store Overview section
  renderRetailWeekStoreInfo();

  // Lunch timeline should show for everyone (not only SA).
  setupLunchTimeline(userEmployee || null);

  // Employee discount policy tracking (remaining retail value).
  setupEmployeeDiscountStatus();

  // Populate welcome metrics boxes (retail week, daily targets, etc.)
  populateWelcomeMetricsBoxes(userEmployee);
}

async function populateWelcomeMetricsBoxes(userEmployee) {
  const retailWeek = metrics?.retailWeek;

  // Update Retail Week Box
  if (retailWeek && retailWeek.weekNumber) {
    const weekHeader = document.getElementById('retailWeekHeader');
    const weekDates = document.getElementById('retailWeekDates');
    const weekActual = document.getElementById('retailWeekActual');
    const weekTarget = document.getElementById('retailWeekTarget');

    if (weekHeader) weekHeader.textContent = `Retail Week ${retailWeek.weekNumber}`;
    if (weekDates) weekDates.textContent = `${retailWeek.weekStart} → ${retailWeek.weekEnd}`;
    // Also set the compact KPI retail week value with a line break so it fits
    const kpiRetail = document.getElementById('kpiRetailWeekValue');
    if (kpiRetail) {
      kpiRetail.innerHTML = `${retailWeek.weekStart}<br>→ ${retailWeek.weekEnd}`;
      kpiRetail.style.fontSize = '15px';
      kpiRetail.style.lineHeight = '1.05';
    }
    if (weekActual) weekActual.textContent = formatCurrencyOrDash(retailWeek.salesAmount);
    if (weekTarget) weekTarget.textContent = `Retail Week Target: ${formatCurrencyOrDash(retailWeek.target)}`;
  }

  // Update Daily Target Box
  const dailyTarget = getDailyTargetValue();
  const dailyTargetEl = document.getElementById('dailyTarget');
  if (dailyTargetEl) {
    dailyTargetEl.textContent = Number.isFinite(Number(dailyTarget)) ? formatCurrencyOrDash(dailyTarget) : '--';
  }

  const perPerson = (!userEmployee?.isOff) ? getRetailWeekTargetPerPerson() : null;
  const saCount = getWorkingSACount();
  const targetPerSAEl = document.getElementById('targetPerSA');
  if (targetPerSAEl) {
    if (perPerson) {
      targetPerSAEl.textContent = `Target / SA: ${formatCurrencyOrDash(perPerson)} (${saCount} SA working)`;
    } else {
      targetPerSAEl.textContent = `Target / SA: -- (assign shifts to calculate)`;
    }
  }

  // Update Employee Discount Box
  try {
    const resp = await fetch('/api/expenses/status', { credentials: 'include' });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.available) {
        const yearly = data?.status?.yearly || {};
        if (Number.isFinite(Number(yearly.limit))) {
          const used = Number(yearly.used || 0);
          const remaining = Number(yearly.remaining || 0);
          const limit = Number(yearly.limit || 0);
          const percent = Number.isFinite(Number(yearly.percentUsed)) ? Number(yearly.percentUsed).toFixed(0) : 0;

          const discountEl = document.getElementById('employeeDiscount');
          const discountLabelEl = document.getElementById('employeeDiscountLabel');

          if (discountEl) {
            discountEl.textContent = `$${Math.round(remaining)}`;
            discountEl.style.color = remaining <= 250 ? '#f59e0b' : 'var(--primary)';
          }
          if (discountLabelEl) {
            discountLabelEl.textContent = `$${Math.round(remaining)} remaining (of $${Math.round(limit)} · ${percent}% used)`;
          }
        }
      }
    }
  } catch (_) {
    // Quiet fail - keep default values
  }

  // Update Daily Scan Box
  if (isPrivilegedUser() && userEmployee) {
    const scan = getDailyScanStatsForEmployee(userEmployee);
    const pct = scan?.accuracy;
    const hasPct = Number.isFinite(pct);
    const pctText = hasPct ? `${pct}%` : '--';

    const dailyScanEl = document.getElementById('dailyScan');
    if (dailyScanEl) {
      dailyScanEl.textContent = pctText;
      if (hasPct) {
        dailyScanEl.style.color = pct >= 99.5 ? 'var(--success)' : pct >= 99 ? '#f59e0b' : 'var(--danger)';
      }
    }
  }
}

async function setupEmployeeDiscountStatus() {
  if (!currentUser) return;
  const detailsEl = document.getElementById('welcomeDetails');
  if (!detailsEl) return;

  try {
    const resp = await fetch('/api/expenses/status', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.available) return;

    const yearly = data?.status?.yearly || {};
    if (!Number.isFinite(Number(yearly.limit))) return;

    const used = Number(yearly.used || 0);
    const remaining = Number(yearly.remaining || 0);
    const percent = Number.isFinite(Number(yearly.percentUsed)) ? Number(yearly.percentUsed) : null;
    const over = !!yearly.over;

    const existing = document.getElementById('welcomeDiscountStatus');
    const row = existing || document.createElement('div');
    row.id = 'welcomeDiscountStatus';
    row.className = 'welcome-assignments';

    const cls = over ? 'negative' : remaining <= 250 ? 'warning' : 'positive';
    const pctText = percent !== null ? `${percent}% used` : '';
    const line = `
      <div class="assignment-item">
        <span class="label">Employee Discount:</span>
        <span class="value ${cls}">$${Math.round(remaining)} remaining</span>
        <span class="value muted" style="margin-left:8px;">(of $${Math.round(yearly.limit)} · ${pctText})</span>
      </div>
    `;

    row.innerHTML = line;
    if (!existing) {
      // Put at the top of the details box for visibility.
      detailsEl.prepend(row);
    }
  } catch (_) {
    // Quiet fail
  }
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.toString().trim().match(/^(\d{1,2})\s*:\s*(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

// Setup Lunch Timeline - shows the whole team's lunch times
function setupLunchTimeline(currentEmployee) {
  const timelineSection = document.getElementById('lunchTimelineSection');
  const timeline = document.getElementById('lunchTimeline');
  const myLunchTimeEl = document.getElementById('myLunchTime');
  
  if (!timelineSection || !timeline) return;
  
  // Get all employees with lunch times (scheduledLunch preferred, fall back to lunch)
  const allEmployees = [
    ...(employees.MANAGEMENT || []),
    ...(employees.SA || []),
    ...(employees.BOH || []),
    ...(employees.TAILOR || [])
  ];

  const byId = new Map();
  allEmployees.forEach((e) => {
    if (!e) return;
    const key = e.id ?? `${e.type || ''}:${e.employeeId || e.name || Math.random()}`;
    if (!byId.has(key)) byId.set(key, e);
  });

  const employeesWithLunch = Array.from(byId.values())
    .map(e => ({ ...e, lunchTime: e.scheduledLunch || e.lunch }))
    .filter(e => e.lunchTime && parseTimeToMinutes(e.lunchTime) !== null)
    .sort((a, b) => (parseTimeToMinutes(a.lunchTime) ?? 0) - (parseTimeToMinutes(b.lunchTime) ?? 0));
  
  if (employeesWithLunch.length === 0) {
    timelineSection.style.display = 'none';
    return;
  }
  
  timelineSection.style.display = 'block';
  
  // Show my lunch time
  if (myLunchTimeEl) {
    const myLunch = currentEmployee ? (currentEmployee.scheduledLunch || currentEmployee.lunch) : null;
    myLunchTimeEl.textContent = myLunch ? `Your lunch: ${myLunch}` : 'Your lunch: --';
  }
  
  // Timeline from 11:00 to 17:00 (11AM to 5PM)
  const startHour = 11;
  const endHour = 17;
  const totalMinutes = (endHour - startHour) * 60;
  
  // Create scale with 30-minute intervals
  let scaleHtml = '<div class="timeline-scale">';
  for (let h = startHour; h <= endHour; h++) {
    const hourLabel = h > 12 ? (h-12) + 'PM' : h + (h === 12 ? 'PM' : 'AM');
    scaleHtml += `<span class="scale-mark">${hourLabel}</span>`;
    if (h < endHour) {
      // Add 30-minute mark
      scaleHtml += `<span class="scale-mark-half">:30</span>`;
    }
  }
  scaleHtml += '</div>';
  
  // Create bars
  const rowCount = Math.min(4, Math.max(2, Math.ceil(employeesWithLunch.length / 6)));
  const rowHeight = 26;
  const barAreaHeight = rowCount * rowHeight + 12;
  let barsHtml = `<div class="timeline-bars" style="height:${barAreaHeight}px;">`;
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];
  
  employeesWithLunch.forEach((emp, idx) => {
    const lunchTime = emp.lunchTime;
    const minutesOfDay = parseTimeToMinutes(lunchTime);
    if (minutesOfDay === null) return;
    const lunchMinutes = minutesOfDay - startHour * 60;
    const leftPercent = (lunchMinutes / totalMinutes) * 100;
    const width = (30 / totalMinutes) * 100; // 30 min lunch
    
    const isMyLunch = !!(currentEmployee && emp.id === currentEmployee.id);
    const firstName = (emp.name || '--').toString().trim().split(/\s+/)[0] || '--';
    const topOffset = (idx % rowCount) * rowHeight + 6;
    
    barsHtml += `<div class="lunch-bar${isMyLunch ? ' my-lunch' : ''}" 
      style="left: ${Math.max(0, Math.min(leftPercent, 95))}%; width: ${width}%; top: ${topOffset}px; background: ${isMyLunch ? '#22c55e' : colors[idx % colors.length]};"
      title="${emp.name} - ${lunchTime}">
      ${firstName}
    </div>`;
  });
  
  barsHtml += '</div>';
  
  timeline.innerHTML = scaleHtml + barsHtml;
  timeline.style.height = `${barAreaHeight + 20}px`;
}

// Setup Expandable Boxes (Fitting Room, Zone, Closing Duties)
function setupExpandableBoxes(userEmployee) {
  const expandableEl = document.getElementById('expandableAssignments');
  if (!expandableEl) return;

  expandableEl.style.display = 'flex';
  bindExpandableControls();

  // My values
  document.getElementById('myFittingRoom').textContent = userEmployee.fittingRoom || 'Not assigned';
  const myZones = getEmployeeZones(userEmployee);
  document.getElementById('myZone').textContent = myZones.length ? myZones.join(', ') : 'Not assigned';
  
  const myClosingDuties = userEmployee.closingSections && userEmployee.closingSections.length > 0
    ? userEmployee.closingSections.join(', ')
    : 'None assigned';
  document.getElementById('myClosingDuties').textContent = myClosingDuties;

  // Build lists for all assignments
  buildFittingRoomList(userEmployee);
  buildZoneList(userEmployee);
  buildClosingDutiesList(userEmployee);

  if (currentPageType === 'SA') {
    setExpandableOpen('fittingRoom', true);
    setExpandableOpen('zone', true);
    setExpandableOpen('closingDuties', true);
  }
}

function buildFittingRoomList(userEmployee) {
  const listEl = document.getElementById('fittingRoomList');
  if (!listEl) return;

  const allFittingRooms = settings.fittingRooms || [];
  const allSAs = employees.SA || [];

  // Map of fitting room -> assigned employee
  const frAssignments = {};
  allSAs.forEach(sa => {
    if (sa.fittingRoom) {
      frAssignments[sa.fittingRoom] = sa.name;
    }
  });

  let html = '';
  allFittingRooms.forEach(fr => {
    const assignee = frAssignments[fr.name];
    const isMine = userEmployee.fittingRoom === fr.name;
    const isAvailable = !assignee;

    let itemClass = 'expandable-list-item';
    if (isMine) itemClass += ' mine';
    else if (isAvailable) itemClass += ' available';

    html += `
      <div class="${itemClass}">
        <span class="item-name">${fr.name}</span>
        <span class="item-assignee">${isMine ? 'You' : (assignee || 'Available')}</span>
      </div>
    `;
  });

  listEl.innerHTML = html || '<div class="expandable-list-item">No fitting rooms configured</div>';
}

function buildZoneList(userEmployee) {
  const listEl = document.getElementById('zoneList');
  if (!listEl) return;

  const allZones = settings.zones || [];
  const allSAs = employees.SA || [];

  // Map of zone -> assigned employees (multiple SAs can be in same zone)
  const zoneAssignments = {};
  allSAs.forEach(sa => {
    const zones = getEmployeeZones(sa);
    zones.forEach(zoneName => {
      if (!zoneAssignments[zoneName]) zoneAssignments[zoneName] = [];
      zoneAssignments[zoneName].push(sa.name);
    });
  });

  let html = '';
  allZones.forEach(z => {
    const assignees = zoneAssignments[z.name] || [];
    const isMine = getEmployeeZones(userEmployee).includes(z.name);
    const isAvailable = assignees.length === 0;

    let itemClass = 'expandable-list-item';
    if (isMine) itemClass += ' mine';
    else if (isAvailable) itemClass += ' available';

    const assigneeText = isMine 
      ? `You${assignees.length > 1 ? ` + ${assignees.length - 1} others` : ''}`
      : (assignees.length > 0 ? assignees.join(', ') : 'Available');

    html += `
      <div class="${itemClass}">
        <span class="item-name">${z.name}</span>
        <span class="item-assignee">${assigneeText}</span>
      </div>
    `;
  });

  listEl.innerHTML = html || '<div class="expandable-list-item">No zones configured</div>';
}

function buildClosingDutiesList(userEmployee) {
  const listEl = document.getElementById('closingDutiesList');
  if (!listEl) return;

  // Show all closing duties assigned to each employee
  const people = []
    .concat(employees.MANAGEMENT || [])
    .concat(employees.SA || []);

  if (people.length === 0) {
    listEl.innerHTML = '<div class="expandable-list-item">No employees loaded</div>';
    return;
  }

  let html = '';
  people.forEach(p => {
    const duties = Array.isArray(p.closingSections) ? p.closingSections : [];
    const isMine = p.id === userEmployee.id;
    let itemClass = 'expandable-list-item';
    if (isMine) itemClass += ' mine';
    const dutyText = duties.length ? duties.join(', ') : '—';
    html += `
      <div class="${itemClass}">
        <span class="item-name">${isMine ? 'You' : p.name}</span>
        <span class="item-assignee">${dutyText}</span>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function renderSAAssignmentStatus() {
  if (!['SA', 'MANAGEMENT', 'BOH', 'TAILOR'].includes(currentPageType)) return;

  const sectionEl = document.getElementById('saAssignmentStatus');
  const frListEl = document.getElementById('saFittingRoomAssignmentsList');
  const dutiesListEl = document.getElementById('saClosingDutiesStatusList');
  if (!sectionEl || !frListEl || !dutiesListEl) return;

  // Show container (publish gating handled elsewhere).
  sectionEl.style.display = 'block';

  // Fitting room assignments (room -> assignee)
  const allFittingRooms = settings.fittingRooms || [];
  const allSAs = employees.SA || [];
  const userEmployee = findCurrentUserEmployee('SA');
  const frAssignments = {};
  allSAs.forEach(sa => {
    const key = (sa?.fittingRoom || '').toString().trim();
    if (key) frAssignments[key] = sa.name;
  });

  if (!Array.isArray(allFittingRooms) || allFittingRooms.length === 0) {
    frListEl.innerHTML = '<div class="expandable-list-item">No fitting rooms configured</div>';
  } else {
    const roomNames = allFittingRooms
      .map(fr => (fr?.name || fr))
      .map(v => (v || '').toString().trim())
      .filter(Boolean);

    frListEl.innerHTML = roomNames.map(roomName => {
      const assignee = frAssignments[roomName] || '';
      const isMine = !!(userEmployee?.fittingRoom && roomName === (userEmployee.fittingRoom || '').toString().trim());
      const isAvailable = !assignee;
      let cls = 'expandable-list-item';
      if (isMine) cls += ' mine';
      else if (isAvailable) cls += ' available';

      const displayAssignee = isMine ? 'You' : (assignee ? assignee.split(' ')[0] : '');
      return `
        <div class="${cls}">
          <span class="item-name">${roomName}</span>
          <span class="item-assignee">
            ${isAvailable ? '<span class="status-pill status-pill--pending">Available</span>' : ''}
            ${displayAssignee}
          </span>
        </div>
      `;
    }).join('');
  }

  // Closing duties status (section -> assignee + completed/pending)
  const allSections = (settings.closingSections || []).map(s => s?.name).filter(Boolean);
  const sectionToAssignee = {};
  // Include assignments from all groups so everyone can see who owns each duty.
  const allPeople = []
    .concat(employees.SA || [])
    .concat(employees.BOH || [])
    .concat(employees.MANAGEMENT || [])
    .concat(employees.TAILOR || []);
  allPeople.forEach(person => {
    const list = Array.isArray(person?.closingSections) ? person.closingSections : [];
    list.forEach(sectionName => {
      const key = (sectionName || '').toString().trim();
      if (!key) return;
      // Keep first match for stability.
      if (sectionToAssignee[key]) return;
      sectionToAssignee[key] = { name: person?.name || '', id: person?.id, type: person?.type || '' };
    });
  });

  const submitted = new Set(
    (closingDutiesToday || []).map(s => (s?.section || '').toString()).filter(Boolean)
  );

  // Store-wide completion rate (all configured sections, regardless of assignee type).
  const completionEl = document.getElementById('closingDutiesStoreCompletion');
  if (completionEl) {
    const total = Array.isArray(allSections) ? allSections.length : 0;
    const completed = total ? allSections.filter(s => submitted.has(s)).length : 0;
    const pct = total ? Math.round((completed / total) * 100) : null;
    completionEl.textContent = pct === null ? '--' : `${pct}%`;
    completionEl.title = total ? `${completed}/${total} completed` : '';
  }

  if (!Array.isArray(allSections) || allSections.length === 0) {
    dutiesListEl.innerHTML = '<div class="expandable-list-item">No closing duties configured</div>';
  } else {
    dutiesListEl.innerHTML = allSections.map(sectionName => {
      const assigneeObj = sectionToAssignee[sectionName] || {};
      const assigneeName = assigneeObj?.name || '';
      const isComplete = submitted.has(sectionName);
      const left = sectionName;
      const storeDate = storeDayInfo?.date || currentClientDate || getLocalISODate();
      const historyUrl = `/closing-duties?tab=history&date=${encodeURIComponent(storeDate)}&section=${encodeURIComponent(left)}`;
      const statusPill = isComplete
        ? `<a href="${historyUrl}" class="status-pill status-pill--complete" style="color:inherit; text-decoration:underline;">Completed</a>`
        : '<span class="status-pill status-pill--pending">Pending</span>';

      const isMine = !!(
        (userEmployee?.id && assigneeObj?.id && userEmployee.id === assigneeObj.id) ||
        (assigneeName && currentUser?.name && assigneeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );

      const who = isMine ? 'You' : (assigneeName ? assigneeName.split(' ')[0] : 'Open');
      let cls = 'expandable-list-item';
      if (isMine) cls += ' mine';

      const whoHtml = isMine
        ? (isComplete
          ? `<a class="status-pill__who" href="${historyUrl}" style="color:inherit; text-decoration:underline;">${who}</a>`
          : `<a class="status-pill__who" href="/closing-duties?section=${encodeURIComponent(left)}&submit=1" style="color:inherit; text-decoration:underline;">${who}</a>`
        )
        : `<span class="status-pill__who">${who}</span>`;

      return `
        <div class="${cls}">
          <span class="item-name">${left}</span>
          <span class="item-assignee">${statusPill}${whoHtml}</span>
        </div>
      `;
    }).join('');
  }
}

// Toggle expandable box
function toggleExpandable(type) {
  const contentEl = document.getElementById(`${type}Content`);
  const arrowEl = document.getElementById(`${type}Arrow`);
  if (!contentEl || !arrowEl) return;
  
  const isHidden = window.getComputedStyle(contentEl).display === 'none';
  setExpandableOpen(type, isHidden);
}

function setExpandableOpen(type, open) {
  const contentEl = document.getElementById(`${type}Content`);
  const arrowEl = document.getElementById(`${type}Arrow`);
  if (!contentEl || !arrowEl) return;

  contentEl.style.display = open ? 'block' : 'none';
  arrowEl.classList.toggle('expanded', open);
}

function setAllExpandableOpen(open) {
  ['fittingRoom', 'zone', 'closingDuties'].forEach(type => setExpandableOpen(type, open));
}

function bindExpandableControls() {
  if (expandableControlsBound) return;
  const expandBtn = document.getElementById('expandAllAssignments');
  const collapseBtn = document.getElementById('collapseAllAssignments');
  if (expandBtn) expandBtn.addEventListener('click', () => setAllExpandableOpen(true));
  if (collapseBtn) collapseBtn.addEventListener('click', () => setAllExpandableOpen(false));
  if (expandBtn || collapseBtn) expandableControlsBound = true;
}

function getRoleName(role) {
  const roleNames = {
    'SA': 'Sales Associate',
    'BOH': 'Back of House',
    'MANAGEMENT': 'Management',
    'TAILOR': 'Tailor',
    'ADMIN': 'Administrator'
  };
  return roleNames[role] || role;
}

// Render Management Quick Section - Shows all managers on duty
function renderManagementQuickSection() {
  const grid = document.getElementById('managementQuickGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const mgmtArray = (employees.MANAGEMENT || []).filter(e => !e?.isOff);
  const saArray = employees.SA || [];
  const bohArray = employees.BOH || [];
  const shownIds = new Set();

  // Find all MODs (Manager on Duty)
  const mods = mgmtArray.filter(e => 
    e.role?.toUpperCase() === 'MOD' || 
    e.role?.toLowerCase().includes('manager on duty')
  );

  // Find all Hosts from management
  const hosts = mgmtArray.filter(e => 
    e.role?.toUpperCase() === 'HOST'
  );

  // Find Host from SA (zone-based)
  const saHost = saArray.find(e => 
    e.zone?.toLowerCase().includes('host') ||
    e.fittingRoom?.toLowerCase().includes('host')
  );

  // Get BOH employees working today
  const bohWorking = bohArray.filter(e => !e?.isOff && (e.shift || e.taskOfTheDay));

  // Show all MODs first
  mods.forEach(mod => {
    grid.appendChild(createManagementQuickCard(mod, 'MOD', 'mod-card'));
    shownIds.add(mod.id);
  });

  // Show all Hosts from management
  hosts.forEach(host => {
    grid.appendChild(createManagementQuickCard(host, 'Host', 'host-card'));
    shownIds.add(host.id);
  });

  // Show SA Host if exists
  if (saHost) {
    grid.appendChild(createManagementQuickCard(saHost, 'Host', 'host-card'));
  }

  // Show any other managers with shifts assigned (not already shown)
  mgmtArray.filter(e => e.shift && !shownIds.has(e.id)).forEach(mgr => {
    const roleLabel = mgr.shift?.includes('Open') ? 'Opening' : 
                      mgr.shift?.includes('Close') ? 'Closing' : 'Manager';
    grid.appendChild(createManagementQuickCard(mgr, roleLabel, ''));
    shownIds.add(mgr.id);
  });

  // Add BOH employees
  bohWorking.forEach(boh => {
    grid.appendChild(createManagementQuickCard(boh, 'BOH', 'boh-card'));
  });

  // Hide the entire section if there are no cards to show
  const sectionEl = document.getElementById('managementQuickSection');
  if (sectionEl) {
    if (!grid.children || grid.children.length === 0) {
      sectionEl.style.display = 'none';
    } else {
      sectionEl.style.display = '';
    }
  }
}

function createManagementQuickCard(emp, roleLabel, extraClass) {
  const card = document.createElement('div');
  card.className = `management-quick-card ${extraClass}`.trim();

  const displayName = (emp?.name || '--').toString().trim().split(/\s+/)[0] || '--';
  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}">`
    : getInitials(emp.name);

  const timeInfo = emp.shift || '';

  card.innerHTML = `
    <div class="card-icon">${emp.imageUrl ? `<img src="${emp.imageUrl}" alt="${emp.name}">` : getInitials(emp.name)}</div>
    <div class="card-content">
      <div class="card-role">${roleLabel}</div>
      <div class="card-name">${displayName}</div>
      ${timeInfo ? `<div class="card-time">${timeInfo}</div>` : ''}
    </div>
  `;

  return card;
}

// Update notes preview in welcome section
function updateNotesPreview() {
  const notesPreview = document.getElementById('notesPreview');
  const notesAuthor = document.getElementById('notesAuthor');
  const storeInfo = document.getElementById('welcomeStoreInfo');
  if (!notesPreview) return;

  // Use gameplanData.notes directly - preserve HTML formatting
  if (gameplanData.notes && gameplanData.notes.trim()) {
    // Render the full HTML with formatting
    notesPreview.innerHTML = gameplanData.notes;
    
    // Show who added the notes (on right side)
    if (notesAuthor && gameplanData.lastEditedBy) {
      notesAuthor.textContent = `by ${gameplanData.lastEditedBy}`;
    }
    storeInfo.style.display = 'block';
  } else {
    notesPreview.innerHTML = '<span style="color: var(--text-muted);">No notes for today</span>';
    if (notesAuthor) notesAuthor.textContent = '';
    storeInfo.style.display = 'block';
  }
}

// Debounced render to prevent rapid re-renders
function debouncedRenderAll(delay = 50) {
  if (renderAllTimer) clearTimeout(renderAllTimer);
  renderAllTimer = setTimeout(() => renderAll(), delay);
}

// Render functions
function renderAll() {
  updateNotesPreview();
  updateLastSyncTime(); // Update sidebar sync time

  // Keep the Retail Week info in the Week to Date Store Overview up to date.
  renderRetailWeekStoreInfo();

  const setDisplay = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.style.display = value;
  };

  // Conditional rendering based on page type
  switch (currentPageType) {
    case 'SA':
      updateMetricsDisplay();
      renderManagementQuickSection();
      renderSAAssignmentStatus();
      renderSASection();
      // SA view is a shared "status" view; always show BOH tasks here.
      renderBOHSection();
      // Hide other sections not relevant to SA
      setDisplay('managementSection', 'none');
      setDisplay('tailorsSection', 'none');
      setDisplay('operationsSection', 'none');
      setDisplay('lookerSection', 'none');
      break;
    case 'TAILOR':
      renderTailorsSection();
      renderSAAssignmentStatus();
      // Hide other sections
      // Keep welcome visible so lunch + status blocks can show
      setDisplay('managementQuickSection', 'none');
      setDisplay('metricsSection', 'none');
      setDisplay('operationsSection', 'none');
      setDisplay('saSection', 'none');
      setDisplay('bohSection', 'none');
      setDisplay('managementSection', 'none');
      setDisplay('lookerSection', 'none');
      break;
    case 'BOH':
      renderBOHSection();
      renderSASection();
      renderSAAssignmentStatus();
      // Ops dashboard moved to /operations-metrics
      setDisplay('operationsSection', 'none');
      // Hide other sections
      // Keep welcome visible so lunch + status blocks can show
      setDisplay('managementQuickSection', 'none');
      setDisplay('metricsSection', 'none');
      setDisplay('managementSection', 'none');
      setDisplay('tailorsSection', 'none');
      setDisplay('lookerSection', 'none');
      break;
    case 'OPS_METRICS':
      renderMainRetailKpis();
      renderTailorProductivityLastWeek();
      renderWorkRelatedExpensesSummary();
      renderOperationsHealth();
      renderInventoryIssues();
      renderCustomerOrders();
      renderCountLeaderboard();
      renderTailorTrend();
      renderAppointmentsWidget();
      renderBestSellers();
      // Hide non-ops sections (if present)
      setDisplay('welcomeSection', 'none');
      setDisplay('managementQuickSection', 'none');
      setDisplay('metricsSection', 'none');
      setDisplay('saSection', 'none');
      setDisplay('bohSection', 'none');
      setDisplay('managementSection', 'none');
      setDisplay('tailorsSection', 'none');
      setDisplay('lookerSection', 'none');
      break;
    case 'MANAGEMENT':
    case 'EDIT':
      updateMetricsDisplay();
      updateWorkingToday();
      renderManagementQuickSection();
      renderSAAssignmentStatus();
      renderTailorProductivityLastWeek();
      renderWorkRelatedExpensesSummary();
      renderSASection();
      renderBOHSection();
      renderManagementSection();
      renderTailorsSection();
      // Ops dashboard moved to /operations-metrics
      setDisplay('operationsSection', 'none');
      break;
    default:
      updateMetricsDisplay();
      updateWorkingToday();
      renderManagementQuickSection();
      renderSASection();
      renderBOHSection();
      renderManagementSection();
      renderTailorsSection();
      // Ops dashboard moved to /operations-metrics
      setDisplay('operationsSection', 'none');
      break;
  }
}

function updateWorkingToday() {
  // Get employees with shifts assigned (meaning they're working today)
  const workingManagement = (employees.MANAGEMENT || []).filter(e => e.shift || e.role);
  const workingBOH = (employees.BOH || []).filter(e => e.shift || e.taskOfTheDay);

  // Update Management working
  const mgmtEl = document.getElementById('managementWorking');
  if (mgmtEl) {
    if (workingManagement.length > 0) {
      const names = workingManagement.map(e => {
        const role = e.role ? ` (${e.role})` : '';
        return e.name + role;
      }).join(', ');
      mgmtEl.textContent = names;
    } else {
      mgmtEl.textContent = 'No assignments yet';
    }
  }

  // Update BOH working
  const bohEl = document.getElementById('bohWorking');
  if (bohEl) {
    if (workingBOH.length > 0) {
      const names = workingBOH.map(e => e.name).join(', ');
      bohEl.textContent = names;
    } else {
      bohEl.textContent = 'No assignments yet';
    }
  }
}

function updateMetricsDisplay() {
  if (!metrics.wtd) return;

  // Some pages (e.g. role-based gameplan views) intentionally omit the WTD section.
  const wtdSalesEl = document.getElementById('wtdSales');

  const setVsPyEl = (el, value) => {
    if (!el) return;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      el.textContent = 'Ø vs PY';
      el.className = 'metric-change neutral';
      return;
    }
    el.textContent = `${num >= 0 ? '+' : ''}${num}% vs PY`;
    el.className = `metric-change ${num >= 0 ? 'positive' : 'negative'}`;
  };

  if (wtdSalesEl) wtdSalesEl.textContent = formatCurrency(metrics.wtd.salesAmount);
  const wtdChange = document.getElementById('wtdChange');
  if (wtdChange) {
    wtdChange.textContent = `${metrics.wtd.salesVsPY >= 0 ? '+' : ''}${metrics.wtd.salesVsPY}% vs PY`;
    wtdChange.className = `metric-change ${metrics.wtd.salesVsPY >= 0 ? 'positive' : 'negative'}`;
  }

  const targetEl = document.getElementById('targetAmount');
  if (targetEl) targetEl.textContent = formatCurrency(metrics.wtd.target);
  const vsTarget = document.getElementById('vsTarget');
  if (vsTarget) {
    vsTarget.textContent = `${metrics.wtd.vsTarget}% vs Target`;
    vsTarget.className = `metric-change ${metrics.wtd.vsTarget >= 0 ? 'positive' : 'negative'}`;
  }

  if (metrics.metrics) {
    const sphEl = document.getElementById('sph');
    if (sphEl) sphEl.textContent = `$${metrics.metrics.salesPerHour}`;
    const sphChange = document.getElementById('sphChange');
    if (sphChange) {
      sphChange.textContent = `${metrics.metrics.sphVsPY}% vs PY`;
      sphChange.className = `metric-change ${metrics.metrics.sphVsPY >= 0 ? 'positive' : 'negative'}`;
    }

    const ipcEl = document.getElementById('ipc');
    if (ipcEl) ipcEl.textContent = metrics.metrics.itemsPerCustomer;
    const ipcChange = document.getElementById('ipcChange');
    if (ipcChange) {
      ipcChange.textContent = `${metrics.metrics.ipcVsPY}% vs PY`;
      ipcChange.className = `metric-change ${metrics.metrics.ipcVsPY >= 0 ? 'positive' : 'negative'}`;
    }

    const dropoffsEl = document.getElementById('dropoffs');
    if (dropoffsEl) dropoffsEl.textContent = `${metrics.metrics.dropOffs}%`;

    const dropoffsChange = document.getElementById('dropoffsChange');
    if (dropoffsChange) setVsPyEl(dropoffsChange, metrics.metrics.dropOffsVsPY);
  }

  if (metrics.lastWeekSales) {
    const formalEl = document.getElementById('formalPct');
    const casualEl = document.getElementById('casualPct');
    const tuxedoEl = document.getElementById('tuxedoPct');
    if (formalEl) formalEl.textContent = `${metrics.lastWeekSales.formal}%`;
    if (casualEl) casualEl.textContent = `${metrics.lastWeekSales.casual}%`;
    if (tuxedoEl) tuxedoEl.textContent = `${metrics.lastWeekSales.tuxedo}%`;
  }

  if (metrics.productMixCmRtw) {
    const rtwEl = document.getElementById('rtwPct');
    const cmEl = document.getElementById('cmPct');
    if (rtwEl) rtwEl.textContent = `${Math.round(metrics.productMixCmRtw.RTW ?? 0)}%`;
    if (cmEl) cmEl.textContent = `${Math.round(metrics.productMixCmRtw.CM ?? 0)}%`;
  }

  const cj = metrics.customerJourney;
  if (cj) {
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const setPercentText = (id, value, digits = 1) => {
      const el = document.getElementById(id);
      if (!el) return;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        el.textContent = '--';
        return;
      }
      const factor = Math.pow(10, digits);
      el.textContent = `${Math.round(n * factor) / factor}%`;
    };

    setText('cjTotalCustomers', formatNumberOrDash(cj.totalCustomers, 0));
    setVsPyEl(document.getElementById('cjTotalCustomersVsPY'), cj.totalCustomersVsPY);

    setText('cjReturningCustomers', formatNumberOrDash(cj.returningCustomers, 0));
    setVsPyEl(document.getElementById('cjReturningCustomersVsPY'), cj.returningCustomersVsPY);
    setPercentText('cjReturningPct', cj.returningPct, 1);

    setText('cjNewCustomers', formatNumberOrDash(cj.newCustomers, 0));
    setVsPyEl(document.getElementById('cjNewCustomersVsPY'), cj.newCustomersVsPY);
    setPercentText('cjNewPct', cj.newPct, 1);

    setText('cjVisits', formatNumberOrDash(cj.visits, 0));
    setVsPyEl(document.getElementById('cjVisitsVsPY'), cj.visitsVsPY);

    setPercentText('cjAppointments', cj.appointmentsShareTy, 0);
    const apptPyEl = document.getElementById('cjAppointmentsPy');
    if (apptPyEl) {
      const py = Number(cj.appointmentsSharePy);
      apptPyEl.textContent = Number.isFinite(py) ? `${Math.round(py)}% PY` : '--';
      apptPyEl.className = 'metric-change neutral';
    }

    setPercentText('cjQrCheckins', cj.qrCheckinsPct, 1);
    setVsPyEl(document.getElementById('cjQrCheckinsVsPY'), cj.qrCheckinsVsPY);

    const npsEl = document.getElementById('cjNpsScore');
    if (npsEl) {
      const n = Number(cj.npsScore);
      npsEl.textContent = Number.isFinite(n) ? `${n}` : '--';
    }
    const npsVsEl = document.getElementById('cjNpsVsPY');
    if (npsVsEl) {
      const n = Number(cj.npsVsPY);
      npsVsEl.textContent = Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n}% vs PY` : 'Ø vs PY';
      npsVsEl.className = Number.isFinite(n) ? `metric-change ${n >= 0 ? 'positive' : 'negative'}` : 'metric-change neutral';
    }

    setText('cjNotesTaken', formatNumberOrDash(cj.notesTaken, 0));
    const notesVsEl = document.getElementById('cjNotesTakenVsPY');
    if (notesVsEl) {
      const n = Number(cj.notesTakenVsPY);
      notesVsEl.textContent = Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n}% vs PY` : 'Ø vs PY';
      notesVsEl.className = Number.isFinite(n) ? `metric-change ${n >= 0 ? 'positive' : 'negative'}` : 'metric-change neutral';
    }

    setText('cjCompletedReaches', formatNumberOrDash(cj.completedReaches, 0));

    setPercentText('cjNewsletterPct', cj.newsletterPct, 1);
    setVsPyEl(document.getElementById('cjNewsletterVsPY'), cj.newsletterVsPY);
  }

  renderRetailWeekStoreInfo();
}

window.updateMetricsDisplay = updateMetricsDisplay;

function formatCurrency(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount}`;
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return '??';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function hasLoanOverdue(employeeName) {
  if (!loansData.overdue) return false;
  return loansData.overdue.some(l => l.employeeName === employeeName);
}

// Find employee matching current user
function findCurrentUserEmployee(type) {
  return employees[type]?.find(e =>
    e.name.toLowerCase() === currentUser?.name?.toLowerCase() ||
    e.employeeId?.toString?.() === currentUser?.employeeId?.toString?.()
  );
}

// SA Section
function renderSASection() {
  const grid = document.getElementById('saGrid');
  const count = document.getElementById('saCount');
  const expandBtn = document.getElementById('expandSA');
  grid.innerHTML = '';
  const saEmployees = employees.SA || [];
  const isPrivileged = !!(currentUser?.isManager || currentUser?.isAdmin || (currentUser?.role || '').toString().toUpperCase() === 'MANAGEMENT');

  const currentUserEmp = findCurrentUserEmployee('SA');
  const hasShift = (e) => !!(e?.shift || '').toString().trim();
  const isWorking = (e) => {
    if (!e) return false;
    if (e.isOff) return false;
    if (storeConfig?.requireSaShift) return hasShift(e);
    return true;
  };

  const workingList = saEmployees.filter(isWorking);
  const dayOffList = saEmployees.filter(e => !isWorking(e));

  // Full ordered list (used when "Show All" is active) — only working employees (day off shown separately)
  let orderedAll = [...workingList];
  if (currentUserEmp && isWorking(currentUserEmp)) {
    orderedAll = [currentUserEmp, ...workingList.filter(e => e.id !== currentUserEmp.id)];
  }

  // On the SA page, we don't repeat the current user in the grid.
  if (currentPageType === 'SA' && currentUserEmp) {
    orderedAll = orderedAll.filter(e => e.id !== currentUserEmp.id);
  }

  // Count should reflect total employees in this type (not just what's shown).
  if (count) count.textContent = saEmployees.length;

  const getCollapsedList = () => {
    // SA page: show more cards by default so other associates are visible.
    if (currentPageType === 'SA') return orderedAll.slice(0, Math.min(4, orderedAll.length));

    // Non-privileged users: show only themselves until expanded.
    if (!isPrivileged) return currentUserEmp ? [currentUserEmp] : [];

    // Privileged: show a few cards until expanded.
    const initialVisible = 4;
    return orderedAll.slice(0, initialVisible);
  };

  const collapsed = getCollapsedList();
  const shown = (!expandBtn || showAllEmployees.SA) ? orderedAll : collapsed;

  // Toggle button
  const maxCollapsed = collapsed.length;
  const canExpand = !!expandBtn && (orderedAll.length > maxCollapsed || (!isPrivileged && workingList.length > 1));
  if (expandBtn) {
    if (!canExpand) {
      expandBtn.style.display = 'none';
    } else {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = showAllEmployees.SA ? 'Show Less' : `Show All (${workingList.length})`;
    }
  }

  shown.forEach(emp => {
    grid.appendChild(createSACard(emp, emp.id === currentUserEmp?.id));
  });

  renderDayOffGroup(grid, dayOffList, 'SA', { open: showAllEmployees.SA });
}

function createSACard(emp, isCurrentUser = false) {
  const card = document.createElement('div');
  const hasShift = !!(emp?.shift || '').toString().trim();
  const isWorking = !emp.isOff && (!storeConfig?.requireSaShift || hasShift);
  const isDayOff = !isWorking;
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}${isDayOff ? ' day-off' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  const loanWarning = hasLoanOverdue(emp.name)
    ? '<div class="loan-warning">Loan Overdue</div>'
    : '';

  const scan = getDailyScanStatsForEmployee(emp);
  const scanAccuracyHtml = Number.isFinite(scan?.accuracy)
    ? `
      <div class="card-field">
        <span class="field-label">Scan Accuracy</span>
        <span class="field-value ${scan.accuracy >= 99.5 ? 'positive' : scan.accuracy >= 99 ? 'warning' : 'negative'}">${scan.accuracy}%</span>
      </div>
    `
    : '';

  const perPersonTarget = getRetailWeekTargetPerPerson();

  if (isDayOff) {
    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role day-off-badge">Day Off</span>
        </div>
      </div>
    `;
    return card;
  }

		  card.innerHTML = `
		    <div class="card-header">
	      ${photoHtml}
	      <div class="employee-info">
	        <h4>${emp.name}</h4>
        <span class="role">Sales Associate</span>
      </div>
    </div>
	    <div class="card-body">
	      <div class="card-field">
	        <span class="field-label">Zones</span>
	        <span class="field-value">${formatZones(emp)}</span>
	      </div>
      <div class="card-field">
        <span class="field-label">Fitting Room</span>
        <span class="field-value">${emp.fittingRoom || '-'}</span>
      </div>
		      <div class="card-field">
		        <span class="field-label">Target</span>
		        <span class="field-value">${(isWorking && perPersonTarget) ? formatCurrency(perPersonTarget) : '-'}</span>
		      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.scheduledLunch || '-'}</span>
      </div>
      <div class="card-field full-width">
        <span class="field-label">Closing Sections</span>
        <span class="field-value">${Array.isArray(emp.closingSections) ? emp.closingSections.join(', ') : emp.closingSections || '-'}</span>
      </div>
      ${scanAccuracyHtml}
    </div>
    ${emp.metrics ? `
    <div class="sa-metrics">
      <div class="sa-metric">
        <span class="value">${formatCurrency(emp.metrics.salesAmount)}</span>
        <span class="label">WTD</span>
      </div>
      <div class="sa-metric">
        <span class="value">$${emp.metrics.sph}</span>
        <span class="label">SPH</span>
      </div>
      <div class="sa-metric">
        <span class="value">${emp.metrics.ipc}</span>
        <span class="label">IPC</span>
      </div>
    </div>
    ` : ''}
    ${loanWarning}
	  `;
	  return card;
	}

// BOH Section
function renderBOHSection() {
  const grid = document.getElementById('bohGrid');
  const count = document.getElementById('bohCount');
  const expandBtn = document.getElementById('expandBOH');
  grid.innerHTML = '';
  const bohEmployees = employees.BOH || [];
  const isPrivileged = !!(currentUser?.isManager || currentUser?.isAdmin || (currentUser?.role || '').toString().toUpperCase() === 'MANAGEMENT');
  if (count) count.textContent = bohEmployees.length;

  const currentUserEmp = findCurrentUserEmployee('BOH');
  const workingList = bohEmployees.filter(e => !e?.isOff);
  const dayOffList = bohEmployees.filter(e => !!e?.isOff);

  let orderedAll = [...workingList];
  if (currentUserEmp && !currentUserEmp?.isOff) orderedAll = [currentUserEmp, ...workingList.filter(e => e.id !== currentUserEmp.id)];

  const collapsed = (() => {
    // If this page doesn't offer an expand control (ex: SA view), show the full list.
    if (!expandBtn) return orderedAll;
    if (!isPrivileged) return currentUserEmp ? [currentUserEmp] : orderedAll.slice(0, 4);
    return orderedAll.slice(0, 4);
  })();

  const shown = (!expandBtn || showAllEmployees.BOH) ? orderedAll : collapsed;

  const canExpand = !!expandBtn && (orderedAll.length > collapsed.length || (!isPrivileged && workingList.length > 1));
  if (expandBtn) {
    if (!canExpand) {
      expandBtn.style.display = 'none';
    } else {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = showAllEmployees.BOH ? 'Show Less' : `Show All (${workingList.length})`;
    }
  }

  shown.forEach(emp => {
    grid.appendChild(createBOHCard(emp, emp.id === currentUserEmp?.id));
  });

  renderDayOffGroup(grid, dayOffList, 'BOH', { open: showAllEmployees.BOH });
}

function createBOHCard(emp, isCurrentUser = false) {
  const card = document.createElement('div');
  const isDayOff = !!emp?.isOff;
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}${isDayOff ? ' day-off' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  if (isDayOff) {
    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role day-off-badge">Day Off</span>
        </div>
      </div>
    `;
    return card;
  }

  const scan = getDailyScanStatsForEmployee(emp);
  const accuracy = emp.metrics?.inventoryAccuracy !== undefined ? Number(emp.metrics.inventoryAccuracy) : scan?.accuracy;
  const countsDone = emp.metrics?.storeCountsCompleted !== undefined ? Number(emp.metrics.storeCountsCompleted) : scan?.countsDone;
  const missedReserved = emp.metrics?.missedReserved !== undefined ? Number(emp.metrics.missedReserved) : scan?.missedReserved;
  const hasAnyScanStats = accuracy !== undefined || countsDone !== undefined || missedReserved !== undefined;

  const accuracyClass =
    Number.isFinite(accuracy) ? (accuracy >= 99.5 ? 'positive' : accuracy >= 98 ? 'warning' : 'negative') : 'muted';
  const missedClass =
    Number.isFinite(missedReserved) ? ((missedReserved || 0) === 0 ? 'positive' : 'negative') : 'muted';

  card.innerHTML = `
    <div class="card-header">
      ${photoHtml}
      <div class="employee-info">
        <h4>${emp.name}</h4>
        <span class="role">Back of House</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-field">
        <span class="field-label">Shift</span>
        <span class="field-value">${emp.shift || '-'}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.lunch || '-'}</span>
      </div>
      <div class="card-field full-width">
        <span class="field-label">Task of the Day</span>
        <span class="field-value">${emp.taskOfTheDay || '-'}</span>
      </div>
    </div>
    ${hasAnyScanStats ? `
    <div class="boh-metrics">
      <div class="boh-metric">
        <span class="value ${accuracyClass}">${Number.isFinite(accuracy) ? `${accuracy}%` : '--'}</span>
        <span class="label">Scan %</span>
      </div>
      <div class="boh-metric">
        <span class="value ${Number.isFinite(countsDone) ? '' : 'muted'}">${Number.isFinite(countsDone) ? countsDone : '--'}</span>
        <span class="label">Scans</span>
      </div>
      <div class="boh-metric">
        <span class="value ${missedClass}">${Number.isFinite(missedReserved) ? missedReserved : '--'}</span>
        <span class="label">Missed</span>
      </div>
    </div>
    ` : ''}
  `;
  return card;
}

// Management Section - Collapse if >3
function renderManagementSection() {
  const grid = document.getElementById('mgmtGrid');
  const count = document.getElementById('mgmtCount');
  const expandBtn = document.getElementById('expandMgmt');
  if (!grid || !count) return;
  grid.innerHTML = '';

  // Working vs day off (driven by Game Plan Edit toggle)
  const mgmtEmployees = employees.MANAGEMENT || [];
  const scheduledMgmt = mgmtEmployees.filter(e => !e?.isOff);
  const dayOffMgmt = mgmtEmployees.filter(e => !!e?.isOff);
  count.textContent = mgmtEmployees.length;

  const currentUserEmp = findCurrentUserEmployee('MANAGEMENT');
  let displayedEmployees = [...scheduledMgmt];

  // Collapse if >3 and not expanded
  if (!showAllEmployees.MANAGEMENT && scheduledMgmt.length > 3) {
    displayedEmployees = scheduledMgmt.slice(0, 3);
    if (expandBtn) {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = `Show All (${scheduledMgmt.length})`;
    }
  } else if (showAllEmployees.MANAGEMENT && scheduledMgmt.length > 3) {
    if (expandBtn) {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = 'Show Less';
    }
  } else if (expandBtn) {
    expandBtn.style.display = 'none';
  }

  // Render scheduled managers
  displayedEmployees.forEach(emp => {
    const isCurrentEmp = emp.employeeId === currentUserEmp?.employeeId || emp.id === currentUserEmp?.id;
    grid.appendChild(createManagementCard(emp, isCurrentEmp, false));
  });

  // Render day off managers (collapsed)
  renderDayOffGroup(grid, dayOffMgmt, 'MANAGEMENT', { open: showAllEmployees.MANAGEMENT });
}

function createManagementCard(emp, isCurrentUser = false, isDayOff = false) {
  try {
    const card = document.createElement('div');
    card.className = `employee-card${isCurrentUser ? ' current-user' : ''}${isDayOff ? ' day-off' : ''}`;

    const empName = emp?.name || 'Unknown';
    const photoHtml = emp.imageUrl
      ? `<img src="${emp.imageUrl}" alt="${empName}" class="employee-photo">`
      : `<div class="employee-photo placeholder">${getInitials(empName)}</div>`;

    const loanWarning = hasLoanOverdue(empName)
      ? '<div class="loan-warning">Loan Overdue</div>'
      : '';

    if (isDayOff) {
      card.innerHTML = `
        <div class="card-header">
          ${photoHtml}
          <div class="employee-info">
            <h4>${empName}</h4>
            <span class="role day-off-badge">Day Off</span>
          </div>
        </div>
      `;
      return card;
    }
    
    const scan = getDailyScanStatsForEmployee(emp);
    const scanRow = Number.isFinite(scan?.accuracy)
      ? `
        <div class="card-field">
          <span class="field-label">Scan %</span>
          <span class="field-value ${scan.accuracy >= 99.5 ? 'positive' : scan.accuracy >= 99 ? 'warning' : 'negative'}">${scan.accuracy}%</span>
        </div>
      `
      : '';

    // Employee discount or expense info (if available)
    const discount = emp.metrics?.discountLc || emp.metrics?.employeeDiscount || emp.discount || null;
    const discountRow = (discount !== null && discount !== undefined && Number.isFinite(Number(discount)))
      ? `
        <div class="card-field">
          <span class="field-label">Employee Discount</span>
          <span class="field-value">${formatCurrency(Number(discount))}</span>
        </div>
      ` : '';

    // IPC / sales if available
    const ipc = emp.metrics?.ipc ?? emp.ipc ?? null;
    const sales = emp.metrics?.salesAmount ?? (emp.metrics?.sales ?? null);
    const hasIpc = ipc !== null && ipc !== undefined && Number.isFinite(Number(ipc));
    const hasSales = sales !== null && sales !== undefined && Number.isFinite(Number(sales));
    const ipcSalesRow = (hasIpc || hasSales)
      ? `
        <div class="card-field">
          <span class="field-label">IPC</span>
          <span class="field-value">${hasIpc ? ipc : '--'}</span>
        </div>
        <div class="card-field">
          <span class="field-label">Sales</span>
          <span class="field-value">${hasSales ? formatCurrency(sales) : '--'}</span>
        </div>
      ` : '';

    const position = emp.role || emp.position || emp.taskOfTheDay || '';
    const lunch = emp.scheduledLunch || emp.lunch || '-';

    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role">${position || 'Management'}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-field">
          <span class="field-label">Shift</span>
          <span class="field-value">${emp.shift || '-'}</span>
        </div>
        <div class="card-field">
          <span class="field-label">Lunch</span>
          <span class="field-value">${lunch}</span>
        </div>
        ${scanRow}
        ${discountRow}
        ${ipcSalesRow}
      </div>
      ${loanWarning}
    `;
    return card;
  } catch (error) {
    console.error('Error creating management card:', error, emp);
    const errorCard = document.createElement('div');
    errorCard.className = 'employee-card';
    errorCard.innerHTML = '<div class="card-header"><div class="employee-info"><h4>Error loading card</h4></div></div>';
    return errorCard;
  }
}

// Tailors Section - Collapsed by default, show Day Off for unscheduled
function renderTailorsSection() {
  const grid = document.getElementById('tailorGrid');
  const count = document.getElementById('tailorCount');
  if (!grid) return;
  grid.innerHTML = '';

  // Working vs day off (driven by Game Plan Edit toggle)
  const tailors = employees.TAILOR || [];
  const scheduledTailors = tailors.filter(e => !e?.isOff);
  const dayOffTailors = tailors.filter(e => !!e?.isOff);
  if (count) count.textContent = tailors.length;

  const currentUserEmp = findCurrentUserEmployee('TAILOR');

  // Collapsed by default - show only scheduled, max 3 (expand by clicking section title).
  const shownScheduled = showAllEmployees.TAILOR ? scheduledTailors : scheduledTailors.slice(0, 3);
  shownScheduled.forEach(emp => {
    grid.appendChild(createTailorCard(emp, emp.id === currentUserEmp?.id, false));
  });

  renderDayOffGroup(grid, dayOffTailors, 'TAILOR', { open: showAllEmployees.TAILOR });
}

function createTailorCard(emp, isCurrentUser = false, isDayOff = false) {
  const card = document.createElement('div');
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}${isDayOff ? ' day-off' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  if (isDayOff) {
    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role day-off-badge">Day Off</span>
        </div>
      </div>
    `;
  } else {
    const scan = getDailyScanStatsForEmployee(emp);
    const scanRow = Number.isFinite(scan?.accuracy)
      ? `
        <div class="card-field">
          <span class="field-label">Scan Accuracy</span>
          <span class="field-value ${scan.accuracy >= 99.5 ? 'positive' : scan.accuracy >= 99 ? 'warning' : 'negative'}">${scan.accuracy}%</span>
        </div>
      `
      : '';
    const productivity = emp.productivity || 0;
    const productivityClass = productivity >= 100 ? 'positive' : productivity >= 80 ? 'warning' : 'negative';
    const apg = getTailorApgForEmployee(emp);
    const apgText = apg !== null ? formatNumberOrDash(apg, 1) : '--';
    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role">Tailor</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-field">
          <span class="field-label">Station</span>
          <span class="field-value">${emp.station || '-'}</span>
        </div>
        <div class="card-field">
          <span class="field-label">Lunch</span>
          <span class="field-value">${emp.lunch || '-'}</span>
        </div>
        <div class="card-field">
          <span class="field-label">APG</span>
          <span class="field-value">${apgText}</span>
        </div>
        ${scanRow}
      </div>
      <div class="tailor-productivity">
        <div class="productivity-bar">
          <div class="productivity-fill ${productivityClass}" style="width: ${Math.min(productivity, 150)}%"></div>
        </div>
        <span class="productivity-value ${productivityClass}">${productivity}% YTD Productivity</span>
      </div>
    `;
  }
  return card;
}

function renderDayOffGroup(grid, list, label, options = {}) {
  if (!grid) return;
  if (!Array.isArray(list) || list.length === 0) return;

  const open = options?.open === true;

  const details = document.createElement('details');
  details.className = 'day-off-group';
  details.open = open;
  const summary = document.createElement('summary');
  summary.textContent = `Day Off (${list.length})`;
  details.appendChild(summary);

  const wrap = document.createElement('div');
  wrap.className = 'employee-grid day-off-grid';
  list.forEach(emp => {
    if (label === 'SA') wrap.appendChild(createSACard(emp, false));
    else if (label === 'BOH') wrap.appendChild(createBOHCard(emp, false));
    else if (label === 'MANAGEMENT') wrap.appendChild(createManagementCard(emp, false, true));
    else if (label === 'TAILOR') wrap.appendChild(createTailorCard(emp, false, true));
  });
  details.appendChild(wrap);
  grid.appendChild(details);
}

// =====================================================
// NEW SECTIONS RENDERING
// =====================================================

// Operations Health Section
function renderOperationsHealth() {
  const health = metrics.operationsHealth;
  if (!health) return;

  // Tailor Productivity
  const tailorProdEl = document.getElementById('tailorProductivity');
  if (tailorProdEl) {
    tailorProdEl.textContent = health.tailorProductivity !== null ? `${health.tailorProductivity}%` : '--';
    const card = document.getElementById('tailorProdCard');
    if (card) {
      card.classList.remove('success', 'warning');
      if (health.tailorProductivity >= 90) card.classList.add('success');
      else if (health.tailorProductivity < 80) card.classList.add('warning');
    }
  }

  // On-time Alterations
  const ontimeEl = document.getElementById('ontimeAlterations');
  if (ontimeEl) {
    ontimeEl.textContent = health.onTimeAlterations !== null ? `${health.onTimeAlterations}%` : '--';
    const card = document.getElementById('ontimeCard');
    if (card) {
      card.classList.remove('success', 'warning');
      if (health.onTimeAlterations >= 95) card.classList.add('success');
      else if (health.onTimeAlterations < 90) card.classList.add('warning');
    }
  }

  // Overdue Alterations
  const overdueEl = document.getElementById('overdueAlterations');
  if (overdueEl) {
    overdueEl.textContent = health.overdueAlterations;
    const card = document.getElementById('overdueAltsCard');
    if (card) {
      card.classList.remove('success', 'warning');
      if (health.overdueAlterations === 0) card.classList.add('success');
      else card.classList.add('warning');
    }
  }

  // Inventory Accuracy
  const accuracyEl = document.getElementById('inventoryAccuracy');
  if (accuracyEl) {
    accuracyEl.textContent = health.inventoryAccuracy !== null ? `${health.inventoryAccuracy}%` : '--';
    const card = document.getElementById('invAccuracyCard');
    if (card) {
      card.classList.remove('success', 'warning');
      if (health.inventoryAccuracy >= 99) card.classList.add('success');
      else if (health.inventoryAccuracy < 98) card.classList.add('warning');
    }
  }

  // OPS_METRICS: Tailor on-time donut charts
  if (currentPageType === 'OPS_METRICS') {
    renderTailorOnTimeCharts();
  }
}

function renderMainRetailKpis() {
  const kpi = metrics?.metrics;
  if (!kpi) return;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const setChange = (id, value, suffix) => {
    const el = document.getElementById(id);
    if (!el) return;

    const num = Number(value);
    if (!Number.isFinite(num)) {
      el.textContent = '--';
      el.className = 'metric-change neutral';
      return;
    }

    el.textContent = `${num >= 0 ? '+' : ''}${num}% ${suffix}`;
    el.className = `metric-change ${num >= 0 ? 'positive' : 'negative'}`;
  };

  const setVsTarget = (valueId, labelId, vs, target, targetFormatter) => {
    const vsEl = document.getElementById(valueId);
    const labelEl = document.getElementById(labelId);
    if (!vsEl && !labelEl) return;

    const vsNum = Number(vs);
    if (!Number.isFinite(vsNum)) {
      if (vsEl) vsEl.textContent = '--';
      if (labelEl) {
        labelEl.textContent = '--';
        labelEl.className = 'metric-change neutral';
      }
      return;
    }

    if (vsEl) vsEl.textContent = `${vsNum >= 0 ? '+' : ''}${vsNum}%`;
    if (labelEl) {
      const formattedTarget = targetFormatter ? targetFormatter(target) : target;
      labelEl.textContent = formattedTarget !== null && formattedTarget !== undefined && formattedTarget !== '' ? `Target: ${formattedTarget}` : 'Target: --';
      labelEl.className = `metric-change ${vsNum >= 0 ? 'positive' : 'negative'}`;
    }
  };

  // APC
  if (kpi.apc !== undefined) setText('kpiApc', formatUsd(kpi.apc).replace('.00', ''));
  setChange('kpiApcChange', kpi.apcVsPY, 'vs PY');
  setVsTarget('kpiApcVsTarget', 'kpiApcTargetLabel', kpi.apcVsTarget, kpi.apcTarget, (v) => formatUsd(v).replace('.00', ''));

  // CPC
  setText('kpiCpc', Number.isFinite(Number(kpi.cpc)) ? Number(kpi.cpc).toFixed(2) : '--');
  setChange('kpiCpcChange', kpi.cpcVsPY, 'vs PY');
  setVsTarget('kpiCpcVsTarget', 'kpiCpcTargetLabel', kpi.cpcVsTarget, kpi.cpcTarget, (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '--'));

  // IPC
  setText('kpiIpc', Number.isFinite(Number(kpi.itemsPerCustomer)) ? Number(kpi.itemsPerCustomer).toFixed(2) : '--');
  setChange('kpiIpcChange', kpi.ipcVsPY, 'vs PY');
  setVsTarget('kpiIpcVsTarget', 'kpiIpcTargetLabel', kpi.ipcVsTarget, kpi.itemsPerCustomerTarget, (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '--'));

  // SPH
  if (kpi.salesPerHour !== undefined) setText('kpiSph', formatUsd(kpi.salesPerHour).replace('.00', ''));
  setChange('kpiSphChange', kpi.sphVsPY, 'vs PY');
}

function formatNumberOrDash(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (digits <= 0) return `${Math.round(n)}`;
  const factor = Math.pow(10, digits);
  return `${Math.round(n * factor) / factor}`;
}

function getTailorApgForEmployee(emp) {
  const employeeApg = Number(emp?.metrics?.apg);
  if (Number.isFinite(employeeApg)) return employeeApg;

  const storeApg = Number(metrics?.storeOpsOverdueAudit?.apg);
  if (Number.isFinite(storeApg)) return storeApg;

  return null;
}

function getL3MSizePassPctForEmployee(emp) {
  const employeeVal = Number(emp?.metrics?.l3mSizePassPct ?? emp?.metrics?.l3mSizePass);
  if (Number.isFinite(employeeVal)) return employeeVal;

  const storeVal = Number(metrics?.storeOpsOverdueAudit?.l3mSizePassPct);
  if (Number.isFinite(storeVal)) return storeVal;

  return null;
}

function formatPercentOrDash(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${formatNumberOrDash(n, digits)}%`;
}

// Tailor over-audit donut charts (overall + long/short)
let onTimeOverallChart = null;
let onTimeLongChart = null;
let onTimeShortChart = null;

function destroyChartSafely(chart) {
  try {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  } catch (_) {}
}

function getCssVarColor(varName, fallback) {
  try {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  } catch (_) {
    return fallback;
  }
}

function renderOnTimeDoughnut(canvasId, split) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (typeof Chart === 'undefined') return null;
  if (!split) return null;

  const good = Number(split.goodCount);
  const late = Number(split.lateCount);
  const goodCount = Number.isFinite(good) ? good : 0;
  const lateCount = Number.isFinite(late) ? late : 0;

  const goodColor = getCssVarColor('--success', '#28a745');
  const lateColor = getCssVarColor('--danger', '#dc3545');

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Good', 'Late'],
      datasets: [
        {
          data: [goodCount, lateCount],
          backgroundColor: [goodColor, lateColor],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = (goodCount + lateCount) || 1;
              const pct = Math.round((ctx.raw / total) * 1000) / 10;
              return `${ctx.label}: ${ctx.raw} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderTailorOnTimeCharts() {
  const breakdown = metrics?.operationsHealth?.alterationsOnTimeBreakdown;
  const overall = breakdown?.overall || null;
  const long = breakdown?.byDuration?.long || null;
  const short = breakdown?.byDuration?.short || null;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setCardVisible = (cardId, visible) => {
    const el = document.getElementById(cardId);
    if (el) el.style.display = visible ? '' : 'none';
  };

  setText('onTimeOverallPct', overall ? formatPercentOrDash(overall.goodPct, 0) : '--');
  setText('onTimeLongPct', long ? formatPercentOrDash(long.goodPct, 0) : '--');
  setText('onTimeShortPct', short ? formatPercentOrDash(short.goodPct, 0) : '--');

  const formatCounts = (split) => {
    if (!split) return 'Good vs Late';
    const good = Number(split.goodCount);
    const late = Number(split.lateCount);
    if (!Number.isFinite(good) || !Number.isFinite(late)) return 'Good vs Late';
    return `Good: ${good} • Late: ${late}`;
  };
  setText('onTimeOverallCounts', formatCounts(overall));
  setText('onTimeLongCounts', formatCounts(long));
  setText('onTimeShortCounts', formatCounts(short));

  setCardVisible('onTimeOverallChartCard', !!overall);
  setCardVisible('onTimeLongChartCard', !!long);
  setCardVisible('onTimeShortChartCard', !!short);

  onTimeOverallChart = (destroyChartSafely(onTimeOverallChart), renderOnTimeDoughnut('onTimeOverallChart', overall));
  onTimeLongChart = (destroyChartSafely(onTimeLongChart), renderOnTimeDoughnut('onTimeLongChart', long));
  onTimeShortChart = (destroyChartSafely(onTimeShortChart), renderOnTimeDoughnut('onTimeShortChart', short));
}

function renderTailorProductivityLastWeek() {
  const health = metrics?.operationsHealth;
  if (!health) return;

  const formatPct = (v) => (Number.isFinite(Number(v)) ? `${formatNumberOrDash(v, 1)}%` : '--');

  const setIfPresent = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const team = health.teamProductivity ?? health.tailorProductivity;
  setIfPresent('tailorTeamProductivityPct', formatPct(team));
  setIfPresent('tailorUtilizationPct', formatPct(health.utilization));
  setIfPresent('tailorWorkedHours', formatNumberOrDash(health.workedHours, 0));
  setIfPresent('tailorAlterationsHours', formatNumberOrDash(health.hoursOfAlterations, 0));

  setIfPresent('mgrTailorTeamProductivityPct', formatPct(team));
  setIfPresent('mgrTailorUtilizationPct', formatPct(health.utilization));
  setIfPresent('mgrTailorWorkedHours', formatNumberOrDash(health.workedHours, 0));
  setIfPresent('mgrTailorAlterationsHours', formatNumberOrDash(health.hoursOfAlterations, 0));

  // Store Ops Overdue Audit (PDF-derived) KPIs
  try {
    const audit = metrics?.storeOpsOverdueAudit;
    const apgEl = document.getElementById('tailorAuditApg');
    const sizePassEl = document.getElementById('tailorAuditSizePassPct');
    const freeAltEl = document.getElementById('tailorAuditFreeAltPct');
    const weekHintEl = document.getElementById('tailorAuditWeekHint');
    const genHintEl = document.getElementById('tailorAuditGeneratedHint');

    if (apgEl) apgEl.textContent = Number.isFinite(Number(audit?.apg)) ? formatNumberOrDash(audit.apg, 1) : '--';
    if (sizePassEl) sizePassEl.textContent = Number.isFinite(Number(audit?.l3mSizePassPct)) ? `${formatNumberOrDash(audit.l3mSizePassPct, 0)}%` : '--';
    if (freeAltEl) freeAltEl.textContent = Number.isFinite(Number(audit?.freeAlterationPct)) ? `${formatNumberOrDash(audit.freeAlterationPct, 0)}%` : '--';

    if (weekHintEl) {
      if (audit?.finishedWeekStart && audit?.finishedWeekEnd) {
        weekHintEl.textContent = `Finished week: ${audit.finishedWeekStart} → ${audit.finishedWeekEnd}`;
      } else {
        weekHintEl.textContent = 'Last complete week';
      }
    }

    if (genHintEl) {
      if (audit?.generatedByLookerAtText) genHintEl.textContent = `Looker: ${audit.generatedByLookerAtText}`;
      else if (audit?.sourceFile) genHintEl.textContent = `Overdue Audit: ${audit.sourceFile}`;
      else genHintEl.textContent = 'Overdue Audit';
    }
  } catch (_) {
    // ignore
  }

  const tailorBody = document.getElementById('tailorLastWeekTableBody');
  if (tailorBody) {
    tailorBody.innerHTML = '';
    const rows = Array.isArray(health.tailorsLastWeek) ? health.tailorsLastWeek : [];
    rows.forEach(t => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = t?.name || '--';

      const tdProd = document.createElement('td');
      tdProd.textContent = formatPct(t?.productivityPercent);

      const tdBench = document.createElement('td');
      tdBench.textContent = Number.isFinite(Number(t?.benchmarkHours)) ? formatNumberOrDash(t.benchmarkHours, 2) : '--';

      const tdWorked = document.createElement('td');
      tdWorked.textContent = Number.isFinite(Number(t?.workedHours)) ? formatNumberOrDash(t.workedHours, 2) : '--';

      const tdEff = document.createElement('td');
      tdEff.textContent = Number.isFinite(Number(t?.efficiency)) ? `${formatNumberOrDash(t.efficiency, 1)}%` : '--';

      tr.appendChild(tdName);
      tr.appendChild(tdProd);
      tr.appendChild(tdBench);
      tr.appendChild(tdWorked);
      tr.appendChild(tdEff);
      tailorBody.appendChild(tr);
    });
  }

  const benchBody = document.getElementById('benchmarkTimesTableBody');
  if (benchBody) {
    benchBody.innerHTML = '';
    const rows = Array.isArray(health.benchmarkTimesMinutes) ? health.benchmarkTimesMinutes : [];
    rows.slice(0, 40).forEach(r => {
      const tr = document.createElement('tr');

      const tdDiff = document.createElement('td');
      tdDiff.textContent = r?.difficultyLevel ?? '--';

      const tdDesc = document.createElement('td');
      tdDesc.textContent = r?.description || '--';

      const tdMin = document.createElement('td');
      tdMin.textContent = Number.isFinite(Number(r?.minutes)) ? formatNumberOrDash(r.minutes, 0) : '--';

      tr.appendChild(tdDiff);
      tr.appendChild(tdDesc);
      tr.appendChild(tdMin);
      benchBody.appendChild(tr);
    });
  }
}

window.renderTailorProductivityLastWeek = renderTailorProductivityLastWeek;

function renderWorkRelatedExpensesSummary() {
  const exp = metrics?.workRelatedExpenses;
  if (!exp || !exp.storeTotals) return;

  const ytd = exp.storeTotals.currentYear || {};
  const month = exp.storeTotals.currentMonth || {};

  const formatUsdCompact = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '--';
    return formatUsd(num).replace('.00', '');
  };

  const set = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  set('expDiscountYtd', formatUsdCompact(ytd.fullPriceLc));
  set('expDiscountYtdHint', `${Number(ytd.orders || 0)} orders`);
  set('expDiscountMonth', formatUsdCompact(month.fullPriceLc));
  set('expDiscountMonthHint', `${Number(month.orders || 0)} orders`);

  set('mgrExpDiscountYtd', formatUsdCompact(ytd.fullPriceLc));
  set('mgrExpDiscountYtdHint', `${Number(ytd.orders || 0)} orders`);
  set('mgrExpDiscountMonth', formatUsdCompact(month.fullPriceLc));
  set('mgrExpDiscountMonthHint', `${Number(month.orders || 0)} orders`);

  // Manager over-limit banner
  const mgrBanner = document.getElementById('mgrOverLimitBanner');
  if (mgrBanner && Array.isArray(exp.employees)) {
    const overLimitEmployees = exp.employees.filter(e => {
      return !!(e?.overLimit?.yearly);
    });
    if (overLimitEmployees.length > 0) {
      mgrBanner.style.display = '';
      mgrBanner.textContent = `Over yearly limit ($2,500): ${overLimitEmployees.length} employee${overLimitEmployees.length === 1 ? '' : 's'} · Click to view`;
      mgrBanner.style.cursor = 'pointer';
      mgrBanner.onclick = () => { window.location.href = '/employee-discount'; };
    } else {
      mgrBanner.style.display = 'none';
      mgrBanner.textContent = '';
      mgrBanner.onclick = null;
      mgrBanner.style.cursor = '';
    }
  }
}

window.renderWorkRelatedExpensesSummary = renderWorkRelatedExpensesSummary;

// Inventory Issues Section
function renderInventoryIssues() {
  const issues = metrics.inventoryIssues;
  if (!issues) return;

  // Missing Items
  const missingEl = document.getElementById('missingItems');
  if (missingEl) {
    missingEl.textContent = issues.missingItems !== null ? `${issues.missingItems}%` : '--';
    const card = document.getElementById('missingCard');
    if (card) {
      card.classList.remove('warning');
      if (issues.missingItems > 5) card.classList.add('warning');
    }
  }

  // Overdue Reserved
  const overdueReservedEl = document.getElementById('overdueReserved');
  if (overdueReservedEl) {
    overdueReservedEl.textContent = issues.overdueReserved !== null ? `${issues.overdueReserved}%` : '--';
    const card = document.getElementById('overdueReservedCard');
    if (card) {
      card.classList.remove('warning');
      if (issues.overdueReserved > 5) card.classList.add('warning');
    }
  }

  // Unexpected Items
  const unexpectedEl = document.getElementById('unexpectedItems');
  if (unexpectedEl) {
    unexpectedEl.textContent = issues.unexpectedItems !== null ? `${issues.unexpectedItems}%` : '--';
  }

  // Due Pullbacks
  const pullbacksEl = document.getElementById('duePullbacks');
  if (pullbacksEl) {
    pullbacksEl.textContent = issues.duePullbacks;
  }
}

// Customer Reserved Orders Section
function renderCustomerOrders() {
  const orders = metrics.customerReservedOrders;
  if (!orders) return;

  // Summary stats
  document.getElementById('ordersCount').textContent = `${orders.summary.total} orders`;
  document.getElementById('orders30Days').textContent = orders.summary.over30Days;
  document.getElementById('orders60Days').textContent = orders.summary.over60Days;
  document.getElementById('orders90Days').textContent = orders.summary.over90Days;
  document.getElementById('missingReservedCount').textContent = orders.missingReserved.length;

  // Populate table
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Combine and sort by days old
  const allOrders = [
    ...orders.orders.map(o => ({ ...o, status: 'pending' })),
    ...orders.missingReserved.map(o => ({ ...o, daysOld: 0, status: 'missing' }))
  ].sort((a, b) => b.daysOld - a.daysOld);

  // Show max 20 orders
  allOrders.slice(0, 20).forEach(order => {
    const tr = document.createElement('tr');
    const daysClass = order.daysOld >= 90 ? 'critical' : order.daysOld >= 60 ? 'warning' : order.daysOld >= 30 ? 'alert' : '';
    const statusClass = order.status === 'missing' ? 'missing' : 'pending';

    // Check for PSUS order number in fulfillmentId (PSUS + 8 digits)
    const fulfillmentId = order.fulfillmentId || '';
    const psusMatch = fulfillmentId.match(/PSUS(\d{8})/i);
    const fulfillmentDisplay = psusMatch
      ? `<a href="https://ussbp.omni.manh.com/customerengagementfacade/app/orderstatus?orderId=PSUS${psusMatch[1]}&selectedOrg=SUIT-US" target="_blank" class="psus-link" title="Open Order Status">PSUS${psusMatch[1]}</a>`
      : fulfillmentId;

    tr.innerHTML = `
      <td class="fulfillment-id">${fulfillmentDisplay}</td>
      <td>${order.createdDate || order.lastReadDate || '-'}</td>
      <td class="days-old ${daysClass}">${order.daysOld > 0 ? order.daysOld + ' days' : '-'}</td>
      <td><span class="status-badge ${statusClass}">${order.status === 'missing' ? 'Missing' : 'Pending'}</span></td>
    `;
    tbody.appendChild(tr);
  });

  if (allOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No orders found</td></tr>';
  }
}

// Daily Scan Log (formerly Employee Count Leaderboard)
function renderCountLeaderboard() {
  renderDailyScanLog();
}

function renderDailyScanLog() {
  const countData = metrics.employeeCountPerformance;
  const grid = document.getElementById('scanLogGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!countData || !countData.employees || countData.employees.length === 0) {
    grid.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">No scan data available for today</div>';
    return;
  }

  // Get all employees for photo matching
  const allEmployees = [
    ...(employees.SA || []),
    ...(employees.BOH || []),
    ...(employees.MANAGEMENT || []),
    ...(employees.TAILOR || [])
  ];

  (countData.employees || []).filter(Boolean).forEach((emp, index) => {
    // Try to find the employee's photo from our employee data
    const matchedEmployee = allEmployees.find(e => 
      e.name?.toLowerCase() === emp.name?.toLowerCase() ||
      e.id === emp.employeeId
    );
    
    const photoUrl = matchedEmployee?.imageUrl || emp.imageUrl;
    const photoHtml = photoUrl 
      ? `<img src="${photoUrl}" alt="${emp.name}" class="employee-photo">` 
      : `<div class="employee-photo placeholder">${getInitials(emp.name || 'Unknown')}</div>`;
    
    const accuracy = Number(emp.accuracy);
    const accuracyClass = accuracy >= 99.5 ? 'good' : accuracy >= 99 ? '' : 'bad';
    const missedClass = emp.missedReserved === 0 ? 'good' : 'bad';
    const rankBadge = index < 3 ? `<span class="rank-badge rank-${index + 1}">${index + 1}</span>` : '';

    const card = document.createElement('div');
    card.className = 'scan-log-card';
    card.innerHTML = `
      ${photoHtml}
      <div class="scan-log-info">
        <h5>${rankBadge}${emp.name || 'Unknown'}</h5>
        <div class="scan-log-stats">
          <span class="scan-log-stat ${accuracyClass}">
            <strong>${Number.isFinite(accuracy) ? accuracy : '--'}${Number.isFinite(accuracy) ? '%' : ''}</strong> accuracy
          </span>
          <span class="scan-log-stat">
            <strong>${emp.countsDone}</strong> scans
          </span>
          <span class="scan-log-stat ${missedClass}">
            <strong>${emp.missedReserved}</strong> missed
          </span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Tailor Productivity Trend Chart
let tailorTrendChart = null;

function renderTailorTrend() {
  const trendData = metrics.tailorProductivityTrend;
  if (!trendData) return;

  // Update YTD averages
  const ytd24 = document.getElementById('ytdAvg2024');
  if (ytd24) ytd24.textContent = `${trendData.ytdAvg2024}%`;
  const ytd25 = document.getElementById('ytdAvg2025');
  if (ytd25) ytd25.textContent = `${trendData.ytdAvg2025}%`;

  // Create chart
  const ctx = document.getElementById('tailorTrendChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') return;

  // Destroy existing chart
  if (tailorTrendChart) {
    tailorTrendChart.destroy();
  }

  const weeks = trendData.weeks.map(w => `W${w.week}`);
  const data2024 = trendData.weeks.map(w => w.productivity2024);
  const data2025 = trendData.weeks.map(w => w.productivity2025);

  tailorTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: weeks,
      datasets: [
        {
          label: '2024',
          data: data2024,
          borderColor: '#94a3b8',
          backgroundColor: 'rgba(148, 163, 184, 0.1)',
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5
        },
        {
          label: '2025',
          data: data2025,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          min: 50,
          max: 140,
          ticks: {
            callback: value => value + '%'
          }
        },
        x: {
          ticks: {
            maxTicksLimit: 12
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
}

// Appointments/Waitwhile Widget
function renderAppointmentsWidget() {
  const appointmentsFromMetrics = metrics?.waitwhile?.currentWeek;
  if (appointmentsFromMetrics) {
    const appointments = appointmentsFromMetrics;
        
    // Update week number
    const weekNumEl = document.getElementById('appointmentsWeekNum');
    if (weekNumEl) weekNumEl.textContent = `Week ${appointments.week}`;

    // Update totals
    const totalEl = document.getElementById('appointmentsTotal');
    if (totalEl) totalEl.textContent = appointments.total || 0;

    const bookedEl = document.getElementById('appointmentsBooked');
    if (bookedEl) bookedEl.textContent = appointments.appointments || 0;

    const walkInsEl = document.getElementById('appointmentsWalkIns');
    if (walkInsEl) walkInsEl.textContent = appointments.walkIns || 0;

    const dropOffEl = document.getElementById('appointmentsDropOff');
    if (dropOffEl) dropOffEl.textContent = `${appointments.dropOffRate || 0}%`;

    // Update breakdown by type
    const shoppingEl = document.getElementById('appointmentsShopping');
    if (shoppingEl) shoppingEl.textContent = appointments.shopping || 0;

    const pickupEl = document.getElementById('appointmentsPickup');
    if (pickupEl) pickupEl.textContent = appointments.pickup || 0;

    const consultEl = document.getElementById('appointmentsConsultation');
    if (consultEl) consultEl.textContent = appointments.consultation || 0;

    const otherEl = document.getElementById('appointmentsOther');
    if (otherEl) otherEl.textContent = appointments.other || 0;
    return;
  }

  // Fallback: fetch appointments data from API (older pages / missing metrics payload)
  fetch('/api/gameplan/appointments')
    .then(res => res.json())
    .then(data => {
      if (data.success && data.data?.waitwhile?.currentWeek) {
        metrics.waitwhile = data.data.waitwhile;
        renderAppointmentsWidget();
      }
    })
    .catch(err => {
      console.error('Error loading appointments:', err);
    });
}

// Best Sellers Widget
let currentBestSellersView = 'revenue';
let bestSellersData = { byRevenue: [], byQuantity: [] };

function renderBestSellers() {
  if (metrics?.bestSellers && (metrics.bestSellers.byRevenue?.length || metrics.bestSellers.byQuantity?.length)) {
    bestSellersData = metrics.bestSellers;
    renderBestSellersList();
  } else {
    fetch('/api/gameplan/best-sellers')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          metrics.bestSellers = data.data;
          bestSellersData = data.data;
          renderBestSellersList();
        }
      })
      .catch(err => {
        console.error('Error loading best sellers:', err);
        const list = document.getElementById('bestSellersList');
        if (list) list.innerHTML = '<div class="best-seller-placeholder">Unable to load best sellers</div>';
      });
  }

  // Setup toggle buttons
  const revenueBtn = document.getElementById('toggleByRevenue');
  const quantityBtn = document.getElementById('toggleByQuantity');

  if (revenueBtn) {
    revenueBtn.onclick = () => {
      currentBestSellersView = 'revenue';
      revenueBtn.classList.add('active');
      quantityBtn?.classList.remove('active');
      renderBestSellersList();
    };
  }

  if (quantityBtn) {
    quantityBtn.onclick = () => {
      currentBestSellersView = 'quantity';
      quantityBtn.classList.add('active');
      revenueBtn?.classList.remove('active');
      renderBestSellersList();
    };
  }
}

function renderBestSellersList() {
  const list = document.getElementById('bestSellersList');
  if (!list) return;

  const items = currentBestSellersView === 'revenue' 
    ? bestSellersData.byRevenue 
    : bestSellersData.byQuantity;

  if (!items || items.length === 0) {
    list.innerHTML = '<div class="best-seller-placeholder">No best sellers data available</div>';
    return;
  }

  list.innerHTML = items.slice(0, 10).map((item, index) => {
    const value = currentBestSellersView === 'revenue'
      ? formatUsd(item.amount)
      : `${item.quantity || 0} units`;

    return `
      <div class="best-seller-item">
        <div class="best-seller-rank">${index + 1}</div>
        <div class="best-seller-thumb-wrap">
          <img class="best-seller-thumb" alt="${item.code || 'Product'}" loading="lazy" data-product-code="${item.code || ''}">
        </div>
        <div class="best-seller-info">
          <div class="best-seller-code">${item.code || 'Unknown'}</div>
          <div class="best-seller-desc">${item.description || ''}</div>
        </div>
        <div class="best-seller-value">${value}</div>
      </div>
    `;
  }).join('');

  hydrateBestSellerImages();
}

function hydrateBestSellerImages() {
  const imgs = Array.from(document.querySelectorAll('img.best-seller-thumb[data-product-code]'));
  if (!imgs.length) return;

  imgs.forEach(img => {
    const code = (img.dataset.productCode || '').toString().trim();
    if (!code) {
      img.classList.add('best-seller-thumb--empty');
      img.style.display = 'none';
      return;
    }

    if (img.dataset.hydrated === '1') return;
    img.dataset.hydrated = '1';

    fetch(`/api/gameplan/product-image/${encodeURIComponent(code)}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.success || !data?.imageUrl) {
          img.classList.add('best-seller-thumb--empty');
          img.style.display = 'none';
          return;
        }
        img.src = data.imageUrl;
        img.style.display = 'block';
      })
      .catch(() => {
        img.classList.add('best-seller-thumb--empty');
        img.style.display = 'none';
      });
  });
}

// Modal Functions
function openEditModal(emp) {
  if (!currentUser?.isManager && !currentUser?.isAdmin) {
    showNotification('Only managers can edit assignments', 'warning');
    return;
  }

  currentEditEmployee = emp;
  document.getElementById('modalTitle').textContent = `Edit ${emp.name}`;
  document.getElementById('modalBody').innerHTML = getFormFields(emp);
  document.getElementById('editModal').classList.add('active');
}

function getFormFields(emp) {
  const empZones = getEmployeeZones(emp);
  const zoneOptions = (settings.zones || []).map(z =>
    `<option value="${z.name}" ${empZones.includes(z.name) ? 'selected' : ''}>${z.name}</option>`
  ).join('');

  const frOptions = (settings.fittingRooms || []).map(fr =>
    `<option value="${fr.name}" ${emp.fittingRoom === fr.name ? 'selected' : ''}>${fr.name}</option>`
  ).join('');

  const shiftOptions = (settings.shifts || []).map(s =>
    `<option value="${s.name}" ${emp.shift === s.name ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  const lunchOptions = (settings.lunchTimes || []).map(t =>
    `<option value="${t}" ${emp.scheduledLunch === t || emp.lunch === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  const typeOptions = ['SA', 'BOH', 'MANAGEMENT', 'TAILOR'].map(t =>
    `<option value="${t}" ${emp.type === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  let fields = `
    <div class="form-group">
      <label>Employee Type</label>
      <select class="form-control" id="editType">${typeOptions}</select>
    </div>
  `;

  switch (emp.type) {
	    case 'SA':
	      fields += `
	        <div class="grid grid-2">
	          <div class="form-group">
	            <label>Zones</label>
	            <select class="form-control" id="editZones" multiple><option value="">Select...</option>${zoneOptions}</select>
	          </div>
	          <div class="form-group">
	            <label>Fitting Room</label>
	            <select class="form-control" id="editFittingRoom"><option value="">Select...</option>${frOptions}</select>
	          </div>
	        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>Lunch Time</label>
            <select class="form-control" id="editLunch"><option value="">Select...</option>${lunchOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Closing Sections</label>
          <input type="text" class="form-control" id="editClosing" value="${Array.isArray(emp.closingSections) ? emp.closingSections.join(', ') : emp.closingSections || ''}" placeholder="Section 1, Section 2">
        </div>
      `;
      break;
    case 'BOH':
      fields += `
        <div class="grid grid-2">
          <div class="form-group">
            <label>Shift</label>
            <select class="form-control" id="editShift"><option value="">Select...</option>${shiftOptions}</select>
          </div>
          <div class="form-group">
            <label>Lunch Time</label>
            <select class="form-control" id="editLunch"><option value="">Select...</option>${lunchOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Task of the Day</label>
          <textarea class="form-control" id="editTask" rows="3">${emp.taskOfTheDay || ''}</textarea>
        </div>
      `;
      break;
    case 'MANAGEMENT':
      // No zone for management
      fields += `
        <div class="grid grid-2">
          <div class="form-group">
            <label>Role</label>
            <select class="form-control" id="editRole">
              <option value="">Select...</option>
              <option value="MOD" ${emp.role === 'MOD' ? 'selected' : ''}>MOD (Manager on Duty)</option>
              <option value="HOST" ${emp.role === 'HOST' ? 'selected' : ''}>Host</option>
            </select>
          </div>
          <div class="form-group">
            <label>Shift</label>
            <select class="form-control" id="editShift"><option value="">Select...</option>${shiftOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Lunch Time</label>
          <select class="form-control" id="editLunch"><option value="">Select...</option>${lunchOptions}</select>
        </div>
      `;
      break;
    case 'TAILOR':
      const stationOptions = (settings.tailorStations || []).map(s =>
        `<option value="${s.name}" ${emp.station === s.name ? 'selected' : ''}>${s.name}</option>`
      ).join('');
      fields += `
        <div class="grid grid-2">
          <div class="form-group">
            <label>Station</label>
            <select class="form-control" id="editStation"><option value="">Select...</option>${stationOptions}</select>
          </div>
          <div class="form-group">
            <label>Lunch Time</label>
            <select class="form-control" id="editLunch"><option value="">Select...</option>${lunchOptions}</select>
          </div>
        </div>
      `;
      break;
  }

  return fields;
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  currentEditEmployee = null;
}

async function saveModalChanges() {
  if (!currentEditEmployee) return;

  const emp = currentEditEmployee;
  const newType = document.getElementById('editType').value;

  // Check if type changed
  const typeChanged = newType !== emp.type;

	  switch (emp.type) {
	    case 'SA':
	      const zonesSelect = document.getElementById('editZones');
	      if (zonesSelect) {
	        const zones = Array.from(zonesSelect.selectedOptions)
	          .map(o => (o.value || '').trim())
	          .filter(v => v && v !== 'Select...');
	        emp.zones = zones;
	        emp.zone = zones[0] || '';
	      }
	      emp.fittingRoom = document.getElementById('editFittingRoom')?.value || emp.fittingRoom;
	      emp.scheduledLunch = document.getElementById('editLunch')?.value || emp.scheduledLunch;
	      emp.closingSections = (document.getElementById('editClosing')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
	      break;
    case 'BOH':
      emp.shift = document.getElementById('editShift')?.value || emp.shift;
      emp.lunch = document.getElementById('editLunch')?.value || emp.lunch;
      emp.taskOfTheDay = document.getElementById('editTask')?.value || emp.taskOfTheDay;
      break;
    case 'MANAGEMENT':
      emp.shift = document.getElementById('editShift')?.value || emp.shift;
      emp.role = document.getElementById('editRole')?.value || emp.role;
      emp.lunch = document.getElementById('editLunch')?.value || emp.lunch;
      break;
    case 'TAILOR':
      emp.station = document.getElementById('editStation')?.value || emp.station;
      emp.lunch = document.getElementById('editLunch')?.value || emp.lunch;
      break;
  }

  // Handle type change
  if (typeChanged) {
    emp.type = newType;
    await fetch('/api/gameplan/employees/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: emp.id, fromType: currentEditEmployee.type, toType: newType })
    });
    await loadEmployees();
  }

  gameplanData.assignments[emp.id] = { ...emp };
  closeModal();
  renderAll();
  await saveGameplan();
}

// Notes functions
async function saveGameplan() {
  const notesEditor = document.getElementById('notesEditor') || document.getElementById('notesEditorInline');
  gameplanData.notes = notesEditor?.innerHTML || '';
  // Use local date (store day) to avoid UTC off-by-one issues.
  gameplanData.date = getLocalISODate(); // YYYY-MM-DD
  gameplanData.lastEditedBy = currentUser?.name || 'Unknown';
  gameplanData.lastEditedAt = new Date().toISOString();

  try {
    const response = await fetch('/api/gameplan/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameplanData)
    });

    const notesStatus = document.getElementById('notesStatus') || document.getElementById('notesStatusInline');
    const lastEditedBy = document.getElementById('lastEditedBy');
    
    if (response.ok) {
      if (notesStatus) notesStatus.textContent = 'Saved';
      if (lastEditedBy) {
        const editTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        lastEditedBy.textContent = `Last edited by ${currentUser?.name || 'Unknown'} at ${editTime}`;
      }
    } else {
      let msg = `Save failed (HTTP ${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) msg = data.error;
      } catch (e) {}
      if (notesStatus) notesStatus.textContent = msg;
    }
  } catch (error) {
    console.error('Error saving gameplan:', error);
    const notesStatus = document.getElementById('notesStatus') || document.getElementById('notesStatusInline');
    if (notesStatus) notesStatus.textContent = 'Error saving';
  }
}

async function publishGameplan() {
  gameplanData.published = true;
  gameplanData.publishedAt = new Date().toISOString();
  gameplanData.publishedBy = currentUser.name;
  await saveGameplan();
  document.getElementById('statusBanner').style.display = 'none';
  showNotification('Game plan published successfully!');
}

// Metrics editing
function openMetricsEditor() {
  document.getElementById('editWtdSales').value = metrics.wtd?.salesAmount || 0;
  document.getElementById('editTargetAmount').value = metrics.wtd?.target || 0;
  document.getElementById('editSph').value = metrics.metrics?.salesPerHour || 0;
  document.getElementById('editIpc').value = metrics.metrics?.itemsPerCustomer || 0;
  document.getElementById('editDropoffs').value = metrics.metrics?.dropOffs || 0;
  document.getElementById('editFormal').value = metrics.lastWeekSales?.formal || 0;
  document.getElementById('editCasual').value = metrics.lastWeekSales?.casual || 0;
  document.getElementById('editTuxedo').value = metrics.lastWeekSales?.tuxedo || 0;

  openOverlay('metricsModal');
}

async function saveMetricsChanges() {
  const updatedMetrics = {
    date: new Date().toISOString().split('T')[0],
    source: 'manual',
    importedAt: new Date().toISOString(),
    wtd: {
      salesAmount: parseFloat(document.getElementById('editWtdSales').value) || 0,
      target: parseFloat(document.getElementById('editTargetAmount').value) || 0,
      salesVsPY: metrics.wtd?.salesVsPY || 0,
      vsTarget: 0
    },
    metrics: {
      salesPerHour: parseFloat(document.getElementById('editSph').value) || 0,
      itemsPerCustomer: parseFloat(document.getElementById('editIpc').value) || 0,
      dropOffs: parseFloat(document.getElementById('editDropoffs').value) || 0,
      sphVsPY: metrics.metrics?.sphVsPY || 0,
      ipcVsPY: metrics.metrics?.ipcVsPY || 0
    },
    lastWeekSales: {
      formal: parseInt(document.getElementById('editFormal').value) || 0,
      casual: parseInt(document.getElementById('editCasual').value) || 0,
      tuxedo: parseInt(document.getElementById('editTuxedo').value) || 0
    }
  };

  // Calculate vs target
  if (updatedMetrics.wtd.target > 0) {
    updatedMetrics.wtd.vsTarget = ((updatedMetrics.wtd.salesAmount - updatedMetrics.wtd.target) / updatedMetrics.wtd.target * 100).toFixed(1);
  }

  try {
    await fetch('/api/gameplan/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedMetrics)
    });

    metrics = updatedMetrics;
    updateMetricsDisplay();
    document.getElementById('metricsModal').classList.remove('active');
    showNotification('Metrics updated successfully!');
  } catch (error) {
    showNotification('Error updating metrics', 'error');
  }
}

// Settings Modal
function openSettingsModal() {
  openOverlay('settingsModal');
  renderSettingsTab(currentSettingsTab);
}

function renderSettingsTab(tab) {
  currentSettingsTab = tab;
  const content = document.getElementById('settingsContent');

  // Update active tab
  document.querySelectorAll('.settings-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  let items = [];
  let label = '';

  switch (tab) {
    case 'zones':
      items = settings.zones || [];
      label = 'Zone';
      break;
    case 'fittingRooms':
      items = settings.fittingRooms || [];
      label = 'Fitting Room';
      break;
    case 'shifts':
      items = settings.shifts || [];
      label = 'Shift';
      break;
    case 'sections':
      items = settings.closingSections || [];
      label = 'Closing Section';
      break;
  }

  content.innerHTML = `
    <div class="settings-list" id="settingsList">
      ${items.map((item, idx) => `
        <div class="settings-item" data-index="${idx}">
          <input type="text" class="form-control" value="${item.name || item}" data-field="name">
          <button class="btn btn-sm btn-danger remove-item" data-index="${idx}">Remove</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm" id="addSettingItem">+ Add ${label}</button>
  `;

  // Add item button
  document.getElementById('addSettingItem').addEventListener('click', () => {
    const list = document.getElementById('settingsList');
    const idx = list.children.length;
    const div = document.createElement('div');
    div.className = 'settings-item';
    div.dataset.index = idx;
    div.innerHTML = `
      <input type="text" class="form-control" value="" data-field="name" placeholder="Enter ${label.toLowerCase()} name">
      <button class="btn btn-sm btn-danger remove-item" data-index="${idx}">Remove</button>
    `;
    list.appendChild(div);

    div.querySelector('.remove-item').addEventListener('click', () => div.remove());
  });

  // Remove buttons
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.settings-item').remove();
    });
  });
}

async function saveSettingsChanges() {
  const items = [];
  document.querySelectorAll('#settingsList .settings-item').forEach(item => {
    const input = item.querySelector('input');
    if (input.value.trim()) {
      items.push({ name: input.value.trim() });
    }
  });

  switch (currentSettingsTab) {
    case 'zones':
      settings.zones = items;
      break;
    case 'fittingRooms':
      settings.fittingRooms = items;
      break;
    case 'shifts':
      settings.shifts = items;
      break;
    case 'sections':
      settings.closingSections = items;
      break;
  }

  try {
    await fetch('/api/gameplan/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    showNotification('Settings saved successfully!');
  } catch (error) {
    showNotification('Error saving settings', 'error');
  }
}

// Utility
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Event Listeners
function setupEventListeners() {
  // Refresh data button
  document.getElementById('refreshDataBtn')?.addEventListener('click', refreshAllData);

  // User dropdown
  const userMenu = document.getElementById('userMenu');
  const userDropdown = document.getElementById('userDropdown');
  if (userMenu && userDropdown) {
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      userDropdown.classList.remove('active');
    });
  }

  const toggleSection = (btnId, contentId) => {
    const btn = document.getElementById(btnId);
    const content = document.getElementById(contentId);
    if (!btn || !content) return;

    // Preserve original display type so we can restore correctly (grid/flex/etc).
    if (!content.dataset.defaultDisplay) {
      const computed = window.getComputedStyle(content).display;
      content.dataset.defaultDisplay = (computed && computed !== 'none') ? computed : 'block';
    }

    const isHidden = window.getComputedStyle(content).display === 'none';
    content.style.display = isHidden ? content.dataset.defaultDisplay : 'none';
    btn.textContent = isHidden ? 'Hide' : 'Show';
  };

  document.getElementById('toggleMetrics')?.addEventListener('click', () => toggleSection('toggleMetrics', 'metricsContent'));
  document.getElementById('toggleLooker')?.addEventListener('click', () => toggleSection('toggleLooker', 'lookerContainer'));
  document.getElementById('toggleOperations')?.addEventListener('click', () => toggleSection('toggleOperations', 'operationsContent'));

  // Collapse Management section
  document.getElementById('collapseMgmt')?.addEventListener('click', () => {
    const section = document.getElementById('managementSection');
    if (section) section.classList.toggle('collapsed');
  });

  // Expand via section title click (replaces "Show All" buttons).
  document.querySelector('#saSection .section-header h2')?.addEventListener('click', () => {
    showAllEmployees.SA = !showAllEmployees.SA;
    renderSASection();
  });
  document.querySelector('#bohSection .section-header h2')?.addEventListener('click', () => {
    showAllEmployees.BOH = !showAllEmployees.BOH;
    renderBOHSection();
  });
  document.querySelector('#managementSection .section-header h2')?.addEventListener('click', () => {
    showAllEmployees.MANAGEMENT = !showAllEmployees.MANAGEMENT;
    renderManagementSection();
  });
  document.querySelector('#tailorsSection .section-header h2')?.addEventListener('click', () => {
    showAllEmployees.TAILOR = !showAllEmployees.TAILOR;
    renderTailorsSection();
  });

  // Modal
  document.getElementById('closeModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelEdit')?.addEventListener('click', closeModal);
  document.getElementById('saveEdit')?.addEventListener('click', saveModalChanges);
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeModal();
  });

  // Notes editor - supports both sidebar (notesEditor) and inline (notesEditorInline)
  let saveTimeout;
  const notesEditor = document.getElementById('notesEditor') || document.getElementById('notesEditorInline');
  const notesStatus = document.getElementById('notesStatus') || document.getElementById('notesStatusInline');
  
  notesEditor?.addEventListener('input', () => {
    if (notesStatus) notesStatus.textContent = 'Saving...';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveGameplan, 1000);
  });

  // Notes toolbar - supports both sidebar and inline
  document.querySelectorAll('.notes-toolbar button[data-cmd], .notes-toolbar-inline button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      (notesEditor)?.focus();
    });
  });

  // Font size selector - supports both
  const fontSizeSelect = document.getElementById('fontSizeSelect') || document.getElementById('fontSizeSelectInline');
  fontSizeSelect?.addEventListener('change', (e) => {
    document.execCommand('fontSize', false, e.target.value);
    (notesEditor)?.focus();
  });

  // Emoji picker - supports both
  const emojiBtn = document.getElementById('emojiBtn') || document.getElementById('emojiBtnInline');
  const emojiPicker = document.getElementById('emojiPicker');

  emojiBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.getElementById('settingsModal')?.classList?.contains('active')) return;
    if (document.getElementById('metricsModal')?.classList?.contains('active')) return;
    if (document.getElementById('loansModal')?.classList?.contains('active')) return;
    const rect = emojiBtn.getBoundingClientRect();
    if (emojiPicker) {
      emojiPicker.style.top = `${rect.bottom + 5}px`;
      emojiPicker.style.right = `${window.innerWidth - rect.right}px`;
      emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
    }
  });

  document.querySelectorAll('.emoji-grid span').forEach(emoji => {
    emoji.addEventListener('click', () => {
      (notesEditor)?.focus();
      document.execCommand('insertText', false, emoji.textContent);
      if (emojiPicker) emojiPicker.style.display = 'none';
    });
  });

  document.addEventListener('click', () => {
    if (emojiPicker) emojiPicker.style.display = 'none';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTopLayer();
  });

  // Manager actions
  document.getElementById('publishBtn')?.addEventListener('click', publishGameplan);
  document.getElementById('editMetricsBtn')?.addEventListener('click', openMetricsEditor);
  document.getElementById('manageSettingsBtn')?.addEventListener('click', openSettingsModal);

  // Metrics modal
  document.getElementById('closeMetrics')?.addEventListener('click', () => {
    closeOverlay('metricsModal');
  });
  document.getElementById('cancelMetrics')?.addEventListener('click', () => {
    closeOverlay('metricsModal');
  });
  document.getElementById('saveMetrics')?.addEventListener('click', saveMetricsChanges);

  // Settings modal
  document.getElementById('closeSettings')?.addEventListener('click', () => {
    closeOverlay('settingsModal');
  });
  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
    closeOverlay('settingsModal');
  });
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettingsChanges);

  // Close modals on backdrop click (only if the overlay itself is clicked)
  ['settingsModal', 'metricsModal', 'loansModal'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.target?.id === id) closeOverlay(id);
    });
  });

  // Settings tabs
  document.querySelectorAll('.settings-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => renderSettingsTab(tab.dataset.tab));
  });
}
