// Shared Header Component for Stockroom Dashboard
// Standardized header with consistent navigation across all pages

const SharedHeader = {
  currentUser: null,
  shipmentsBadgeTimer: null,

  // Desktop: hide the wide link row and use the hamburger sheet (same as mobile).
  hamburgerNavOnDesktop: true,

  // Pages that show refresh button
  refreshPages: ['/dashboard', '/shipments'],

  // Page title mapping
  pageTitles: {
    '/home': 'GamePlan',
    '/app': 'GamePlan',
    '/dashboard': 'Daily Game Plan',
    '/operations-metrics': 'Operations Metrics',
    '/awards': 'Team Awards',
    '/expenses': 'Work-Related Expenses',
    '/shipments': 'Shipments',
    '/scanner': 'Scanner',
    '/radio': 'Radio Transcription',
    '/radio-transcripts': 'Radio Transcripts',
    '/radio-admin': 'Radio Admin',
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
    '/operations-metrics': '🛠️',
    '/awards': '🏆',
    '/expenses': '💳',
    '/shipments': '📦',
    '/scanner': '📷',
    '/radio': '🎙️',
    '/radio-transcripts': '📝',
    '/radio-admin': '🎛️',
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
    return 'GamePlan';
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
    const pageTitle = this.getPageTitle();

    const navItems = [
      { href: '/dashboard', label: 'Game Plan', id: 'navGamePlan' },
      { href: '/operations-metrics', label: 'Operations', id: 'navOperationsMetrics' },
      { href: '/awards', label: 'Awards', id: 'navAwards' },
      { href: '/expenses', label: 'Expenses', id: 'navExpenses', badge: 'expensesBadge' },
      { href: '/radio-transcripts', label: 'Radio Transcripts', id: 'navRadioTranscripts' },
      { href: '/shipments', label: 'Shipments', id: 'navShipments', badge: 'shipmentsBadge' },
      { href: '/scanner', label: 'Scanner', id: 'navScanner' },
      { href: '/lost-punch', label: 'Lost Punch', id: 'navLostPunch' },
      { href: '/closing-duties', label: 'Closing Duties', id: 'navClosingDuties' },
      { href: '/time-off', label: 'Time Off', id: 'navTimeOff' },
      { href: '/ops-dashboard', label: 'Looker Dashboards', id: 'navOpsDashboard' },
      { href: '/radio-admin', label: 'Radio Admin', id: 'navRadioAdmin', adminOnly: true },
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
        <h1>${pageTitle}</h1>
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
        <img src="data:," alt="" id="userAvatar" class="user-avatar-img" onerror="this.style.display='none'">
        <span id="userName">Guest</span>
        <div class="user-dropdown" id="userDropdown">
          <a href="#" id="logoutBtn">Logout</a>
        </div>
      </div>
    </div>
  </header>`;
  },

  // Initialize header
  async init() {
    this.registerServiceWorker();
    this.applyHomeBehavior();
    this.ensureCoreNavLinks();
    this.ensureMobileMenu();
    this.bindResponsiveHandlers();
    this.mountBottomScannerLink();

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

    // Expenses badge
    this.setupExpensesBadge();
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
        this.mountBottomScannerLink();
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
      { href: '/expenses', label: 'Expenses', id: 'navExpenses', badge: 'expensesBadge' },
      { href: '/radio-transcripts', label: 'Radio Transcripts', id: 'navRadioTranscripts' },
      { href: '/radio-admin', label: 'Radio Admin', id: 'navRadioAdmin', adminOnly: true }
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
        if (targetPath === '/expenses' && path === '/expenses.html') return a;
        if (targetPath === '/radio' && path === '/radio.html') return a;
        if (targetPath === '/radio-transcripts' && path === '/radio-transcripts.html') return a;
        if (targetPath === '/radio-admin' && path === '/radio-admin.html') return a;
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
        if (item.href === '/expenses' && existingPath === '/expenses.html') existing.setAttribute('href', item.href);
        if (item.href === '/radio' && existingPath === '/radio.html') existing.setAttribute('href', item.href);
        if (item.href === '/radio-transcripts' && existingPath === '/radio-transcripts.html') existing.setAttribute('href', item.href);
        if (item.href === '/radio-admin' && existingPath === '/radio-admin.html') existing.setAttribute('href', item.href);

        if (item.id && !existing.id) existing.id = item.id;
        if (item.adminOnly) existing.style.display = 'none';
        if (item.badge) ensureBadge(existing, item.badge);
        return;
      }

      const a = document.createElement('a');
      a.href = item.href;
      if (item.id) a.id = item.id;
      a.textContent = item.label;
      if (item.badge) ensureBadge(a, item.badge);
      if (item.adminOnly) a.style.display = 'none';

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
      } else if (item.href === '/radio-transcripts') {
        inserted =
          insertAfter(document.getElementById('navExpenses')) ||
          insertAfter(anchors.find(x => normalizePath(x.getAttribute('href') || x.href) === '/radio')) ||
          insertAfter(anchors.find(x => normalizePath(x.getAttribute('href') || x.href) === '/radio.html'));
      } else if (item.href === '/radio-admin') {
        inserted =
          insertAfter(document.getElementById('navRadioTranscripts')) ||
          insertAfter(anchors.find(x => normalizePath(x.getAttribute('href') || x.href) === '/admin')) ||
          insertAfter(anchors.find(x => normalizePath(x.getAttribute('href') || x.href) === '/admin.html')) ||
          insertAfter(document.getElementById('navExpenses'));
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
          // Scanner is a floating button on phones.
          if (isPhone && path === '/scanner') return false;
          // Hide Admin portal on phones (available on iPad/desktop only).
          if (isPhone && path === '/admin') return false;
          // Hide Radio Admin on phones (available on iPad/desktop only).
          if (isPhone && path === '/radio-admin') return false;
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
    const radioAdminLink = document.getElementById('navRadioAdmin');
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
    if (radioAdminLink) {
      if (user.isAdmin && !this.isPhoneViewport()) radioAdminLink.style.display = 'inline';
      else radioAdminLink.style.display = 'none';
    }
    if (opsLink) {
      opsLink.style.display = this.isPhoneViewport() ? 'none' : '';
    }

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

  mountBottomScannerLink() {
    const isPhone = this.isPhoneViewport();
    const isOnScannerPage = window.location.pathname === '/scanner';

    let link = document.getElementById('bottomScannerLink');
    if (!isPhone || isOnScannerPage) {
      if (link) link.remove();
      return;
    }

    if (!link) {
      link = document.createElement('a');
      link.id = 'bottomScannerLink';
      link.className = 'scanner-floating-link';
      link.href = '/scanner';
      link.textContent = 'Scanner';
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
    console.log('[SharedHeader] Looking for #logoutBtn:', logoutBtn);
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
    console.log('[SharedHeader] #logoutBtn ready:', logoutBtn);

    // Keep dropdown clean: logout only.
    dropdown.querySelectorAll('a').forEach((a) => {
      if (a !== logoutBtn) a.remove();
    });

    // Avoid double-binding if some page also re-initializes.
    if (!logoutBtn.dataset.bound) {
      console.log('[SharedHeader] Attaching logout event to #logoutBtn');
      // Replace node to drop any previously-attached handlers from page-specific scripts.
      const clean = logoutBtn.cloneNode(true);
      clean.dataset.bound = 'true';
      logoutBtn.replaceWith(clean);
      logoutBtn = clean;

      logoutBtn.addEventListener('click', async (e) => {
        console.log('[SharedHeader] Logout button clicked');
        e.preventDefault();
        e.stopPropagation();
        try {
          const resp = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
          console.log('[SharedHeader] Logout request sent, response:', resp);
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

document.addEventListener('DOMContentLoaded', () => {
  SharedHeader.init();
});
