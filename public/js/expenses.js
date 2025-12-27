async function fetchJson(url) {
  const resp = await fetch(url, { credentials: 'include' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `Request failed: ${resp.status}`);
  return data;
}

function toMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function isoToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isoStartOfYear() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function isoStartOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function normalizeEmail(v) {
  return (v || '').toString().trim().toLowerCase();
}

function getRangeFilters() {
  const range = document.getElementById('rangeSelect')?.value || 'ytd';
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');

  if (range === 'ytd') return { start: isoStartOfYear(), end: isoToday() };
  if (range === 'month') return { start: isoStartOfMonth(), end: isoToday() };
  return { start: startEl?.value || null, end: endEl?.value || null };
}

function getInitials(nameOrEmail) {
  const raw = (nameOrEmail || '').toString().trim();
  if (!raw) return '--';
  const parts = raw.includes(' ') ? raw.split(/\s+/) : raw.split('@')[0].split('.');
  const letters = parts.filter(Boolean).map(p => p[0]).slice(0, 2).join('');
  return (letters || raw[0] || '--').toUpperCase();
}

function setBanner(text) {
  const banner = document.getElementById('limitBanner');
  if (!banner) return;
  if (!text) {
    banner.style.display = 'none';
    banner.textContent = '';
    return;
  }
  banner.textContent = text;
  banner.style.display = 'block';
}

function populateEmployeeSelect(employees) {
  const field = document.getElementById('employeeFilterField');
  const select = document.getElementById('employeeSelect');
  if (!field || !select) return;

  if (!Array.isArray(employees) || employees.length === 0) {
    field.style.display = 'none';
    return;
  }

  field.style.display = '';
  select.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = 'All employees';
  select.appendChild(optAll);

  const knownGroup = document.createElement('optgroup');
  knownGroup.label = 'Known (in users list)';
  const unknownGroup = document.createElement('optgroup');
  unknownGroup.label = 'Unknown (not in users list)';

  employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e?.key || e?.employee?.email || e?.employee?.employeeId || e?.employee?.name || '';
    const name = e?.employee?.name || e?.employee?.email || e?.employee?.employeeId || 'Unknown';
    const label = e?.known === false ? `${name} (Unknown)` : name;
    opt.textContent = label;
    (e?.known === false ? unknownGroup : knownGroup).appendChild(opt);
  });

  if (knownGroup.children.length) select.appendChild(knownGroup);
  if (unknownGroup.children.length) select.appendChild(unknownGroup);
}

let currentEmployeeTab = 'known'; // known | unknown | all
let lastEmployeesForPanel = [];

function renderEmployeeTabs(employees) {
  const tabs = document.getElementById('employeeTabs');
  if (!tabs) return;
  const list = Array.isArray(employees) ? employees : [];
  const knownCount = list.filter(e => e?.known !== false).length;
  const unknownCount = list.filter(e => e?.known === false).length;
  const total = list.length;

  const mkBtn = (key, label) => {
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.textContent = label;
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '999px';
    btn.style.border = key === currentEmployeeTab ? '1px solid var(--text)' : '1px solid var(--border)';
    btn.style.background = key === currentEmployeeTab ? 'var(--surface)' : 'var(--background)';
    btn.addEventListener('click', () => {
      currentEmployeeTab = key;
      renderEmployeeTabs(lastEmployeesForPanel);
      renderEmployeePanel(lastEmployeesForPanel);
    });
    return btn;
  };

  tabs.innerHTML = '';
  tabs.appendChild(mkBtn('known', `Known (${knownCount})`));
  if (unknownCount) tabs.appendChild(mkBtn('unknown', `Unknown (${unknownCount})`));
  tabs.appendChild(mkBtn('all', `All (${total})`));
}

