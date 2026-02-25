(function () {
  const state = {
    createdAt: new Date(),
    expirationDays: 3,
    createdBy: '',
    historyItems: []
  };

  const HISTORY_LIMIT = 50;
  const DEFAULT_PRINTER_IP = '10.201.40.35';

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatDateTime(date) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function setActivePill(value) {
    const pills = document.querySelectorAll('#expirationGroup .radio-pill');
    pills.forEach((pill) => {
      const input = pill.querySelector('input');
      if (!input) return;
      pill.classList.toggle('active', input.value === String(value));
    });
  }

  function updateReceipt() {
    const foodItem = els.foodItem.value.trim();
    const fullName = els.fullName.value.trim();
    const email = els.email.value.trim();
    const createdBy = state.createdBy || fullName || '—';
    const notes = els.notes.value.trim();

    const createdAt = state.createdAt;
    const expirationDate = addDays(createdAt, state.expirationDays);

    els.receiptFood.textContent = `Food: ${foodItem || '—'}`;
    els.receiptName.textContent = `Name: ${fullName || '—'}`;
    els.receiptEmail.textContent = `Email: ${email || '—'}`;
    els.receiptCreatedBy.textContent = `Created by: ${createdBy || '—'}`;
    els.receiptCreatedAt.textContent = `Created: ${formatDateTime(createdAt)}`;
    els.receiptExpires.textContent = `Expires (${state.expirationDays} days): ${formatDate(expirationDate)}`;
    els.receiptNotes.textContent = `Notes: ${notes || '—'}`;
  }

  function normalizeHistoryItem(job) {
    const data = typeof job?.data === 'string' ? (() => {
      try { return JSON.parse(job.data); } catch (_) { return {}; }
    })() : (job?.data || {});

    return {
      id: job?.id ? String(job.id) : data.id || String(Math.random()),
      foodItem: data.foodItem || '—',
      fullName: data.fullName || '—',
      email: data.email || '—',
      createdBy: data.createdBy || '—',
      notes: data.notes || '',
      createdAt: data.createdAt || job?.created_at || job?.createdAt,
      expirationDays: data.expirationDays || '—',
      expiresAt: data.expiresAt || '—'
    };
  }

  async function fetchHistory() {
    const response = await fetch(`/api/printers/print/freezer-history?limit=${HISTORY_LIMIT}`);
    if (!response.ok) {
      throw new Error('Failed to load history');
    }
    const data = await response.json();
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return jobs.map(normalizeHistoryItem);
  }

  async function renderHistory() {
    const list = els.historyList;
    if (!list) return;

    list.innerHTML = '<div class="help-note">Loading history...</div>';
    let history = [];
    try {
      history = await fetchHistory();
    } catch (error) {
      console.warn('[Freezer Labels] Failed to load history', error);
      list.innerHTML = '<div class="help-note">Unable to load history.</div>';
      return;
    }

    state.historyItems = history;
    if (history.length === 0) {
      list.innerHTML = '<div class="help-note">No labels printed yet.</div>';
      return;
    }

    list.innerHTML = history.map(item => {
      const createdAt = new Date(item.createdAt);
      const expiresAt = new Date(item.expiresAt);
      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-header">
            <span>🧊 ${item.foodItem}</span>
            <span class="history-meta">${formatDateTime(createdAt)}</span>
          </div>
          <div class="history-meta">Expires (${item.expirationDays} days): ${formatDate(expiresAt)}</div>
          <div class="history-meta">${item.fullName} · ${item.email}</div>
          <div class="history-meta">Created by: ${item.createdBy}</div>
          ${item.notes ? `<div class="history-meta">Notes: ${item.notes}</div>` : ''}
          <div class="history-actions">
            <button class="btn btn-sm btn-outline" data-action="load">Load</button>
            <button class="btn btn-sm btn-outline" data-action="remove">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-action="load"]').forEach(button => {
      button.addEventListener('click', () => {
        const itemEl = button.closest('.history-item');
        const id = itemEl?.dataset?.id;
        if (!id) return;
        const entry = state.historyItems.find(item => String(item.id) === String(id));
        if (!entry) return;
        els.foodItem.value = entry.foodItem || '';
        els.fullName.value = entry.fullName || '';
        els.email.value = entry.email || '';
        state.createdBy = entry.createdBy || state.createdBy;
        if (els.createdByDisplay) {
          els.createdByDisplay.textContent = state.createdBy || '—';
        }
        els.notes.value = entry.notes || '';
        state.expirationDays = Number(entry.expirationDays) || 3;
        state.createdAt = new Date(entry.createdAt || new Date());
        const radio = document.querySelector(`input[name="expirationDays"][value="${state.expirationDays}"]`);
        if (radio) radio.checked = true;
        setActivePill(state.expirationDays);
        updateReceipt();
      });
    });

    list.querySelectorAll('[data-action="remove"]').forEach(button => {
      button.addEventListener('click', () => {
        const itemEl = button.closest('.history-item');
        const id = itemEl?.dataset?.id;
        if (!id) return;
        state.historyItems = state.historyItems.filter(item => String(item.id) !== String(id));
        list.removeChild(itemEl);
      });
    });
  }

  function setCreatedAtNow() {
    state.createdAt = new Date();
    updateReceipt();
  }

  async function loadCurrentUser() {
    try {
      const response = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await response.json();
      if (!data?.authenticated || !data?.user) return;

      const userName = data.user.name || '';
      const userEmail = data.user.email || '';
      if (!els.fullName.value && userName) els.fullName.value = userName;
      if (!els.email.value && userEmail) els.email.value = userEmail;

      state.createdBy = userName || userEmail || state.createdBy;
      if (els.createdByDisplay) {
        els.createdByDisplay.textContent = state.createdBy || '—';
      }
      updateReceipt();
    } catch (error) {
      console.warn('[Freezer Labels] Failed to load user', error);
    }
  }

  async function handlePrint() {
    const requiredFields = [
      { el: els.foodItem, label: 'Food Item' },
      { el: els.fullName, label: 'Full Name' },
      { el: els.email, label: 'Email' }
    ];

    for (const field of requiredFields) {
      if (!field.el.value.trim()) {
        window.ErrorHandler?.showError(`${field.label} is required.`);
        field.el.focus();
        return;
      }
    }

    const createdAt = state.createdAt;
    const expiresAt = addDays(createdAt, state.expirationDays);

    const labelData = {
      foodItem: els.foodItem.value.trim(),
      fullName: els.fullName.value.trim(),
      email: els.email.value.trim(),
      createdBy: state.createdBy || els.fullName.value.trim(),
      notes: els.notes.value.trim(),
      createdAt: formatDateTime(createdAt),
      expirationDays: state.expirationDays,
      expiresAt: formatDate(expiresAt),
      warning: 'All food after the valid date will be thrown away.'
    };

    try {
      const response = await fetch('/api/printers/print/freezer-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelData, printerIp: DEFAULT_PRINTER_IP })
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Print failed');
      }

      showSuccess(`Printed to Epson ${result.printer}`);
      await renderHistory();
    } catch (error) {
      console.error('[Freezer Labels] Print error:', error);
      showError(error.message || 'Failed to print receipt');
    }
  }

  function init() {
    els.foodItem = $('foodItem');
    els.fullName = $('fullName');
    els.email = $('email');
    els.notes = $('notes');
    els.refreshTimestampBtn = $('refreshTimestampBtn');
    els.printLabelBtn = $('printLabelBtn');
    els.createdByDisplay = $('createdByDisplay');

    els.receiptFood = $('receiptFood');
    els.receiptName = $('receiptName');
    els.receiptEmail = $('receiptEmail');
    els.receiptCreatedBy = $('receiptCreatedBy');
    els.receiptCreatedAt = $('receiptCreatedAt');
    els.receiptExpires = $('receiptExpires');
    els.receiptNotes = $('receiptNotes');
    els.historyList = $('historyList');
    els.refreshHistoryBtn = $('clearHistoryBtn');

    const radios = document.querySelectorAll('input[name="expirationDays"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', (event) => {
        state.expirationDays = Number(event.target.value);
        setActivePill(state.expirationDays);
        updateReceipt();
      });
    });

    const inputs = [els.foodItem, els.fullName, els.email, els.notes];
    inputs.forEach((input) => {
      input.addEventListener('input', updateReceipt);
    });

    els.refreshTimestampBtn.addEventListener('click', () => {
      setCreatedAtNow();
    });

    els.printLabelBtn.addEventListener('click', handlePrint);

    els.refreshHistoryBtn?.addEventListener('click', () => {
      renderHistory();
    });

    const defaultRadio = document.querySelector('input[name="expirationDays"][value="3"]');
    if (defaultRadio) {
      defaultRadio.checked = true;
      setActivePill(3);
    }

    updateReceipt();
    loadCurrentUser();
    renderHistory();
  }

  function showSuccess(message) {
    alert(`✅ ${message}`);
  }

  function showError(message) {
    if (window.ErrorHandler?.showError) {
      window.ErrorHandler.showError(message);
      return;
    }
    alert(`❌ ${message}`);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
