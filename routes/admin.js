const express = require('express');
const router = express.Router();
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const AdmZip = require('adm-zip');
const dal = require('../utils/dal');
const pgDal = require('../utils/dal/pg');
const { getActiveUsersSummary } = require('../utils/active-users');
const { getUnifiedProcessor } = require('../utils/unified-gmail-processor');

function getDiskUsageBytes(targetPath = '/') {
  try {
    const out = execFileSync('df', ['-kP', targetPath], { encoding: 'utf8' });
    const lines = out.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { available: false, error: 'df output missing data' };

    // POSIX format: Filesystem 1024-blocks Used Available Capacity Mounted on
    // Example: /dev/sda1  30830512  123456  30600000  1% /
    const cols = lines[1].trim().split(/\s+/);
    if (cols.length < 6) return { available: false, error: 'df output unparseable' };

    const totalKiB = Number(cols[1]);
    const usedKiB = Number(cols[2]);
    const availKiB = Number(cols[3]);
    const usePercent = Number(String(cols[4]).replace('%', ''));
    const mount = cols.slice(5).join(' ');

    return {
      available: true,
      path: targetPath,
      mount,
      totalBytes: Number.isFinite(totalKiB) ? totalKiB * 1024 : null,
      usedBytes: Number.isFinite(usedKiB) ? usedKiB * 1024 : null,
      availBytes: Number.isFinite(availKiB) ? availKiB * 1024 : null,
      usePercent: Number.isFinite(usePercent) ? usePercent : null,
    };
  } catch (e) {
    return { available: false, error: e?.message || 'df failed' };
  }
}

const DATA_DIR = dal.paths.dataDir;
const TIMEOFF_FILE = dal.paths.timeoffFile;
const GAMEPLAN_DAILY_DIR = dal.paths.gameplanDailyDir;
const SHIPMENTS_FILE = dal.paths.shipmentsFile;
const USERS_FILE = dal.paths.usersFile;
const AWARDS_CONFIG_FILE = path.join(DATA_DIR, 'awards-config.json');
const WORK_EXPENSES_CONFIG_FILE = path.join(DATA_DIR, 'work-expenses-config.json');
const STORE_RECOVERY_CONFIG_FILE = dal.paths.storeRecoveryConfigFile || path.join(DATA_DIR, 'store-recovery-config.json');

// Default suitsApi host root (used when admin doesn't have/scan a base URL).
const DEFAULT_STORE_RECOVERY_BASE_URL = 'https://printlabel.tst.suitapi.com/';
const DEFAULT_STORE_RECOVERY_OAUTH_DOMAIN = 'https://login.microsoftonline.com';
const DEFAULT_STORE_RECOVERY_OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/suitsupply.com/oauth2/token';
// From CREATE RFID app defaults: suitsApi_clientId
const DEFAULT_STORE_RECOVERY_OAUTH_CLIENT_ID = 'a775bf49-2444-46e1-b8e2-dfa0e6564c51';
const DEFAULT_STORE_RECOVERY_OAUTH_RESOURCE = 'https://suitsupply.com/printlabel-tst-sp';

function extractGuid(value) {
  const s = (value || '').toString();
  const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : '';
}

function maskSecret(value) {
  const s = (value || '').toString();
  if (!s) return '';
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function extractFirstUrl(text) {
  const s = (text || '').toString();
  const m = s.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : '';
}

function looksLikeGzipBase64(text) {
  const t = (text || '').toString().trim();
  if (!t) return false;
  if (!t.startsWith('H4sI')) return false;
  const compact = t.replace(/\s+/g, '');
  return /^[A-Za-z0-9+/=]+$/.test(compact);
}

function bytesLookPrintableAscii(buf) {
  if (!buf || !buf.length) return true;
  let printable = 0;
  for (const b of buf) {
    if (b === 9 || b === 10 || b === 13) { printable++; continue; }
    if (b >= 32 && b <= 126) { printable++; continue; }
  }
  return printable / buf.length >= 0.9;
}

function extractSuitQrKeyValues(decodedText) {
  const txt = (decodedText || '').toString().trim();
  if (!txt) return {};
  if (!looksLikeGzipBase64(txt)) return {};

  try {
    const compact = txt.replace(/\s+/g, '');
    const gz = Buffer.from(compact, 'base64');
    const buf = zlib.gunzipSync(gz);
    const latin = buf.toString('latin1');
    const re = /@S\dC([A-Za-z0-9_./-]+)=@/g;
    const matches = Array.from(latin.matchAll(re));
    if (!matches.length) return {};

    const kv = {};
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const key = (m[1] || '').trim();
      if (!key) continue;
      const start = (m.index || 0) + m[0].length;
      const end = (i + 1 < matches.length) ? (matches[i + 1].index || buf.length) : buf.length;
      const valBuf = buf.subarray(start, end);
      if (!valBuf.length) continue;
      if (bytesLookPrintableAscii(valBuf)) {
        const val = valBuf.toString('latin1').trim();
        if (val) kv[key] = val;
      } else {
        kv[key] = valBuf.toString('base64');
      }
    }
    return kv;
  } catch (_) {
    return {};
  }
}

