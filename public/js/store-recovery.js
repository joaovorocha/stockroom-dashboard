// Store Recovery page logic
// RFID tag reads come from companion apps (iOS/Windows/Android) via /api/store-recovery/scan

const scanStatusEl = document.getElementById('scanStatus');
const scanResultsEl = document.getElementById('scanResults');
const rfidStatusEl = document.getElementById('rfidStatus');

const srLookupInput = document.getElementById('srLookupInput');
const srLookupBtn = document.getElementById('srLookupBtn');
const srLookupImage = document.getElementById('srLookupImage');
const srDecodeImageBtn = document.getElementById('srDecodeImageBtn');
const srStartCameraBtn = document.getElementById('srStartCameraBtn');
const srStopCameraBtn = document.getElementById('srStopCameraBtn');
const srLookupStatus = document.getElementById('srLookupStatus');
const srLookupResult = document.getElementById('srLookupResult');
const srCameraWrap = document.getElementById('srCameraWrap');
const srCameraVideo = document.getElementById('srCameraVideo');

let srCameraStream = null;
let srCameraLoopActive = false;
let srLastDetected = { value: null, at: 0 };

function setLookupStatus(text) {
  if (!srLookupStatus) return;
  srLookupStatus.textContent = text || '';
}

function setLookupResult(text) {
  if (!srLookupResult) return;
  srLookupResult.textContent = text || '';
}

function looksLikeEpc(value) {
  const s = (value || '').toString().trim();
  // Common EPC representations are long hex strings (often 24+ hex chars).
  if (/^[0-9a-fA-F]{16,64}$/.test(s)) return true;
  return false;
}

function looksLikeEanOrGtin(value) {
  const s = (value || '').toString().trim();
  return /^\d{13,14}$/.test(s);
}

function extractGtinFromGs1DataMatrix(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return '';

  // Common representations:
  // - (01)01234567890128(21)....
  // - 010123456789012821....
  // We only need the GTIN (14 digits).
  const m1 = s.match(/\(01\)\s*(\d{14})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = s.match(/\b01(\d{14})\b/);
  if (m2 && m2[1]) return m2[1];
  const m3 = s.match(/^01(\d{14})/);
  if (m3 && m3[1]) return m3[1];
  return '';
}

function parseInputToLookup(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return { kind: 'none', value: '' };

  // GS1 DataMatrix: pull out GTIN/01 if present.
  const gtin = extractGtinFromGs1DataMatrix(raw);
  if (gtin) return { kind: 'ean', value: gtin };

  // If scanner/QR contains a URL, try to extract epc/sku from query.
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const epc = (u.searchParams.get('epc') || '').trim();
      const sku = (u.searchParams.get('sku') || '').trim();
      const ean = (u.searchParams.get('ean') || u.searchParams.get('gtin') || '').trim();
      if (epc) return { kind: 'epc', value: epc };
      if (ean) return { kind: 'ean', value: ean };
      if (sku) return { kind: 'sku', value: sku };
      return { kind: looksLikeEpc(raw) ? 'epc' : 'sku', value: raw };
    }
  } catch (_) {}

  // If it's JSON, try common fields.
  try {
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const obj = JSON.parse(raw);
      const epc = (obj.epc || obj.EPC || obj.tag || '').toString().trim();
      const sku = (obj.sku || obj.SKU || obj.itemSku || '').toString().trim();
      const ean = (obj.ean || obj.EAN || obj.gtin || obj.GTIN || '').toString().trim();
      if (epc) return { kind: 'epc', value: epc };
      if (ean) return { kind: 'ean', value: ean };
      if (sku) return { kind: 'sku', value: sku };
    }
  } catch (_) {}

  if (looksLikeEanOrGtin(raw)) return { kind: 'ean', value: raw };
  return { kind: looksLikeEpc(raw) ? 'epc' : 'sku', value: raw };
}

async function lookupProductFlexible(value) {
  const { kind, value: v } = parseInputToLookup(value);
  if (!v) return { error: 'Missing EPC or SKU' };

  const qs = kind === 'epc'
    ? `epc=${encodeURIComponent(v)}`
    : (kind === 'ean' ? `ean=${encodeURIComponent(v)}` : `sku=${encodeURIComponent(v)}`);
  try {
    const resp = await fetch(`/api/store-recovery/lookup?${qs}`, { credentials: 'include' });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      return { error: (data && data.error) ? data.error : `Lookup failed (${resp.status})`, raw: data || null };
    }
    return data;
  } catch (e) {
    return { error: e?.message || 'Lookup failed' };
  }
}

