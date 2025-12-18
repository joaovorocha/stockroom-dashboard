// Closing Duties page JavaScript

let allSubmissions = [];
let allEmployees = [];
let selectedDate = new Date().toISOString().split('T')[0]; // Today's date
let currentUser = null;
let assignedDuties = [];

document.addEventListener('DOMContentLoaded', () => {
  addQuickNav('Closing Duties', 'top');
  addQuickNav('Closing Duties', 'bottom');

  setupTabs();
  setupForm();
  setupDateNavigation();
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
      loadAssignedDuties();
    }
  } catch (error) {
    console.log('User not logged in');
    currentUser = null;
  }
}

// Load user info if logged in
function loadUserInfo() {
  if (currentUser) {
    document.getElementById('employee-id-input').value = currentUser.userId;
    document.getElementById('employee-name-input').value = currentUser.name;
  }
}

// Load assigned duties for logged-in user
async function loadAssignedDuties() {
  if (!currentUser) return;

  try {
    // Get employee data to find assigned duties
    const response = await fetch('/api/closing-duties/employees');
    const result = await response.json();

    if (response.ok && result.success) {
      const employee = result.employees.find(emp => emp.id === currentUser.userId);

      if (employee && employee.closingDuties) {
        // Parse comma-separated duties
        assignedDuties = employee.closingDuties.split(',').map(duty => duty.trim()).filter(Boolean);

        if (assignedDuties.length > 0) {
          displayAssignedDuties();
        }
      }
    }
  } catch (error) {
    console.error('Error loading assigned duties:', error);
  }
}

// Display assigned duties checklist
function displayAssignedDuties() {
  const assignedSection = document.getElementById('assigned-duties-section');
  const dutiesList = document.getElementById('duties-list');

  // Show the section
  assignedSection.classList.remove('hidden');

  // Load completion status from localStorage
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `duties_${currentUser.userId}_${today}`;
  const savedStatus = JSON.parse(localStorage.getItem(storageKey) || '{}');

  // Create checklist items
  let html = '';
  assignedDuties.forEach((duty, index) => {
    const isCompleted = savedStatus[index] || false;
    const completedClass = isCompleted ? 'completed' : '';
    const checkedAttr = isCompleted ? 'checked' : '';
    const buttonText = isCompleted ? '✓ Done' : 'Mark Complete';

    html += `
      <div class="duty-item ${completedClass}" id="duty-${index}">
        <input type="checkbox" id="checkbox-${index}" ${checkedAttr} onchange="toggleDuty(${index})">
        <label for="checkbox-${index}">${duty}</label>
        <button class="complete-btn" onclick="toggleDuty(${index})">${buttonText}</button>
      </div>
    `;
  });

  dutiesList.innerHTML = html;
}

// Toggle duty completion
function toggleDuty(index) {
  const dutyItem = document.getElementById(`duty-${index}`);
  const checkbox = document.getElementById(`checkbox-${index}`);
  const button = dutyItem.querySelector('.complete-btn');

  // Toggle state
  const isCompleted = !checkbox.checked;
  checkbox.checked = isCompleted;

  // Update UI
  if (isCompleted) {
    dutyItem.classList.add('completed');
    button.textContent = '✓ Done';
  } else {
    dutyItem.classList.remove('completed');
    button.textContent = 'Mark Complete';
  }

  // Save to localStorage
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `duties_${currentUser.userId}_${today}`;
  const savedStatus = JSON.parse(localStorage.getItem(storageKey) || '{}');
  savedStatus[index] = isCompleted;
  localStorage.setItem(storageKey, JSON.stringify(savedStatus));
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

// Setup date navigation
function setupDateNavigation() {
  const datePicker = document.getElementById('date-picker');
  const prevBtn = document.getElementById('prev-day-btn');
  const nextBtn = document.getElementById('next-day-btn');
  const todayBtn = document.getElementById('today-btn');

  // Set initial date to today
  datePicker.value = selectedDate;

  // Date picker change
  datePicker.addEventListener('change', () => {
    selectedDate = datePicker.value;
    loadHistoryForDate(selectedDate);
  });

  // Previous day
  prevBtn.addEventListener('click', () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    selectedDate = date.toISOString().split('T')[0];
    datePicker.value = selectedDate;
    loadHistoryForDate(selectedDate);
  });

  // Next day
  nextBtn.addEventListener('click', () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    selectedDate = date.toISOString().split('T')[0];
    datePicker.value = selectedDate;
    loadHistoryForDate(selectedDate);
  });

  // Today
  todayBtn.addEventListener('click', () => {
    selectedDate = new Date().toISOString().split('T')[0];
    datePicker.value = selectedDate;
    loadHistoryForDate(selectedDate);
  });
}

