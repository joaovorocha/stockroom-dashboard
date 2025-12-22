// Shared Header Component for Stockroom Dashboard
// Standardized header with consistent navigation across all pages

const SharedHeader = {
  currentUser: null,
  shipmentsBadgeTimer: null,

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
      { href: '/home', label: 'Game Plan', id: 'navGamePlan' },
      { href: '/shipments', label: 'Shipments', id: 'navShipments', badge: 'shipmentsBadge' },
      { href: '/scanner', label: 'Scanner', id: 'navScanner' },
      { href: '/lost-punch', label: 'Lost Punch', id: 'navLostPunch' },
      { href: '/closing-duties', label: 'Closing Duties', id: 'navClosingDuties' },
      { href: '/time-off', label: 'Time Off', id: 'navTimeOff' },
      { href: '/ops-dashboard', label: 'Looker Dashboards', id: 'navOpsDashboard' },
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
      <a href="/home" class="logo-link">
        <img src="/images/suitsupply-logo.svg" alt="Suitsupply" class="logo-img" onerror="this.outerHTML='<span class=\\'logo-text\\'>SUITSUPPLY</span>'">
      </a>
      <div class="header-title">
        <h1>Daily Game Plan</h1>
        <span class="location">San Francisco</span>
      </div>
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
          <a href="/home" id="homeBtn">Home</a>
          <a href="#" id="switchUserBtn">Change User</a>
          <a href="#" id="logoutBtn">Logout</a>
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

    // Shipments badge
    this.setupShipmentsBadge();
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
    const isOnFeedbackPage = window.location.pathname === '/feedback';

    if (userName) userName.textContent = user.name;
    if (userAvatar && user.imageUrl) {
      userAvatar.src = user.imageUrl;
      userAvatar.style.display = 'block';
    }
    // Feedback is now shown at the bottom of the page (not in the header nav).
    if (feedbackLink) feedbackLink.style.display = isOnFeedbackPage ? 'inline' : 'none';
    this.mountBottomFeedbackLink(user);
    if (adminLink && user.isAdmin) {
      adminLink.style.display = 'inline';
    }
  },

  mountBottomFeedbackLink(user) {
    const canSee = !!(user?.isManager || user?.isAdmin);
    const isOnFeedbackPage = window.location.pathname === '/feedback';

    let link = document.getElementById('bottomFeedbackLink');
    if (!canSee || isOnFeedbackPage) {
      if (link) link.remove();
      return;
    }

    if (!link) {
      link = document.createElement('a');
      link.id = 'bottomFeedbackLink';
      link.className = 'feedback-floating-link';
      link.href = '/feedback';
      link.textContent = 'Feedback';
      document.body.appendChild(link);
    }
  },

  ensureShipmentsBadge() {
    const shipmentsLink = document.getElementById('navShipments');
    if (!shipmentsLink) return null;
    let badge = document.getElementById('shipmentsBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.id = 'shipmentsBadge';
      badge.style.display = 'none';
      badge.textContent = '0';
      shipmentsLink.appendChild(badge);
    }
    return badge;
  },

  canSeeShipmentsBadge() {
    const role = (this.currentUser?.role || '').toString().toUpperCase();
    return !!(this.currentUser?.isAdmin || this.currentUser?.isManager || role === 'BOH' || role === 'MANAGEMENT');
  },

  async updateShipmentsBadge() {
    const badge = this.ensureShipmentsBadge();
    if (!badge) return;

    if (!this.canSeeShipmentsBadge()) {
      badge.style.display = 'none';
      return;
    }

    try {
      const resp = await fetch('/api/shipments', { credentials: 'include' });
      if (!resp.ok) {
        badge.style.display = 'none';
        return;
      }
      const shipments = await resp.json();
      const pendingCount = (shipments || []).filter(s => {
        const status = (s?.status || '').toString().toLowerCase();
        return status === 'pending' || status === 'requested';
      }).length;

      if (pendingCount > 0) {
        badge.textContent = String(pendingCount);
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    } catch (_) {
      // Keep UI quiet on transient errors
      badge.style.display = 'none';
    }
  },

  setupShipmentsBadge() {
    // Always ensure element exists if the link is present (some pages have static headers)
    this.ensureShipmentsBadge();
    this.updateShipmentsBadge();

    if (this.shipmentsBadgeTimer) clearInterval(this.shipmentsBadgeTimer);
    this.shipmentsBadgeTimer = setInterval(() => {
      this.updateShipmentsBadge();
    }, 60000);
  },

  // Setup user switching (direct, no logout loop)
  setupUserSwitching() {
    const switchBtn = document.getElementById('switchUserBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userMenu = document.getElementById('userMenu');
    const dropdown = document.getElementById('userDropdown');

    if (dropdown && switchBtn) {
      const originalLabel = (switchBtn.textContent || '').trim().toLowerCase();
      const hasHomeBtn = !!document.getElementById('homeBtn');
      if (!hasHomeBtn && (originalLabel === 'home' || originalLabel === 'dashboard')) {
        // Preserve original "Home" behavior by adding a dedicated link.
        const homeLink = document.createElement('a');
        homeLink.href = '/home';
        homeLink.id = 'homeBtn';
        homeLink.textContent = 'Home';
        dropdown.insertBefore(homeLink, switchBtn);
      }
    }
    if (switchBtn) switchBtn.textContent = 'Change User';

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
        dropdown?.classList.remove('active');
        // "Change User" = log out and return to login (no user switching without password)
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (_) {}
        window.location.href = '/login-v2';
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (_) {}
        dropdown?.classList.remove('active');
        window.location.href = '/login-v2';
      });
    }

    // Some pages ship a minimal dropdown with only a single <a>.
    // Ensure "Logout" exists so user can always exit current session.
    if (dropdown && !document.getElementById('logoutBtn')) {
      const a = document.createElement('a');
      a.href = '#';
      a.id = 'logoutBtn';
      a.textContent = 'Logout';
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (_) {}
        dropdown.classList.remove('active');
        window.location.href = '/login-v2';
      });
      dropdown.appendChild(a);
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
