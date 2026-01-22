let currentUser = null;
let employees = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
let metrics = {};
let tomato = null;

function getInitials(name) {
  return (name || '')
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatNumberOrDash(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(digits);
}

function renderLeaderboardRow({ rank, name, imageUrl, primary, secondary }) {
  const photoHtml = imageUrl
    ? `<img src="${imageUrl}" alt="${name}" class="employee-photo" style="width:40px;height:40px;">`
    : `<div class="employee-photo placeholder" style="width:40px;height:40px;">${getInitials(name)}</div>`;

  return `
    <div class="best-seller-item">
      <div class="best-seller-rank">${rank}</div>
      ${photoHtml}
      <div class="best-seller-info">
        <div class="best-seller-code">${name}</div>
        <div class="best-seller-desc">${secondary || ''}</div>
      </div>
      <div class="best-seller-value">${primary}</div>
    </div>
  `;
}

async function checkAuth() {
  try {
    const resp = await fetch('/api/auth/check', { credentials: 'include' });
    const data = await resp.json();
    if (data?.authenticated) {
      currentUser = data.user;
      return true;
    }
  } catch (_) {}
  window.location.href = '/login';
  return false;
}

async function loadEmployees() {
  const resp = await fetch('/api/gameplan/employees', { credentials: 'include' });
  const data = await resp.json();
  employees = data.employees || employees;
}

async function loadMetrics() {
  const resp = await fetch('/api/gameplan/metrics', { credentials: 'include' });
  metrics = await resp.json();
}

async function loadTomatoAwards() {
  const resp = await fetch('/api/awards/tomato', { credentials: 'include' });
  tomato = resp.ok ? await resp.json() : null;
  
  // Also load missed daily scans data
  try {
    const missedResp = await fetch('/api/gameplan/daily-scan/missed?days=365', { credentials: 'include' });
    if (missedResp.ok) {
      const missedData = await missedResp.json();
      if (!tomato) tomato = {};
      tomato.missedScans = missedData;
    }
  } catch (error) {
    console.error('Error loading missed scans:', error);
  }
}

function renderTopSales() {
  const list = document.getElementById('topSalesList');
  if (!list) return;

  const sa = (employees.SA || []).filter(e => (e.metrics?.salesAmount || 0) > 0);
  const sorted = sa
    .slice()
    .sort((a, b) => (b.metrics?.salesAmount || 0) - (a.metrics?.salesAmount || 0))
    .slice(0, 5);

  if (!sorted.length) {
    list.innerHTML = '<div class="best-seller-placeholder">No sales data available</div>';
    return;
  }

  list.innerHTML = sorted
    .map((emp, idx) =>
      renderLeaderboardRow({
        rank: idx + 1,
        name: emp.name || 'Unknown',
        imageUrl: emp.imageUrl,
        primary: formatUsd(emp.metrics?.salesAmount || 0),
        secondary: `IPC ${formatNumberOrDash(emp.metrics?.ipc)} • APC ${formatUsd(emp.metrics?.apc || 0)}`
      })
    )
    .join('');
}

function renderTopScan() {
  const list = document.getElementById('topScanList');
  if (!list) return;

  const scan = metrics.employeeCountPerformance?.employees || [];
  if (!Array.isArray(scan) || scan.length === 0) {
    list.innerHTML = '<div class="best-seller-placeholder">No scan data available</div>';
    return;
  }

  // Match photos from employee roster when possible.
  const allEmployees = []
    .concat(employees.SA || [])
    .concat(employees.BOH || [])
    .concat(employees.MANAGEMENT || [])
    .concat(employees.TAILOR || []);

  const sorted = scan
    .slice()
    .sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0))
    .slice(0, 5);

  list.innerHTML = sorted
    .map((emp, idx) => {
      const matched = allEmployees.find(e =>
        (e.name || '').toLowerCase() === (emp.name || '').toLowerCase() ||
        (e.employeeId || '').toString() === (emp.employeeId || '').toString()
      );
      const photo = matched?.imageUrl || emp.imageUrl || '';
      return renderLeaderboardRow({
        rank: idx + 1,
        name: emp.name || 'Unknown',
        imageUrl: photo,
        primary: `${formatNumberOrDash(emp.accuracy, 1)}%`,
        secondary: `${emp.countsDone || 0} scans • ${emp.missedReserved || 0} missed`
      });
    })
    .join('');
}