function readStoreRecoveryConfig() {
  const raw = dal.readJson(STORE_RECOVERY_CONFIG_FILE, null) || {};
  const baseUrl = (raw.baseUrl || raw.apiBaseUrl || '').toString().trim();
  const authType = (raw.authType || raw.lookupAuthType || raw.productAuthType || 'apiKey').toString().trim() || 'apiKey';

  const headerName = (raw.headerName || raw.apiKeyHeader || raw.apiKeyHeaderName || 'x-api-key').toString().trim() || 'x-api-key';
  const apiKey = (raw.apiKey || raw.key || '').toString();

  const oauthDomain = (raw.oauthDomain || raw.domain || '').toString().trim();
  const oauthTokenUrl = (raw.oauthTokenUrl || raw.tokenUrl || '').toString().trim();
  const oauthClientId = (raw.oauthClientId || raw.clientId || '').toString().trim();
  const oauthClientSecret = (raw.oauthClientSecret || raw.clientSecret || '').toString();
  const oauthResource = (raw.oauthResource || raw.resource || '').toString().trim();
  const oauthScope = (raw.oauthScope || raw.scope || '').toString().trim();
  const oauthGrantType = (raw.oauthGrantType || raw.grantType || '').toString().trim();
  const oauthCountryCode = (raw.oauthCountryCode || raw.countryCode || '').toString().trim();

  const decodedText = (raw.decodedText || raw.raw || '').toString();
  return {
    baseUrl,
    authType,
    headerName,
    apiKey,
    oauthDomain,
    oauthTokenUrl,
    oauthClientId,
    oauthClientSecret,
    oauthResource,
    oauthScope,
    oauthGrantType,
    oauthCountryCode,
    decodedText,
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null
  };
}

function writeStoreRecoveryConfig(next) {
  dal.writeJsonAtomic(STORE_RECOVERY_CONFIG_FILE, next, { pretty: true });
}

function getTomatoConfigDefaults() {
  const today = dal.getBusinessDate();
  return { tomatoStartDate: dal.addDaysToIsoDate(today, 1) };
}

function readTomatoConfig() {
  const defaults = getTomatoConfigDefaults();
  const cfg = readJson(AWARDS_CONFIG_FILE, null) || {};
  return {
    ...defaults,
    ...cfg,
    tomatoStartDate: (cfg.tomatoStartDate || defaults.tomatoStartDate || '').toString(),
    tomatoResetAt: cfg.tomatoResetAt || null
  };
}

function writeTomatoConfig(next) {
  dal.writeJsonAtomic(AWARDS_CONFIG_FILE, next, { pretty: true });
}

function getTimestampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeFileName(value) {
  return (value || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function readJson(filePath, fallback) {
  return dal.readJson(filePath, fallback);
}

function readWorkExpensesConfig() {
  const cfg = readJson(WORK_EXPENSES_CONFIG_FILE, null) || {};
  return {
    // Policy default: €2,500 max retail value per calendar year (or local currency equivalent).
    // We store limits in local currency (LC) numbers (USD for SF).
    globalMonthlyLimit: Number.isFinite(Number(cfg.globalMonthlyLimit)) ? Number(cfg.globalMonthlyLimit) : null,
    globalYearlyLimit: Number.isFinite(Number(cfg.globalYearlyLimit)) ? Number(cfg.globalYearlyLimit) : 2500,
    overrides: cfg.overrides && typeof cfg.overrides === 'object' ? cfg.overrides : {},
    updatedAt: cfg.updatedAt || null,
    updatedBy: cfg.updatedBy || null
  };
}

function tryExec(cmd, args, { timeoutMs = 1200 } = {}) {
  try {
    const out = execFileSync(cmd, args, {
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out ? out.toString('utf8') : '';
  } catch {
    return null;
  }
}

function getGpuInfo() {
  // If the host doesn't have NVIDIA tools installed, this will gracefully return unavailable.
  const out = tryExec('nvidia-smi', [
    '--query-gpu=index,name,utilization.gpu,memory.total,memory.used,temperature.gpu',
    '--format=csv,noheader,nounits',
  ]);
  if (!out) return { available: false };

  const gpus = out
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 6) return null;
      return {
        index: Number(parts[0]),
        name: parts[1],
        utilGpuPercent: Number(parts[2]),
        memTotalMiB: Number(parts[3]),
        memUsedMiB: Number(parts[4]),
        tempC: Number(parts[5]),
      };
    })
    .filter(Boolean);

  return { available: true, gpus };
}

function writeWorkExpensesConfig(next) {
  dal.writeJsonAtomic(WORK_EXPENSES_CONFIG_FILE, next, { pretty: true });
}

// GET /api/admin/store-config - Get store configuration (admin only; middleware enforced in server.js)
router.get('/store-config', (req, res) => {
  return res.json(dal.getStoreConfig());
});

// POST /api/admin/store-config - Update store configuration (admin only)
router.post('/store-config', express.json(), (req, res) => {
  try {
    const patch = req.body || {};
    if (Object.prototype.hasOwnProperty.call(patch, 'requireSaShift')) {
      patch.requireSaShift = patch.requireSaShift === true || patch.requireSaShift === 'true';
    }
    const actorName = req.user?.name || null;
    const next = dal.updateStoreConfig(patch, actorName);
    return res.json(next);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid store config' });
  }
});

// GET /api/admin/health - basic server health metrics (admin only; middleware enforced in server.js)
router.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  const users = getActiveUsersSummary();
  const disk = getDiskUsageBytes('/');

  return res.json({
    ok: true,
    ts: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    },
    os: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptimeSec: os.uptime(),
      loadavg: os.loadavg(),
      cpuCores: (os.cpus() || []).length,
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
    },
    gpu: getGpuInfo(),
    disk,
    runtime: {
      env: {
        nodeEnv: process.env.NODE_ENV || null,
        port: process.env.PORT || null,
      },
      versions: {
        node: process.version,
        v8: process.versions?.v8 || null,
        openssl: process.versions?.openssl || null,
        uv: process.versions?.uv || null,
      },
    },
    users: {
      activeCount: users.activeCount,
      windowMs: users.windowMs,
    },
  });
});

// GET /api/admin/data-processing/status - Get unified Gmail processor status (admin only)
router.get('/data-processing/status', (req, res) => {
  try {
    const processor = getUnifiedProcessor();
    const status = processor.getStatus();

    return res.json({
      ok: true,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting data processing status:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to get data processing status',
      message: error.message
    });
  }
});

// POST /api/admin/data-processing/trigger - Trigger manual data processing (admin only)
router.post('/data-processing/trigger', express.json(), async (req, res) => {
  try {
    const processor = getUnifiedProcessor();

    // Check if processing is already running
    const status = processor.getStatus();
    if (status.isRunning) {
      return res.status(409).json({
        ok: false,
        error: 'Data processing already in progress',
        status: status
      });
    }

    // Start processing in background
    processor.processEmails().then(results => {
      console.log('Manual data processing completed:', results);
    }).catch(error => {
      console.error('Manual data processing failed:', error);
    });

    return res.json({
      ok: true,
      message: 'Data processing triggered successfully',
      status: 'started',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error triggering data processing:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to trigger data processing',
      message: error.message
    });
  }
});