function renderEmployeePanel(employees) {
  const panel = document.getElementById('employeePanel');
  const grid = document.getElementById('employeeGrid');
  if (!panel || !grid) return;

  lastEmployeesForPanel = Array.isArray(employees) ? employees : [];
  renderEmployeeTabs(lastEmployeesForPanel);

  if (!Array.isArray(employees) || employees.length === 0) {
    panel.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  const filteredEmployees = currentEmployeeTab === 'known'
    ? employees.filter(e => e?.known !== false)
    : currentEmployeeTab === 'unknown'
      ? employees.filter(e => e?.known === false)
      : employees;

  panel.style.display = 'block';
  grid.innerHTML = '';

  filteredEmployees.slice(0, 200).forEach(e => {
    const card = document.createElement('div');
    const over = !!(e?.overLimit?.yearly || e?.overLimit?.monthly);
    const unauthCount = Number(e?.unauthorizedOrders || 0);
    const hasUnauth = unauthCount > 0;
    card.className = `employee-card${over ? ' over' : ''}${hasUnauth ? ' unauth' : ''}`;

    const name = e?.employee?.name || e?.employee?.email || 'Unknown';
    const email = e?.employee?.email || '';
    const imgUrl = e?.employee?.imageUrl || null;
    const used = Number(e?.status?.yearly?.used || 0);
    const limit = Number(e?.status?.yearly?.limit || 0);
    const remaining = Number(e?.status?.yearly?.remaining || 0);
    const percent = Number.isFinite(Number(e?.status?.yearly?.percentUsed)) ? Number(e.status.yearly.percentUsed) : null;
    const pctWidth = percent !== null ? Math.max(0, Math.min(100, percent)) : (limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0);

    const avatar = imgUrl
      ? `<img class="emp-avatar" src="${imgUrl}" alt="" onerror="this.remove()">`
      : `<div class="emp-initials">${getInitials(name)}</div>`;

    const unauthPill = hasUnauth ? `<span class="pill warn" title="Orders approved by a non-manager">(!) ${unauthCount} review</span>` : '';

    card.innerHTML = `
      <div class="top">
        <div class="meta">
          ${avatar}
          <div class="text">
            <div class="title">${name}</div>
            <div class="sub">${email || 'Not in user list'}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${unauthPill}
          <span class="pill">${toMoney(remaining)} left</span>
        </div>
      </div>
      <div class="bar"><div style="width:${pctWidth}%;"></div></div>
      <div class="nums">
        <span>${toMoney(used)} used</span>
        <span>Limit ${toMoney(limit || 2500)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      const select = document.getElementById('employeeSelect');
      if (select) {
        // Prefer normalized key; fallback to name/email.
        const val = e?.key || e?.employee?.email || e?.employee?.employeeId || e?.employee?.name || '';
        // Try to set the <select> value, but also store a "forced" value for the next update
        // (some browsers won't set select.value unless an option exists).
        try {
          const target = (val || '').toString();
          const targetLower = target.toLowerCase();
          const opts = Array.from(select.options || []);
          const match = opts.find(o => (o.value || '').toString().toLowerCase() === targetLower);
          if (match) select.value = match.value;
        } catch (_) {}
        window.__expensesSelectedEmployee = val;
      }
      document.getElementById('applyBtn')?.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    grid.appendChild(card);
  });
}

function renderOrders(orders) {
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!Array.isArray(orders) || orders.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'No orders found for this range.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  orders.forEach((o, idx) => {
    const tr = document.createElement('tr');

    const unauthorized = !!o?.unauthorized;
    const reviewMsg = 'Approver is not marked as manager/admin (review)';

    const tdDate = document.createElement('td');
    tdDate.textContent = o.calendarDate || '--';

    const tdEmp = document.createElement('td');
    const empWrap = document.createElement('div');
    empWrap.className = 'emp-cell';
    const beneficiary = o?.beneficiary || {};
    const imgUrl = beneficiary?.imageUrl;
    if (imgUrl) {
      const img = document.createElement('img');
      img.className = 'emp-avatar';
      img.src = imgUrl;
      img.alt = '';
      img.onerror = () => img.remove();
      empWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'emp-initials';
      ph.textContent = getInitials(beneficiary?.name || beneficiary?.email);
      empWrap.appendChild(ph);
    }
    const meta = document.createElement('div');
    meta.className = 'emp-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = beneficiary?.name || beneficiary?.email || '--';
    const emailEl = document.createElement('div');
    emailEl.className = 'email';
    emailEl.textContent = beneficiary?.email || '';
    meta.appendChild(nameEl);
    if (beneficiary?.email) meta.appendChild(emailEl);
    empWrap.appendChild(meta);
    tdEmp.appendChild(empWrap);

    const tdApprover = document.createElement('td');
    const approver = o?.approver || {};
    const approverName = approver?.name || approver?.email || '--';
    const approverEmail = approver?.email || '';
    const approverWrap = document.createElement('div');
    approverWrap.style.display = 'flex';
    approverWrap.style.gap = '8px';
    approverWrap.style.alignItems = 'center';
    approverWrap.style.flexWrap = 'wrap';
    const approverNameEl = document.createElement('span');
    approverNameEl.textContent = approverName;
    approverWrap.appendChild(approverNameEl);
    if (approverEmail) {
      const emailPill = document.createElement('span');
      emailPill.className = 'pill';
      emailPill.textContent = approverEmail;
      approverWrap.appendChild(emailPill);
    }
    const isManager = !!(approver?.isManager || approver?.isAdmin);
    const statusPill = document.createElement('span');
    statusPill.className = `pill ${isManager ? 'success' : 'warn'}`;
    statusPill.textContent = isManager ? 'Manager' : '(!) Approver';
    statusPill.title = isManager ? 'Approved by a manager/admin' : reviewMsg;
    approverWrap.appendChild(statusPill);
    tdApprover.appendChild(approverWrap);

    const tdReason = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = o.discountReason || '--';
    tdReason.appendChild(pill);

    const tdRetail = document.createElement('td');
    tdRetail.className = 'right';
    tdRetail.textContent = toMoney(o?.amounts?.lc?.fullPrice);

    const tdDiscount = document.createElement('td');
    tdDiscount.className = 'right';
    tdDiscount.textContent = toMoney(o?.amounts?.lc?.discount);

    const tdOrder = document.createElement('td');
    if (o.orderId) {
      const a = document.createElement('a');
      a.className = 'mono order-link';
      a.href = `https://ussbp.omni.manh.com/customerengagementfacade/app/orderstatus?orderId=${encodeURIComponent(String(o.orderId))}&selectedOrg=SUIT-US`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = String(o.orderId);
      a.title = 'Open order status';
      tdOrder.appendChild(a);
    } else {
      const code = document.createElement('span');
      code.className = 'mono';
      code.textContent = '--';
      tdOrder.appendChild(code);
    }

    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.textContent = 'Details';
    btn.addEventListener('click', () => showOrderDetailModal(o));
    tdAction.appendChild(btn);

    tr.appendChild(tdDate);
    tr.appendChild(tdEmp);
    tr.appendChild(tdApprover);
    tr.appendChild(tdReason);
    tr.appendChild(tdRetail);
    tr.appendChild(tdDiscount);
    tr.appendChild(tdOrder);
    tr.appendChild(tdAction);

    if (unauthorized) tr.title = reviewMsg;

    tbody.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function refreshOrderNotesUI(orderId) {
  const notesWrap = document.getElementById('orderNotesWrap');
  if (!notesWrap) return;
  notesWrap.innerHTML = '<div class="pill">Loading…</div>';
  try {
    const data = await fetchJson(`/api/expenses/orders/${encodeURIComponent(orderId)}/notes`);
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    const atts = Array.isArray(data?.attachments) ? data.attachments : [];

    const notesHtml = notes.length
      ? `<div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          ${notes.map(n => `
            <div style="border:1px solid var(--border); border-radius:10px; padding:10px 12px; background: var(--background);">
              <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <span class="pill">${escapeHtml(n?.createdBy?.name || n?.createdBy?.email || 'User')}</span>
                <span class="pill">${n?.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</span>
              </div>
              <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(n?.text || '')}</div>
            </div>
          `).join('')}
        </div>`
      : '<div style="margin-top:10px; color: var(--text-secondary);">No notes yet.</div>';

    const attsHtml = atts.length
      ? `<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          ${atts.map(a => `
            <a class="order-link" href="/api/expenses/orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(a.id)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(a.originalName || a.storedName || 'Attachment')}
            </a>
          `).join('')}
        </div>`
      : '<div style="margin-top:10px; color: var(--text-secondary);">No attachments uploaded.</div>';

    notesWrap.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr; gap: 18px;">
        <div>
          <div class="label">Notes</div>
          ${notesHtml}
        </div>
        <div>
          <div class="label">Attachments</div>
          ${attsHtml}
        </div>
      </div>
    `;
  } catch (e) {
    notesWrap.innerHTML = `<div class="pill danger">${escapeHtml(e?.message || 'Failed to load notes')}</div>`;
  }
}

async function showOrderDetailModal(order) {
  let modal = document.getElementById('orderDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'orderDetailModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.25)';
    modal.style.zIndex = '9999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = '<div id="orderDetailContent" style="background:#fff; padding:24px; border-radius:12px; min-width:320px; max-width:90vw; box-shadow:0 2px 16px rgba(0,0,0,0.12);"></div>';
    document.body.appendChild(modal);
  }
  const content = modal.querySelector('#orderDetailContent');
  if (content) {
    const orderId = order.orderId ? String(order.orderId) : '';
    const orderUrl = orderId
      ? `https://ussbp.omni.manh.com/customerengagementfacade/app/orderstatus?orderId=${encodeURIComponent(orderId)}&selectedOrg=SUIT-US`
      : '';
    const beneficiary = order?.beneficiary || {};
    const approver = order?.approver || {};
    const unauthorized = !!order?.unauthorized;
    content.innerHTML = `
      <h3>Order Details</h3>
      <div><b>Date:</b> ${order.calendarDate || '--'}</div>
      <div><b>Order ID:</b> ${orderUrl ? `<a class="mono order-link" href="${orderUrl}" target="_blank" rel="noopener noreferrer">${orderId}</a>` : `<span class="mono">--</span>`}</div>
      <div><b>Employee:</b> ${escapeHtml(beneficiary?.name || beneficiary?.email || '--')}</div>
      <div><b>Approver:</b> ${escapeHtml(approver?.name || approver?.email || '--')} <span class="pill ${approver?.isManager || approver?.isAdmin ? 'success' : 'warn'}" style="margin-left:8px;">${approver?.isManager || approver?.isAdmin ? 'Manager' : '(!) Approver'}</span></div>
      <div><b>Reason:</b> ${order.discountReason || '--'}</div>
      <div><b>Retail Value (USD):</b> ${toMoney(order?.amounts?.lc?.fullPrice)}</div>
      <div><b>Discount (USD):</b> ${toMoney(order?.amounts?.lc?.discount)}</div>
      <div><b>Net Revenue (USD):</b> ${toMoney(order?.amounts?.lc?.netRevenue)}</div>
      <div><b>Location:</b> ${order?.location?.contractLocationCode || '--'} (${order?.location?.country || ''} ${order?.location?.countryRegion || ''})</div>
      <div style="margin-top:18px; border-top:1px solid var(--border); padding-top:14px;">
        <div class="label">Add Note</div>
        <div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap; margin-top:10px;">
          <textarea id="orderNoteText" rows="3" style="width:100%; max-width:680px; padding:10px 12px; border-radius:10px; border:1px solid var(--border);"></textarea>
          <button class="btn-sm" id="addOrderNoteBtn">Add</button>
        </div>
        <div class="label" style="margin-top:14px;">Upload Attachments</div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px;">
          <input id="orderAttachmentsInput" type="file" multiple />
          <button class="btn-sm" id="uploadOrderAttachmentsBtn">Upload</button>
        </div>
        <div id="orderNotesWrap" style="margin-top:14px;"></div>
      </div>
      <div style="margin-top:18px; text-align:right;"><button class="btn-sm" id="closeOrderDetailBtn">Close</button></div>
    `;

    document.getElementById('closeOrderDetailBtn')?.addEventListener('click', () => document.getElementById('orderDetailModal')?.remove());

    document.getElementById('addOrderNoteBtn')?.addEventListener('click', async () => {
      const txt = document.getElementById('orderNoteText')?.value || '';
      if (!txt.trim()) return;
      await fetch(`/api/expenses/orders/${encodeURIComponent(orderId)}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt })
      });
      const box = document.getElementById('orderNoteText');
      if (box) box.value = '';
      await refreshOrderNotesUI(orderId);
    });

    document.getElementById('uploadOrderAttachmentsBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('orderAttachmentsInput');
      const files = input?.files ? Array.from(input.files) : [];
      if (files.length === 0) return;
      const fd = new FormData();
      files.slice(0, 5).forEach(f => fd.append('files', f));
      await fetch(`/api/expenses/orders/${encodeURIComponent(orderId)}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      if (input) input.value = '';
      await refreshOrderNotesUI(orderId);
    });

    await refreshOrderNotesUI(orderId);
  }
  modal.style.display = 'flex';
}

async function loadPage() {
  // Shared header
  const headerMount = document.getElementById('sharedHeader');
  if (headerMount) headerMount.innerHTML = SharedHeader.render({ showRefresh: false });
  await SharedHeader.init();

  // Initialize date inputs
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  if (startEl && !startEl.value) startEl.value = isoStartOfYear();
  if (endEl && !endEl.value) endEl.value = isoToday();

  const config = await fetchJson('/api/expenses/config');
  const status = await fetchJson('/api/expenses/status');

  // Admin: configure global limits
  const isAdmin = !!SharedHeader?.currentUser?.isAdmin;
  const adminCard = document.getElementById('adminLimitsCard');
  if (adminCard) adminCard.style.display = isAdmin ? 'block' : 'none';
  if (isAdmin) {
    try {
      const adminCfg = await fetchJson('/api/admin/work-expenses-config');
      const yEl = document.getElementById('adminYearlyLimit');
      if (yEl) yEl.value = adminCfg.globalYearlyLimit ?? '';
      const savedBy = document.getElementById('adminLimitsSavedBy');
      if (savedBy) {
        const who = adminCfg.updatedBy ? `by ${adminCfg.updatedBy}` : '';
        const when = adminCfg.updatedAt ? new Date(adminCfg.updatedAt).toLocaleString() : '';
        const txt = [when, who].filter(Boolean).join(' ');
        if (txt) {
          savedBy.textContent = `Last saved ${txt}`;
          savedBy.style.display = 'inline-flex';
        } else {
          savedBy.style.display = 'none';
        }
      }

      document.getElementById('adminSaveLimitsBtn')?.addEventListener('click', async () => {
        const yearly = document.getElementById('adminYearlyLimit')?.value;
        await fetch('/api/admin/work-expenses-config', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            globalYearlyLimit: yearly === '' ? null : Number(yearly)
          })
        });
        window.location.reload();
      });
    } catch (e) {
      // If admin endpoint fails, keep UI quiet.
    }
  }

  const myLimitValue = Number.isFinite(config?.limits?.yearlyLimit) ? toMoney(config.limits.yearlyLimit) : 'Not set';
  const myLimitEl = document.getElementById('myLimit');
  if (myLimitEl) myLimitEl.textContent = myLimitValue;

  if (status?.overLimit?.yearly) {
    setBanner('You are over your yearly retail value limit. Please review your employee discount orders.');
  } else {
    setBanner('');
  }

  const update = async () => {
    const { start, end } = getRangeFilters();
    const employeeSelect = document.getElementById('employeeSelect');
    let employeeEmail = employeeSelect ? (employeeSelect.value || '') : '';
    // Card clicks can force an employee filter even if the <select> can't represent it.
    if (window.__expensesSelectedEmployee) {
      employeeEmail = window.__expensesSelectedEmployee;
      window.__expensesSelectedEmployee = null;
    }

    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    if (employeeEmail) qs.set('employeeEmail', employeeEmail);

    const data = await fetchJson(`/api/expenses?${qs.toString()}`);
    populateEmployeeSelect(data.employees);
    renderEmployeePanel(data.employees);

    const orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders(orders);

    const meEmail = normalizeEmail(SharedHeader?.currentUser?.email);
    const meName = (SharedHeader?.currentUser?.name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const myOrders = orders.filter(o => {
      const b = o?.beneficiary || {};
      const bEmail = normalizeEmail(b?.email);
      const bName = (b?.name || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
      if (meEmail && bEmail && meEmail === bEmail) return true;
      if (meName && bName && meName === bName) return true;
      return false;
    });
    const myTotal = myOrders.reduce((acc, o) => acc + Number(o?.amounts?.lc?.fullPrice || 0), 0);
    const storeTotal = orders.reduce((acc, o) => acc + Number(o?.amounts?.lc?.fullPrice || 0), 0);

    const myTotalEl = document.getElementById('myTotal');
    const storeTotalEl = document.getElementById('storeTotal');
    const myHintEl = document.getElementById('myTotalHint');
    const storeHintEl = document.getElementById('storeTotalHint');
    if (myTotalEl) myTotalEl.textContent = toMoney(myTotal);
    if (storeTotalEl) storeTotalEl.textContent = toMoney(storeTotal);
    if (myHintEl) myHintEl.textContent = `${myOrders.length} orders`;
    if (storeHintEl) storeHintEl.textContent = `${orders.length} orders`;
  };

  document.getElementById('applyBtn')?.addEventListener('click', update);
  document.getElementById('rangeSelect')?.addEventListener('change', () => {
    const { start, end } = getRangeFilters();
    if (startEl && start) startEl.value = start;
    if (endEl && end) endEl.value = end;
  });

  await update();
}

document.addEventListener('DOMContentLoaded', () => {
  loadPage().catch(err => {
    console.error(err);
    setBanner(err?.message || 'Failed to load expenses');
  });
});
