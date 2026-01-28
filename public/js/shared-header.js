// Shared Header Component for Daily Operations
// Standardized header with consistent navigation across all pages

// Global error handler and notification system
window.ErrorHandler = {
  showError(message, duration = 5000) {
    const existing = document.getElementById('globalErrorBox');
    if (existing) existing.remove();
    const errorBox = document.createElement('div');
    errorBox.id = 'globalErrorBox';
    errorBox.style.cssText = `position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:16px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;max-width:500px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;word-wrap:break-word;animation:slideIn 0.3s ease-out;`;
    errorBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div style="flex:1;"><strong style="display:block;margin-bottom:4px;">Error</strong><div>${message}</div></div><button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:0;width:24px;height:24px;">×</button></div>`;
    document.body.appendChild(errorBox);
    if (duration > 0) setTimeout(() => { if (errorBox.parentElement) errorBox.remove(); }, duration);
  },
  logError(context, error) {
    const message = error?.message || error?.error || String(error);
    this.showError(`${context}: ${message}`);
  }
};

// Add animation CSS if not already added
if (!document.getElementById('errorHandlerStyles')) {
  const style = document.createElement('style');
  style.id = 'errorHandlerStyles';
  style.textContent = '@keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
  document.head.appendChild(style);
}

function displayTodaysDate() {
  const dateElement = document.createElement('div');
  dateElement.id = 'todaysDateHeader';
  dateElement.style.cssText = 'font-size: 14px; font-weight: 500; color: var(--text-secondary);';
  const today = new Date();
  dateElement.textContent = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const header = document.querySelector('.header-nav');
  if (header) {
    header.prepend(dateElement);
  }
}

// Global fetch interceptor to ensure credentials are always included
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    if (!options.credentials) {
      options.credentials = 'include';
    }
    return originalFetch(url, options).catch(error => {
      window.ErrorHandler?.logError('Network Error', error);
      throw error;
    });
  };
})();

// Load error logger script
(function() {
  const script = document.createElement('script');
  script.src = '/js/error-logger.js?v=1';
  script.async = true;
  document.head.appendChild(script);
})();