// GET /api/admin/store-recovery-config - Store Recovery product lookup config (admin only)
router.get('/store-recovery-config', (req, res) => {
  const cfg = readStoreRecoveryConfig();
  return res.json({
    baseUrl: cfg.baseUrl,
    authType: cfg.authType || 'apiKey',
    headerName: cfg.headerName,
    decodedText: cfg.decodedText,
    apiKeyMasked: maskSecret(cfg.apiKey),
    hasApiKey: !!cfg.apiKey,
    oauthDomain: cfg.oauthDomain,
    oauthTokenUrl: cfg.oauthTokenUrl,
    oauthClientId: cfg.oauthClientId,
    oauthClientSecretMasked: maskSecret(cfg.oauthClientSecret),
    hasOauthClientSecret: !!cfg.oauthClientSecret,
    oauthResource: cfg.oauthResource,
    oauthScope: cfg.oauthScope,
    oauthGrantType: cfg.oauthGrantType,
    oauthCountryCode: cfg.oauthCountryCode,
    updatedAt: cfg.updatedAt,
    updatedBy: cfg.updatedBy
  });
});

// POST /api/admin/store-recovery-config - Update Store Recovery product lookup config (admin only)
router.post('/store-recovery-config', express.json(), (req, res) => {
  try {
    const body = req.body || {};

    const decodedText = (body.decodedText || body.raw || '').toString();
    let baseUrl = (body.baseUrl || body.apiBaseUrl || '').toString().trim();

    // If the QR payload is the Suit gzip/base64 format, extract any key-values server-side.
    const suitKv = extractSuitQrKeyValues(decodedText);
    if (!baseUrl && suitKv.suitsApi_baseUrl) baseUrl = String(suitKv.suitsApi_baseUrl).trim();

    const authType = (body.authType || body.lookupAuthType || '').toString().trim() || 'apiKey';
    const headerName = (body.headerName || body.apiKeyHeader || body.apiKeyHeaderName || 'x-api-key').toString().trim() || 'x-api-key';
    const apiKey = (body.apiKey || '').toString();

    const oauthDomain = (body.oauthDomain || '').toString().trim();
    const oauthTokenUrl = (body.oauthTokenUrl || '').toString().trim();
    const oauthClientId = (body.oauthClientId || '').toString().trim();
    let oauthClientSecret = (body.oauthClientSecret || '').toString();
    const oauthResource = (body.oauthResource || '').toString().trim();
    const oauthScope = (body.oauthScope || '').toString().trim();
    const oauthGrantType = (body.oauthGrantType || '').toString().trim();
    const oauthCountryCode = (body.oauthCountryCode || '').toString().trim();

    if (!oauthClientSecret && suitKv.suitsApi_clientSecret) {
      oauthClientSecret = String(suitKv.suitsApi_clientSecret);
    }

    const looksLikeSuitsApi = /suitapi\.com/i.test(baseUrl || DEFAULT_STORE_RECOVERY_BASE_URL) || !!suitKv.suitsApi_clientSecret;

    // If admin only uploads/pastes the QR decoded payload, try to pull a URL out.
    if (!baseUrl && decodedText) baseUrl = extractFirstUrl(decodedText);
    // If there's still no baseUrl, use a safe default suitsApi host root.
    if (!baseUrl) baseUrl = DEFAULT_STORE_RECOVERY_BASE_URL;

    const current = readStoreRecoveryConfig();
    const nextAuthType = (looksLikeSuitsApi && (!apiKey || authType === 'oauth2')) ? 'oauth2' : authType;
    const next = {
      baseUrl,
      authType: nextAuthType,
      headerName,
      // Allow leaving apiKey blank to keep existing.
      apiKey: apiKey ? apiKey : current.apiKey,
      oauthDomain: (oauthDomain || current.oauthDomain || (looksLikeSuitsApi ? DEFAULT_STORE_RECOVERY_OAUTH_DOMAIN : '')).toString().trim(),
      oauthTokenUrl: (oauthTokenUrl || current.oauthTokenUrl || (looksLikeSuitsApi ? DEFAULT_STORE_RECOVERY_OAUTH_TOKEN_URL : '')).toString().trim(),
      oauthClientId: (oauthClientId || current.oauthClientId || (looksLikeSuitsApi ? DEFAULT_STORE_RECOVERY_OAUTH_CLIENT_ID : '')).toString().trim(),
      // Allow leaving client secret blank to keep existing.
      oauthClientSecret: oauthClientSecret ? oauthClientSecret : current.oauthClientSecret,
      oauthResource: (oauthResource || current.oauthResource || (looksLikeSuitsApi ? DEFAULT_STORE_RECOVERY_OAUTH_RESOURCE : '')).toString().trim(),
      oauthScope: oauthScope || current.oauthScope,
      oauthGrantType: (oauthGrantType || current.oauthGrantType || (looksLikeSuitsApi ? 'client_credentials' : '')).toString().trim(),
      oauthCountryCode: oauthCountryCode || current.oauthCountryCode,
      decodedText,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || null
    };

    // If the admin uploads only the QR, fill missing clientId from known defaults.
    // (CREATE RFID app defaults to a fixed clientId for SuitSupply.)
    if (looksLikeSuitsApi && !next.oauthClientId) next.oauthClientId = DEFAULT_STORE_RECOVERY_OAUTH_CLIENT_ID;
    writeStoreRecoveryConfig(next);

    return res.json({
      success: true,
      baseUrl: next.baseUrl,
      authType: next.authType || 'apiKey',
      headerName: next.headerName,
      decodedText: next.decodedText,
      apiKeyMasked: maskSecret(next.apiKey),
      hasApiKey: !!next.apiKey,
      oauthDomain: next.oauthDomain || '',
      oauthTokenUrl: next.oauthTokenUrl || '',
      oauthClientId: next.oauthClientId || '',
      oauthClientSecretMasked: maskSecret(next.oauthClientSecret),
      hasOauthClientSecret: !!next.oauthClientSecret,
      oauthResource: next.oauthResource || '',
      oauthScope: next.oauthScope || '',
      oauthGrantType: next.oauthGrantType || '',
      oauthCountryCode: next.oauthCountryCode || '',
      updatedAt: next.updatedAt,
      updatedBy: next.updatedBy
    });
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid store recovery config' });
  }
});

