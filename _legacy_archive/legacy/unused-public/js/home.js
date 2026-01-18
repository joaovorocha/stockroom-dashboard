// Home page JavaScript

let colleaguesData = null;
let showingAll = false;

// Load page when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Add quick nav at top and bottom
  addQuickNav('Home', 'top');
  addQuickNav('Home', 'bottom');

  displayCurrentDate();
  await checkAuthAndLoadData();
  setupEventListeners();
});

// Display current date
function displayCurrentDate() {
  const dateElement = document.getElementById('current-date');
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateElement.textContent = today.toLocaleDateString('en-US', options);
}

// Check authentication and load appropriate data
async function checkAuthAndLoadData() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();

    if (data.authenticated && data.user) {
      // User is logged in - show personalized section
      showPersonalizedSection(data.user);
      await loadColleagues();
    } else {
      // User is not logged in - show login prompt
      showLoginPrompt();
    }
  } catch (error) {
    console.error('Error checking auth:', error);
    showLoginPrompt();
  }
}

// Show personalized section for logged-in users
function showPersonalizedSection(user) {
  document.getElementById('personalized-section').classList.remove('hidden');
  document.getElementById('logout-section').classList.remove('hidden');
  document.getElementById('login-prompt').classList.add('hidden');

  // Set welcome message
  document.getElementById('welcome-message').textContent = `Welcome, ${user.name}`;
  document.getElementById('room-assignment').innerHTML = `<strong>Your Assignment:</strong> ${user.room}`;

  // Set quick data
  document.getElementById('fitting-room').textContent = user.fittingRoom || '—';
  document.getElementById('goals').textContent = user.goals || '—';
  document.getElementById('closing-duties').textContent = user.closingDuties || '—';
}

// Show login prompt for non-logged-in users
function showLoginPrompt() {
  document.getElementById('login-prompt').classList.remove('hidden');
  document.getElementById('personalized-section').classList.add('hidden');
  document.getElementById('logout-section').classList.add('hidden');
}

// Load colleagues
async function loadColleagues() {
  try {
    const response = await fetch('/api/employees/colleagues');
    const data = await response.json();

    if (data.success) {
      colleaguesData = data;
      displayColleagues(false); // Start with compact view
    }
  } catch (error) {
    console.error('Error loading colleagues:', error);
    document.getElementById('colleagues-list').innerHTML =
      '<p style="color: #999;">Unable to load colleagues</p>';
  }
}

// Display colleagues (compact or expanded)
function displayColleagues(showAll) {
  if (!colleaguesData) return;

  const colleaguesList = document.getElementById('colleagues-list');
  const expandBtn = document.getElementById('expand-colleagues');

  let html = '';

  if (showAll) {
    // Show all colleagues
    if (colleaguesData.sameRoom.length > 0) {
      html += '<div style="margin-bottom: 20px;"><strong style="color: #000;">Same Room:</strong></div>';
      colleaguesData.sameRoom.forEach(colleague => {
        html += createColleagueItem(colleague);
      });
    }

    if (colleaguesData.otherRooms.length > 0) {
      html += '<div style="margin: 20px 0;"><strong style="color: #000;">Other Rooms:</strong></div>';
      colleaguesData.otherRooms.forEach(colleague => {
        html += createColleagueItem(colleague);
      });
    }

    expandBtn.textContent = 'Show Less';
  } else {
    // Show compact view (max 3-5 from same room)
    const limit = Math.min(5, colleaguesData.sameRoom.length);
    for (let i = 0; i < limit; i++) {
      html += createColleagueItem(colleaguesData.sameRoom[i]);
    }

    if (colleaguesData.sameRoom.length > limit || colleaguesData.otherRooms.length > 0) {
      expandBtn.textContent = 'See All Colleagues';
    } else {
      expandBtn.style.display = 'none';
    }
  }

  colleaguesList.innerHTML = html;
}

// Create colleague item HTML
function createColleagueItem(colleague) {
  return `
    <div class="colleague-item">
      <span class="colleague-name">${colleague.name}</span>
      <span class="colleague-room">${colleague.room}</span>
    </div>
  `;
}

// Setup event listeners
function setupEventListeners() {
  // Expand/collapse colleagues
  const expandBtn = document.getElementById('expand-colleagues');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      showingAll = !showingAll;
      displayColleagues(showingAll);
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
      } catch (error) {
        console.error('Logout error:', error);
      }
    });
  }

  // MAO Lookup
  const maoLookupBtn = document.getElementById('mao-lookup-btn');
  const maoInput = document.getElementById('mao-order');

  maoLookupBtn.addEventListener('click', () => handleMAOLookup());

  // Allow Enter key to submit
  maoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleMAOLookup();
    }
  });
}

// Handle MAO order lookup
function handleMAOLookup() {
  const input = document.getElementById('mao-order').value;
  const errorDiv = document.getElementById('mao-error');

  errorDiv.classList.add('hidden');

  if (!input.trim()) {
    errorDiv.textContent = 'Please enter an order number';
    errorDiv.classList.remove('hidden');
    return;
  }

  const psusNumber = extractPSUSNumber(input);

  if (!psusNumber) {
    errorDiv.textContent = 'Invalid order number. Please use format: PSUS + 8 digits (e.g., PSUS02101002)';
    errorDiv.classList.remove('hidden');
    return;
  }

  // Valid PSUS number - open MAO URL
  const url = getMAOOrderURL(psusNumber);
  openInNewTab(url);

  // Clear input
  document.getElementById('mao-order').value = '';
}
