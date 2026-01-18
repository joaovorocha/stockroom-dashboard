// Shared Header Component for Stockroom Dashboard
// Standardized header with consistent navigation across all pages

const SharedHeader = {
  currentUser: null,

  // Pages that show refresh button
  refreshPages: ['/dashboard', '/shipments'],

  // Get current page path
  getCurrentPage() {
    return window.location.pathname;
  },

  // Check if current page should show refresh
  shouldShowRefresh() {
    const path = this.getCurrentPage();
    return this.refreshPages.some(p => path.includes(p) || path === p);
  },

  // Generate header HTML
  render(options = {}) {
    const currentPage = this.getCurrentPage();
    const showRefresh = options.showRefresh ?? this.shouldShowRefresh();

    const navItems = [
      { href: '/dashboard', label: 'Game Plan', id: 'navGamePlan' },
      { href: '/shipments', label: 'Shipments', id: 'navShipments', badge: 'shipmentsBadge' },
      { href: '/scanner', label: 'Scanner', id: 'navScanner' },
      { href: '/lost-punch', label: 'Lost Punch', id: 'navLostPunch' },
      { href: '/closing-duties', label: 'Closing Duties', id: 'navClosingDuties' },
      { href: '/time-off', label: 'Time Off', id: 'navTimeOff' },
      { href: '/ops-dashboard', label: 'Looker Dashboards', id: 'navOpsDashboard' },
      { href: '/feedback', label: 'Feedback', id: 'navFeedback', managerOnly: true },
      { href: '/admin', label: 'Admin', id: 'navAdmin', adminOnly: true }
    ];

    const navHtml = navItems.map(item => {
      const isActive = currentPage.includes(item.href) ? 'class="active"' : '';
      const style = (item.managerOnly || item.adminOnly) ? 'style="display:none;"' : '';
      const badge = item.badge ? `<span class="nav-badge" id="${item.badge}" style="display:none;">0</span>` : '';
      return `<a href="${item.href}" ${isActive} id="${item.id}" ${style}>${item.label}${badge}</a>`;
    }).join('\n      ');

    let refreshBar = '';
    if (showRefresh) {
      refreshBar = `
  <div class="refresh-bar" id="refreshBar">
    <div class="refresh-left">
      <span class="refresh-day" id="refreshDay"></span>
    </div>
    <div class="refresh-right">
      <button class="btn btn-sm btn-outline" id="refreshDataBtn" title="Refresh all data">
        &#8635; Refresh
      </button>
      <span class="last-sync" id="lastSync"></span>
    </div>
  </div>`;
    }

    return `${refreshBar}
  <header class="header">
    <div class="header-brand">
      <a href="/dashboard" class="logo-link">
        <img src="/images/suitsupply-logo.svg" alt="Suitsupply" class="logo-img" onerror="this.outerHTML='<span class=\\'logo-text\\'>SUITSUPPLY</span>'">
      </a>
    </div>

    <nav class="header-nav">
      ${navHtml}
    </nav>

    <div class="header-actions">
      <div class="header-date">
        <span id="currentDate"></span>
      </div>
      <div class="header-user" id="userMenu">
        <img src="" alt="" id="userAvatar" class="user-avatar-img" onerror="this.style.display='none'">
        <span id="userName">Guest</span>
        <div class="user-dropdown" id="userDropdown">
          <a href="#" id="switchUserBtn">Switch User</a>
        </div>
      </div>
    </div>
  </header>`;
  },

  // Initialize header
  async init() {
    // Set current date
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
      const today = new Date();
      dateEl.textContent = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Set day in refresh bar
    const refreshDay = document.getElementById('refreshDay');
    if (refreshDay) {
      const today = new Date();
      refreshDay.textContent = today.toLocaleDateString('en-US', { weekday: 'long' });
    }

    // Check auth and update UI
    await this.checkAuth();

    // Setup user switching
    this.setupUserSwitching();
  },

  // Check authentication
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await response.json();

      if (data.authenticated) {
        this.currentUser = data.user;
        this.updateUserUI(data.user);
        return data.user;
      }
    } catch (e) {
      console.error('Auth check failed:', e);
    }
    return null;
  },

  // Update user UI elements
  updateUserUI(user) {
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const adminLink = document.getElementById('navAdmin');
    const feedbackLink = document.getElementById('navFeedback');

    if (userName) userName.textContent = user.name;
    if (userAvatar && user.imageUrl) {
      userAvatar.src = user.imageUrl;
      userAvatar.style.display = 'block';
    }
    if (adminLink && (user.isManager || user.isAdmin)) {
      adminLink.style.display = 'inline';
    }
    if (feedbackLink && (user.isManager || user.isAdmin)) {
      feedbackLink.style.display = 'inline';
    }
  },

  // Setup user switching (direct, no logout loop)
  setupUserSwitching() {
    const switchBtn = document.getElementById('switchUserBtn');
    const userMenu = document.getElementById('userMenu');
    const dropdown = document.getElementById('userDropdown');

    if (userMenu && dropdown) {
      userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('active');
      });
    }

    if (switchBtn) {
      switchBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Redirect to login page
        window.location.href = '/login-v2';
      });
    }
  },

  // Show user switcher modal
  async showUserSwitcher() {
    // Fetch all users
    let users = [];
    try {
      const response = await fetch('/api/auth/users', { credentials: 'include' });
      const data = await response.json();
      users = data.users || [];
    } catch (e) {
      console.error('Failed to fetch users:', e);
      return;
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById('userSwitchModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'userSwitchModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const userListHtml = users.map(u => `
      <div class="user-switch-item" data-user-id="${u.id}" data-employee-id="${u.employeeId}">
        <div class="user-switch-avatar">
          ${u.imageUrl ? `<img src="${u.imageUrl}" alt="${u.name}">` : `<span>${u.name.split(' ').map(n => n[0]).join('').substring(0,2)}</span>`}
        </div>
        <div class="user-switch-info">
          <div class="user-switch-name">${u.name}</div>
          <div class="user-switch-role">${u.role}</div>
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal" style="max-width: 400px;">
        <div class="modal-header">
          <h3>Switch User</h3>
          <button class="modal-close" id="closeUserSwitch">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
          <div class="user-switch-list">
            ${userListHtml}
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Setup close button
    document.getElementById('closeUserSwitch').addEventListener('click', () => {
      modal.classList.remove('active');
    });

    // Setup user selection
    modal.querySelectorAll('.user-switch-item').forEach(item => {
      item.addEventListener('click', async () => {
        const employeeId = item.dataset.employeeId;
        await this.switchToUser(employeeId);
        modal.classList.remove('active');
      });
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  },

  // Switch to a different user
  async switchToUser(employeeId) {
    try {
      const response = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
        credentials: 'include'
      });

      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to switch user');
      }
    } catch (e) {
      console.error('Switch user failed:', e);
      alert('Failed to switch user');
    }
  },

  // Update last sync time
  updateLastSync(time) {
    const lastSync = document.getElementById('lastSync');
    if (lastSync) {
      const date = time ? new Date(time) : new Date();
      lastSync.textContent = `Last sync: ${date.toLocaleTimeString()}`;
    }
  }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  SharedHeader.init();
});