// GET /api/admin/tomato-awards - Tomato awards configuration (admin only)
router.get('/tomato-awards', (req, res) => {
  const cfg = readTomatoConfig();
  // Persist if file didn't exist so awards start "tomorrow" by default.
  if (!fs.existsSync(AWARDS_CONFIG_FILE)) {
    writeTomatoConfig({ ...cfg, createdAt: new Date().toISOString(), createdBy: req.user?.name || null });
  }
  return res.json(cfg);
});

// POST /api/admin/tomato-awards/reset - Reset tomato awards (starts tomorrow)
router.post('/tomato-awards/reset', (req, res) => {
  const today = dal.getBusinessDate();
  const next = {
    ...readTomatoConfig(),
    // Reset immediately: numbers go back to 0 and start counting again from the current store day.
    tomatoStartDate: today,
    tomatoResetAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.name || null
  };
  writeTomatoConfig(next);
  return res.json(next);
});

// GET /api/admin/work-expenses-config - Work-related expenses limits (admin)
router.get('/work-expenses-config', (req, res) => {
  return res.json(readWorkExpensesConfig());
});

// POST /api/admin/work-expenses-config - Update limits (admin)
router.post('/work-expenses-config', express.json(), (req, res) => {
  try {
    const patch = req.body || {};
    const current = readWorkExpensesConfig();

    const next = {
      ...current,
      globalMonthlyLimit: Object.prototype.hasOwnProperty.call(patch, 'globalMonthlyLimit')
        ? (patch.globalMonthlyLimit === null || patch.globalMonthlyLimit === '' ? null : Number(patch.globalMonthlyLimit))
        : current.globalMonthlyLimit,
      globalYearlyLimit: Object.prototype.hasOwnProperty.call(patch, 'globalYearlyLimit')
        ? (patch.globalYearlyLimit === null || patch.globalYearlyLimit === '' ? null : Number(patch.globalYearlyLimit))
        : current.globalYearlyLimit,
      overrides: Object.prototype.hasOwnProperty.call(patch, 'overrides') && patch.overrides && typeof patch.overrides === 'object'
        ? patch.overrides
        : current.overrides,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || null
    };

    if (next.globalMonthlyLimit !== null && !Number.isFinite(next.globalMonthlyLimit)) {
      return res.status(400).json({ error: 'globalMonthlyLimit must be a number or null' });
    }
    if (next.globalYearlyLimit !== null && !Number.isFinite(next.globalYearlyLimit)) {
      return res.status(400).json({ error: 'globalYearlyLimit must be a number or null' });
    }

    writeWorkExpensesConfig(next);
    return res.json(next);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid work expenses config' });
  }
});

