// Global error handler
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

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );
}

function isPhoneViewport() {
  try {
    return window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  } catch (_) {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // In standalone mode, make the logo take you back to the app home.
  if (isStandalone()) {
    const logoLink = document.querySelector('.logo-link');
    if (logoLink) logoLink.href = '/home';
  }

  // Show admin tile if user is admin.
  try {
    const resp = await fetch('/api/auth/check', { credentials: 'include' });
    const data = await resp.json();
    if (!data?.authenticated) {
      window.location.href = '/login';
      return;
    }
    const tile = document.getElementById('appAdminTile');
    if (tile && data.user?.isAdmin && !isPhoneViewport()) tile.style.display = 'flex';
  } catch (error) {
    if (window.ErrorHandler) {
      ErrorHandler.logError('Authentication Check', error);
    }
  }

  // Hide Looker dashboards on phones (iPad/desktop only).
  if (isPhoneViewport()) {
    const lookerTile = document.getElementById('appLookerTile');
    if (lookerTile) lookerTile.style.display = 'none';
  }
});
