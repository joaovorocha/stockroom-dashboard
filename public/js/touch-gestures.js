// Touch Gestures & Native-like Interactions for iOS

class TouchGestureHandler {
  constructor() {
    this.touchStartX = 0;
    this.touchEndX = 0;
    this.touchStartY = 0;
    this.touchEndY = 0;
    this.touchStartTime = 0;
    this.init();
  }

  init() {
    // Prevent zoom on double-tap (except inputs)
    document.addEventListener('touchstart', this.handleTouchStart.bind(this));
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this));
    
    // Disable text selection on long press (except inputs)
    document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    
    // Add haptic feedback to buttons
    this.addHapticFeedback();
    
    // Handle pull-to-refresh
    this.initPullToRefresh();
    
    // Initialize bottom nav
    this.initBottomNav();
  }

  handleTouchStart(e) {
    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
    this.touchStartTime = Date.now();
    
    // Add touch visual feedback for buttons
    const target = e.target.closest('button, a, .nav-item, .clickable');
    if (target && !target.closest('input, textarea')) {
      target.style.opacity = '0.7';
    }
  }

  handleTouchEnd(e) {
    this.touchEndX = e.changedTouches[0].screenX;
    this.touchEndY = e.changedTouches[0].screenY;
    
    // Remove touch feedback
    const target = e.target.closest('button, a, .nav-item, .clickable');
    if (target) {
      target.style.opacity = '1';
    }
    
    this.handleSwipe();
    this.triggerHaptic();
  }

  handleTouchMove(e) {
    // Prevent default scroll bounce on iOS
    if (this.isAtTopOfPage() && e.changedTouches[0].clientY > this.touchStartY) {
      e.preventDefault();
    }
  }

  handleSwipe() {
    const diffX = this.touchEndX - this.touchStartX;
    const diffY = this.touchEndY - this.touchStartY;
    const timeDiff = Date.now() - this.touchStartTime;
    
    // Swipe threshold: 50px, within 300ms
    const threshold = 50;
    const timeThreshold = 300;
    
    if (Math.abs(diffX) > Math.abs(diffY) && timeDiff < timeThreshold) {
      if (diffX > threshold) {
        // Swiped right
        this.handleSwipeRight();
      } else if (diffX < -threshold) {
        // Swiped left
        this.handleSwipeLeft();
      }
    }
  }

  handleSwipeRight() {
    // Swipe right = go back
    if (history.length > 1) {
      // Don't go back if on home page
      if (!window.location.pathname.includes('home') && 
          !window.location.pathname === '/') {
        history.back();
      }
    }
  }

  handleSwipeLeft() {
    // Could be used for dismissing modals or sidebars
    const modal = document.querySelector('.modal.open');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  handleContextMenu(e) {
    // Allow context menu on links and images
    const target = e.target;
    if (!target.closest('a, img, [data-context-menu]')) {
      // This is already prevented by default for links/images
    }
  }

  addHapticFeedback() {
    // Add vibration on button clicks
    const buttons = document.querySelectorAll('button, a.button, .btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.triggerHaptic('light');
      });
    });
  }

  triggerHaptic(type = 'selection') {
    // iOS haptic feedback via vibration API
    if (navigator.vibrate) {
      switch (type) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(20);
          break;
        case 'heavy':
          navigator.vibrate(30);
          break;
        default:
          navigator.vibrate(15);
      }
    }
  }

  isAtTopOfPage() {
    return window.scrollY === 0;
  }

  initPullToRefresh() {
    const container = document.body;
    let startY = 0;
    let currentY = 0;
    let refreshTriggered = false;

    container.addEventListener('touchstart', (e) => {
      if (this.isAtTopOfPage()) {
        startY = e.touches[0].clientY;
      }
    });

    container.addEventListener('touchmove', (e) => {
      if (this.isAtTopOfPage()) {
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        
        if (diff > 0 && diff < 100) {
          // Show pull indicator
          this.showPullIndicator(diff);
        }
      }
    });

    container.addEventListener('touchend', (e) => {
      const diff = currentY - startY;
      if (diff > 60) {
        refreshTriggered = true;
        this.hidePullIndicator();
        this.performRefresh();
      } else {
        this.hidePullIndicator();
      }
    });
  }

  showPullIndicator(distance) {
    let indicator = document.getElementById('pull-to-refresh');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'pull-to-refresh';
      indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: white;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999;
        transition: none;
      `;
      indicator.innerHTML = '<span>⟳ Pull to refresh</span>';
      document.body.prepend(indicator);
    }
    
    indicator.style.transform = `translateY(${distance - 60}px)`;
    indicator.innerHTML = distance > 60 
      ? '<span>⟳ Release to refresh</span>' 
      : '<span>⟳ Pull to refresh</span>';
  }

  hidePullIndicator() {
    const indicator = document.getElementById('pull-to-refresh');
    if (indicator) {
      indicator.style.transform = 'translateY(-100%)';
      setTimeout(() => indicator.remove(), 300);
    }
  }

  performRefresh() {
    // Reload page
    location.reload();
  }

  initBottomNav() {
    // Initialize bottom navigation if it exists
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.triggerHaptic('light');
      });
    });
    
    // Set active based on current page
    this.setActiveNavItem();
  }

  setActiveNavItem() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && currentPath.includes(href.replace('/', ''))) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Prevent double-tap zoom on iOS
  preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new TouchGestureHandler();
  });
} else {
  new TouchGestureHandler();
}

// Service Worker for offline notifications
if ('serviceWorker' in navigator && 'Notification' in window) {
  navigator.serviceWorker.ready.then(registration => {
    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
}

// Export for use in other scripts
window.TouchGestureHandler = TouchGestureHandler;