function splitForwardedFor(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getNetworkInterfacesSnapshot() {
  const ifaces = os.networkInterfaces();
  const all = [];

  Object.entries(ifaces).forEach(([name, addrs]) => {
    (addrs || []).forEach((a) => {
      if (!a || typeof a !== 'object') return;
      all.push({
        name,
        address: a.address,
        family: a.family,
        netmask: a.netmask,
        mac: a.mac,
        internal: !!a.internal,
        cidr: a.cidr || null,
        scopeid: a.scopeid ?? null,
      });
    });
  });

  // Heuristics: Tailscale interface is usually `tailscale0` and uses 100.64.0.0/10.
  const tailscale = all.filter((r) => {
    const addr = (r.address || '').toString();
    const name = (r.name || '').toString().toLowerCase();
    if (name.includes('tailscale')) return true;
    return /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(addr);
  });

  const nonInternal = all.filter((r) => !r.internal);
  return {
    all,
    nonInternal,
    ipv4: nonInternal.filter((r) => r.family === 'IPv4'),
    ipv6: nonInternal.filter((r) => r.family === 'IPv6'),
    tailscale,
  };
}

// GET /api/admin/network-info - Debug IP/proxy/network info (admin only)
router.get('/network-info', (req, res) => {
  const forwardedFor = splitForwardedFor(req.headers['x-forwarded-for']);
  const forwarded = (req.headers['forwarded'] || '').toString().trim() || null;
  const remoteAddress = req.socket?.remoteAddress || null;
  const network = getNetworkInterfacesSnapshot();

  return res.json({
    ok: true,
    server: {
      hostname: os.hostname(),
      platform: process.platform,
      pid: process.pid,
      node: process.version,
      port: process.env.PORT || 3000,
      appBaseUrl: (process.env.APP_BASE_URL || '').toString().trim() || null,
      interfaces: {
        ipv4: network.ipv4,
        ipv6: network.ipv6,
        tailscale: network.tailscale,
      },
    },
    request: {
      method: req.method,
      path: req.originalUrl || req.url,
      // Express-derived values (affected by `app.set('trust proxy', ...)` if enabled).
      expressIp: req.ip || null,
      expressIps: Array.isArray(req.ips) ? req.ips : [],
      // Raw socket + common proxy headers.
      remoteAddress,
      headers: {
        host: req.headers.host || null,
        'x-forwarded-for': forwardedFor,
        'x-forwarded-proto': req.headers['x-forwarded-proto'] || null,
        'x-forwarded-host': req.headers['x-forwarded-host'] || null,
        'x-real-ip': req.headers['x-real-ip'] || null,
        forwarded,
        'cf-connecting-ip': req.headers['cf-connecting-ip'] || null,
      },
    },
  });
});

function buildTimeOffCsv(entries) {
  const esc = (v) => `"${String(v ?? '').replace(/\"/g, '""')}"`;
  const header = [
    'employeeId',
    'employeeName',
    'startDate',
    'endDate',
    'reason',
    'status',
    'notes',
    'submittedAt',
    'decidedAt',
    'decidedByName',
    'workdayStatus',
    'processedAt',
    'processedByName'
  ].join(',');

  const rows = (entries || []).map(e => [
    esc(e.employeeId),
    esc(e.employeeName),
    esc(e.startDate),
    esc(e.endDate),
    esc(e.reason),
    esc(e.status),
    esc(e.notes),
    esc(e.submittedAt),
    esc(e.decidedAt || ''),
    esc(e.decidedBy?.name || ''),
    esc(e.workdayStatus || 'pending'),
    esc(e.processedAt || ''),
    esc(e.processedBy?.name || '')
  ].join(','));

  return `${header}\n${rows.join('\n')}\n`;
}

// GET /api/admin/backup.zip - Download a ZIP of the data directory (admin only; middleware enforced in server.js)
router.get('/backup.zip', async (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return res.status(404).json({ error: 'No data directory found' });
    }

    const zip = new AdmZip();
    zip.addLocalFolder(DATA_DIR, 'data');

    const filename = `stockroom-dashboard-backup_${getTimestampForFilename()}.zip`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-backup-'));
    const tmpZipPath = path.join(tmpDir, filename);
    zip.writeZip(tmpZipPath);

    return res.download(tmpZipPath, filename, (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
      if (err) {
        console.error('Error sending backup zip:', err);
      }
    });
  } catch (error) {
    console.error('Error generating backup zip:', error);
    return res.status(500).json({ error: 'Failed to generate backup' });
  }
});

