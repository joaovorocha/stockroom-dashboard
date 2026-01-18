// Game Plan page JavaScript

let currentDate = new Date();

// Load game plan when page loads
document.addEventListener('DOMContentLoaded', () => {
  addQuickNav('Game Plan', 'top');
  addQuickNav('Game Plan', 'bottom');

  loadGamePlan(currentDate);
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('prev-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    loadGamePlan(currentDate);
  });

  document.getElementById('next-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    loadGamePlan(currentDate);
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    currentDate = new Date();
    loadGamePlan(currentDate);
  });
}

// Load game plan for specific date
async function loadGamePlan(date) {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const content = document.getElementById('gameplan-content');

  // Show loading
  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const dateStr = date.toISOString().split('T')[0];
    const response = await fetch(`/api/gameplan?date=${dateStr}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to load game plan');
    }

    // Hide loading, show content
    loading.classList.add('hidden');
    content.classList.remove('hidden');

    // Display the game plan
    displayGamePlan(result.data);
    updateDateDisplay(date);
  } catch (err) {
    console.error('Error loading game plan:', err);
    loading.classList.add('hidden');
    error.textContent = `ERROR: ${err.message}`;
    error.classList.remove('hidden');
  }
}

// Update date display
function updateDateDisplay(date) {
  const dateElement = document.getElementById('current-date');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateElement.textContent = date.toLocaleDateString('en-US', options);
}

// Display game plan data
function displayGamePlan(data) {
  // Display date from Excel
  const gamePlanDate = document.getElementById('gameplan-date');
  gamePlanDate.textContent = data.dateText;

  // Display metrics
  displayMetrics(data.metrics);

  // Display table
  displayTable(data.headers, data.employees);
}

// Display metrics section
function displayMetrics(metrics) {
  const metricsSection = document.getElementById('metrics-section');
  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">';

  // Row 1 metrics
  if (metrics.row1 && metrics.row1.length > 0) {
    for (let i = 0; i < metrics.row1.length; i += 2) {
      const label = metrics.row1[i];
      const value = metrics.row1[i + 1];
      if (label && value) {
        html += `
          <div style="border: 1px solid #333; padding: 10px;">
            <div style="color: #999; font-size: 0.85em;">${label}</div>
            <div style="color: #00ff00; font-size: 1.1em; font-weight: bold;">${value}</div>
          </div>
        `;
      }
    }
  }

  // Row 2 metrics (Last Week data)
  if (metrics.row2 && metrics.row2.length > 0) {
    for (let i = 0; i < metrics.row2.length; i += 2) {
      const label = metrics.row2[i];
      const value = metrics.row2[i + 1];
      if (label && value) {
        html += `
          <div style="border: 1px solid #333; padding: 10px;">
            <div style="color: #999; font-size: 0.85em;">${label}</div>
            <div style="color: #e0e0e0; font-size: 1.1em;">${value}</div>
          </div>
        `;
      }
    }
  }

  html += '</div>';
  metricsSection.innerHTML = html;
}

// Display table
function displayTable(headers, employees) {
  const tableHeader = document.getElementById('table-header');
  const tableBody = document.getElementById('table-body');

  // Create header row
  let headerHtml = '<tr>';
  headers.forEach(header => {
    if (header) {
      headerHtml += `<th>${header}</th>`;
    }
  });
  headerHtml += '</tr>';
  tableHeader.innerHTML = headerHtml;

  // Create body rows
  let bodyHtml = '';
  employees.forEach(employee => {
    bodyHtml += '<tr>';
    employee.forEach((cell, index) => {
      // Only show cells up to the number of headers
      if (index < headers.length) {
        bodyHtml += `<td>${cell || ''}</td>`;
      }
    });
    bodyHtml += '</tr>';
  });
  tableBody.innerHTML = bodyHtml;
}
