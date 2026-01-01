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

function normalizeNameKey(v) {
  return (v || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function suggestWorkEmailFromName(name) {
  const raw = (name || '').toString().trim();
  if (!raw) return null;
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s-]+/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '');
  if (!first || !last) return null;
  return `${first[0].toLowerCase()}${last.toLowerCase()}@suitsupply.com`;
}

const IGNORED_EMPLOYEE_STORAGE_KEY = 'expensesIgnoredEmployees.v1';

function getEmployeeFilterValue() {
  try {
    return (window.__expensesEmployeeFilter || '').toString();
  } catch (_) {
    return '';
  }
}

function setEmployeeFilterValue(value) {
  try {
    window.__expensesEmployeeFilter = (value || '').toString();
  } catch (_) {}
}

function loadIgnoredEmployees() {
  try {
    const raw = localStorage.getItem(IGNORED_EMPLOYEE_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(x => String(x || '')) : []);
  } catch (_) {
    return new Set();
  }
}

function saveIgnoredEmployees(set) {
  try {
    localStorage.setItem(IGNORED_EMPLOYEE_STORAGE_KEY, JSON.stringify(Array.from(set || [])));
  } catch (_) {}
}

let ignoredEmployees = loadIgnoredEmployees();

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

function firstNameOnly(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  const name = raw.split('@')[0].trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return parts[0] || raw;
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

let currentEmployeeTab = 'known'; // known | unknown | ignored | all
let lastEmployeesForPanel = [];

function renderEmployeeTabs(employees) {
  const tabs = document.getElementById('employeeTabs');
  if (!tabs) return;
  const list = Array.isArray(employees) ? employees : [];
  const isIgnored = (e) => ignoredEmployees.has(String(e?.key || e?.employee?.key || ''));

  const knownCount = list.filter(e => e?.known !== false && !isIgnored(e)).length;
  const unknownCount = list.filter(e => e?.known === false && !isIgnored(e)).length;
  const ignoredCount = list.filter(e => isIgnored(e)).length;
  const total = list.filter(e => !isIgnored(e)).length;

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
  if (ignoredCount) tabs.appendChild(mkBtn('ignored', `Ignored (${ignoredCount})`));
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

  const isIgnored = (e) => ignoredEmployees.has(String(e?.key || e?.employee?.key || ''));

  const filteredEmployees = currentEmployeeTab === 'known'
    ? employees.filter(e => e?.known !== false && !isIgnored(e))
    : currentEmployeeTab === 'unknown'
      ? employees.filter(e => e?.known === false && !isIgnored(e))
      : currentEmployeeTab === 'ignored'
        ? employees.filter(e => isIgnored(e))
        : employees.filter(e => !isIgnored(e));

  panel.style.display = 'block';
  grid.innerHTML = '';

  filteredEmployees.slice(0, 200).forEach(e => {
    const card = document.createElement('div');
    const over = !!(e?.overLimit?.yearly);
    card.className = `employee-card${over ? ' over' : ''}`;

    const name = e?.employee?.name || e?.employee?.email || 'Unknown';
    const displayName = firstNameOnly(name) || name;
    const imgUrl = e?.employee?.imageUrl || null;
    const used = Number(e?.status?.yearly?.used || 0);
    const limit = Number(e?.status?.yearly?.limit || 0);
    const remainingRaw = e?.status?.yearly?.remaining;
    const remaining = Number.isFinite(Number(remainingRaw)) ? Number(remainingRaw) : null;
    const percent = Number.isFinite(Number(e?.status?.yearly?.percentUsed)) ? Number(e.status.yearly.percentUsed) : null;
    const pctWidth = percent !== null ? Math.max(0, Math.min(100, percent)) : (limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0);

    const avatar = imgUrl
      ? `<img class="emp-avatar" src="${imgUrl}" alt="" onerror="this.remove()">`
      : `<div class="emp-initials">${getInitials(name)}</div>`;

    const ignoreBtn = '';
    const unignoreBtn = '';

    // Only show the amount, no 'left' or 'over' text
    const remainingText = remaining === null
      ? '--'
      : toMoney(Math.abs(remaining));

    // Add faint green/red background to the pill
    const pillClass = remaining === null ? '' : (remaining >= 0 ? 'pill-green' : 'pill-red');

    card.innerHTML = `
      <div class="top">
        <div class="meta">
          ${avatar}
          <div class="text">
            <div class="title user-link" title="${name}">${displayName}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          <span class="pill ${pillClass}">${remainingText}</span>
        </div>
      </div>
      <div class="bar"><div style="width:${pctWidth}%;"></div></div>
      <div class="nums">
        <span>${toMoney(used)} used</span>
        <span>Limit ${toMoney(limit || 2500)}</span>
      </div>
    `;
    // Add click-to-filter on name
    const nameEl = card.querySelector('.user-link');
    if (nameEl) {
      nameEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const val = e?.key || e?.employee?.email || e?.employee?.employeeId || e?.employee?.name || '';
        setEmployeeFilterValue(val);
        window.__expensesUpdate?.();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const ignoreEl = card.querySelector('.js-ignore-btn');
    if (ignoreEl) {
      ignoreEl.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const k = String(e?.key || e?.employee?.key || '');
        if (!k) return;
        ignoredEmployees.add(k);
        saveIgnoredEmployees(ignoredEmployees);
        renderEmployeeTabs(lastEmployeesForPanel);
        renderEmployeePanel(lastEmployeesForPanel);
      });
    }

    const unignoreEl = card.querySelector('.js-unignore-btn');
    if (unignoreEl) {
      unignoreEl.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const k = String(e?.key || e?.employee?.key || '');
        if (!k) return;
        ignoredEmployees.delete(k);
        saveIgnoredEmployees(ignoredEmployees);
        renderEmployeeTabs(lastEmployeesForPanel);
        renderEmployeePanel(lastEmployeesForPanel);
      });
    }

    card.addEventListener('click', () => {
      const val = e?.key || e?.employee?.email || e?.employee?.employeeId || e?.employee?.name || '';
      setEmployeeFilterValue(val);
      window.__expensesUpdate?.();
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
    td.colSpan = 7;
    td.textContent = 'No orders found for this range.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  orders.forEach((o, idx) => {
    const tr = document.createElement('tr');

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
    const fullName = beneficiary?.name || beneficiary?.email || '--';
    // Table row has more space: show full name.
    nameEl.textContent = fullName;
    const emailEl = document.createElement('div');
    emailEl.className = 'email';
    emailEl.textContent = beneficiary?.email || '';
    meta.appendChild(nameEl);
    if (beneficiary?.email) meta.appendChild(emailEl);
    empWrap.appendChild(meta);
    tdEmp.appendChild(empWrap);

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
    tr.appendChild(tdReason);
    tr.appendChild(tdRetail);
    tr.appendChild(tdDiscount);
    tr.appendChild(tdOrder);
    tr.appendChild(tdAction);

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
    content.innerHTML = `
      <h3>Order Details</h3>
      <div><b>Date:</b> ${order.calendarDate || '--'}</div>
      <div><b>Order ID:</b> ${orderUrl ? `<a class="mono order-link" href="${orderUrl}" target="_blank" rel="noopener noreferrer">${orderId}</a>` : `<span class="mono">--</span>`}</div>
      <div><b>Employee:</b> ${escapeHtml(beneficiary?.name || beneficiary?.email || '--')}</div>
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
  let cachedConfig = null;
  let latestStatus = null;

  function applyStatusToSummary(statusData) {
    const myLimitEl = document.getElementById('myLimit');
    const myTotalEl = document.getElementById('myTotal');
    const myHintEl = document.getElementById('myTotalHint');

    const overrideLimit = Number.isFinite(Number(statusData?.limits?.yearlyLimit))
      ? Number(statusData.limits.yearlyLimit)
      : null;
    const fallbackLimit = Number.isFinite(Number(cachedConfig?.limits?.yearlyLimit))
      ? Number(cachedConfig.limits.yearlyLimit)
      : null;
    const limitValue = overrideLimit !== null ? overrideLimit : fallbackLimit;
    const hasLimit = Number.isFinite(limitValue);

    if (myLimitEl) myLimitEl.textContent = hasLimit ? toMoney(limitValue) : 'Not set';

    const usedValue = Number(statusData?.totals?.currentYearRetailLc);
    const hasUsedValue = Number.isFinite(usedValue);
    if (myTotalEl) myTotalEl.textContent = hasUsedValue ? toMoney(usedValue) : '--';

    if (myHintEl) {
      if (statusData?.available) {
        const orderCountRaw = Number(statusData?.totals?.yearOrders);
        const orderCount = Number.isFinite(orderCountRaw) ? orderCountRaw : 0;
        const label = orderCount === 1 ? 'order' : 'orders';
        myHintEl.textContent = `${orderCount} YTD ${label}`;
      } else {
        myHintEl.textContent = 'No YTD data';
      }
    }

    if (myTotalEl) {
      myTotalEl.classList.remove('retail-green', 'retail-yellow', 'retail-red');
      let percent = Number(statusData?.status?.yearly?.percentUsed);
      if (!Number.isFinite(percent)) percent = null;
      if (percent === null && hasLimit && limitValue > 0 && hasUsedValue) {
        percent = (usedValue / limitValue) * 100;
      }
      if (percent !== null) {
        if (percent >= 100) {
          myTotalEl.classList.add('retail-red');
        } else if (percent >= 85) {
          myTotalEl.classList.add('retail-yellow');
        } else {
          myTotalEl.classList.add('retail-green');
        }
      }
    }
  }

  const config = await fetchJson('/api/expenses/config');
  cachedConfig = config;

  // Set year balloon
  const yearBalloon = document.getElementById('yearBalloon');
  const currentYear = new Date().getFullYear();
  if (yearBalloon) {
    yearBalloon.textContent = currentYear;
    if (!config?.limits?.yearlyLimit) {
      yearBalloon.classList.add('greyed');
      yearBalloon.title = 'Yearly limit not available';
    } else {
      yearBalloon.classList.remove('greyed');
      yearBalloon.title = '';
    }
  }

  // Shared header
  SharedHeader.mountHeader({ showRefresh: false });
  await SharedHeader.init();

  // Initialize date inputs
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  if (startEl && !startEl.value) startEl.value = isoStartOfYear();
  if (endEl && !endEl.value) endEl.value = isoToday();

  applyStatusToSummary(null);

  // Remove over-limit banner, handled visually in summary card now

  async function update() {
    const { start, end } = getRangeFilters();
    const employeeEmail = getEmployeeFilterValue();

    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    if (employeeEmail) qs.set('employeeEmail', employeeEmail);

    const qsString = qs.toString();
    const expensesUrl = qsString ? `/api/expenses?${qsString}` : '/api/expenses';
    const [data, statusData] = await Promise.all([
      fetchJson(expensesUrl),
      fetchJson('/api/expenses/status').catch(() => null)
    ]);

    if (statusData) {
      latestStatus = statusData;
      applyStatusToSummary(statusData);
    } else if (latestStatus) {
      applyStatusToSummary(latestStatus);
    } else {
      applyStatusToSummary(null);
    }

    renderEmployeePanel(data.employees);

    const orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders(orders);

    const storeTotalValue = orders.reduce((acc, o) => acc + Number(o?.amounts?.lc?.fullPrice || 0), 0);

    const storeTotalEl = document.getElementById('storeTotal');
    const storeHintEl = document.getElementById('storeTotalHint');
    if (storeTotalEl) storeTotalEl.textContent = toMoney(storeTotalValue);
    if (storeHintEl) storeHintEl.textContent = `${orders.length} orders`;
  }

  window.__expensesUpdate = update;
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
