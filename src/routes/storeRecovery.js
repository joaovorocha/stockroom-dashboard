const express = require('express');
const router = express.Router();
const dal = require('../utils/dal');
const axios = require('axios');
const path = require('path');

const SCAN_LOG_FILE = dal.paths.storeRecoveryScanLogFile;
const CONFIG_FILE = dal.paths.storeRecoveryConfigFile || path.join(dal.paths.dataDir, 'store-recovery-config.json');

// Default suitsApi host root (used when no explicit baseUrl is configured).
const DEFAULT_STORE_RECOVERY_BASE_URL = 'https://printlabel.tst.suitapi.com/';
const DEFAULT_STORE_RECOVERY_OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/suitsupply.com/oauth2/token';
const DEFAULT_STORE_RECOVERY_OAUTH_DOMAIN = 'https://login.microsoftonline.com';
const DEFAULT_STORE_RECOVERY_OAUTH_CLIENT_ID = 'a775bf49-2444-46e1-b8e2-dfa0e6564c51';

let cachedOauthToken = { accessToken: null, expiresAtMs: 0 };

function extractGuid(value) {
  const s = (value || '').toString();
  const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : '';
}

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
  const envBaseUrl = (process.env.STORE_RECOVERY_PRODUCT_API_BASE_URL || '').toString().trim();
  const envApiKey = (process.env.STORE_RECOVERY_PRODUCT_API_KEY || '').toString().trim();
  const envHeaderName = (process.env.STORE_RECOVERY_PRODUCT_API_KEY_HEADER || 'x-api-key').toString().trim();
  const envAuthType = (process.env.STORE_RECOVERY_PRODUCT_API_AUTH_TYPE || '').toString().trim();

  const envOauthDomain = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_DOMAIN || '').toString().trim();
  const envOauthTokenUrl = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_TOKEN_URL || '').toString().trim();
  const envOauthClientId = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_CLIENT_ID || '').toString().trim();
  const envOauthClientSecret = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_CLIENT_SECRET || '').toString().trim();
  const envOauthResource = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_RESOURCE || '').toString().trim();
  const envOauthScope = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_SCOPE || '').toString().trim();
  const envOauthGrantType = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_GRANT_TYPE || '').toString().trim();
  const envOauthCountryCode = (process.env.STORE_RECOVERY_PRODUCT_OAUTH_COUNTRY_CODE || '').toString().trim();

  // Prefer explicit env vars, but allow admin-configured fallback from disk.
  if (envBaseUrl && (envApiKey || envOauthClientSecret || envOauthTokenUrl || envOauthDomain)) {
    return {
      baseUrl: envBaseUrl,
      authType: envAuthType,
      apiKey: envApiKey,
      headerName: envHeaderName || 'x-api-key',
      oauthDomain: envOauthDomain,
      oauthTokenUrl: envOauthTokenUrl,
      oauthClientId: envOauthClientId,
      oauthClientSecret: envOauthClientSecret,
      oauthResource: envOauthResource,
      oauthScope: envOauthScope,
      oauthGrantType: envOauthGrantType,
      oauthCountryCode: envOauthCountryCode
    };
  }

  const saved = CONFIG_FILE ? (dal.readJson(CONFIG_FILE, null) || {}) : {};
  const baseUrl = (envBaseUrl || saved.baseUrl || saved.apiBaseUrl || DEFAULT_STORE_RECOVERY_BASE_URL).toString().trim();
  const authType = (envAuthType || saved.authType || saved.lookupAuthType || saved.productAuthType || '').toString().trim();
  const apiKey = (envApiKey || saved.apiKey || saved.key || '').toString().trim();
  const headerName = (envHeaderName || saved.headerName || saved.apiKeyHeader || 'x-api-key').toString().trim() || 'x-api-key';

  let oauthDomain = (envOauthDomain || saved.oauthDomain || saved.domain || '').toString().trim();
  let oauthTokenUrl = (envOauthTokenUrl || saved.oauthTokenUrl || saved.tokenUrl || '').toString().trim();
  let oauthClientId = (envOauthClientId || saved.oauthClientId || saved.clientId || '').toString().trim();
  const oauthClientSecret = (envOauthClientSecret || saved.oauthClientSecret || saved.clientSecret || '').toString().trim();
  const oauthResource = (envOauthResource || saved.oauthResource || saved.resource || '').toString().trim();
  const oauthScope = (envOauthScope || saved.oauthScope || saved.scope || '').toString().trim();
  const oauthGrantType = (envOauthGrantType || saved.oauthGrantType || saved.grantType || '').toString().trim();
  const oauthCountryCode = (envOauthCountryCode || saved.oauthCountryCode || saved.countryCode || '').toString().trim();

  // Runtime migration / compatibility:
  // - Older configs stored a GUID as part of oauthDomain like https://login.microsoftonline.com/<GUID>
  // - CREATE RFID app defaults to tenant `suitsupply.com` and a fixed GUID clientId
  const domainGuid = extractGuid(oauthDomain);
  const looksLikeMsTenantUrl = /^https?:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/?$/i.test(oauthDomain);
  if (!oauthClientId && domainGuid) oauthClientId = domainGuid;
  if (!oauthClientId && /suitapi\.com/i.test(baseUrl) && oauthClientSecret) oauthClientId = DEFAULT_STORE_RECOVERY_OAUTH_CLIENT_ID;

  if (!oauthTokenUrl && /suitapi\.com/i.test(baseUrl) && oauthClientSecret) {
    oauthTokenUrl = DEFAULT_STORE_RECOVERY_OAUTH_TOKEN_URL;
  }
  if (looksLikeMsTenantUrl) {
    // Prefer treating oauthDomain as a host root rather than a tenant URL.
    oauthDomain = DEFAULT_STORE_RECOVERY_OAUTH_DOMAIN;
  }

  return {
    baseUrl,
    authType,
    apiKey,
    headerName,
    oauthDomain,
    oauthTokenUrl,
    oauthClientId,
    oauthClientSecret,
    oauthResource,
    oauthScope,
    oauthGrantType,
    oauthCountryCode
  };
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

