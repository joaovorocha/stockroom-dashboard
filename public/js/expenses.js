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

  employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e?.employee?.email || e?.employee?.number || '';
    const label = e?.employee?.name || e?.employee?.email || e?.employee?.number || 'Unknown';
    opt.textContent = label;
    select.appendChild(opt);
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

  orders.forEach(o => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = o.calendarDate || '--';

    const tdEmp = document.createElement('td');
    tdEmp.textContent = o?.employee?.name || o?.employee?.email || '--';

    const tdCust = document.createElement('td');
    tdCust.textContent = o.customerName || '--';

    const tdReason = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = o.discountReason || '--';
    tdReason.appendChild(pill);

    const tdDisc = document.createElement('td');
    tdDisc.className = 'right';
    tdDisc.textContent = toMoney(o?.amounts?.lc?.discount);

    const tdFull = document.createElement('td');
    tdFull.className = 'right';
    tdFull.textContent = toMoney(o?.amounts?.lc?.fullPrice);

    const tdOrder = document.createElement('td');
    const code = document.createElement('span');
    code.className = 'mono';
    code.textContent = o.orderId || '--';
    tdOrder.appendChild(code);

    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.textContent = 'Copy Order ID';
    btn.addEventListener('click', async () => {
      try {
        if (!o.orderId) return;
        await navigator.clipboard.writeText(String(o.orderId));
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy Order ID'), 900);
      } catch (_) {
        // ignore
      }
    });
    tdAction.appendChild(btn);

    tr.appendChild(tdDate);
    tr.appendChild(tdEmp);
    tr.appendChild(tdCust);
    tr.appendChild(tdReason);
    tr.appendChild(tdDisc);
    tr.appendChild(tdFull);
    tr.appendChild(tdOrder);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });
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

  const myLimitValue =
    Number.isFinite(config?.limits?.monthlyLimit) || Number.isFinite(config?.limits?.yearlyLimit)
      ? `Monthly: ${Number.isFinite(config?.limits?.monthlyLimit) ? toMoney(config.limits.monthlyLimit) : '--'} · Yearly: ${Number.isFinite(config?.limits?.yearlyLimit) ? toMoney(config.limits.yearlyLimit) : '--'}`
      : 'Not set';
  const myLimitEl = document.getElementById('myLimit');
  if (myLimitEl) myLimitEl.textContent = myLimitValue;

  if (status?.overLimit?.monthly || status?.overLimit?.yearly) {
    const bits = [];
    if (status?.overLimit?.monthly) bits.push('monthly');
    if (status?.overLimit?.yearly) bits.push('yearly');
    setBanner(`You are over your ${bits.join(' and ')} limit. Please review your employee discount orders.`);
  } else {
    setBanner('');
  }

  const update = async () => {
    const { start, end } = getRangeFilters();
    const employeeSelect = document.getElementById('employeeSelect');
    const employeeEmail = employeeSelect ? (employeeSelect.value || '') : '';

    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    if (employeeEmail) qs.set('employeeEmail', employeeEmail);

    const data = await fetchJson(`/api/expenses?${qs.toString()}`);
    populateEmployeeSelect(data.employees);

    const orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders(orders);

    const me = normalizeEmail(SharedHeader?.currentUser?.email);
    const myOrders = orders.filter(o => normalizeEmail(o?.employee?.email) === me);
    const myTotal = myOrders.reduce((acc, o) => acc + Number(o?.amounts?.lc?.discount || 0), 0);
    const storeTotal = orders.reduce((acc, o) => acc + Number(o?.amounts?.lc?.discount || 0), 0);

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