const SharedHeader = {
  currentUser: null,
  shipmentsBadgeTimer: null,
  _initPromise: null,

  // Desktop: hide the wide link row and use the hamburger sheet (same as mobile).
  hamburgerNavOnDesktop: true,


  // Page title mapping
  pageTitles: {
    '/home': 'Daily Operations',
    '/app': 'Daily Operations',
    '/qr-decode': 'QR Decode',
    '/dashboard': 'Game Plan',
    '/awards': 'Team Awards',
    '/daily-scan-performance': 'Daily Scan Performance',
    '/expenses': 'Employee Discount',
    '/employee-discount': 'Employee Discount',
    '/shipments': 'Shipments',
    '/boh-shipments': 'BOH Shipments',
    '/lost-punch': 'Lost Punch',
    '/closing-duties': 'Closing Duties',
    '/time-off': 'Time Off',
    '/ops-dashboard': 'Looker Dashboards',
    '/admin': 'Admin Console',
    '/feedback': 'Feedback'
  },

  menuIcons: {
    '/home': '🏠',
    '/dashboard': '📋',
    '/qr-decode': '🔎',
    '/awards': '🏆',
    '/daily-scan-performance': '📊',
    '/expenses': '💳',
    '/employee-discount': '💳',
    '/shipments': '📦',
    '/boh-shipments': '📦',
    '/lost-punch': '🕒',
    '/closing-duties': '✅',
    '/time-off': '🗓️',
    '/ops-dashboard': '📈',
    '/admin': '🔐'
  },

  // Get current page path
  getCurrentPage() {
    return window.location.pathname;
  },

  // Get page title based on current path
  getPageTitle() {
    const path = this.getCurrentPage();
    // Check exact match first
    if (this.pageTitles[path]) {
      return this.pageTitles[path];
    }
    // Check if path includes any of the known paths
    for (const [route, title] of Object.entries(this.pageTitles)) {
      if (path.includes(route)) {
        return title;
      }
    }
    // Default title
    return 'Daily Operations';
  },

  // Generate header HTML
  render(options = {}) {
    const currentPage = this.getCurrentPage();
    const pageTitle = this.getPageTitle();

    const navItems = [
      { href: '/dashboard', label: 'Game Plan', id: 'navGamePlan' },
      { href: '/awards', label: 'Awards', id: 'navAwards' },
      { href: '/daily-scan-performance', label: 'Daily Scan', id: 'navDailyScan' },
      { href: '/employee-discount', label: 'Employee Discount', id: 'navExpenses', badge: 'expensesBadge' },
      { href: '/shipments', label: 'Shipments', id: 'navShipments', badge: 'shipmentsBadge' },
      { href: '/lost-punch', label: 'Lost Punch', id: 'navLostPunch' },
      { href: '/closing-duties', label: 'Closing Duties', id: 'navClosingDuties' },
      { href: '/time-off', label: 'Time Off', id: 'navTimeOff' },
      { href: '/ops-dashboard', label: 'Looker Dashboards', id: 'navOpsDashboard' },
      { href: '/admin', label: 'Admin', id: 'navAdmin', adminOnly: true }
    ];

    const navHtml = navItems.map(item => {
      const isActive = currentPage.includes(item.href) ? 'class="active"' : '';
      const style = (item.managerOnly || item.adminOnly) ? 'style="display:none;"' : '';
      const dataAttrs = `${item.managerOnly ? ' data-manager-only="true"' : ''}${item.adminOnly ? ' data-admin-only="true"' : ''}`;
      const badge = item.badge ? `<span class="nav-badge" id="${item.badge}" style="display:none;">0</span>` : '';
      return `<a href="${item.href}" ${isActive} id="${item.id}" ${style}${dataAttrs}>${item.label}${badge}</a>`;
    }).join('\n      ');

    return `
  <header class="header">
    <div class="header-brand">
      <a href="/home" class="logo-link">
        <img src="/icons/icon-32.png" alt="Daily Operations" class="logo-img" onerror="this.outerHTML='<span class=\\'logo-text\\'>DAILY OPS</span>'">
      </a>
      <div class="header-title">
        <h1>${pageTitle}</h1>
        <span class="location">San Francisco</span>
      </div>
    </div>

    <div class="header-center-logo">
      <img src="https://cdn.freebiesupply.com/logos/large/2x/suitsupply-logo-logo-svg-vector.svg" alt="Suitsupply" class="suitsupply-logo">
    </div>

    <nav class="header-nav">
      ${navHtml}
    </nav>

    <div class="header-actions">
      <div class="header-date">
        <span id="currentDate"></span>
      </div>
      <div class="header-user" id="userMenu">
        <img src="data:," alt="" id="userAvatar" class="user-avatar-img" onerror="this.style.display='none'">
        <span id="userName">Guest</span>
        <div class="user-dropdown" id="userDropdown">
          <a href="#" id="logoutBtn">Logout</a>
        </div>
      </div>
    </div>
  </header>`;
  },

  // Locate the mount target (supporting legacy IDs)
  getMountTarget() {
    if (this._mountTarget && document.body && document.body.contains(this._mountTarget)) {
      return this._mountTarget;
    }

    const selectors = ['#shared-header-mount', '#sharedHeaderMount', '[data-shared-header]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        this._mountTarget = el;
        return el;
      }
    }

    this._mountTarget = null;
    return null;
  },

  // Render the shared header into the mount placeholder
  mountHeader(options = {}) {
    if (typeof document === 'undefined') return null;

    let mount = this.getMountTarget();
    if (!mount) {
      if (!document.body) return null;
      mount = document.createElement('div');
      mount.id = 'shared-header-mount';
      document.body.insertBefore(mount, document.body.firstChild || null);
      this._mountTarget = mount;
    }

    if (mount.dataset.rendered === 'true' && !options.force) {
      return mount;
    }

    const derivedOptions = { ...options };
    const showRefreshAttr = mount.dataset.showRefresh;
    if (showRefreshAttr === 'false') derivedOptions.showRefresh = false;
    else if (showRefreshAttr === 'true') derivedOptions.showRefresh = true;

    mount.innerHTML = this.render(derivedOptions);
    mount.dataset.rendered = 'true';
    return mount;
  },

  // Initialize header
  async init() {
    if (this._initPromise) return this._initPromise;
    const self = this;
    this._initPromise = (async () => {
      try {
        self.mountHeader();
        self.registerServiceWorker();
        self.applyHomeBehavior();
        self.ensureCoreNavLinks();
        self.ensureMobileMenu();
        self.bindResponsiveHandlers();

        // Setup user switching early so Logout works even if auth check fails.
        self.setupUserSwitching();

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
        await self.checkAuth();

        // Shipments badge
        self.setupShipmentsBadge();

        // Expenses badge
        self.setupExpensesBadge();
      } catch (e) {
        console.warn('[SharedHeader] init failed (continuing):', e);
      }
    })();
    return this._initPromise;
  },

  bindResponsiveHandlers() {
    if (this._responsiveBound) return;
    this._responsiveBound = true;
    let t = null;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        this.applyHomeBehavior();
        this.ensureCoreNavLinks();
        this.ensureMobileMenu();
      }, 120);
    });
  },

  isMobileViewport() {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    } catch (_) {
      return false;
    }
  },

  isPhoneViewport() {
    // "Phone" = small viewport (hide admin portal); iPads/tablets are allowed.
    try {
      return window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    } catch (_) {
      return false;
    }
  },

  isStandalone() {
    try {
      if (window.navigator.standalone === true) return true; // iOS Safari
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (_) {}
    return false;
  },

  applyHomeBehavior() {
    const isStandalone = this.isStandalone();
    const isMobile = this.isMobileViewport();
    if (isStandalone) document.body.classList.add('is-standalone');
    if (isMobile) document.body.classList.add('is-mobile-nav');
    else document.body.classList.remove('is-mobile-nav');
    if (this.hamburgerNavOnDesktop && !isMobile) document.body.classList.add('is-hamburger-nav');
    else document.body.classList.remove('is-hamburger-nav');
    if (this.isPhoneViewport()) document.body.classList.add('is-phone');
    else document.body.classList.remove('is-phone');

    const logoLink = document.querySelector('.logo-link');
    // The logo is the Home screen everywhere.
    if (logoLink) logoLink.href = '/home';

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) homeBtn.href = '/home';

    // Phones: hide heavy pages that don't work well on small devices.
    const isPhone = this.isPhoneViewport();
    const ops = document.getElementById('navOpsDashboard');
    if (ops) ops.style.display = isPhone ? 'none' : '';
  },

  ensureMobileMenu() {
    const wantsHamburger = this.isMobileViewport() || document.body.classList.contains('is-hamburger-nav');
    if (!wantsHamburger) return;

    const header = document.querySelector('header.header');
    const brand = document.querySelector('.header-brand');
    const actions = document.querySelector('.header-actions');
    if (!header || !brand || !actions) return;

    let btn = document.getElementById('mobileMenuBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'mobileMenuBtn';
      btn.type = 'button';
      btn.className = 'mobile-menu-btn';
      btn.innerHTML = '&#9776;';
      btn.setAttribute('aria-label', 'Menu');
      btn.addEventListener('click', () => this.openMobileMenu());
    }

    // Mobile header order: hamburger → logo → user.
    const logoLink = brand.querySelector('.logo-link');
    if (logoLink && btn.parentElement !== brand) {
      brand.insertBefore(btn, logoLink);
    } else if (logoLink && brand.firstElementChild !== btn) {
      brand.insertBefore(btn, logoLink);
    }

    if (!document.getElementById('mobileMenuOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'mobileMenuOverlay';
      overlay.className = 'mobile-menu-overlay';
      overlay.innerHTML = `
        <div class="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div class="mobile-menu-header">
            <div class="mobile-menu-title">Menu</div>
            <button type="button" class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">×</button>
          </div>
          <div class="mobile-menu-items" id="mobileMenuItems"></div>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target?.id === 'mobileMenuOverlay') this.closeMobileMenu();
      });
      document.body.appendChild(overlay);

      overlay.querySelector('#mobileMenuClose')?.addEventListener('click', () => this.closeMobileMenu());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeMobileMenu();
      });
    }

    this.refreshMobileMenuItems();
  },

  ensureCoreNavLinks() {
    const nav = document.querySelector('.header-nav');
    if (!nav) return;

    const desired = [
      { href: '/employee-discount', label: 'Employee Discount', id: 'navExpenses', badge: 'expensesBadge' }
    ];

    const normalizePath = (href) => {
      try {
        return new URL(href, window.location.origin).pathname;
      } catch (_) {
        return href;
      }
    };

    const findAnchorFor = (targetPath) => {
      const anchors = Array.from(nav.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const path = normalizePath(a.getAttribute('href') || a.href);
        if (path === targetPath) return a;

        // Backward-compat for older hardcoded links.
        if (targetPath === '/employee-discount' && (path === '/expenses' || path === '/expenses.html')) return a;
      }
      return null;
    };

    const ensureBadge = (a, badgeId) => {
      if (!badgeId) return;
      let badge = a.querySelector(`#${badgeId}`);
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.id = badgeId;
        badge.style.display = 'none';
        badge.textContent = '0';
        a.appendChild(document.createTextNode(' '));
        a.appendChild(badge);
      }
    };

    // Ensure canonical links exist; if a legacy link exists, normalize it and add ids/badges.
    desired.forEach((item) => {
      const existing = findAnchorFor(item.href);
      if (existing) {
        const existingPath = normalizePath(existing.getAttribute('href') || existing.href);
        // Normalize legacy `.html` links to canonical routes.
        if (existingPath === `${item.href}.html`) existing.setAttribute('href', item.href);
        if (item.href === '/employee-discount' && (existingPath === '/expenses' || existingPath === '/expenses.html')) existing.setAttribute('href', item.href);

        if (item.id && !existing.id) existing.id = item.id;
        if (item.badge) ensureBadge(existing, item.badge);
        return;
      }

      const a = document.createElement('a');
      a.href = item.href;
      if (item.id) a.id = item.id;
      a.textContent = item.label;
      if (item.badge) ensureBadge(a, item.badge);

      const anchors = Array.from(nav.querySelectorAll('a[href]'));
      const insertAfter = (afterEl) => {
        if (!afterEl || afterEl.parentElement !== nav) return false;
        if (afterEl.nextSibling) nav.insertBefore(a, afterEl.nextSibling);
        else nav.appendChild(a);
        return true;
      };

      let inserted = false;
      if (item.href === '/expenses') {
        inserted =
          insertAfter(document.getElementById('navAwards')) ||
          insertAfter(document.getElementById('navOperationsMetrics')) ||
          insertAfter(document.getElementById('navGamePlan'));
      }
      if (!inserted) nav.appendChild(a);
    });

    // Keep hamburger menu in sync with injected links.
    this.refreshMobileMenuItems();
  },

  refreshMobileMenuItems() {
    const items = document.getElementById('mobileMenuItems');
    if (!items) return;

    const currentPath = window.location.pathname || '/';
    const isPhone = this.isPhoneViewport();

    const buildMenuItem = ({ href, path, label, active }) => {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'mobile-menu-item';
      if (active) a.classList.add('active');

      const left = document.createElement('span');
      left.className = 'mobile-menu-item-left';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'mobile-menu-icon';
      iconSpan.textContent = this.menuIcons[path] || '•';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'mobile-menu-label';
      labelSpan.textContent = label;

      left.appendChild(iconSpan);
      left.appendChild(labelSpan);
      a.appendChild(left);
      return a;
    };

    const getAnchorLabel = (a) => {
      // Use only text nodes (ignores badge counts).
      let text = '';
      a.childNodes.forEach((n) => {
        if (n && n.nodeType === Node.TEXT_NODE) text += (n.textContent || '');
      });
      text = text.replace(/\s+/g, ' ').trim();
      if (text) return text;
      return (a.textContent || '').replace(/\s+/g, ' ').trim();
    };

    const links = Array.from(document.querySelectorAll('.header-nav a'))
      .filter(a => a?.href)
      .filter(a => a.id !== 'navFeedback') // feedback is bottom link only
      .filter(a => {
        // Respect visibility toggles (admin link is hidden unless admin).
        const inlineDisplay = (a.style?.display || '').toLowerCase();
        if (inlineDisplay === 'none') return false;

        const href = a.getAttribute('href') || a.href;
        try {
          const path = new URL(href, window.location.origin).pathname;
          // We'll always inject Home (/home) ourselves.
          if (path === '/home' || path === '/app') return false;
          // Hide Admin portal on phones (available on iPad/desktop only).
          if (isPhone && path === '/admin') return false;
          // Hide Looker dashboards on phones (iPad/desktop only).
          if (isPhone && path === '/ops-dashboard') return false;
        } catch (_) {}
        const label = getAnchorLabel(a).trim().toLowerCase();
        if (label === 'home') return false;
        return true;
      });

    // Home first
    items.innerHTML = '';
    items.appendChild(buildMenuItem({
      href: '/home',
      path: '/home',
      label: 'Home',
      active: currentPath === '/home' || currentPath === '/app'
    }));

    const seen = new Set(['/home', '/app']);
    links.forEach(a => {
      const href = a.getAttribute('href') || a.href;
      const label = getAnchorLabel(a);
      try {
        const path = new URL(href, window.location.origin).pathname;
        if (seen.has(path)) return;
        seen.add(path);
        items.appendChild(buildMenuItem({
          href,
          path,
          label,
          active: path === currentPath
        }));
      } catch (_) {
        items.appendChild(buildMenuItem({
          href,
          path: href,
          label,
          active: a.classList.contains('active')
        }));
      }
    });

    // Close menu on navigation
    items.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => this.closeMobileMenu());
    });
  },

  openMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    if (!overlay) return;
    this.refreshMobileMenuItems();
    overlay.classList.add('active');
  },

  closeMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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
    const opsLink = document.getElementById('navOpsDashboard');

    if (userName) userName.textContent = user.name;
    if (userAvatar && user.imageUrl) {
      userAvatar.src = user.imageUrl;
      userAvatar.style.display = 'block';
    }
    // Feedback is now shown at the bottom of the page (not in the header nav).
    if (feedbackLink) feedbackLink.style.display = 'none';
    this.mountBottomFeedbackLink(user);
    if (adminLink) {
      if (user.isAdmin && !this.isPhoneViewport()) adminLink.style.display = 'inline';
      else adminLink.style.display = 'none';
    }

    // Show admin-only links for admins (except the Admin Console link which stays hidden on phones).
    document.querySelectorAll('.header-nav a[data-admin-only="true"]').forEach((a) => {
      if (a && a.id === 'navAdmin') return;
      a.style.display = user?.isAdmin ? '' : 'none';
    });

    if (opsLink) {
      opsLink.style.display = this.isPhoneViewport() ? 'none' : '';
    }

    // Show manager-only links for managers/admins (and explicit radio config permission).
    const canSeeManagerLinks = !!(user?.isManager || user?.isAdmin);
    document.querySelectorAll('.header-nav a[data-manager-only="true"]').forEach((a) => {
      a.style.display = canSeeManagerLinks ? '' : 'none';
    });

    // Keep the mobile menu in sync with permission-based nav visibility.
    this.refreshMobileMenuItems();
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

  async setupExpensesBadge() {
    try {
      const badge = document.getElementById('expensesBadge');
      if (!badge) return;
      const resp = await fetch('/api/expenses/status', { credentials: 'include' });
      if (!resp.ok) {
        badge.style.display = 'none';
        return;
      }
      const data = await resp.json();
      const over = !!(data?.overLimit?.yearly);
      if (!data?.available || !over) {
        badge.style.display = 'none';
        return;
      }
      badge.textContent = '!';
      badge.style.display = 'inline-flex';
    } catch (_) {
      const badge = document.getElementById('expensesBadge');
      if (badge) badge.style.display = 'none';
    }
  },

  // Setup user switching (direct, no logout loop)
  setupUserSwitching() {
    const userMenu = document.getElementById('userMenu');
    const dropdown = document.getElementById('userDropdown');

    if (!dropdown) return;

    // Remove "Change User" / "Switch User" (logout is the only action now).
    dropdown.querySelectorAll('#switchUserBtn').forEach(el => el.remove());

    if (userMenu && dropdown) {
      userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('active');
      });
    }

    let logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) {
      console.warn('[SharedHeader] #logoutBtn not found, attempting to create or convert.');
      // Convert any existing single-action link (e.g., "Switch User") to Logout.
      const candidate = dropdown.querySelector('a');
      if (candidate) {
        logoutBtn = candidate;
        logoutBtn.id = 'logoutBtn';
      } else {
        logoutBtn = document.createElement('a');
        logoutBtn.href = '#';
        logoutBtn.id = 'logoutBtn';
        dropdown.appendChild(logoutBtn);
      }
    }

    logoutBtn.textContent = 'Logout';
    logoutBtn.href = '#';

    // Keep dropdown clean: logout only.
    dropdown.querySelectorAll('a').forEach((a) => {
      if (a !== logoutBtn) a.remove();
    });

    // Avoid double-binding if some page also re-initializes.
    if (!logoutBtn.dataset.bound) {
      // Replace node to drop any previously-attached handlers from page-specific scripts.
      const clean = logoutBtn.cloneNode(true);
      clean.dataset.bound = 'true';
      logoutBtn.replaceWith(clean);
      logoutBtn = clean;

      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const resp = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (err) {
          console.error('[SharedHeader] Logout request failed:', err);
        }
        dropdown.classList.remove('active');
        window.location.href = '/login';
      });
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
// Apply mobile/home behavior as early as possible to avoid a flash of the desktop nav on phones.
try {
  SharedHeader.applyHomeBehavior();
  SharedHeader.ensureCoreNavLinks();
  SharedHeader.ensureMobileMenu();
} catch (_) {}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SharedHeader.init());
  } else {
    SharedHeader.init();
  }
} catch (_) {}