// GET /api/admin/export.zip - Structured export (admin only; middleware enforced in server.js)
router.get('/export.zip', async (req, res) => {
  try {
    const zip = new AdmZip();
    const stamp = getTimestampForFilename();

    // ===== Time Off =====
    const timeoff = readJson(TIMEOFF_FILE, { entries: [] });
    const entries = Array.isArray(timeoff?.entries) ? timeoff.entries : [];
    zip.addFile('export/time-off/time-off.json', Buffer.from(JSON.stringify(timeoff, null, 2)));
    zip.addFile('export/time-off/time-off.csv', Buffer.from(buildTimeOffCsv(entries)));

    // By employee
    const byEmployee = new Map();
    for (const e of entries) {
      const key = `${e.employeeId || ''}`.trim() || 'unknown';
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key).push(e);
    }
    for (const [employeeId, list] of byEmployee.entries()) {
      const name = safeFileName(list?.[0]?.employeeName || '');
      const file = `export/time-off/by-employee/${safeFileName(employeeId)}_${name}.json`;
      zip.addFile(file, Buffer.from(JSON.stringify({ employeeId, entries: list }, null, 2)));
    }

    // By start date
    const byDate = new Map();
    for (const e of entries) {
      const date = (e.startDate || '').toString().trim() || 'unknown-date';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(e);
    }
    for (const [date, list] of byDate.entries()) {
      zip.addFile(`export/time-off/by-date/${safeFileName(date)}.json`, Buffer.from(JSON.stringify({ date, entries: list }, null, 2)));
    }

    // ===== Gameplan (already by-date) =====
    if (fs.existsSync(GAMEPLAN_DAILY_DIR)) {
      zip.addLocalFolder(GAMEPLAN_DAILY_DIR, 'export/gameplan/by-date');
    }

    // ===== Shipments =====
    const shipments = readJson(SHIPMENTS_FILE, []);
    zip.addFile('export/shipments/shipments.json', Buffer.from(JSON.stringify(shipments, null, 2)));

    // ===== Users (redacted) =====
    const usersData = readJson(USERS_FILE, { users: [] });
    const redactedUsers = {
      ...usersData,
      users: (usersData?.users || []).map(u => ({ ...u, password: undefined }))
    };
    zip.addFile('export/users/users.redacted.json', Buffer.from(JSON.stringify(redactedUsers, null, 2)));

    // ===== Raw data folder (reference) =====
    // Keep this export safe-ish by still including raw data in a separate subtree.
    if (fs.existsSync(DATA_DIR)) zip.addLocalFolder(DATA_DIR, 'export/raw-data');

    const filename = `stockroom-dashboard-export_${stamp}.zip`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-export-'));
    const tmpZipPath = path.join(tmpDir, filename);
    zip.writeZip(tmpZipPath);

    return res.download(tmpZipPath, filename, (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
      if (err) console.error('Error sending export zip:', err);
    });
  } catch (error) {
    console.error('Error generating structured export zip:', error);
    return res.status(500).json({ error: 'Failed to generate structured export' });
  }
});

module.exports = router;