function joinUrl(baseUrl, pathPart) {
  const base = (baseUrl || '').toString();
  const part = (pathPart || '').toString();
  if (!base) return part;
  if (!part) return base;
  const a = base.endsWith('/') ? base.slice(0, -1) : base;
  const b = part.startsWith('/') ? part : `/${part}`;
  return `${a}${b}`;
}

function decodeSgtin96EpcToGtin(epcHex) {
  const hex = (epcHex || '').toString().trim();
  if (!/^[0-9a-fA-F]{24}$/.test(hex)) return null;
  const n = BigInt('0x' + hex);
  const header = Number((n >> 88n) & 0xFFn);
  if (header !== 0x30) return null; // SGTIN-96

  // SGTIN-96 layout:
  // header (8) | filter (3) | partition (3) | company prefix (20-40) | item ref (24-4) | serial (38)
  // partition bits are at positions 84..82 (from MSB), so shift by 82.
  const partition = Number((n >> 82n) & 0x7n);
  if (partition < 0 || partition > 6) return null;

  const companyPrefixBits = [40, 37, 34, 30, 27, 24, 20][partition];
  const itemReferenceBits = [4, 7, 10, 14, 17, 20, 24][partition];
  const companyPrefixDigits = [12, 11, 10, 9, 8, 7, 6][partition];
  const itemReferenceDigits = [1, 2, 3, 4, 5, 6, 7][partition];
  if (!companyPrefixBits || !itemReferenceBits) return null;

  const companyPrefix = (n >> (38n + BigInt(itemReferenceBits))) & ((1n << BigInt(companyPrefixBits)) - 1n);
  const itemReference = (n >> 38n) & ((1n << BigInt(itemReferenceBits)) - 1n);

  const companyPrefixStr = companyPrefix.toString().padStart(companyPrefixDigits, '0');
  const itemRefStr = itemReference.toString().padStart(itemReferenceDigits, '0');
  const indicator = itemRefStr.slice(0, 1);
  const itemRefRemainder = itemRefStr.slice(1);

  const gtin13 = `${indicator}${companyPrefixStr}${itemRefRemainder}`;
  if (!/^\d{13}$/.test(gtin13)) return null;

  // GS1 check digit (mod 10)
  let sum = 0;
  for (let i = 0; i < gtin13.length; i++) {
    const digit = Number(gtin13[gtin13.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  const gtin14 = `${gtin13}${check}`;
  const ean = gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;

  return { gtin14, ean, partition, companyPrefix: companyPrefixStr, itemReference: itemRefStr };
}

function isTemplateUrl(value) {
  const s = (value || '').toString();
  return /\{(epc|sku|ean|gtin)\}/i.test(s);
}

async function getBearerToken(cfg) {
  const now = Date.now();
  if (cachedOauthToken.accessToken && cachedOauthToken.expiresAtMs && now < (cachedOauthToken.expiresAtMs - 60_000)) {
    return cachedOauthToken.accessToken;
  }

  const grantType = (cfg.oauthGrantType || 'client_credentials').toString().trim() || 'client_credentials';

  let tokenUrl = (cfg.oauthTokenUrl || '').toString().trim();
  if (!tokenUrl) {
    const domain = (cfg.oauthDomain || '').toString().trim();
    if (domain) {
      const domainUrl = /^https?:\/\//i.test(domain) ? domain : `https://${domain.replace(/^\/+/, '')}`;
      // If oauthDomain is the Microsoft host root, include the GUID tenant segment.
      if (/^https?:\/\/login\.microsoftonline\.com\/?$/i.test(domainUrl) && extractGuid(cfg.oauthClientId)) {
        tokenUrl = joinUrl(domainUrl, `/${cfg.oauthClientId}/oauth2/token`);
      } else {
        tokenUrl = joinUrl(domainUrl, '/oauth2/token');
      }
    }
  }

  if (!tokenUrl) throw new Error('Missing oauth token URL/domain');
  if (!cfg.oauthClientId) throw new Error('Missing oauth client ID');
  if (!cfg.oauthClientSecret) throw new Error('Missing oauth client secret');

  // Some setups store a binary secret as base64. We'll try both the raw string
  // and decoded variants of base64 bytes.
  const secretCandidates = [];
  const rawSecret = (cfg.oauthClientSecret || '').toString();
  if (rawSecret) secretCandidates.push(rawSecret);
  const compact = rawSecret.replace(/\s+/g, '');
  const looksBase64 = compact.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(compact);
  if (looksBase64) {
    try {
      const bytes = Buffer.from(compact, 'base64');
      if (bytes && bytes.length) {
        // 1) Some apps embed raw bytes; treat them as latin1.
        secretCandidates.push(bytes.toString('latin1'));

        // 2) Some QR payloads embed a UTF-8 string as bytes; decode as utf8.
        // Strip nulls just in case.
        const utf8 = bytes.toString('utf8').replace(/\0/g, '').trim();
        if (utf8) secretCandidates.push(utf8);

        // 3) Some payloads may use UTF-16LE.
        const utf16le = bytes.toString('utf16le').replace(/\0/g, '').trim();
        if (utf16le) secretCandidates.push(utf16le);
      }
    } catch (_) {}
  }

  let lastStatus = null;
  let lastBody = null;
  let token = null;
  let expiresIn = null;
  for (const candidateSecret of secretCandidates) {
    const params = new URLSearchParams();
    params.set('grant_type', grantType);
    params.set('client_id', cfg.oauthClientId);
    params.set('client_secret', candidateSecret);
    if (cfg.oauthScope) params.set('scope', cfg.oauthScope);
    else if (cfg.oauthResource) params.set('resource', cfg.oauthResource);

    const resp = await axios.post(tokenUrl, params.toString(), {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      validateStatus: () => true
    });

    lastStatus = resp.status;
    lastBody = resp.data;

    if (resp.status >= 200 && resp.status < 300 && resp.data?.access_token) {
      token = resp.data.access_token;
      expiresIn = Number(resp.data?.expires_in);
      break;
    }
  }

  if (!token) {
    const details = (lastBody && typeof lastBody === 'object')
      ? (lastBody.error_description || lastBody.error || '')
      : '';
    throw new Error(`Token request failed (${lastStatus || 'unknown'})${details ? `: ${details}` : ''}`);
  }

  const expiresAtMs = Number.isFinite(expiresIn) && expiresIn > 0 ? (now + expiresIn * 1000) : (now + 45 * 60 * 1000);

  cachedOauthToken = { accessToken: token, expiresAtMs };
  return token;
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
  const sku = pickField(raw, ['sku', 'SKU', 'itemcode', 'itemCode', 'skuCode', 'item.sku', 'product.sku', 'data.sku']);
  const epc = pickField(raw, ['epc', 'EPC', 'epcCode', 'tag.epc', 'data.epc', 'product.epc']);
  const name = pickField(raw, ['name', 'productName', 'short_description', 'shortDescription', 'product.name', 'item.name', 'data.name', 'description']);
  const size = pickField(raw, ['size', 'product.size', 'item.size', 'data.size', 'attributes.size']);
  const model = pickField(raw, ['model', 'style', 'product.model', 'product.style', 'item.model', 'data.model']);
  const category = pickField(raw, ['category', 'type', 'productType', 'product.category', 'item.category']);
  const price = pickField(raw, ['price', 'retailPrice', 'product.price', 'item.price', 'data.price', 'attributes.price']);
  const ean = pickField(raw, ['ean', 'eancode', 'eanCode', 'gtin', 'GTIN', 'barcode', 'data.ean']);

  return {
    sku,
    epc,
    name,
    size,
    model,
    category,
    price,
    ean
  };
}

// GET /api/store-recovery/recent
router.get('/recent', (req, res) => {
  const data = readLog();
  const scans = Array.isArray(data.scans) ? data.scans : [];
  return res.json({ scans: scans.slice(0, 50) });
});

// GET /api/store-recovery/lookup?epc=...&sku=...&ean=...
router.get('/lookup', async (req, res) => {
  const epc = (req.query?.epc || '').toString().trim();
  const sku = (req.query?.sku || '').toString().trim();
  const ean = (req.query?.ean || req.query?.gtin || '').toString().trim();
  if (!epc && !sku && !ean) return res.status(400).json({ success: false, error: 'Missing epc, sku, or ean' });

  const cfg = getLookupConfig();
  cfg.baseUrl = (cfg.baseUrl || DEFAULT_STORE_RECOVERY_BASE_URL).toString().trim();
  if (!cfg.baseUrl) {
    return res.status(501).json({ success: false, error: 'Product lookup is not configured on the server' });
  }

  const hostLooksSuitsApi = /suitapi\.com/i.test(cfg.baseUrl);
  let effectiveAuthType = (cfg.authType || '').toString().trim() || (cfg.oauthClientSecret ? 'oauth2' : 'apiKey');
  // If this is clearly the Suit API host and no API key exists, prefer oauth2.
  if (effectiveAuthType === 'apiKey' && !cfg.apiKey && hostLooksSuitsApi) effectiveAuthType = 'oauth2';

  // Backwards-compatible mode: baseUrl is a URL template including {epc}/{sku}/{ean}.
  if (isTemplateUrl(cfg.baseUrl)) {
    if (!cfg.apiKey) {
      return res.status(501).json({ success: false, error: 'Product lookup API key is not configured on the server' });
    }
    let url = cfg.baseUrl;
    if (epc) url = url.replaceAll('{epc}', encodeURIComponent(epc));
    if (sku) url = url.replaceAll('{sku}', encodeURIComponent(sku));
    if (ean) url = url.replaceAll('{ean}', encodeURIComponent(ean));
    if (ean) url = url.replaceAll('{gtin}', encodeURIComponent(ean));
    if (!url) return res.status(500).json({ success: false, error: 'Invalid product lookup URL' });

    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        headers: {
          [cfg.headerName]: cfg.apiKey,
          'Accept': 'application/json'
        },
        validateStatus: () => true
      });

      if (resp.status < 200 || resp.status >= 300) {
        return res.status(502).json({ success: false, error: 'Upstream lookup failed', status: resp.status });
      }
      const raw = resp.data;
      const product = normalizeProduct(raw);
      return res.json({ success: true, product, raw });
    } catch (e) {
      return res.status(502).json({ success: false, error: 'Lookup request failed' });
    }
  }

  // Suits API mode: baseUrl is a host root; use known endpoints.
  let resolvedEan = ean;
  if (!resolvedEan && epc) {
    const decoded = decodeSgtin96EpcToGtin(epc);
    if (decoded?.ean) resolvedEan = decoded.ean;
  }

  let method = 'post';
  let url = '';
  let data = null;
  if (sku) {
    url = joinUrl(cfg.baseUrl, '/api/v1/RfidTag/NewTagFromSkuCode');
    data = { skuCode: sku };
  } else if (resolvedEan) {
    url = joinUrl(cfg.baseUrl, '/api/v1/RfidTag/NewTagFromEanCode');
    data = { eanCode: resolvedEan };
  } else {
    return res.status(400).json({ success: false, error: 'Unable to resolve EPC to EAN (need SKU or EAN/GTIN)' });
  }

  const headers = { 'Accept': 'application/json' };
  try {
    if (effectiveAuthType === 'oauth2') {
      const token = await getBearerToken(cfg);
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      if (!cfg.apiKey) {
        return res.status(501).json({ success: false, error: 'Product lookup API key is not configured on the server' });
      }
      headers[cfg.headerName] = cfg.apiKey;
    }

    const resp = await axios.request({
      method,
      url,
      data,
      timeout: 10000,
      headers,
      validateStatus: () => true
    });

    if (resp.status < 200 || resp.status >= 300) {
      return res.status(502).json({ success: false, error: 'Upstream lookup failed', status: resp.status });
    }

    const raw = resp.data;
    const product = normalizeProduct(raw);
    return res.json({ success: true, product, raw });
  } catch (e) {
    const msg = (e?.message || '').toString();
    if (/missing oauth/i.test(msg) || /token request failed/i.test(msg)) {
      return res.status(501).json({
        success: false,
        error: `OAuth is not configured for product lookup (${msg}). Upload the setup QR in Admin → Store Recovery config.`
      });
    }
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
