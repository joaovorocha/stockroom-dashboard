// Daily Scan Schedule Manager
(function() {
  'use strict';

  let employees = [];
  let schedules = [];

  // Load employees
  async function loadEmployees() {
    try {
      const response = await fetch('/api/gameplan/employees', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const allEmployees = [
          ...(data.employees.SA || []),
          ...(data.employees.BOH || []),
          ...(data.employees.MANAGEMENT || [])
        ];
        
        employees = allEmployees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        populateEmployeeDropdown();
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }

  // Populate employee dropdown
  function populateEmployeeDropdown() {
    const select = document.getElementById('employee');
    if (!select) return;

    select.innerHTML = '<option value="">Select employee...</option>' + 
      employees.map(emp => {
        const email = emp.id || emp.employeeId || emp.email;
        return `<option value="${email}">${emp.name || email}</option>`;
      }).join('');
  }

  // Load scheduled scans
  async function loadSchedules() {
    try {
      const response = await fetch('/api/gameplan/daily-scan/schedule?days=60', {
        credentials: 'include'
      });
      
      if (response.ok) {
        schedules = await response.json();
        await loadScanStatuses();
        renderSchedulesTable();
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }

  // Load scan statuses for scheduled dates
  async function loadScanStatuses() {
    const statusPromises = schedules.map(async (schedule) => {
      try {
        const response = await fetch(`/api/gameplan/daily-scan/status/${schedule.scan_date}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const status = await response.json();
          schedule.scanStatus = status;
        }
      } catch (error) {
        console.error(`Error loading status for ${schedule.scan_date}:`, error);
      }
    });

    await Promise.all(statusPromises);
  }

  // Render schedules table
  function renderSchedulesTable() {
    const tbody = document.getElementById('scheduleTableBody');
    if (!tbody) return;

    if (schedules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">No scheduled scans yet</td></tr>';
      return;
    }

    // Sort by date descending
    const sorted = [...schedules].sort((a, b) => new Date(b.scan_date) - new Date(a.scan_date));

    tbody.innerHTML = sorted.map(schedule => {
      const date = new Date(schedule.scan_date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const scheduledName = getEmployeeName(schedule.scheduled_employee);
      const actualName = schedule.scanStatus?.actual_employee 
        ? getEmployeeName(schedule.scanStatus.actual_employee)
        : '--';

      const status = schedule.scanStatus?.status || 'SCHEDULED';
      const statusBadge = getStatusBadge(status);

      return `
        <tr>
          <td style="font-weight: 600;">${date}</td>
          <td>${scheduledName}</td>
          <td>${statusBadge}</td>
          <td>${actualName}</td>
          <td>${schedule.notes || '--'}</td>
          <td>
            <button class="btn btn-danger" onclick="deleteSchedule('${schedule.scan_date}')">
              Remove
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Get employee name from email
  function getEmployeeName(email) {
    if (!email) return 'Unknown';
    
    const emp = employees.find(e => 
      (e.id && e.id.toLowerCase() === email.toLowerCase()) ||
      (e.employeeId && e.employeeId.toLowerCase() === email.toLowerCase()) ||
      (e.email && e.email.toLowerCase() === email.toLowerCase())
    );
    
    return emp ? (emp.name || email) : email;
  }

  // Get status badge HTML
  function getStatusBadge(status) {
    const badges = {
      'SCHEDULED': '<span class="status-badge status-scheduled">⏳ Scheduled</span>',
      'EXECUTED': '<span class="status-badge status-executed">✓ Executed</span>',
      'MISSED': '<span class="status-badge status-missed">✗ Missed</span>',
      'COMPLETED_BY_OTHER': '<span class="status-badge status-completed-other">⚠️ By Other</span>',
      'UNSCHEDULED': '<span class="status-badge status-scheduled">Unscheduled</span>'
    };
    
    return badges[status] || badges['SCHEDULED'];
  }

  // Create new schedule
  async function createSchedule() {
    const dateInput = document.getElementById('scanDate');
    const employeeSelect = document.getElementById('employee');
    const notesInput = document.getElementById('notes');
    const statusEl = document.getElementById('scheduleStatus');
    const scheduleBtn = document.getElementById('scheduleBtn');

    const scanDate = dateInput.value;
    const scheduledEmployee = employeeSelect.value;
    const notes = notesInput.value;

    if (!scanDate || !scheduledEmployee) {
      if (statusEl) statusEl.textContent = '❌ Please select a date and employee';
      return;
    }

    try {
      if (scheduleBtn) scheduleBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Creating schedule...';

      const response = await fetch('/api/gameplan/daily-scan/schedule', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scan_date: scanDate,
          scheduled_employee: scheduledEmployee,
          notes: notes || null
        })
      });

      if (response.ok) {
        if (statusEl) statusEl.textContent = '✓ Schedule created successfully';
        
        // Reset form
        dateInput.value = '';
        employeeSelect.value = '';
        notesInput.value = '';

        // Reload schedules
        await loadSchedules();

        setTimeout(() => {
          if (statusEl) statusEl.textContent = '';
        }, 3000);
      } else {
        const error = await response.json();
        if (statusEl) statusEl.textContent = `❌ Error: ${error.error || 'Failed to create schedule'}`;
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      if (statusEl) statusEl.textContent = '❌ Error creating schedule';
    } finally {
      if (scheduleBtn) scheduleBtn.disabled = false;
    }
  }

  // Delete schedule
  window.deleteSchedule = async function(date) {
    if (!confirm(`Remove scheduled scan for ${new Date(date).toLocaleDateString()}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/gameplan/daily-scan/schedule/${date}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        await loadSchedules();
      } else {
        alert('Failed to remove schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Error removing schedule');
    }
  };

  // Initialize
  async function init() {
    await loadEmployees();
    await loadSchedules();

    // Set up form submission
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) {
      scheduleBtn.addEventListener('click', createSchedule);
    }

    // Set default date to tomorrow
    const dateInput = document.getElementById('scanDate');
    if (dateInput) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateInput.value = tomorrow.toISOString().split('T')[0];
      dateInput.min = new Date().toISOString().split('T')[0]; // Don't allow past dates
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
