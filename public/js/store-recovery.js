// Store Recovery page logic
// RFID tag reads come from companion apps (iOS/Windows/Android) via /api/store-recovery/scan

const scanStatusEl = document.getElementById('scanStatus');
const scanResultsEl = document.getElementById('scanResults');
const rfidStatusEl = document.getElementById('rfidStatus');

function escapeHtml(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFilters() {
  return {
    type: document.getElementById('productType')?.value || '',
    size: document.getElementById('sizeInput')?.value || '',
    model: document.getElementById('modelInput')?.value || ''
  };
}

function renderScan(scan) {
  const epc = escapeHtml(scan?.epc || '');
  const tid = escapeHtml(scan?.tid || '');
  const when = escapeHtml(scan?.at || '');
  const by = escapeHtml(scan?.by?.name || '');
  const device = escapeHtml(scan?.deviceId || '');
  const scanId = escapeHtml(scan?.id || '');

  return `
    <div class="card" style="margin-bottom: 10px;" data-scan-id="${scanId}" data-epc="${epc}">
      <div class="card-body">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div style="font-weight: 600;">EPC: <span style="font-weight: 700;">${epc}</span></div>
          <div style="color: var(--text-muted); font-size: 12px;">${when}</div>
        </div>
        ${tid ? `<div style="margin-top:6px; color: var(--text-muted);">TID: ${tid}</div>` : ''}
        <div style="margin-top:6px; color: var(--text-muted); font-size: 12px;">${by ? `By: ${by}` : ''}${by && device ? ' • ' : ''}${device ? `Device: ${device}` : ''}</div>
        <div class="sr-product" style="margin-top:10px; color: var(--text-muted); font-size: 13px;">Looking up product…</div>
      </div>
    </div>
  `;
}

async function lookupProduct(epc) {
  if (!epc) return null;
  try {
    const resp = await fetch(`/api/store-recovery/lookup?epc=${encodeURIComponent(epc)}`, { credentials: 'include' });
    if (!resp.ok) return { error: `Lookup failed (${resp.status})` };
    return await resp.json();
  } catch (_) {
    return { error: 'Lookup failed' };
  }
}

function renderProductSummary(product) {
  if (!product) return '';
  const parts = [];
  if (product.name) parts.push(`<strong>${escapeHtml(product.name)}</strong>`);
  const meta = [];
  if (product.sku) meta.push(`SKU: ${escapeHtml(product.sku)}`);
  if (product.size) meta.push(`Size: ${escapeHtml(product.size)}`);
  if (product.model) meta.push(`Model: ${escapeHtml(product.model)}`);
  if (product.category) meta.push(`Type: ${escapeHtml(product.category)}`);
  if (product.price !== null && product.price !== undefined && String(product.price).trim() !== '') meta.push(`Price: ${escapeHtml(String(product.price))}`);
  if (meta.length) parts.push(`<div style="margin-top:4px;">${meta.join(' • ')}</div>`);
  return parts.join('');
}

async function enrichCard(cardEl) {
  try {
    const epc = cardEl.getAttribute('data-epc') || '';
    const target = cardEl.querySelector('.sr-product');
    if (!target) return;

    const data = await lookupProduct(epc);
    if (!data || data.success !== true) {
      const msg = data?.error || 'No product info';
      target.textContent = msg;
      return;
    }
    const html = renderProductSummary(data.product);
    target.innerHTML = html || '<span style="color: var(--text-muted);">No product details returned</span>';
  } catch (_) {}
}

function renderScans(scans) {
  if (!Array.isArray(scans) || scans.length === 0) {
    scanResultsEl.innerHTML = '<div class="card"><div class="card-body" style="color: var(--text-muted);">No scans yet.</div></div>';
    return;
  }
  scanResultsEl.innerHTML = scans.slice(0, 20).map(renderScan).join('');
  scanResultsEl.querySelectorAll('[data-scan-id]').forEach(enrichCard);
}

async function loadRecentScans() {
  try {
    const resp = await fetch('/api/store-recovery/recent', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    renderScans(data?.scans || []);
  } catch (_) {}
}

function setupLiveUpdates() {
  try {
    const es = new EventSource('/api/sse/updates', { withCredentials: true });
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === 'storeRecoveryScan') {
          const scan = msg?.data?.scan;
          if (scan) {
            // Prepend new scan card quickly
            const current = scanResultsEl.innerHTML || '';
            scanResultsEl.innerHTML = renderScan(scan) + current;
            const card = scanResultsEl.querySelector(`[data-scan-id="${CSS.escape(scan.id)}"]`);
            if (card) enrichCard(card);
          }
        }
      } catch (_) {}
    };
    es.onerror = () => {
      // Keep quiet; browser will auto-reconnect.
    };
  } catch (_) {}
}

document.getElementById('filterForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const { type, size, model } = getFilters();
  scanStatusEl.textContent = `Filter: ${type}${size ? `, Size: ${size}` : ''}${model ? `, Model: ${model}` : ''}`;
});

document.getElementById('connectBluetooth').addEventListener('click', function() {
  rfidStatusEl.textContent = 'Bluetooth: requires companion app (iOS/Android) using Zebra SDK.';
  // TODO: Integrate Zebra RFID SDK for Bluetooth
});

document.getElementById('connectUSB').addEventListener('click', function() {
  rfidStatusEl.textContent = 'USB: requires Windows app/service using Zebra SDK.';
  // TODO: Integrate Zebra RFID SDK for USB
});

loadRecentScans();
setupLiveUpdates();