function renderTopTailor() {
  const list = document.getElementById('topTailorList');
  if (!list) return;

  const tailors = (employees.TAILOR || []).filter(t => Number.isFinite(Number(t.productivity)));
  const sorted = tailors
    .slice()
    .sort((a, b) => (b.productivity || 0) - (a.productivity || 0))
    .slice(0, 5);

  if (!sorted.length) {
    list.innerHTML = '<div class="best-seller-placeholder">No tailor data available</div>';
    return;
  }

  list.innerHTML = sorted
    .map((t, idx) =>
      renderLeaderboardRow({
        rank: idx + 1,
        name: t.name || 'Unknown',
        imageUrl: t.imageUrl,
        primary: `${t.productivity || 0}%`,
        secondary: 'YTD Productivity'
      })
    )
    .join('');
}

function renderTopBoh() {
  const list = document.getElementById('topBohList');
  if (!list) return;

  const boh = (employees.BOH || []).filter(b => Number.isFinite(Number(b.metrics?.inventoryAccuracy)));
  const sorted = boh
    .slice()
    .sort((a, b) => (b.metrics?.inventoryAccuracy || 0) - (a.metrics?.inventoryAccuracy || 0))
    .slice(0, 5);

  if (!sorted.length) {
    list.innerHTML = '<div class="best-seller-placeholder">No BOH data available</div>';
    return;
  }

  list.innerHTML = sorted
    .map((b, idx) =>
      renderLeaderboardRow({
        rank: idx + 1,
        name: b.name || 'Unknown',
        imageUrl: b.imageUrl,
        primary: `${formatNumberOrDash(b.metrics?.inventoryAccuracy, 1)}%`,
        secondary: `${b.metrics?.storeCountsCompleted || 0} counts completed`
      })
    )
    .join('');
}

function renderTomatoLists() {
  const lostPunchEl = document.getElementById('tomatoLostPunchList');
  const closingMissedEl = document.getElementById('tomatoClosingMissedList');
  const missedScansEl = document.getElementById('tomatoMissedScans');
  const lowestCompletionEl = document.getElementById('tomatoLowestCompletion');

  const windowLabel = tomato?.windowDays ? ` (last ${tomato.windowDays} days)` : '';
  const sinceLabel = tomato?.startDate ? ` (since ${tomato.startDate})` : '';
  const label = sinceLabel || windowLabel;

  if (lostPunchEl) {
    const items = Array.isArray(tomato?.lostPunch) ? tomato.lostPunch : [];
    lostPunchEl.innerHTML = items.length
      ? items
          .map((row, idx) =>
            renderLeaderboardRow({
              rank: idx + 1,
              name: row.name || 'Unknown',
              imageUrl: row.imageUrl,
              primary: `${row.count || 0}`,
              secondary: `submissions${label}`
            })
          )
          .join('')
      : `<div class="best-seller-placeholder">No lost punch data${label}</div>`;
  }

  if (closingMissedEl) {
    const items = Array.isArray(tomato?.closingMissed) ? tomato.closingMissed : [];
    closingMissedEl.innerHTML = items.length
      ? items
          .map((row, idx) =>
            renderLeaderboardRow({
              rank: idx + 1,
              name: row.name || 'Unknown',
              imageUrl: row.imageUrl,
              primary: `${row.count || 0}`,
              secondary: `missed duties${label}`
            })
          )
          .join('')
      : `<div class="best-seller-placeholder">No closing duty misses${label}</div>`;
  }

  // Render Missed Daily Scans
  if (missedScansEl) {
    const items = Array.isArray(tomato?.missedScans) ? tomato.missedScans : [];
    const sorted = items
      .filter(item => item.missed_count > 0)
      .sort((a, b) => b.missed_count - a.missed_count)
      .slice(0, 5);

    missedScansEl.innerHTML = sorted.length
      ? sorted
          .map((row, idx) => {
            const name = getEmployeeNameFromEmail(row.scheduled_employee);
            return renderLeaderboardRow({
              rank: idx + 1,
              name: name,
              imageUrl: null,
              primary: `${row.missed_count || 0}`,
              secondary: `missed scans (YTD)`
            });
          })
          .join('')
      : `<div class="best-seller-placeholder">No missed scans (YTD)</div>`;
  }

  // Render Lowest Completion Rate
  if (lowestCompletionEl) {
    const items = Array.isArray(tomato?.missedScans) ? tomato.missedScans : [];
    const sorted = items
      .filter(item => item.total_assigned > 0)
      .sort((a, b) => parseFloat(a.completion_rate || 0) - parseFloat(b.completion_rate || 0))
      .slice(0, 5);

    lowestCompletionEl.innerHTML = sorted.length
      ? sorted
          .map((row, idx) => {
            const name = getEmployeeNameFromEmail(row.scheduled_employee);
            const rate = parseFloat(row.completion_rate || 0).toFixed(1);
            return renderLeaderboardRow({
              rank: idx + 1,
              name: name,
              imageUrl: null,
              primary: `${rate}%`,
              secondary: `${row.executed_count}/${row.total_assigned} completed`
            });
          })
          .join('')
      : `<div class="best-seller-placeholder">No completion data (YTD)</div>`;
  }
}

