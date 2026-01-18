// Lost Punch page JavaScript

let currentUser = null;
let myEntries = [];

document.addEventListener('DOMContentLoaded', () => {
  addQuickNav('Lost Punch', 'top');
  addQuickNav('Lost Punch', 'bottom');

  setupTabs();
  setupForm();
  checkUserAuth();
});

// Check user authentication
async function checkUserAuth() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();

    if (data.authenticated && data.user) {
      currentUser = data.user;
      loadUserInfo();
    }
  } catch (error) {
    console.log('User not logged in');
    currentUser = null;
  }
}

// Setup tab switching
function setupTabs() {
  const submitTabBtn = document.getElementById('submit-tab-btn');
  const historyTabBtn = document.getElementById('history-tab-btn');
  const submitSection = document.getElementById('submit-section');
  const historySection = document.getElementById('history-section');

  submitTabBtn.addEventListener('click', () => {
    submitTabBtn.classList.remove('btn-secondary');
    submitTabBtn.classList.add('btn');
    historyTabBtn.classList.remove('btn');
    historyTabBtn.classList.add('btn-secondary');

    submitSection.classList.remove('hidden');
    historySection.classList.add('hidden');
  });

  historyTabBtn.addEventListener('click', () => {
    historyTabBtn.classList.remove('btn-secondary');
    historyTabBtn.classList.add('btn');
    submitTabBtn.classList.remove('btn');
    submitTabBtn.classList.add('btn-secondary');

    submitSection.classList.add('hidden');
    historySection.classList.remove('hidden');

    // Load history when tab is opened
    loadHistory();
  });
}

// Setup form
function setupForm() {
  const form = document.getElementById('lost-punch-form');
  form.addEventListener('submit', handleSubmit);

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('missed-date-input').value = today;
}

// Load user info if logged in
function loadUserInfo() {
  if (currentUser) {
    document.getElementById('employee-id-input').value = currentUser.userId;
    document.getElementById('employee-name-input').value = currentUser.name;
  }
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const successDiv = document.getElementById('submit-success');
  const errorDiv = document.getElementById('submit-error');

  successDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // Create form data
    const formData = new FormData(e.target);
    const punchData = {
      employeeId: formData.get('employeeId'),
      employeeName: formData.get('employeeName'),
      missedDate: formData.get('missedDate'),
      missedTime: formData.get('missedTime'),
      punchType: formData.get('punchType'),
      reason: formData.get('reason'),
      manager: formData.get('manager') || '',
      submittedAt: new Date().toISOString()
    };

    // Submit to API
    const response = await fetch('/api/lost-punch/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(punchData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      successDiv.textContent = `Success! Lost punch submitted for ${punchData.missedDate} at ${punchData.missedTime}`;
      successDiv.classList.remove('hidden');

      // Reset form
      e.target.reset();

      // Set date back to today
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('missed-date-input').value = today;

      // Reload user info if logged in
      if (currentUser) {
        loadUserInfo();
      }

      // Scroll to success message
      successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      errorDiv.textContent = result.error || 'Failed to submit lost punch';
      errorDiv.classList.remove('hidden');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Lost Punch';
  } catch (error) {
    console.error('Error submitting:', error);
    errorDiv.textContent = 'Connection error. Please try again.';
    errorDiv.classList.remove('hidden');

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Lost Punch';
  }
}

// Load history
async function loadHistory() {
  const loading = document.getElementById('loading-history');
  const error = document.getElementById('history-error');
  const content = document.getElementById('history-content');
  const loginRequired = document.getElementById('login-required');

  // Check if user is logged in
  if (!currentUser) {
    loading.classList.add('hidden');
    content.classList.add('hidden');
    loginRequired.classList.remove('hidden');
    return;
  }

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');
  loginRequired.classList.add('hidden');

  try {
    const response = await fetch(`/api/lost-punch/my-entries`);
    const result = await response.json();

    if (response.ok && result.success) {
      myEntries = result.entries;
      displayHistory(myEntries);

      loading.classList.add('hidden');
      content.classList.remove('hidden');
    } else {
      throw new Error(result.error || 'Failed to load history');
    }
  } catch (err) {
    console.error('Error loading history:', err);
    loading.classList.add('hidden');
    error.textContent = `ERROR: ${err.message}`;
    error.classList.remove('hidden');
  }
}

// Display history
function displayHistory(entries) {
  const listDiv = document.getElementById('entries-list');
  const subtitle = document.getElementById('history-subtitle');

  if (entries.length === 0) {
    listDiv.innerHTML = '<div class="form-section"><p style="color: #666; text-align: center; padding: 40px;">No lost punch entries yet</p></div>';
    subtitle.textContent = 'View your submitted lost punch reports';
    return;
  }

  subtitle.textContent = `You have ${entries.length} lost punch report(s)`;

  // Sort by date (most recent first)
  const sortedEntries = entries.sort((a, b) => {
    const dateA = new Date(`${a.missedDate}T${a.missedTime}`);
    const dateB = new Date(`${b.missedDate}T${b.missedTime}`);
    return dateB - dateA;
  });

  // Create HTML
  let html = '<div class="form-section">';

  sortedEntries.forEach(entry => {
    const submittedDate = new Date(entry.submittedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const submittedTime = new Date(entry.submittedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const missedDate = new Date(entry.missedDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Format punch type
    const punchTypeFormatted = entry.punchType.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    // Status badge (default to pending)
    const status = entry.status || 'Pending Review';
    const statusClass = status.toLowerCase().includes('approved') ? 'status-delivered' :
                       status.toLowerCase().includes('denied') ? 'status-error' :
                       'status-pending';

    html += `
      <div style="border: 1px solid #e0e0e0; padding: 20px; margin-bottom: 20px; background-color: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
          <div>
            <h4 style="margin-bottom: 5px; font-weight: 500;">${punchTypeFormatted}</h4>
            <div style="color: #666; font-size: 0.9em;">${missedDate} at ${entry.missedTime}</div>
          </div>
          <span class="status-badge ${statusClass}">${status}</span>
        </div>

        <div style="margin-bottom: 10px;">
          <strong>Reason:</strong>
          <div style="color: #333; margin-top: 5px;">${entry.reason}</div>
        </div>

        ${entry.manager ? `
          <div style="margin-bottom: 10px;">
            <strong>Manager:</strong> <span style="color: #333;">${entry.manager}</span>
          </div>
        ` : ''}

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 0.85em; color: #666;">
          Submitted on ${submittedDate} at ${submittedTime}
        </div>
      </div>
    `;
  });

  html += '</div>';
  listDiv.innerHTML = html;
}
