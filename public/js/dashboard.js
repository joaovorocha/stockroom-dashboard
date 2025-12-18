// Dashboard JavaScript
let currentUser = null;
let employees = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
let metrics = {};
let settings = {};
let gameplanData = { notes: '', assignments: {}, published: false };
let loansData = [];
let currentEditEmployee = null;
let showAllEmployees = { SA: false, BOH: false, MANAGEMENT: false, TAILOR: false };
let currentSettingsTab = 'zones';
let sseConnection = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setCurrentDate();
  await Promise.all([
    loadEmployees(),
    loadMetrics(),
    loadSettings(),
    loadGameplan(),
    loadLoansData(),
    loadPendingShipments()
  ]);
  renderAll();
  setupWelcomeSection();
  setupNotesPermissions();
  setupEventListeners();
  setupSSEConnection(); // Real-time updates
  updateLastSyncTime();
});

// ===== Server-Sent Events for Real-Time Updates =====
function setupSSEConnection() {
  // Close existing connection if any
  if (sseConnection) {
    sseConnection.close();
  }

  sseConnection = new EventSource('/api/sse/updates');

  sseConnection.onopen = () => {
    console.log('SSE connection established');
    updateConnectionStatus(true);
  };

  sseConnection.onmessage = (event) => {
    try {
      const update = JSON.parse(event.data);
      handleSSEUpdate(update);
    } catch (e) {
      console.error('Error parsing SSE message:', e);
    }
  };

  sseConnection.onerror = (error) => {
    console.error('SSE connection error:', error);
    updateConnectionStatus(false);
    // Try to reconnect after 5 seconds
    setTimeout(setupSSEConnection, 5000);
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
      // Only reload if another user made changes
      if (update.data?.lastEditedBy && update.data.lastEditedBy !== currentUser?.name) {
        showNotification(`Game Plan updated by ${update.data.lastEditedBy}`);
        // Reload gameplan data
        loadGameplan().then(() => renderAll());
      }
      break;
    
    case 'metrics_updated':
      loadMetrics().then(() => renderAll());
      showNotification('Metrics updated from Looker');
      break;
    
    case 'employee_updated':
      loadEmployees().then(() => renderAll());
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
      window.location.href = '/login-v2';
      return;
    }

    currentUser = data.user;
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (currentUser.imageUrl) {
      const avatarEl = document.getElementById('userAvatar');
      if (avatarEl) avatarEl.src = currentUser.imageUrl;
    }

    // Show manager/admin features
    if (currentUser.isManager || currentUser.isAdmin) {
      const managerActions = document.getElementById('managerActions');
      const adminLink = document.getElementById('adminLink') || document.getElementById('navAdmin');
      if (managerActions) managerActions.style.display = 'block';
      if (adminLink) adminLink.style.display = 'inline';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login-v2';
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
    const response = await fetch('/api/gameplan/employees');
    const data = await response.json();
    employees = data.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
    
    // Deduplicate employees by ID within each type
    for (const type of Object.keys(employees)) {
      const seen = new Set();
      employees[type] = employees[type].filter(emp => {
        if (seen.has(emp.id)) {
          return false;
        }
        seen.add(emp.id);
        return true;
      });
    }
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}

async function loadMetrics() {
  try {
    console.log('[DEBUG] Loading metrics...');
    const response = await fetch('/api/gameplan/metrics');
    metrics = await response.json();
    console.log('[DEBUG] Metrics loaded:', metrics);
    updateLastUpdated(metrics.importedAt);
    
    // Update import status card (both welcome section and sidebar)
    const lastLookerSyncEl = document.getElementById('lastLookerSync');
    const sidebarLastSyncEl = document.getElementById('sidebarLastSync');
    const recordsImportedEl = document.getElementById('recordsImported');
    // Prefer lastEmailReceived (actual email time) over importedAt (processing time)
    const syncTimestamp = metrics.lastEmailReceived || metrics.importedAt;
    if (syncTimestamp) {
      const syncDate = new Date(syncTimestamp);
      const formattedDate = syncDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      if (lastLookerSyncEl) lastLookerSyncEl.textContent = formattedDate;
      if (sidebarLastSyncEl) sidebarLastSyncEl.textContent = formattedDate;
    }
    if (recordsImportedEl) {
      // Count total records from various data sources
      let totalRecords = 0;
      if (metrics.wtd) totalRecords++;
      if (metrics.operationsHealth) totalRecords += Object.keys(metrics.operationsHealth).length;
      if (metrics.inventoryIssues) totalRecords += Object.keys(metrics.inventoryIssues).length;
      if (metrics.employeeCountPerformance?.employees?.length) totalRecords += metrics.employeeCountPerformance.employees.length;
      recordsImportedEl.textContent = totalRecords > 0 ? `${totalRecords} metrics` : '--';
    }
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/gameplan/settings');
    settings = await response.json();
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = { zones: [], shifts: [], closingSections: [], fittingRooms: [] };
  }
}

async function loadGameplan() {
  try {
    // Check for date parameter in URL, fallback to today
    const params = new URLSearchParams(window.location.search);
    let clientDate = params.get('date');
    
    if (!clientDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      clientDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    
    const response = await fetch(`/api/gameplan/date/${clientDate}`);
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

      // Check if published - show banner at TOP if not published
      const statusBanner = document.getElementById('statusBanner');
      if (statusBanner) {
        if (!gameplanData.published) {
          statusBanner.style.display = 'flex';
        } else {
          statusBanner.style.display = 'none';
        }
      }

      // Merge assignments
      if (gameplanData.assignments) {
        mergeAssignments(gameplanData.assignments);
      }
    }
  } catch (error) {
    console.error('Error loading gameplan:', error);
  }
}

async function loadLoansData() {
  try {
    const response = await fetch('/api/gameplan/loans');
    if (response.ok) {
      loansData = await response.json();
      checkLoansOverdue();
    }
  } catch (error) {
    console.error('Error loading loans:', error);
  }
}

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
    console.error('Error loading shipments:', error);
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
  refreshBtn.disabled = true;
  refreshBtn.textContent = '↻ Refreshing...';

  try {
    await Promise.all([
      loadEmployees(),
      loadMetrics(),
      loadSettings(),
      loadGameplan(),
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
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh Data';
  }
}

function mergeAssignments(assignments) {
  Object.keys(assignments).forEach(id => {
    const assignment = assignments[id];
    for (const type of Object.keys(employees)) {
      const emp = employees[type].find(e => e.id === id);
      if (emp) {
        Object.assign(emp, assignment);
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

function showLoansModal() {
  const modalBody = document.getElementById('loansModalBody');

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

  document.getElementById('loansModal').classList.add('active');

  // Add close button listener
  document.getElementById('closeLoans').onclick = () => {
    document.getElementById('loansModal').classList.remove('active');
  };
}

// Setup Welcome Section
function setupWelcomeSection() {
  if (!currentUser) return;

  document.getElementById('welcomeName').textContent = currentUser.name.split(' ')[0];
  document.getElementById('welcomeRole').textContent = getRoleName(currentUser.role);

  // Find current user's employee data first (to get their photo)
  let userEmployee = null;
  for (const type of Object.keys(employees)) {
    userEmployee = employees[type].find(e =>
      e.name?.toLowerCase() === currentUser.name?.toLowerCase() ||
      e.id === currentUser.employeeId
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
  const dataImportBox = document.getElementById('dataImportBox');
  const storeInfoEl = document.getElementById('welcomeStoreInfo');

  if (userEmployee) {
    // Don't show duplicate assignment info - it's in expandable boxes
    let detailsHtml = '';

    switch (userEmployee.type) {
      case 'SA':
        // Show Data Import status for SA (and hide sidebar duplicate)
        if (dataImportBox) {
          dataImportBox.style.display = 'flex';
          const lastSync = document.getElementById('lastLookerSync');
          const sidebarCard = document.getElementById('importStatusCard');
          if (sidebarCard) sidebarCard.style.display = 'none';
          // Prefer lastEmailReceived (actual email time) over importedAt (processing time)
          const syncTimestamp = metrics?.lastEmailReceived || metrics?.importedAt;
          if (lastSync && syncTimestamp) {
            const syncDate = new Date(syncTimestamp);
            lastSync.textContent = syncDate.toLocaleString('en-US', { 
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
            });
          }
        }

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
          document.getElementById('kpiTarget').textContent = userEmployee.individualTarget
            ? '$' + Number(userEmployee.individualTarget).toLocaleString()
            : '--';
        }

        // For SA, all metrics are shown in the KPI row, so no need to add to detailsHtml
        // Store info/notes preview will be shown separately
        storeInfoEl.style.display = 'block';
        
        // Setup lunch timeline for SA
        setupLunchTimeline(userEmployee);
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
        if (userEmployee.productivity) {
          detailsHtml += `<div class="assignment-item"><span class="label">YTD Productivity:</span> <span class="value ${userEmployee.productivity >= 100 ? 'positive' : 'negative'}">${userEmployee.productivity}%</span></div>`;
        }
        storeInfoEl.style.display = 'block';
        break;
    }

    if (detailsHtml) {
      detailsEl.innerHTML = `<div class="welcome-assignments">${detailsHtml}</div>`;
    } else {
      detailsEl.innerHTML = '';
    }

    // Setup expandable boxes for SA
    if (userEmployee && userEmployee.type === 'SA') {
      setupExpandableBoxes(userEmployee);
    }
  } else {
    detailsEl.innerHTML = '<p class="no-assignments">No assignments for today yet.</p>';
  }
}

// Setup Lunch Timeline - shows all SAs and their lunch times
function setupLunchTimeline(currentEmployee) {
  const timelineSection = document.getElementById('lunchTimelineSection');
  const timeline = document.getElementById('lunchTimeline');
  const myLunchTimeEl = document.getElementById('myLunchTime');
  
  if (!timelineSection || !timeline) return;
  
  // Get all employees with lunch times (scheduledLunch preferred, fall back to lunch)
  const allSAs = employees.SA || [];
  const employeesWithLunch = allSAs
    .map(e => ({ ...e, lunchTime: e.scheduledLunch || e.lunch }))
    .filter(e => e.lunchTime);
  
  if (employeesWithLunch.length === 0) {
    timelineSection.style.display = 'none';
    return;
  }
  
  timelineSection.style.display = 'block';
  
  // Show my lunch time
  const myLunch = currentEmployee.scheduledLunch || currentEmployee.lunch;
  if (myLunchTimeEl && myLunch) {
    myLunchTimeEl.textContent = `Your lunch: ${myLunch}`;
  }
  
  // Timeline from 11:00 to 16:00 (typical lunch range)
  const startHour = 11;
  const endHour = 16;
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
  let barsHtml = '<div class="timeline-bars">';
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];
  let row = 0;
  
  employeesWithLunch.forEach((emp, idx) => {
    const lunchTime = emp.lunchTime;
    const [hours, minutes] = lunchTime.split(':').map(Number);
    const lunchMinutes = (hours - startHour) * 60 + minutes;
    const leftPercent = (lunchMinutes / totalMinutes) * 100;
    const width = (30 / totalMinutes) * 100; // 30 min lunch
    
    const isMyLunch = emp.id === currentEmployee.id;
    const firstName = emp.name.split(' ')[0];
    const topOffset = (idx % 2) * 28 + 4; // Alternate rows
    
    barsHtml += `<div class="lunch-bar${isMyLunch ? ' my-lunch' : ''}" 
      style="left: ${Math.max(0, Math.min(leftPercent, 95))}%; width: ${width}%; top: ${topOffset}px; background: ${isMyLunch ? '#22c55e' : colors[idx % colors.length]};"
      title="${emp.name} - ${lunchTime}">
      ${firstName}
    </div>`;
  });
  
  barsHtml += '</div>';
  
  timeline.innerHTML = scaleHtml + barsHtml;
}

// Setup Expandable Boxes (Fitting Room, Zone, Closing Duties)
function setupExpandableBoxes(userEmployee) {
  const expandableEl = document.getElementById('expandableAssignments');
  if (!expandableEl) return;

  expandableEl.style.display = 'flex';

  // My values
  document.getElementById('myFittingRoom').textContent = userEmployee.fittingRoom || 'Not assigned';
  document.getElementById('myZone').textContent = userEmployee.zone || 'Not assigned';
  
  const myClosingDuties = userEmployee.closingSections && userEmployee.closingSections.length > 0
    ? userEmployee.closingSections.join(', ')
    : 'None assigned';
  document.getElementById('myClosingDuties').textContent = myClosingDuties;

  // Build lists for all assignments
  buildFittingRoomList(userEmployee);
  buildZoneList(userEmployee);
  buildClosingDutiesList(userEmployee);
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
    if (sa.zone) {
      if (!zoneAssignments[sa.zone]) zoneAssignments[sa.zone] = [];
      zoneAssignments[sa.zone].push(sa.name);
    }
  });

  let html = '';
  allZones.forEach(z => {
    const assignees = zoneAssignments[z.name] || [];
    const isMine = userEmployee.zone === z.name;
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

  const allClosingSections = settings.closingSections || [];
  const allSAs = employees.SA || [];

  // Map of closing section -> assigned employees
  const closingAssignments = {};
  allSAs.forEach(sa => {
    if (sa.closingSections && sa.closingSections.length > 0) {
      sa.closingSections.forEach(section => {
        if (!closingAssignments[section]) closingAssignments[section] = [];
        closingAssignments[section].push(sa.name);
      });
    }
  });

  const myClosingSections = userEmployee.closingSections || [];

  let html = '';
  allClosingSections.forEach(cs => {
    const assignees = closingAssignments[cs.name] || [];
    const isMine = myClosingSections.includes(cs.name);
    const isAvailable = assignees.length === 0;

    let itemClass = 'expandable-list-item';
    if (isMine) itemClass += ' mine';
    else if (isAvailable) itemClass += ' available';

    const assigneeText = isMine 
      ? `You${assignees.length > 1 ? ` + ${assignees.length - 1} others` : ''}`
      : (assignees.length > 0 ? assignees.join(', ') : 'Available');

    html += `
      <div class="${itemClass}">
        <span class="item-name">${cs.name}</span>
        <span class="item-assignee">${assigneeText}</span>
      </div>
    `;
  });

  listEl.innerHTML = html || '<div class="expandable-list-item">No closing sections configured</div>';
}

// Toggle expandable box
function toggleExpandable(type) {
  const contentEl = document.getElementById(`${type}Content`);
  const arrowEl = document.getElementById(`${type}Arrow`);
  
  if (contentEl.style.display === 'none') {
    contentEl.style.display = 'block';
    arrowEl.classList.add('expanded');
  } else {
    contentEl.style.display = 'none';
    arrowEl.classList.remove('expanded');
  }
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

  const mgmtArray = employees.MANAGEMENT || [];
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
  const bohWorking = bohArray.filter(e => e.shift || e.taskOfTheDay);

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
  mgmtArray.filter(e => e.shift && !shownIds.has(e.id) && e.role !== 'Off').forEach(mgr => {
    const roleLabel = mgr.shift?.includes('Open') ? 'Opening' : 
                      mgr.shift?.includes('Close') ? 'Closing' : 'Manager';
    grid.appendChild(createManagementQuickCard(mgr, roleLabel, ''));
    shownIds.add(mgr.id);
  });

  // Add BOH employees
  bohWorking.forEach(boh => {
    grid.appendChild(createManagementQuickCard(boh, 'BOH', 'boh-card'));
  });
}

function createManagementQuickCard(emp, roleLabel, extraClass) {
  const card = document.createElement('div');
  card.className = `management-quick-card ${extraClass}`.trim();

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}">`
    : getInitials(emp.name);

  const timeInfo = emp.shift || '';

  card.innerHTML = `
    <div class="card-icon">${emp.imageUrl ? `<img src="${emp.imageUrl}" alt="${emp.name}">` : getInitials(emp.name)}</div>
    <div class="card-content">
      <div class="card-role">${roleLabel}</div>
      <div class="card-name">${emp.name}</div>
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

// Render functions
function renderAll() {
  updateMetricsDisplay();
  updateWorkingToday();
  renderManagementQuickSection();
  updateNotesPreview();
  renderSASection();
  renderBOHSection();
  renderManagementSection();
  renderTailorsSection();
  
  // New sections
  renderOperationsHealth();
  renderInventoryIssues();
  renderCustomerOrders();
  renderCountLeaderboard();
  renderTailorTrend();
  renderAppointmentsWidget();
  renderBestSellers();
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

  document.getElementById('wtdSales').textContent = formatCurrency(metrics.wtd.salesAmount);
  const wtdChange = document.getElementById('wtdChange');
  wtdChange.textContent = `${metrics.wtd.salesVsPY >= 0 ? '+' : ''}${metrics.wtd.salesVsPY}% vs PY`;
  wtdChange.className = `metric-change ${metrics.wtd.salesVsPY >= 0 ? 'positive' : 'negative'}`;

  document.getElementById('targetAmount').textContent = formatCurrency(metrics.wtd.target);
  const vsTarget = document.getElementById('vsTarget');
  vsTarget.textContent = `${metrics.wtd.vsTarget}% vs Target`;
  vsTarget.className = `metric-change ${metrics.wtd.vsTarget >= 0 ? 'positive' : 'negative'}`;

  if (metrics.metrics) {
    document.getElementById('sph').textContent = `$${metrics.metrics.salesPerHour}`;
    const sphChange = document.getElementById('sphChange');
    sphChange.textContent = `${metrics.metrics.sphVsPY}% vs PY`;
    sphChange.className = `metric-change ${metrics.metrics.sphVsPY >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('ipc').textContent = metrics.metrics.itemsPerCustomer;
    const ipcChange = document.getElementById('ipcChange');
    ipcChange.textContent = `${metrics.metrics.ipcVsPY}% vs PY`;
    ipcChange.className = `metric-change ${metrics.metrics.ipcVsPY >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('dropoffs').textContent = `${metrics.metrics.dropOffs}%`;
  }

  if (metrics.lastWeekSales) {
    document.getElementById('formalPct').textContent = `${metrics.lastWeekSales.formal}%`;
    document.getElementById('casualPct').textContent = `${metrics.lastWeekSales.casual}%`;
    document.getElementById('tuxedoPct').textContent = `${metrics.lastWeekSales.tuxedo}%`;
  }
}

function formatCurrency(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount}`;
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function hasLoanOverdue(employeeName) {
  if (!loansData.overdue) return false;
  return loansData.overdue.some(l => l.employeeName === employeeName);
}

// Find employee matching current user
function findCurrentUserEmployee(type) {
  return employees[type]?.find(e =>
    e.name.toLowerCase() === currentUser?.name?.toLowerCase() ||
    e.id === currentUser?.employeeId
  );
}

// SA Section
function renderSASection() {
  const grid = document.getElementById('saGrid');
  const count = document.getElementById('saCount');
  const expandBtn = document.getElementById('expandSA');
  grid.innerHTML = '';
  count.textContent = employees.SA.length;

  const currentUserEmp = findCurrentUserEmployee('SA');
  let displayedEmployees = [...employees.SA];

  // If not manager and not showing all, show only current user's card first
  if (!showAllEmployees.SA && !currentUser?.isManager && !currentUser?.isAdmin) {
    if (currentUserEmp) {
      displayedEmployees = [currentUserEmp];
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = `Show All (${employees.SA.length})`;
    }
  } else {
    // Sort to show current user first
    if (currentUserEmp) {
      displayedEmployees = [currentUserEmp, ...employees.SA.filter(e => e.id !== currentUserEmp.id)];
    }
    if (employees.SA.length > 1) {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = 'Show Less';
    }
  }

  displayedEmployees.forEach(emp => {
    grid.appendChild(createSACard(emp, emp.id === currentUserEmp?.id));
  });
}

function createSACard(emp, isCurrentUser = false) {
  const card = document.createElement('div');
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  const loanWarning = hasLoanOverdue(emp.name)
    ? '<div class="loan-warning">Loan Overdue</div>'
    : '';

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
        <span class="field-label">Zone</span>
        <span class="field-value">${emp.zone || '-'}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Fitting Room</span>
        <span class="field-value">${emp.fittingRoom || '-'}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Target</span>
        <span class="field-value">${emp.individualTarget ? '$' + emp.individualTarget.toLocaleString() : '-'}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.scheduledLunch || '-'}</span>
      </div>
      <div class="card-field full-width">
        <span class="field-label">Closing Sections</span>
        <span class="field-value">${Array.isArray(emp.closingSections) ? emp.closingSections.join(', ') : emp.closingSections || '-'}</span>
      </div>
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
  count.textContent = employees.BOH.length;

  const currentUserEmp = findCurrentUserEmployee('BOH');
  let displayedEmployees = [...employees.BOH];

  if (!showAllEmployees.BOH && !currentUser?.isManager && !currentUser?.isAdmin) {
    if (currentUserEmp) {
      displayedEmployees = [currentUserEmp];
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = `Show All (${employees.BOH.length})`;
    }
  } else if (currentUserEmp) {
    displayedEmployees = [currentUserEmp, ...employees.BOH.filter(e => e.id !== currentUserEmp.id)];
    if (employees.BOH.length > 1) {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = 'Show Less';
    }
  }

  displayedEmployees.forEach(emp => {
    grid.appendChild(createBOHCard(emp, emp.id === currentUserEmp?.id));
  });
}

function createBOHCard(emp, isCurrentUser = false) {
  const card = document.createElement('div');
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

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
    ${emp.metrics && emp.metrics.inventoryAccuracy !== undefined ? `
    <div class="boh-metrics">
      <div class="boh-metric">
        <span class="value ${emp.metrics.inventoryAccuracy >= 99.5 ? 'positive' : emp.metrics.inventoryAccuracy >= 98 ? 'warning' : 'negative'}">${emp.metrics.inventoryAccuracy}%</span>
        <span class="label">Accuracy</span>
      </div>
      <div class="boh-metric">
        <span class="value">${emp.metrics.storeCountsCompleted || 0}</span>
        <span class="label">Counts</span>
      </div>
      <div class="boh-metric">
        <span class="value ${(emp.metrics.missedReserved || 0) === 0 ? 'positive' : 'negative'}">${emp.metrics.missedReserved || 0}</span>
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
  grid.innerHTML = '';

  // Filter scheduled (has shift or role) vs day off
  const scheduledMgmt = employees.MANAGEMENT.filter(e => e.shift || e.role);
  const dayOffMgmt = employees.MANAGEMENT.filter(e => !e.shift && !e.role);
  count.textContent = employees.MANAGEMENT.length;

  const currentUserEmp = findCurrentUserEmployee('MANAGEMENT');
  let displayedEmployees = [...scheduledMgmt];

  // Collapse if >3 and not expanded
  if (!showAllEmployees.MANAGEMENT && scheduledMgmt.length > 3) {
    displayedEmployees = scheduledMgmt.slice(0, 3);
    expandBtn.style.display = 'inline-block';
    expandBtn.textContent = `Show All (${scheduledMgmt.length})`;
  } else if (showAllEmployees.MANAGEMENT && scheduledMgmt.length > 3) {
    expandBtn.style.display = 'inline-block';
    expandBtn.textContent = 'Show Less';
  }

  // Render scheduled managers
  displayedEmployees.forEach(emp => {
    grid.appendChild(createManagementCard(emp, emp.id === currentUserEmp?.id, false));
  });

  // Render day off managers (collapsed)
  if (dayOffMgmt.length > 0 && showAllEmployees.MANAGEMENT) {
    dayOffMgmt.forEach(emp => {
      grid.appendChild(createManagementCard(emp, emp.id === currentUserEmp?.id, true));
    });
  }
}

function createManagementCard(emp, isCurrentUser = false, isDayOff = false) {
  const card = document.createElement('div');
  card.className = `employee-card${isCurrentUser ? ' current-user' : ''}${isDayOff ? ' day-off' : ''}`;

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  const loanWarning = hasLoanOverdue(emp.name)
    ? '<div class="loan-warning">Loan Overdue</div>'
    : '';

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
    card.innerHTML = `
      <div class="card-header">
        ${photoHtml}
        <div class="employee-info">
          <h4>${emp.name}</h4>
          <span class="role">${emp.role || 'Management'}</span>
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
      </div>
      ${loanWarning}
    `;
  }
  return card;
}

// Tailors Section - Collapsed by default, show Day Off for unscheduled
function renderTailorsSection() {
  const grid = document.getElementById('tailorGrid');
  const count = document.getElementById('tailorCount');
  const expandBtn = document.getElementById('expandTailors');
  grid.innerHTML = '';

  // Filter scheduled vs day off
  const scheduledTailors = employees.TAILOR.filter(e => e.station || e.lunch);
  const dayOffTailors = employees.TAILOR.filter(e => !e.station && !e.lunch);
  count.textContent = employees.TAILOR.length;

  const currentUserEmp = findCurrentUserEmployee('TAILOR');

  // Collapsed by default - show only scheduled, max 3
  if (!showAllEmployees.TAILOR) {
    const toShow = scheduledTailors.slice(0, 3);
    toShow.forEach(emp => {
      grid.appendChild(createTailorCard(emp, emp.id === currentUserEmp?.id, false));
    });
    if (employees.TAILOR.length > 3) {
      expandBtn.style.display = 'inline-block';
      expandBtn.textContent = `Show All (${employees.TAILOR.length})`;
    }
  } else {
    // Show all scheduled
    scheduledTailors.forEach(emp => {
      grid.appendChild(createTailorCard(emp, emp.id === currentUserEmp?.id, false));
    });
    // Show day off tailors
    dayOffTailors.forEach(emp => {
      grid.appendChild(createTailorCard(emp, emp.id === currentUserEmp?.id, true));
    });
    expandBtn.style.display = 'inline-block';
    expandBtn.textContent = 'Show Less';
  }
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
    const productivity = emp.productivity || 0;
    const productivityClass = productivity >= 100 ? 'positive' : productivity >= 80 ? 'warning' : 'negative';
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
}

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
      ? `<a href="https://mao.suitsupply.com/order/PSUS${psusMatch[1]}" target="_blank" class="psus-link" title="Open in MAO">PSUS${psusMatch[1]}</a>`
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

  countData.employees.forEach((emp, index) => {
    // Try to find the employee's photo from our employee data
    const matchedEmployee = allEmployees.find(e => 
      e.name?.toLowerCase() === emp.name?.toLowerCase() ||
      e.id === emp.employeeId
    );
    
    const photoUrl = matchedEmployee?.imageUrl || emp.imageUrl;
    const photoHtml = photoUrl 
      ? `<img src="${photoUrl}" alt="${emp.name}" class="employee-photo">` 
      : `<div class="employee-photo placeholder">${getInitials(emp.name || 'Unknown')}</div>`;
    
    const accuracyClass = emp.accuracy >= 99.5 ? 'good' : emp.accuracy >= 99 ? '' : 'bad';
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
            <strong>${emp.accuracy}%</strong> accuracy
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
  document.getElementById('ytdAvg2024').textContent = `${trendData.ytdAvg2024}%`;
  document.getElementById('ytdAvg2025').textContent = `${trendData.ytdAvg2025}%`;

  // Create chart
  const ctx = document.getElementById('tailorTrendChart');
  if (!ctx) return;

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
  console.log('[DEBUG] renderAppointmentsWidget called');
  // Fetch appointments data from API
  fetch('/api/gameplan/appointments')
    .then(res => res.json())
    .then(data => {
      console.log('[DEBUG] Appointments data:', data);
      if (data.success && data.data?.waitwhile?.currentWeek) {
        const appointments = data.data.waitwhile.currentWeek;
        
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
  console.log('[DEBUG] renderBestSellers called');
  // Fetch best sellers data
  fetch('/api/gameplan/best-sellers')
    .then(res => res.json())
    .then(data => {
      console.log('[DEBUG] Best sellers data:', data);
      if (data.success && data.data) {
        bestSellersData = data.data;
        renderBestSellersList();
      }
    })
    .catch(err => {
      console.error('Error loading best sellers:', err);
      const list = document.getElementById('bestSellersList');
      if (list) list.innerHTML = '<div class="best-seller-placeholder">Unable to load best sellers</div>';
    });

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
      ? `€${item.amount?.toLocaleString() || 0}`
      : `${item.quantity || 0} units`;

    return `
      <div class="best-seller-item">
        <div class="best-seller-rank">${index + 1}</div>
        <div class="best-seller-info">
          <div class="best-seller-code">${item.code || 'Unknown'}</div>
          <div class="best-seller-desc">${item.description || ''}</div>
        </div>
        <div class="best-seller-value">${value}</div>
      </div>
    `;
  }).join('');
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
  const zoneOptions = (settings.zones || []).map(z =>
    `<option value="${z.name}" ${emp.zone === z.name ? 'selected' : ''}>${z.name}</option>`
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
            <label>Zone</label>
            <select class="form-control" id="editZone"><option value="">Select...</option>${zoneOptions}</select>
          </div>
          <div class="form-group">
            <label>Fitting Room</label>
            <select class="form-control" id="editFittingRoom"><option value="">Select...</option>${frOptions}</select>
          </div>
        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>Individual Target ($)</label>
            <input type="number" class="form-control" id="editTarget" value="${emp.individualTarget || ''}">
          </div>
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
      emp.zone = document.getElementById('editZone')?.value || emp.zone;
      emp.fittingRoom = document.getElementById('editFittingRoom')?.value || emp.fittingRoom;
      emp.individualTarget = parseInt(document.getElementById('editTarget')?.value) || emp.individualTarget;
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
  gameplanData.date = new Date().toISOString().split('T')[0];
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

  document.getElementById('metricsModal').classList.add('active');
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
  document.getElementById('settingsModal').classList.add('active');
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

  // Switch user link (id is switchUserBtn in HTML)
  document.getElementById('switchUserBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login-v2';
  });

  // Toggle metrics
  document.getElementById('toggleMetrics')?.addEventListener('click', () => {
    const content = document.getElementById('metricsContent');
    const btn = document.getElementById('toggleMetrics');
    if (content) content.style.display = content.style.display === 'none' ? 'block' : 'none';
    if (btn) btn.textContent = content?.style.display === 'none' ? 'Show' : 'Hide';
  });

  // Toggle Looker
  document.getElementById('toggleLooker')?.addEventListener('click', () => {
    const container = document.getElementById('lookerContainer');
    const btn = document.getElementById('toggleLooker');
    if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (btn) btn.textContent = container?.style.display === 'none' ? 'Show' : 'Hide';
  });

  // Toggle consolidated Operations Dashboard
  document.getElementById('toggleOperations')?.addEventListener('click', () => {
    const content = document.getElementById('operationsContent');
    const btn = document.getElementById('toggleOperations');
    if (content) content.style.display = content.style.display === 'none' ? 'block' : 'none';
    if (btn) btn.textContent = content?.style.display === 'none' ? 'Show' : 'Hide';
  });

  // Collapse Management section
  document.getElementById('collapseMgmt')?.addEventListener('click', () => {
    const section = document.getElementById('managementSection');
    if (section) section.classList.toggle('collapsed');
  });

  // Expand buttons for employee sections
  document.getElementById('expandSA')?.addEventListener('click', () => {
    showAllEmployees.SA = !showAllEmployees.SA;
    renderSASection();
  });
  document.getElementById('expandBOH')?.addEventListener('click', () => {
    showAllEmployees.BOH = !showAllEmployees.BOH;
    renderBOHSection();
  });
  document.getElementById('expandMgmt')?.addEventListener('click', () => {
    showAllEmployees.MANAGEMENT = !showAllEmployees.MANAGEMENT;
    renderManagementSection();
  });
  document.getElementById('expandTailors')?.addEventListener('click', () => {
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

  // Manager actions
  document.getElementById('publishBtn')?.addEventListener('click', publishGameplan);
  document.getElementById('editMetricsBtn')?.addEventListener('click', openMetricsEditor);
  document.getElementById('manageSettingsBtn')?.addEventListener('click', openSettingsModal);

  // Metrics modal
  document.getElementById('closeMetrics')?.addEventListener('click', () => {
    document.getElementById('metricsModal').classList.remove('active');
  });
  document.getElementById('cancelMetrics')?.addEventListener('click', () => {
    document.getElementById('metricsModal').classList.remove('active');
  });
  document.getElementById('saveMetrics')?.addEventListener('click', saveMetricsChanges);

  // Settings modal
  document.getElementById('closeSettings')?.addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('active');
  });
  document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('active');
  });
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettingsChanges);

  // Settings tabs
  document.querySelectorAll('.settings-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => renderSettingsTab(tab.dataset.tab));
  });
}