// Helper to get employee name from email
function getEmployeeNameFromEmail(email) {
  if (!email) return 'Unknown';
  
  // Search in all employee categories
  const allEmployees = [
    ...(employees.SA || []),
    ...(employees.BOH || []),
    ...(employees.MANAGEMENT || []),
    ...(employees.TAILOR || [])
  ];
  
  const found = allEmployees.find(emp => 
    (emp.id && emp.id.toLowerCase() === email.toLowerCase()) ||
    (emp.employeeId && emp.employeeId.toLowerCase() === email.toLowerCase())
  );
  
  if (found && found.name) {
    return found.name.split(' ')[0]; // Return first name only
  }
  
  // Fallback to email prefix
  if (email.includes('@')) {
    const prefix = email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  
  return email;
}

function renderSalesTable() {
  const tbody = document.getElementById('salesLeaderboardBody');
  if (!tbody) return;

  const sa = (employees.SA || []).slice().sort((a, b) => (b.metrics?.salesAmount || 0) - (a.metrics?.salesAmount || 0));
  tbody.innerHTML = sa
    .map(emp => {
      const name = emp.name || 'Unknown';
      const sales = formatUsd(emp.metrics?.salesAmount || 0);
      const ipc = formatNumberOrDash(emp.metrics?.ipc);
      const apc = formatUsd(emp.metrics?.apc || 0);
      const sph = formatNumberOrDash(emp.metrics?.sph, 0);
      return `<tr><td>${name}</td><td>${sales}</td><td>${ipc}</td><td>${apc}</td><td>${sph}</td></tr>`;
    })
    .join('');
}

function renderUpdatedAt() {
  const el = document.getElementById('awardsUpdatedAt');
  if (!el) return;
  const lookerTime = metrics?.lastEmailReceived || metrics?.lastSyncTime || metrics?.importedAt || null;
  const scanFrom = metrics?.scanPerformanceFromDate || null;

  if (!lookerTime) {
    el.textContent = 'Updated: --';
    return;
  }

  const d = new Date(lookerTime);
  const lookerStr = d.toLocaleString('en-US');
  if (scanFrom) {
    el.textContent = `Updated (Looker): ${lookerStr} • Scan data: ${scanFrom}`;
  } else {
    el.textContent = `Updated: ${lookerStr}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (!authed) return;

  await Promise.all([loadEmployees(), loadMetrics(), loadTomatoAwards()]);

  renderUpdatedAt();
  renderTopSales();
  renderTopScan();
  renderTopTailor();
  renderTopBoh();
  renderTomatoLists();
});