// Setup form
function setupForm() {
  const form = document.getElementById('closing-duties-form');
  const photosInput = document.getElementById('photos-input');
  const photoCount = document.getElementById('photo-count');

  // Update photo count display
  photosInput.addEventListener('change', () => {
    photoCount.textContent = photosInput.files.length;
  });

  // Handle form submission
  form.addEventListener('submit', handleSubmit);
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const successDiv = document.getElementById('submit-success');
  const errorDiv = document.getElementById('submit-error');

  successDiv.classList.add('hidden');
  errorDiv.classList.add('hidden');

  // Validate photos
  const photosInput = document.getElementById('photos-input');
  if (photosInput.files.length === 0) {
    errorDiv.textContent = 'Please select at least one photo';
    errorDiv.classList.remove('hidden');
    return;
  }

  if (photosInput.files.length > 10) {
    errorDiv.textContent = 'Maximum 10 photos allowed';
    errorDiv.classList.remove('hidden');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    // Create FormData
    const formData = new FormData(e.target);

    // Submit to API
    const response = await fetch('/api/closing-duties/submit', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && result.success) {
      successDiv.textContent = `Success! ${result.submission.photoCount} photo(s) uploaded for ${result.submission.date}`;
      successDiv.classList.remove('hidden');

      // Reset form
      e.target.reset();
      document.getElementById('photo-count').textContent = '0';

      // Scroll to success message
      successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      errorDiv.textContent = result.error || 'Failed to submit closing duties';
      errorDiv.classList.remove('hidden');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Closing Duties';
  } catch (error) {
    console.error('Error submitting:', error);
    errorDiv.textContent = 'Connection error. Please try again.';
    errorDiv.classList.remove('hidden');

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Closing Duties';
  }
}

// Load history (initial load - fetches all data)
async function loadHistory() {
  const loading = document.getElementById('loading-history');
  const error = document.getElementById('history-error');
  const content = document.getElementById('history-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    // Fetch both employees and submissions
    const [employeesResponse, submissionsResponse] = await Promise.all([
      fetch('/api/closing-duties/employees'),
      fetch('/api/closing-duties')
    ]);

    const employeesResult = await employeesResponse.json();
    const submissionsResult = await submissionsResponse.json();

    if (employeesResponse.ok && employeesResult.success) {
      allEmployees = employeesResult.employees;
    } else {
      throw new Error('Failed to load employees');
    }

    if (submissionsResponse.ok && submissionsResult.success) {
      allSubmissions = submissionsResult.submissions;
    } else {
      throw new Error('Failed to load submissions');
    }

    // Load today's date by default
    loadHistoryForDate(selectedDate);

    loading.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    console.error('Error loading history:', err);
    loading.classList.add('hidden');
    error.textContent = `ERROR: ${err.message}`;
    error.classList.remove('hidden');
  }
}

// Load history for a specific date
function loadHistoryForDate(date) {
  // Filter submissions for the selected date
  const dateSubmissions = allSubmissions.filter(sub => sub.date === date);

  // Display team completion status
  displayTeamStatus(date, dateSubmissions);

  // Display submissions
  displaySubmissions(date, dateSubmissions);
}

// Display team completion status
function displayTeamStatus(date, submissions) {
  const dateDisplay = document.getElementById('selected-date-display');
  const completionGrid = document.getElementById('completion-grid');
  const missingAlertSection = document.getElementById('missing-alert-section');
  const missingList = document.getElementById('missing-list');

  // Format date display
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  dateDisplay.textContent = formattedDate;

  // Get list of employees who submitted
  const submittedUserIds = submissions.map(sub => sub.userId);

  // Create completion cards
  let completionHTML = '';
  const missingEmployees = [];

  allEmployees.forEach(employee => {
    const hasSubmitted = submittedUserIds.includes(employee.id);
    const statusClass = hasSubmitted ? 'completed' : 'missing';
    const statusIcon = hasSubmitted ? '✓' : '✗';
    const statusText = hasSubmitted ? 'Submitted' : 'Not Submitted';

    completionHTML += `
      <div class="completion-card ${statusClass}">
        <div class="status-icon">${statusIcon}</div>
        <div class="name">${employee.name}</div>
        <div class="status">${statusText}</div>
      </div>
    `;

    if (!hasSubmitted) {
      missingEmployees.push(employee);
    }
  });

  completionGrid.innerHTML = completionHTML;

  // Display missing alert if needed
  if (missingEmployees.length > 0) {
    missingAlertSection.classList.remove('hidden');
    let missingHTML = '';
    missingEmployees.forEach(emp => {
      missingHTML += `<li><strong>${emp.name}</strong> (ID: ${emp.id})</li>`;
    });
    missingList.innerHTML = missingHTML;
  } else {
    missingAlertSection.classList.add('hidden');
  }
}

// Display submissions for a specific date
function displaySubmissions(date, submissions) {
  const listDiv = document.getElementById('submissions-list');

  if (submissions.length === 0) {
    listDiv.innerHTML = `
      <div class="form-section">
        <p style="color: #666; text-align: center; padding: 40px;">No submissions for this date</p>
      </div>
    `;
    return;
  }

  // Create HTML
  let html = `
    <div class="form-section">
      <h3>Submissions (${submissions.length})</h3>
  `;

  submissions.forEach(sub => {
    const time = new Date(sub.submittedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    html += `
      <div style="border: 1px solid #e0e0e0; padding: 20px; margin-bottom: 20px; background-color: #fff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
          <div>
            <strong>${sub.userName}</strong>
            <div style="color: #666; font-size: 0.9em;">Submitted at ${time}</div>
          </div>
          <div style="color: #666; font-size: 0.9em;">
            ${sub.photoCount} photo(s)
          </div>
        </div>

        ${sub.notes ? `<div style="margin-bottom: 15px; color: #333;"><strong>Notes:</strong> ${sub.notes}</div>` : ''}

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
          ${sub.photos.map(photo => `
            <div style="position: relative;">
              <img src="${photo.path}" alt="Closing duty photo" class="photo-thumbnail" onclick="openPhotoModal('${photo.path}')">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  listDiv.innerHTML = html;
}

// Open photo modal
function openPhotoModal(photoPath) {
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: pointer;';

  const img = document.createElement('img');
  img.src = photoPath;
  img.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain;';

  modal.appendChild(img);
  document.body.appendChild(modal);

  // Close on click
  modal.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
}
