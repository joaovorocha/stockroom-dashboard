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
    if (logoLink) logoLink.href = '/app';
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
  } catch (_) {}

  // Hide Looker dashboards on phones (iPad/desktop only).
  if (isPhoneViewport()) {
    const lookerTile = document.getElementById('appLookerTile');
    if (lookerTile) lookerTile.style.display = 'none';
  }
});
