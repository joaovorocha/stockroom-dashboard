const express = require('express');
const router = express.Router();
const dal = require('../utils/dal');
const axios = require('axios');

const SCAN_LOG_FILE = dal.paths.storeRecoveryScanLogFile;

function readLog() {
  return dal.readJson(SCAN_LOG_FILE, { scans: [] });
}

function writeLog(data) {
  dal.ensureDir(dal.paths.dataDir);
  return dal.writeJsonAtomic(SCAN_LOG_FILE, data, { pretty: true });
}

function normalizeScan(body) {
  const now = new Date().toISOString();
  const epc = (body?.epc || body?.tag || body?.EPC || '').toString().trim();
  const tid = (body?.tid || body?.TID || '').toString().trim();
  const rssi = Number.isFinite(Number(body?.rssi)) ? Number(body.rssi) : null;
  const antenna = Number.isFinite(Number(body?.antenna)) ? Number(body.antenna) : null;
  const deviceId = (body?.deviceId || body?.readerId || '').toString().trim();
  const notes = (body?.notes || '').toString().trim();

  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {};

  return {
    id: `sr-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: (body?.at || body?.timestamp || now).toString(),
    epc,
    tid,
    rssi,
    antenna,
    deviceId,
    notes,
    meta
  };
}

function getLookupConfig() {
  const baseUrl = (process.env.STORE_RECOVERY_PRODUCT_API_BASE_URL || '').toString().trim();
  const apiKey = (process.env.STORE_RECOVERY_PRODUCT_API_KEY || '').toString().trim();
  const headerName = (process.env.STORE_RECOVERY_PRODUCT_API_KEY_HEADER || 'x-api-key').toString().trim();
  return { baseUrl, apiKey, headerName };
}

function buildLookupUrl(baseUrl, { epc, sku } = {}) {
  if (!baseUrl) return '';
  let url = baseUrl;
  if (epc) url = url.replaceAll('{epc}', encodeURIComponent(epc));
  if (sku) url = url.replaceAll('{sku}', encodeURIComponent(sku));

  // If no placeholders were present, append query params.
  const hasQuery = url.includes('?');
  const qp = [];
  if (epc && !baseUrl.includes('{epc}')) qp.push(`epc=${encodeURIComponent(epc)}`);
  if (sku && !baseUrl.includes('{sku}')) qp.push(`sku=${encodeURIComponent(sku)}`);
  if (qp.length) url = `${url}${hasQuery ? '&' : '?'}${qp.join('&')}`;
  return url;
}

function pickField(obj, keys) {
  for (const k of keys) {
    if (!k) continue;
    const parts = k.split('.');
    let cur = obj;
    let ok = true;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object' || !(p in cur)) { ok = false; break; }
      cur = cur[p];
    }
    if (ok && cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return null;
}

function normalizeProduct(raw) {
  // Best-effort normalization across unknown API shapes.
  const sku = pickField(raw, ['sku', 'SKU', 'item.sku', 'product.sku', 'data.sku']);
  const epc = pickField(raw, ['epc', 'EPC', 'tag.epc', 'data.epc', 'product.epc']);
  const name = pickField(raw, ['name', 'productName', 'product.name', 'item.name', 'data.name', 'description']);
  const size = pickField(raw, ['size', 'product.size', 'item.size', 'data.size', 'attributes.size']);
  const model = pickField(raw, ['model', 'style', 'product.model', 'product.style', 'item.model', 'data.model']);
  const category = pickField(raw, ['category', 'type', 'productType', 'product.category', 'item.category']);
  const price = pickField(raw, ['price', 'retailPrice', 'product.price', 'item.price', 'data.price', 'attributes.price']);

  return {
    sku,
    epc,
    name,
    size,
    model,
    category,
    price
  };
}

// GET /api/store-recovery/recent
router.get('/recent', (req, res) => {
  const data = readLog();
  const scans = Array.isArray(data.scans) ? data.scans : [];
  return res.json({ scans: scans.slice(0, 50) });
});

// GET /api/store-recovery/lookup?epc=...&sku=...
router.get('/lookup', async (req, res) => {
  const epc = (req.query?.epc || '').toString().trim();
  const sku = (req.query?.sku || '').toString().trim();
  if (!epc && !sku) return res.status(400).json({ success: false, error: 'Missing epc or sku' });

  const { baseUrl, apiKey, headerName } = getLookupConfig();
  if (!baseUrl || !apiKey) {
    return res.status(501).json({
      success: false,
      error: 'Product lookup is not configured on the server'
    });
  }

  const url = buildLookupUrl(baseUrl, { epc, sku });
  if (!url) return res.status(500).json({ success: false, error: 'Invalid product lookup URL' });

  try {
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        [headerName]: apiKey,
        'Accept': 'application/json'
      },
      validateStatus: () => true
    });

    if (resp.status < 200 || resp.status >= 300) {
      return res.status(502).json({
        success: false,
        error: 'Upstream lookup failed',
        status: resp.status
      });
    }

    const raw = resp.data;
    const product = normalizeProduct(raw);
    return res.json({ success: true, product, raw });
  } catch (e) {
    return res.status(502).json({ success: false, error: 'Lookup request failed' });
  }
});

// POST /api/store-recovery/scan
// Body: { epc, tid?, rssi?, antenna?, deviceId?, notes?, meta? }
router.post('/scan', (req, res) => {
  const scan = normalizeScan(req.body);
  if (!scan.epc) {
    return res.status(400).json({ success: false, error: 'Missing epc' });
  }

  // Persist
  const data = readLog();
  const scans = Array.isArray(data.scans) ? data.scans : [];
  scans.unshift({
    ...scan,
    by: {
      userId: req.user?.userId,
      employeeId: req.user?.employeeId,
      name: req.user?.name,
      role: req.user?.role
    }
  });
  data.scans = scans.slice(0, 5000);
  try {
    writeLog(data);
  } catch (e) {
    // Don’t fail the scan if disk write fails
    console.error('[store-recovery] failed to write scan log:', e);
  }

  // Live update via existing SSE broadcast
  try {
    const broadcast = req.app.get('broadcastUpdate');
    if (typeof broadcast === 'function') {
      broadcast('storeRecoveryScan', { scan: data.scans[0] });
    }
  } catch (e) {
    console.error('[store-recovery] failed to broadcast scan:', e);
  }

  return res.json({ success: true, scan: data.scans[0] });
});

module.exports = router;