async function onManualLookup() {
  const v = (srLookupInput?.value || '').toString().trim();
  if (!v) {
    setLookupStatus('Paste an EPC or SKU first.');
    return;
  }
  setLookupStatus('Looking up...');
  setLookupResult('');
  const data = await lookupProductFlexible(v);
  if (!data || data.success !== true) {
    setLookupStatus(data?.error || 'Lookup failed');
    setLookupResult(JSON.stringify(data || {}, null, 2));
    return;
  }
  setLookupStatus('OK');
  setLookupResult(JSON.stringify(data, null, 2));
}

async function decodeFromImageFile(file) {
  if (!file) throw new Error('Choose an image first.');
  if (!('BarcodeDetector' in window)) {
    throw new Error('BarcodeDetector not supported in this browser. Use Chrome/Edge on desktop.');
  }
  const detector = new BarcodeDetector({ formats: ['qr_code', 'data_matrix'] });
  const bmp = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bmp);
    if (!codes || !codes.length) return null;
    return codes[0].rawValue || '';
  } finally {
    try { bmp.close && bmp.close(); } catch (_) {}
  }
}

async function onDecodeImage() {
  setLookupResult('');
  setLookupStatus('Decoding image...');
  try {
    const file = srLookupImage?.files?.[0];
    const txt = await decodeFromImageFile(file);
    if (!txt) {
      setLookupStatus('No QR/DataMatrix found in that image.');
      return;
    }
    if (srLookupInput) srLookupInput.value = txt;
    setLookupStatus('Decoded. Running lookup...');
    await onManualLookup();
  } catch (e) {
    setLookupStatus(e?.message || String(e));
  }
}

async function startCamera() {
  if (!srCameraVideo) throw new Error('Camera UI not found');
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not available in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false
  });
  srCameraStream = stream;
  srCameraVideo.srcObject = stream;
  if (srCameraWrap) srCameraWrap.style.display = 'block';
  if (srStopCameraBtn) srStopCameraBtn.disabled = false;
  if (srStartCameraBtn) srStartCameraBtn.disabled = true;
}

function stopCamera() {
  try {
    if (srCameraStream) {
      srCameraStream.getTracks().forEach(t => t.stop());
    }
  } catch (_) {}
  srCameraStream = null;
  srCameraLoopActive = false;
  if (srCameraVideo) srCameraVideo.srcObject = null;
  if (srCameraWrap) srCameraWrap.style.display = 'none';
  if (srStopCameraBtn) srStopCameraBtn.disabled = true;
  if (srStartCameraBtn) srStartCameraBtn.disabled = false;
}

async function startCameraScanLoop() {
  if (!('BarcodeDetector' in window)) {
    throw new Error('BarcodeDetector not supported in this browser. Use Chrome/Edge on desktop.');
  }
  const detector = new BarcodeDetector({ formats: ['qr_code', 'data_matrix'] });

  srCameraLoopActive = true;
  setLookupStatus('Camera running. Point at DataMatrix/QR...');

  const loop = async () => {
    if (!srCameraLoopActive) return;
    if (!srCameraVideo || srCameraVideo.readyState < 2) {
      requestAnimationFrame(loop);
      return;
    }
    try {
      // Throttle detection to reduce CPU.
      const now = Date.now();
      if (now - (srLastDetected.at || 0) < 250) {
        requestAnimationFrame(loop);
        return;
      }
      srLastDetected.at = now;

      const codes = await detector.detect(srCameraVideo);
      if (codes && codes.length) {
        const val = (codes[0].rawValue || '').toString().trim();
        if (val) {
          const isSame = srLastDetected.value === val && (Date.now() - srLastDetected.at) < 2000;
          srLastDetected.value = val;
          if (!isSame) {
            if (srLookupInput) srLookupInput.value = val;
            setLookupStatus('Detected. Running lookup...');
            // Keep camera running but avoid rapid duplicate lookups.
            await onManualLookup();
          }
        }
      }
    } catch (_) {
      // ignore detection errors
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

async function onStartCamera() {
  setLookupResult('');
  setLookupStatus('Starting camera...');
  try {
    await startCamera();
    await startCameraScanLoop();
  } catch (e) {
    setLookupStatus(e?.message || String(e));
    stopCamera();
  }
}

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

srLookupBtn?.addEventListener('click', onManualLookup);
srDecodeImageBtn?.addEventListener('click', onDecodeImage);
srStartCameraBtn?.addEventListener('click', onStartCamera);
srStopCameraBtn?.addEventListener('click', stopCamera);
srLookupInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    onManualLookup();
  }
});

loadRecentScans();
setupLiveUpdates();
