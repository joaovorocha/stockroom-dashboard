document.addEventListener('DOMContentLoaded', async () => {
  // This script powers the Home page quick summary + WTD overview.
  // It intentionally reuses a few helper functions from dashboard.js,
  // but dashboard.js auto-init is disabled on /home.

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const isEmptyDisplayValue = (value) => {
    const s = (value ?? '').toString().trim();
    if (!s) return true;
    if (s === '--') return true;
    if (s.toLowerCase() === 'none') return true;
    return false;
  };

  const setCardVisibleByValue = (valueElId, visible) => {
    const el = document.getElementById(valueElId);
    const card = el?.closest?.('.metric-card');
    if (!card) return;
    card.style.display = visible ? '' : 'none';
  };

  const setCardStatusClass = (valueElId, statusClass) => {
    const el = document.getElementById(valueElId);
    const card = el?.closest?.('.metric-card');
    if (!card) return;

    card.classList.remove('warning');
    card.classList.remove('success');
    if (statusClass) card.classList.add(statusClass);
  };

  const safeJson = async (resp) => {
    try {
      return await resp.json();
    } catch (_) {
      return null;
    }
  };

  // Ensure authenticated.
  let auth = null;
  try {
    const resp = await fetch('/api/auth/check', { credentials: 'include' });
    auth = await safeJson(resp);
  } catch (_) {}

  if (!auth?.authenticated) {
    window.location.href = '/login';
    return;
  }

  // dashboard.js globals (top-level `let` in dashboard.js is not attached to `window`).
  // These identifiers should exist because app.html loads dashboard.js before this script.
  try {
    currentUser = auth.user;
  } catch (_) {}

  try {
    // Load the minimum data needed for a useful Home.
    await Promise.all([
      typeof window.getStoreDayInfo === 'function' ? window.getStoreDayInfo() : Promise.resolve(null),
      typeof window.loadEmployees === 'function' ? window.loadEmployees() : Promise.resolve(null),
      typeof window.loadSettings === 'function' ? window.loadSettings() : Promise.resolve(null),
      typeof window.loadStoreConfig === 'function' ? window.loadStoreConfig() : Promise.resolve(null),
      typeof window.loadGameplan === 'function' ? window.loadGameplan() : Promise.resolve(null),
      typeof window.loadMetrics === 'function' ? window.loadMetrics() : Promise.resolve(null),
      typeof window.loadLoansData === 'function' ? window.loadLoansData() : Promise.resolve(null)
    ]);

    // Closing duties status for the current day (used in the quick summary).
    if (typeof window.loadClosingDutiesForToday === 'function') {
      await window.loadClosingDutiesForToday();
    }

    // Populate the WTD/metrics section (same IDs as the Game Plan metrics box).
    if (typeof window.updateMetricsDisplay === 'function') window.updateMetricsDisplay();
    if (typeof window.renderTailorProductivityLastWeek === 'function') window.renderTailorProductivityLastWeek();
    if (typeof window.renderWorkRelatedExpensesSummary === 'function') window.renderWorkRelatedExpensesSummary();
    if (typeof window.checkLoansOverdue === 'function') window.checkLoansOverdue();

    // Populate "Today" quick summary.
    const user = auth.user || {};

    // Find current user's employee entry across all groups.
    let userEmp = null;
    const groups = (typeof employees === 'object' && employees) ? employees : {};
    for (const type of Object.keys(groups || {})) {
      const list = Array.isArray(groups?.[type]) ? groups[type] : [];
      userEmp = list.find(e =>
        (e?.name || '').toString().toLowerCase() === (user?.name || '').toString().toLowerCase() ||
        (e?.employeeId?.toString?.() || '') === (user?.employeeId?.toString?.() || '')
      );
      if (userEmp) break;
    }

    const shift = (userEmp?.shift || userEmp?.role || '').toString().trim();
    const position = (
      userEmp?.station ||
      userEmp?.taskOfTheDay ||
      userEmp?.role ||
      ''
    ).toString().trim();
    const zones = Array.isArray(userEmp?.zones)
      ? userEmp.zones.map(z => (z || '').toString().trim()).filter(Boolean)
      : ((userEmp?.zone || '').toString().trim() ? [(userEmp?.zone || '').toString().trim()] : []);
    const zoneText = zones.length ? zones.join(' / ') : '';

    const lunch = (
      userEmp?.scheduledLunch ||
      userEmp?.lunch ||
      userEmp?.lunchTime ||
      userEmp?.lunchStart ||
      ''
    ).toString().trim();
    const fittingRoom = (
      userEmp?.fittingRoom ||
      userEmp?.fitting_room ||
      ''
    ).toString().trim();

    const shiftText = shift || '--';
    const positionText = position || '--';
    const zoneDisplayText = zoneText || '--';
    const lunchText = lunch || '--';
    const fittingRoomText = fittingRoom || '--';

    setText('homeShift', shiftText);
    setText('homePosition', positionText);
    setText('homeZone', zoneDisplayText);
    setText('homeLunch', lunchText);
    setText('homeFittingRoom', fittingRoomText);

    setCardVisibleByValue('homeShift', !isEmptyDisplayValue(shiftText));
    setCardVisibleByValue('homePosition', !isEmptyDisplayValue(positionText));
    setCardVisibleByValue('homeZone', !isEmptyDisplayValue(zoneDisplayText));
    setCardVisibleByValue('homeLunch', !isEmptyDisplayValue(lunchText));
    setCardVisibleByValue('homeFittingRoom', !isEmptyDisplayValue(fittingRoomText));

    const assignedClosing = Array.isArray(userEmp?.closingSections) ? userEmp.closingSections.filter(Boolean) : [];
    const submissions = Array.isArray(closingDutiesToday) ? closingDutiesToday : [];
    const submitted = new Set(submissions.map(s => (s?.section || '').toString()).filter(Boolean));

    if (assignedClosing.length === 0) {
      setText('homeClosingSummary', 'None');
      setText('homeClosingList', '--');
      setCardVisibleByValue('homeClosingSummary', false);
      setCardStatusClass('homeClosingSummary', null);
      const hint = document.getElementById('homeClosingHint');
      if (hint) hint.style.display = 'none';
      const card = document.getElementById('homeClosingCard');
      if (card) {
        card.classList.remove('clickable');
        card.style.cursor = '';
        card.onclick = null;
      }
    } else {
      const completedCount = assignedClosing.filter(s => submitted.has(s)).length;
      const pendingCount = Math.max(0, assignedClosing.length - completedCount);
      const summaryText = `${completedCount} completed • ${pendingCount} pending`;
      setText('homeClosingSummary', summaryText);

      const list = assignedClosing
        .map(s => `${s}${submitted.has(s) ? ' (done)' : ''}`)
        .join(', ');
      const listText = list || '--';
      setText('homeClosingList', listText);

      setCardVisibleByValue('homeClosingSummary', !isEmptyDisplayValue(summaryText) && !isEmptyDisplayValue(listText));

      // Visual status: yellow if anything pending, green when fully complete.
      if (pendingCount === 0 && completedCount > 0) {
        setCardStatusClass('homeClosingSummary', 'success');
      } else {
        setCardStatusClass('homeClosingSummary', 'warning');
      }

      const targetSection = assignedClosing.find(s => !submitted.has(s)) || assignedClosing[0];
      const card = document.getElementById('homeClosingCard');
      const hint = document.getElementById('homeClosingHint');
      if (card && targetSection) {
        card.classList.add('clickable');
        card.style.cursor = 'pointer';
        card.onclick = () => {
          const url = `/closing-duties?section=${encodeURIComponent(targetSection)}&submit=1`;
          window.location.href = url;
        };
        if (hint) hint.style.display = '';
      } else if (hint) {
        hint.style.display = 'none';
      }
    }

    // If everything is empty, hide the whole Today section.
    const todaySection = document.getElementById('homeTodaySection');
    if (todaySection) {
      const cards = Array.from(todaySection.querySelectorAll('.metric-card'));
      const visibleCards = cards.filter(c => c.style.display !== 'none');
      todaySection.style.display = visibleCards.length ? '' : 'none';
    }
  } catch (e) {
    console.error('[home-hub] Failed to load home summary:', e);
  }
});
