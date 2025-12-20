// Gameplan V2 JavaScript
let employees = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
let metrics = {};
let currentEditEmployee = null;
let gameplanData = { notes: '', assignments: {} };

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setCurrentDate();
  await loadEmployees();
  await loadMetrics();
  await loadGameplan();
  renderAllSections();
  setupEventListeners();
});

function setCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

async function loadEmployees() {
  try {
    const response = await fetch('/api/gameplan/employees');
    const data = await response.json();
    employees = data.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}

async function loadMetrics() {
  try {
    const response = await fetch('/api/gameplan/metrics');
    metrics = await response.json();
    updateMetricsDisplay();
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}

async function loadGameplan() {
  try {
    const response = await fetch('/api/gameplan/today');
    if (response.ok) {
      gameplanData = await response.json();
      document.getElementById('gameplanNotes').value = gameplanData.notes || '';
      // Merge assignments into employees
      if (gameplanData.assignments) {
        mergeAssignments(gameplanData.assignments);
      }
    }
  } catch (error) {
    console.error('Error loading gameplan:', error);
  }
}

function mergeAssignments(assignments) {
  Object.keys(assignments).forEach(id => {
    const assignment = assignments[id];
    // Find employee and merge data
    for (const type of Object.keys(employees)) {
      const emp = employees[type].find(e => e.id === id);
      if (emp) {
        Object.assign(emp, assignment);
        break;
      }
    }
  });
}

function updateMetricsDisplay() {
  if (!metrics.wtd) return;

  // WTD Sales
  const wtdAmount = formatCurrency(metrics.wtd.salesAmount);
  document.getElementById('wtdSales').textContent = wtdAmount;
  const wtdChange = document.getElementById('wtdChange');
  wtdChange.textContent = `${metrics.wtd.salesVsPY >= 0 ? '+' : ''}${metrics.wtd.salesVsPY}% vs PY`;
  wtdChange.className = `metric-change ${metrics.wtd.salesVsPY >= 0 ? 'positive' : 'negative'}`;

  // Target
  document.getElementById('targetAmount').textContent = formatCurrency(metrics.wtd.target);
  const vsTarget = document.getElementById('vsTarget');
  vsTarget.textContent = `${metrics.wtd.vsTarget}%`;
  vsTarget.className = `metric-change ${metrics.wtd.vsTarget >= 0 ? 'positive' : 'negative'}`;

  // Other metrics
  if (metrics.metrics) {
    document.getElementById('sph').textContent = `$${metrics.metrics.salesPerHour}`;
    document.getElementById('ipc').textContent = metrics.metrics.itemsPerCustomer;
    document.getElementById('dropoffs').textContent = `${metrics.metrics.dropOffs}%`;
  }

  // Product Mix
  if (metrics.lastWeekSales) {
    document.getElementById('formalPct').textContent = `${metrics.lastWeekSales.formal}%`;
    document.getElementById('casualPct').textContent = `${metrics.lastWeekSales.casual}%`;
    document.getElementById('tuxedoPct').textContent = `${metrics.lastWeekSales.tuxedo}%`;

    // Update bar widths
    document.querySelector('.mix-fill.formal').style.width = `${metrics.lastWeekSales.formal}%`;
    document.querySelector('.mix-fill.casual').style.width = `${metrics.lastWeekSales.casual}%`;
    document.querySelector('.mix-fill.tuxedo').style.width = `${metrics.lastWeekSales.tuxedo}%`;
  }
}

function formatCurrency(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount}`;
}

function renderAllSections() {
  renderSASection();
  renderBOHSection();
  renderManagementSection();
  renderTailorsSection();
}

function renderSASection() {
  const grid = document.getElementById('saGrid');
  const count = document.getElementById('saCount');
  grid.innerHTML = '';
  count.textContent = employees.SA.length;

  employees.SA.forEach(emp => {
    grid.appendChild(createSACard(emp));
  });
}

function createSACard(emp) {
  const card = document.createElement('div');
  card.className = 'employee-card';
  card.onclick = () => openEditModal(emp);

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

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
        <span class="field-value">${emp.zone || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Fitting Room</span>
        <span class="field-value">${emp.fittingRoom || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Target</span>
        <span class="field-value">${emp.individualTarget ? '$' + emp.individualTarget.toLocaleString() : ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.scheduledLunch || ''}</span>
      </div>
      <div class="card-field full-width">
        <span class="field-label">Closing Sections</span>
        <span class="field-value">${Array.isArray(emp.closingSections) ? emp.closingSections.join(', ') : emp.closingSections || ''}</span>
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
  `;
  return card;
}

function renderBOHSection() {
  const grid = document.getElementById('bohGrid');
  const count = document.getElementById('bohCount');
  grid.innerHTML = '';
  count.textContent = employees.BOH.length;

  employees.BOH.forEach(emp => {
    grid.appendChild(createBOHCard(emp));
  });
}

function createBOHCard(emp) {
  const card = document.createElement('div');
  card.className = 'employee-card';
  card.onclick = () => openEditModal(emp);

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
        <span class="field-value">${emp.shift || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.lunch || ''}</span>
      </div>
      <div class="card-field full-width">
        <span class="field-label">Task of the Day</span>
        <span class="field-value">${emp.taskOfTheDay || ''}</span>
      </div>
    </div>
  `;
  return card;
}

function renderManagementSection() {
  const grid = document.getElementById('mgmtGrid');
  const count = document.getElementById('mgmtCount');
  grid.innerHTML = '';
  count.textContent = employees.MANAGEMENT.length;

  employees.MANAGEMENT.forEach(emp => {
    grid.appendChild(createManagementCard(emp));
  });
}

function createManagementCard(emp) {
  const card = document.createElement('div');
  card.className = 'employee-card';
  card.onclick = () => openEditModal(emp);

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  card.innerHTML = `
    <div class="card-header">
      ${photoHtml}
      <div class="employee-info">
        <h4>${emp.name}</h4>
        <span class="role">Management</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-field">
        <span class="field-label">Zone</span>
        <span class="field-value">${emp.zone || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Shift</span>
        <span class="field-value">${emp.shift || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Role</span>
        <span class="field-value">${emp.role || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.lunch || ''}</span>
      </div>
    </div>
  `;
  return card;
}

function renderTailorsSection() {
  const grid = document.getElementById('tailorGrid');
  const count = document.getElementById('tailorCount');
  const productivityBars = document.getElementById('productivityBars');
  grid.innerHTML = '';
  productivityBars.innerHTML = '';
  count.textContent = employees.TAILOR.length;

  employees.TAILOR.forEach(emp => {
    grid.appendChild(createTailorCard(emp));
    productivityBars.appendChild(createProductivityBar(emp));
  });
}

function createTailorCard(emp) {
  const card = document.createElement('div');
  card.className = 'employee-card';
  card.onclick = () => openEditModal(emp);

  const photoHtml = emp.imageUrl
    ? `<img src="${emp.imageUrl}" alt="${emp.name}" class="employee-photo">`
    : `<div class="employee-photo placeholder">${getInitials(emp.name)}</div>`;

  const productivityClass = emp.productivity >= 100 ? 'positive' : emp.productivity >= 80 ? '' : 'negative';

  card.innerHTML = `
    <div class="card-header">
      ${photoHtml}
      <div class="employee-info">
        <h4>${emp.name}</h4>
        <span class="role">Tailor - ${emp.productivity}% Productivity</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-field">
        <span class="field-label">Station</span>
        <span class="field-value">${emp.station || ''}</span>
      </div>
      <div class="card-field">
        <span class="field-label">Lunch</span>
        <span class="field-value">${emp.lunch || ''}</span>
      </div>
    </div>
  `;
  return card;
}

function createProductivityBar(emp) {
  const item = document.createElement('div');
  item.className = 'productivity-item';

  const fillClass = emp.productivity >= 100 ? 'high' : emp.productivity >= 80 ? 'medium' : 'low';
  const width = Math.min(emp.productivity, 150); // Cap at 150% for display

  item.innerHTML = `
    <span class="productivity-name">${emp.name}</span>
    <div class="productivity-bar">
      <div class="productivity-fill ${fillClass}" style="width: ${width}%"></div>
    </div>
    <span class="productivity-value">${emp.productivity}%</span>
  `;
  return item;
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// Modal Functions
function openEditModal(emp) {
  currentEditEmployee = emp;
  const modal = document.getElementById('editModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  title.textContent = `Edit ${emp.name}`;
  body.innerHTML = getFormFields(emp);
  modal.classList.add('active');
}

function getFormFields(emp) {
  switch (emp.type) {
    case 'SA':
      return `
        <div class="form-row">
          <div class="form-group">
            <label>Zone</label>
            <input type="text" id="editZone" value="${emp.zone || ''}" placeholder="e.g., Zone A">
          </div>
          <div class="form-group">
            <label>Fitting Room</label>
            <input type="text" id="editFittingRoom" value="${emp.fittingRoom || ''}" placeholder="e.g., FR 1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Individual Target</label>
            <input type="number" id="editTarget" value="${emp.individualTarget || ''}" placeholder="e.g., 5000">
          </div>
          <div class="form-group">
            <label>Scheduled Lunch</label>
            <input type="time" id="editLunch" value="${emp.scheduledLunch || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Closing Sections</label>
          <input type="text" id="editClosing" value="${Array.isArray(emp.closingSections) ? emp.closingSections.join(', ') : emp.closingSections || ''}" placeholder="e.g., Men's Suits, Accessories">
        </div>
      `;
    case 'BOH':
      return `
        <div class="form-row">
          <div class="form-group">
            <label>Shift</label>
            <input type="text" id="editShift" value="${emp.shift || ''}" placeholder="e.g., 9AM - 5PM">
          </div>
          <div class="form-group">
            <label>Lunch</label>
            <input type="time" id="editLunch" value="${emp.lunch || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Task of the Day</label>
          <textarea id="editTask" rows="3" placeholder="Enter today's main task...">${emp.taskOfTheDay || ''}</textarea>
        </div>
      `;
    case 'MANAGEMENT':
      return `
        <div class="form-row">
          <div class="form-group">
            <label>Zone</label>
            <input type="text" id="editZone" value="${emp.zone || ''}" placeholder="e.g., Floor">
          </div>
          <div class="form-group">
            <label>Shift</label>
            <input type="text" id="editShift" value="${emp.shift || ''}" placeholder="e.g., 10AM - 7PM">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Role</label>
            <select id="editRole">
              <option value="">Select...</option>
              <option value="MOD" ${emp.role === 'MOD' ? 'selected' : ''}>MOD</option>
              <option value="HOST" ${emp.role === 'HOST' ? 'selected' : ''}>HOST</option>
            </select>
          </div>
          <div class="form-group">
            <label>Lunch</label>
            <input type="time" id="editLunch" value="${emp.lunch || ''}">
          </div>
        </div>
      `;
    case 'TAILOR':
      return `
        <div class="form-row">
          <div class="form-group">
            <label>Station</label>
            <input type="text" id="editStation" value="${emp.station || ''}" placeholder="e.g., Station 1">
          </div>
          <div class="form-group">
            <label>Lunch</label>
            <input type="time" id="editLunch" value="${emp.lunch || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Productivity (%)</label>
          <input type="number" id="editProductivity" value="${emp.productivity || ''}" readonly>
          <small style="color: #666; display: block; margin-top: 4px;">Productivity is updated from Looker data</small>
        </div>
      `;
    default:
      return '';
  }
}

function closeModal() {
  document.getElementById('editModal').classList.remove('active');
  currentEditEmployee = null;
}

function saveModalChanges() {
  if (!currentEditEmployee) return;

  const emp = currentEditEmployee;

  switch (emp.type) {
    case 'SA':
      emp.zone = document.getElementById('editZone').value;
      emp.fittingRoom = document.getElementById('editFittingRoom').value;
      emp.individualTarget = parseInt(document.getElementById('editTarget').value) || emp.individualTarget;
      emp.scheduledLunch = document.getElementById('editLunch').value;
      emp.closingSections = document.getElementById('editClosing').value.split(',').map(s => s.trim()).filter(Boolean);
      break;
    case 'BOH':
      emp.shift = document.getElementById('editShift').value;
      emp.lunch = document.getElementById('editLunch').value;
      emp.taskOfTheDay = document.getElementById('editTask').value;
      break;
    case 'MANAGEMENT':
      emp.zone = document.getElementById('editZone').value;
      emp.shift = document.getElementById('editShift').value;
      emp.role = document.getElementById('editRole').value;
      emp.lunch = document.getElementById('editLunch').value;
      break;
    case 'TAILOR':
      emp.station = document.getElementById('editStation').value;
      emp.lunch = document.getElementById('editLunch').value;
      break;
  }

  // Store in assignments
  gameplanData.assignments[emp.id] = { ...emp };

  closeModal();
  renderAllSections();
}

// Save Gameplan
async function saveGameplan() {
  gameplanData.notes = document.getElementById('gameplanNotes').value;
  gameplanData.date = new Date().toISOString().split('T')[0];

  try {
    const response = await fetch('/api/gameplan/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameplanData)
    });

    if (response.ok) {
      showNotification('Game plan saved successfully!');
    } else {
      showNotification('Error saving game plan', 'error');
    }
  } catch (error) {
    console.error('Error saving gameplan:', error);
    showNotification('Error saving game plan', 'error');
  }
}

function showNotification(message, type = 'success') {
  // Simple notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ef4444' : '#22c55e'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 2000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Event Listeners
function setupEventListeners() {
  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveGameplan);

  // Toggle metrics
  document.getElementById('toggleMetrics').addEventListener('click', () => {
    const content = document.getElementById('metricsContent');
    const btn = document.getElementById('toggleMetrics');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      btn.textContent = 'Hide';
    } else {
      content.style.display = 'none';
      btn.textContent = 'Show';
    }
  });

  // Toggle Looker
  document.getElementById('toggleLooker').addEventListener('click', () => {
    const container = document.getElementById('lookerContainer');
    const btn = document.getElementById('toggleLooker');
    if (container.style.display === 'none') {
      container.style.display = 'block';
      btn.textContent = 'Hide';
    } else {
      container.style.display = 'none';
      btn.textContent = 'Show';
    }
  });

  // Modal
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelEdit').addEventListener('click', closeModal);
  document.getElementById('saveEdit').addEventListener('click', saveModalChanges);

  // Close modal on outside click
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeModal();
  });

  // Auto-save notes on change
  let saveTimeout;
  document.getElementById('gameplanNotes').addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveGameplan, 2000);
  });
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(style);