// POST /api/admin/import-shipments-csv
// Accepts a raw CSV body (text/csv) and creates/updates shipments as needed.
router.post('/import-shipments-csv',
  // Accept text/csv and similar content types
  express.text({ type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], limit: '10mb' }),
  async (req, res) => {
    try {
      const csvText = (req.body || '').toString();
      if (!csvText.trim()) return res.status(400).json({ error: 'Empty CSV body' });

      // Simple CSV parser (handles quoted fields)
      function parseLine(line) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i+1] === '"') { cur += '"'; i++; continue; }
            inQuotes = !inQuotes; continue;
          }
          if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out.map(s => (s || '').toString().trim());
      }

      const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 1) return res.status(400).json({ error: 'CSV missing header row' });

      const headers = parseLine(lines[0]).map(h => (h || '').toString().toLowerCase());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const obj = {};
        for (let j = 0; j < headers.length; j++) obj[headers[j] || `c${j}`] = cols[j] || '';
        rows.push(obj);
      }

      // Field heuristics
      const findValue = (row, candidates) => {
        for (const k of candidates) {
          for (const hk of Object.keys(row)) {
            if (hk.includes(k)) return row[hk];
          }
        }
        return '';
      };

      const trackingCandidates = ['tracking', 'tracking_number', 'tracking#', 'trackingno', 'trackingnumber', 'tracking_no'];
      const dateCandidates = ['date', 'status_date', 'delivered_date', 'ship_date', 'scandate', 'scan_date', 'updated_at'];
      const statusCandidates = ['status', 'status_text', 'statusfromups'];
      const nameCandidates = ['customer', 'recipient', 'ship_to', 'shipto', 'name'];
      const shipperCandidates = ['shipper', 'from', 'sender'];

      let inserted = 0, updated = 0, skipped = 0;
      const errors = [];

      const now = Date.now();
      const recentDaysParam = Number(req.query?.recentDays || req.query?.recent_days || 0) || 0;
      const RECENT_WINDOW_MS = recentDaysParam > 0 ? (1000 * 60 * 60 * 24 * recentDaysParam) : (1000 * 60 * 60 * 24 * 90);

      for (const row of rows) {
        try {
          const rawTracking = findValue(row, trackingCandidates) || '';
          const tracking = (rawTracking || '').toString().trim().toUpperCase();
          if (!tracking) { skipped++; continue; }

          // Parse date if present
          const rawDate = findValue(row, dateCandidates) || '';
          let csvDate = null;
          if (rawDate) {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) csvDate = d;
          }

          // Skip if CSV row is not recent
          if (csvDate && (now - csvDate.getTime()) > RECENT_WINDOW_MS) { skipped++; continue; }

          const existing = await pgDal.getShipmentByTracking(tracking);

          if (!existing) {
            // Build shipment object from CSV row (best-effort mapping)
            const shipmentData = {
              tracking_number: tracking,
              carrier: 'UPS',
              status: (findValue(row, statusCandidates) || 'label-created').toString().toLowerCase(),
              status_from_ups: findValue(row, statusCandidates) || '',
              status_updated_at: csvDate ? csvDate.toISOString() : new Date().toISOString(),
              status_updated_source: 'csv-import',
              source: 'csv-import',
              imported_at: new Date().toISOString(),
              shipped_at: csvDate ? csvDate.toISOString() : null,
              customer_name: findValue(row, nameCandidates) || '',
              customer_address: null,
              order_number: findValue(row, ['order', 'order_number']) || '',
              service_type: findValue(row, ['service', 'service_type']) || '',
              package_count: Number(findValue(row, ['packages', 'package_count'])) || null,
              package_weight_lbs: Number((findValue(row, ['weight', 'package_weight']) || '').replace(/[a-zA-Z]/g, '')) || null,
              reference_1: findValue(row, ['reference', 'reference_1']) || '',
              reference_2: findValue(row, ['reference2', 'reference_2']) || '',
              processed_by_id: null,
              processed_by_name: null,
              shipper: findValue(row, shipperCandidates) || '',
              origin_location: findValue(row, ['origin']) || '',
              destination_location: findValue(row, ['destination']) || '',
              estimated_delivery_at: csvDate ? csvDate.toISOString() : null,
              notes: 'Imported from CSV via admin upload'
            };

            await pgDal.createShipment(shipmentData);
            inserted++;
          } else {
            // Decide whether to update existing record if CSV has newer info
            const existingTs = new Date(existing.status_updated_at || existing.imported_at || existing.created_at || 0);
            if (csvDate && csvDate.getTime() > existingTs.getTime()) {
              const updates = {};
              const statusVal = findValue(row, statusCandidates);
              if (statusVal) updates.status_from_ups = statusVal;
              if (csvDate) updates.status_updated_at = csvDate.toISOString();
              if (findValue(row, nameCandidates)) updates.customer_name = findValue(row, nameCandidates);
              const wt = findValue(row, ['weight']);
              if (wt) updates.package_weight_lbs = Number(wt.replace(/[a-zA-Z]/g, '')) || updates.package_weight_lbs;
              if (findValue(row, shipperCandidates)) updates.shipper = findValue(row, shipperCandidates);

              if (Object.keys(updates).length > 0) {
                await pgDal.updateShipment(existing.id, updates);
                updated++;
              } else skipped++;
            } else {
              skipped++;
            }
          }
        } catch (e) {
          errors.push((e && e.message) ? e.message : String(e));
        }
      }

      return res.json({ ok: true, inserted, updated, skipped, errors });
    } catch (e) {
      console.error('CSV import error:', e);
      return res.status(500).json({ error: e?.message || 'Import failed' });
    }
  }
);
