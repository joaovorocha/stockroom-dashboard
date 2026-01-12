require("dotenv").config();
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

const authRoutes = require('./routes/auth-pg');
const shipmentsRoutes = require('./routes/shipments');
const closingDutiesRoutes = require('./routes/closingDuties-pg');
const lostPunchRoutes = require('./routes/lostPunch-pg');
const gameplanRoutes = require('./routes/gameplan');
const timeoffRoutes = require('./routes/timeoff-pg');
const feedbackRoutes = require('./routes/feedback-pg');
const adminRoutes = require('./routes/admin');
const awardsRoutes = require('./routes/awards');
const radioRoutes = require('./routes/radio');
const expensesRoutes = require('./routes/expenses');
const storeRecoveryRoutes = require('./routes/storeRecovery');
const pickupsRoutes = require('./routes/pickups');
const waitwhileRoutes = require('./routes/waitwhile');
const manhattanRoutes = require('./routes/manhattan');
const rfidRoutes = require('./routes/rfid');
const printersRoutes = require('./routes/printers');
const mockApiRoutes = require('./routes/mock-api');
const authMiddleware = require('./middleware/auth-pg');
const dal = require('./utils/dal');
const { getUPSScheduler } = require('./utils/ups-scheduler');
const { markActive } = require('./utils/active-users');

const app = express();
const PORT = process.env.PORT || 3000;
const HOME_PATH = '/home';
const LEGACY_HOME_PATH = '/app';

const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';

// Required when running behind a reverse proxy (e.g. Tailscale Serve) so `req.secure` and IPs are correct.
app.set('trust proxy', true);

function hasSession(req) {
  return !!req.cookies?.userSession;
}

function redirectToHome(req, res) {
  return res.redirect(HOME_PATH);
}

function managerOnly(req, res, next) {
  const user = req.user;
  if (user?.isManager || user?.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Manager access required' });
  return res.status(403).send('Manager access required');
}

function gameplanEditorOnly(req, res, next) {
  const user = req.user;
  if (user?.canEditGameplan || user?.isManager || user?.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Gameplan editor access required' });
  return res.status(403).send('Gameplan editor access required');
}

function adminOnly(req, res, next) {
  const user = req.user;
  if (user?.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Admin access required' });
  return res.status(403).send('Admin access required');
}

// Middleware
app.use(cors({
  origin: true, // Allow all origins (will echo the request origin)
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // Increased for large iPhone photos
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increased for large iPhone photos
app.use(cookieParser());

function isRequestSecure(req) {
  const xfProto = (req.get('x-forwarded-proto') || '').toString().toLowerCase();
  return !!req.secure || xfProto.split(',')[0].trim() === 'https';
}

function isPrivateLanIpHost(hostHeader) {
  const host = (hostHeader || '').toString().split(',')[0].trim();
  const hostNoPort = host.replace(/:\d+$/, '');
  const m = hostNoPort.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const octets = m.slice(1).map((x) => Number.parseInt(x, 10));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

// Optional HTTPS enforcement (recommended in production behind a TLS proxy)
app.use((req, res, next) => {
  if (!FORCE_HTTPS) return next();
  if (isRequestSecure(req)) return next();

  // Allow HTTP access via private LAN IPs (useful as a Wi-Fi fallback when
  // DNS/Internet is flaky). The HTTPS proxy + certificate is for the hostname.
  if (isPrivateLanIpHost(req.get('host'))) return next();

  const host = req.get('host');
  const target = `https://${host}${req.originalUrl || req.url || ''}`;
  if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(301, target);
  return res.status(400).send('HTTPS required');
});

function upsertFrameAncestorsCsp(res, value) {
  const existing = res.getHeader('Content-Security-Policy');
  const existingStr = Array.isArray(existing) ? existing.join('; ') : (existing || '').toString();
  if (!existingStr) {
    res.setHeader('Content-Security-Policy', value);
    return;
  }
  if (/(\s|;)frame-ancestors\s/i.test(existingStr)) {
    const replaced = existingStr.replace(/(^|;)\s*frame-ancestors\s+[^;]*/i, `$1 ${value}`);
    res.setHeader('Content-Security-Policy', replaced.trim());
    return;
  }
  res.setHeader('Content-Security-Policy', `${existingStr.replace(/\s*;\s*$/, '')}; ${value}`);
}

// Basic security headers (keeps inline scripts working)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (isRequestSecure(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  // Builder.io needs to iframe the app; allow only Builder + self.
  upsertFrameAncestorsCsp(res, "frame-ancestors 'self' https://builder.io https://*.builder.io");
  next();
});

// Basic CSRF mitigation for API write requests (cookie auth uses SameSite=None in secure mode).
// Require same-origin Origin/Referer for non-GET API calls.
app.use((req, res, next) => {
  const path = (req.path || '').toString();
  if (!path.startsWith('/api/')) return next();
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  // IMPORTANT: When running behind a TLS-terminating proxy, Express may see the request as HTTP
  // while the browser sends Origin/Referer as HTTPS. Validate by host instead of scheme.
  const expectedHost = ((req.get('x-forwarded-host') || req.get('host') || '').toString().split(',')[0] || '').trim();
  const origin = (req.get('origin') || '').toString();
  const referer = (req.get('referer') || '').toString();

  function getHostFromUrl(urlStr) {
    try {
      const u = new URL(urlStr);
      return (u.host || '').toString();
    } catch (_) {
      return '';
    }
  }

  // Prefer Origin when present.
  if (origin) {
    const originHost = getHostFromUrl(origin);
    if (!originHost || originHost !== expectedHost) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
    return next();
  }

  // Fall back to Referer if Origin is absent.
  if (referer) {
    const refererHost = getHostFromUrl(referer);
    if (!refererHost || refererHost !== expectedHost) {
      return res.status(403).json({ error: 'Invalid referer' });
    }
  }
  return next();
});

// Auth-by-default: everything except explicit public routes/assets requires a valid session.
app.use((req, res, next) => {
  const p = (req.path || '').toString();
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return next();

  const publicExact = new Set([
    '/',
    '/login',
    '/login-v2',
    '/forgot-password',
    '/reset-password',
    '/favicon.ico',
    '/manifest.webmanifest',
    '/sw.js'
  ]);

  // Auth routes are public (they handle their own checks).
  if (p.startsWith('/api/auth')) return next();
  
  // Mock API routes - public for testing
  if (p.startsWith('/api/mock') || p === '/test-mock-status') return next();

  // Public static assets.
  const publicPrefixes = [
    '/css/',
    '/js/',
    '/images/',
    '/icons/',
    '/vendor/',
    '/downloads/'
  ];

  if (publicExact.has(p)) return next();
  if (publicPrefixes.some(prefix => p.startsWith(prefix))) return next();

  // Otherwise require auth.
  return authMiddleware(req, res, next);
});

// Track active users for admin health monitoring.
app.use((req, res, next) => {
  if (req.user) markActive(req.user, req);
  return next();
});

// Normalize common copy/paste dash characters in URLs (e.g. Safari/Docs en-dash/em-dash)
app.use((req, res, next) => {
  const url = req.url || '';
  // Includes: hyphen (U+2010), non-breaking hyphen (U+2011), figure dash (U+2012),
  // en dash (U+2013), em dash (U+2014), minus (U+2212), small hyphen-minus (U+FE63), fullwidth hyphen-minus (U+FF0D).
  const hasUnicodeDash = /[‐‑‒–—−﹣－]/.test(url);
  const hasEncodedDash = /%E2%80%90|%E2%80%91|%E2%80%92|%E2%80%93|%E2%80%94|%E2%88%92|%EF%B9%A3|%EF%BC%8D/i.test(url);
  if (!hasUnicodeDash && !hasEncodedDash) return next();
  return res.redirect(
    302,
    url
      .replace(/[‐‑‒–—−﹣－]/g, '-')
      .replace(/%E2%80%90/gi, '-') // U+2010
      .replace(/%E2%80%91/gi, '-') // U+2011
      .replace(/%E2%80%92/gi, '-') // U+2012
      .replace(/%E2%80%93/gi, '-')
      .replace(/%E2%80%94/gi, '-')
      .replace(/%E2%88%92/gi, '-')
      .replace(/%EF%B9%A3/gi, '-') // U+FE63
      .replace(/%EF%BC%8D/gi, '-') // U+FF0D
  );
});

// Serve static files from public directory (css/js/images)
// Avoid stale assets when we deploy quick fixes.
// Special-case: admin-only HTML pages should not be reachable via express.static.
app.use((req, res, next) => {
  if (req.path === '/radio-admin.html') {
    return authMiddleware(req, res, () => adminOnly(req, res, () => res.redirect('/radio-admin')));
  }
  return next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Serve closing duties photos (auth required)
app.use('/closing-duties', authMiddleware, express.static(dal.paths.closingDutiesDir));
// Routes - Order matters! More specific routes before generic ones
app.use('/feedback-uploads', authMiddleware, express.static(dal.paths.feedbackUploadsDir));
app.use('/api/auth', authRoutes);
app.use('/api/shipments', authMiddleware, shipmentsRoutes);
app.use('/user-uploads', authMiddleware, express.static(dal.paths.userUploadsDir));
app.use('/api/lost-punch', authMiddleware, lostPunchRoutes);
app.use('/api/gameplan', authMiddleware, gameplanRoutes);
app.use('/api/timeoff', authMiddleware, timeoffRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);
app.use('/api/closing-duties', authMiddleware, closingDutiesRoutes);
app.use('/api/admin', authMiddleware, adminOnly, adminRoutes);
app.use('/api/awards', authMiddleware, awardsRoutes);
app.use('/api/radio', authMiddleware, radioRoutes);
app.use('/api/expenses', authMiddleware, expensesRoutes);
app.use('/api/store-recovery', authMiddleware, storeRecoveryRoutes);
app.use('/api/pickups', authMiddleware, pickupsRoutes);
app.use('/api/waitwhile', authMiddleware, waitwhileRoutes);
app.use('/api/manhattan', authMiddleware, manhattanRoutes);
app.use('/api/rfid', authMiddleware, rfidRoutes);
app.use('/api/printers', authMiddleware, printersRoutes);
// Mock API routes - no auth required for testing
app.use('/api/mock', mockApiRoutes);

// Test endpoint for mock data (no auth)
app.get('/test-mock-status', (req, res) => {
  const { mockClient: psMock, MOCK_ENABLED: PS_MOCK } = require('./utils/mock-predictspring-client');
  const { mockClient: mhMock, MOCK_ENABLED: MH_MOCK } = require('./utils/mock-manhattan-client');
  
  res.json({
    predictSpring: { enabled: PS_MOCK, sampleOrders: PS_MOCK ? 3 : 0 },
    manhattan: { enabled: MH_MOCK, sampleInventory: MH_MOCK ? 6 : 0 },
    message: 'Mock clients are loaded and ready',
    usage: {
      getPredictSpringOrder: 'psMock.getOrder("PSU12345")',
      getManhattanInventory: 'mhMock.getInventoryBySKU("SUIT-BLK-42R")'
    }
  });
});

// Redirect old pages to new ones
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Public password reset pages (no auth)
app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/gameplan', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/gameplan-v2', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard.html', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/index.html', (req, res) => {
  // Match `/` behavior (handy when users bookmark /index.html).
  if (hasSession(req)) return redirectToHome(req, res);
  return res.redirect('/login');
});

// Serve HTML pages
app.get('/dashboard', authMiddleware, (req, res) => {
  // Admins always see the management view (even if their role label is SA/BOH/etc).
  if (req.user?.isAdmin) return res.redirect('/gameplan-management');
  const role = (req.user?.role || '').toUpperCase();
  if (role === 'TAILOR') return res.redirect('/gameplan-tailors');
  if (role === 'BOH') return res.redirect('/gameplan-boh');
  if (role === 'MANAGEMENT' || role === 'ADMIN') return res.redirect('/gameplan-management');
  return res.redirect('/gameplan-sa');
});

app.get('/gameplan-sa', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-sa.html'));
});

app.get('/gameplan-tailors', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-tailors.html'));
});

app.get('/gameplan-boh', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-boh.html'));
});

app.get('/gameplan-management', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-management.html'));
});

app.get('/gameplan-edit', authMiddleware, gameplanEditorOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-edit.html'));
});

app.get('/ops-dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops-dashboard.html'));
});

app.get('/time-off', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'time-off.html'));
});

app.get('/login-v2', (req, res) => {
  res.redirect('/login');
});

app.get('/shipments', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shipments.html'));
});

app.get('/awards', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'awards.html'));
});

// Canonical home
app.get(HOME_PATH, authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Backwards compatibility
app.get(LEGACY_HOME_PATH, authMiddleware, (req, res) => {
  const url = req.originalUrl || req.url || '';
  const suffix = url && url !== LEGACY_HOME_PATH ? url.slice(LEGACY_HOME_PATH.length) : '';
  return res.redirect(`${HOME_PATH}${suffix}`);
});

// Profile completion / password change gate (auth required)
app.get('/complete-profile', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'complete-profile.html'));
});

// Extra safety: accept common unicode dash variants in the Operations route.
app.get(/^\/operations[‐‑‒–—−﹣－]metrics$/, authMiddleware, (req, res) => {
  return res.redirect('/operations-metrics');
});

app.get('/operations-metrics', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operations-metrics.html'));
});

app.get('/expenses', authMiddleware, (req, res) => {
  const url = req.originalUrl || req.url || '';
  const qsIndex = url.indexOf('?');
  const qs = qsIndex >= 0 ? url.slice(qsIndex) : '';
  res.redirect(`/employee-discount${qs}`);
});

app.get('/employee-discount', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'expenses.html'));
});

app.get('/shipments-processing', authMiddleware, (req, res) => {
  res.redirect('/shipments');
});

app.get('/ups-extension', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ups-extension.html'));
});

app.get('/store-recovery', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store-recovery.html'));
});

app.get('/qr-decode', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr-decode.html'));
});

// CampusShip import page removed (shipments are captured from UPS emails now).

app.get('/scanner', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get('/radio', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'radio.html'));
});

app.get('/radio-transcripts', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'radio-transcripts.html'));
});

app.get('/radio-admin', authMiddleware, adminOnly, (req, res) => {
  return res.redirect('/admin#radio');
});

app.get('/closing-duties', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'closing-duties.html'));
});

app.get('/lost-punch', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lost-punch.html'));
});

app.get('/admin', authMiddleware, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/feedback', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

// BOH Shipments merged into main /shipments page
app.get('/boh-shipments', authMiddleware, (req, res) => {
  res.redirect('/shipments');
});

app.get('/printer-manager', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'printer-manager.html'));
});

app.get('/rfid-scanner', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rfid-scanner.html'));
});

app.get('/pickup-status', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pickup-status.html'));
});

app.get('/', (req, res) => {
  // If already authenticated, go home; otherwise go to login
  if (hasSession(req)) return redirectToHome(req, res);
  return res.redirect('/login');
});

// ===== Server-Sent Events (SSE) for Real-Time Updates =====
let sseClients = [];

// SSE endpoint for real-time updates
app.get('/api/sse/updates', authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial connection confirmation
  res.write('data: {"type":"connected","message":"Real-time updates enabled"}\n\n');

  // Add client to the list
  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);

  console.log(`SSE client connected: ${clientId}. Total clients: ${sseClients.length}`);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"heartbeat"}\n\n');
  }, 30000);

  // Remove client on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`SSE client disconnected: ${clientId}. Total clients: ${sseClients.length}`);
  });
});

// Function to broadcast updates to all SSE clients
function broadcastUpdate(updateType, data) {
  const message = JSON.stringify({ type: updateType, data, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.res.write(`data: ${message}\n\n`);
  });
}

// Export broadcastUpdate for use in route handlers
app.set('broadcastUpdate', broadcastUpdate);

// --- Radio live audio monitor (UDP -> WebSocket) ---
// Capture process sends 100ms chunks of mono int16 PCM @ 24000 Hz to UDP 127.0.0.1:7355.
const RADIO_MONITOR_UDP_HOST = process.env.RADIO_MONITOR_UDP_HOST || '127.0.0.1';
const RADIO_MONITOR_UDP_PORT = Number.parseInt(process.env.RADIO_MONITOR_UDP_PORT || '7355', 10) || 7355;
const RADIO_MONITOR_SAMPLE_RATE = Number.parseInt(process.env.RADIO_MONITOR_SAMPLE_RATE || '24000', 10) || 24000;

// --- Radio spectrum/waterfall (rtl_power -> UDP JSON -> WebSocket) ---
const RADIO_SPECTRUM_UDP_HOST = process.env.RADIO_SPECTRUM_UDP_HOST || '127.0.0.1';
const RADIO_SPECTRUM_UDP_PORT = Number.parseInt(process.env.RADIO_SPECTRUM_UDP_PORT || '7356', 10) || 7356;

function parseCookieHeader(headerValue) {
  const header = (headerValue || '').toString();
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    out[k] = v;
  });
  return out;
}

function decodeCookieValue(v) {
  const raw = (v || '').toString();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function validateSessionFromCookie(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionRaw = cookies.userSession;
  if (!sessionRaw) return null;

  let sessionObj = null;
  try {
    sessionObj = JSON.parse(decodeCookieValue(sessionRaw));
  } catch {
    return null;
  }

  const usersFile = dal.paths.usersFile;
  try {
    if (!fs.existsSync(usersFile)) return null;
    const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const list = usersData.users || [];
    const employeeId = sessionObj.employeeId || sessionObj.userId;
    const found = list.find(u => u.employeeId === employeeId || u.id === employeeId) || null;
    if (!found) return null;
    return found;
  } catch {
    return null;
  }
}

const radioMonitorClients = new Set();
const radioSpectrumClients = new Set();

const RADIO_ANALYZER_LOG_PATH = path.join(__dirname, 'logs', 'radio-analyzer.log');

function appendLogLine(filePath, line, { maxBytes = 2 * 1024 * 1024 } = {}) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      const st = fs.statSync(filePath);
      if (st.size > maxBytes) {
        const keep = Math.floor(maxBytes / 2);
        const fd = fs.openSync(filePath, 'r');
        try {
          const buf = Buffer.alloc(keep);
          fs.readSync(fd, buf, 0, keep, Math.max(0, st.size - keep));
          fs.writeFileSync(filePath, buf.toString('utf8'), 'utf8');
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch {
      // ignore stat/trim errors
    }
    fs.appendFileSync(filePath, line + '\n', 'utf8');
  } catch {
    // ignore
  }
}

function logAnalyzer(event, details) {
  const obj = {
    ts: new Date().toISOString(),
    event: (event || 'event').toString(),
    ...(details && typeof details === 'object' ? details : {}),
  };
  appendLogLine(RADIO_ANALYZER_LOG_PATH, JSON.stringify(obj));
}

let radioMonitorLastFrameAt = 0;
let radioSpectrumLastUdpAt = 0;
let radioSpectrumLastFftAt = 0;
let radioSpectrumLastErrorAt = 0;
let radioSpectrumLastErrorMessage = '';
let radioSpectrumLastParseErrorAt = 0;
let radioSpectrumLastState = '';

function broadcastRadioPcm(buf) {
  if (!buf || !buf.length) return;
  radioMonitorLastFrameAt = Date.now();
  const clientCount = radioMonitorClients.size;
  let sent = 0;
  for (const ws of radioMonitorClients) {
    if (!ws || ws.readyState !== 1) continue;
    // Drop frames for slow clients to avoid backpressure and memory growth.
    if (ws.bufferedAmount > 512 * 1024) continue;
    try {
      ws.send(buf);
      sent++;
    } catch {
      // ignore
    }
  }
  // Log every 5 seconds
  if (!broadcastRadioPcm._lastLog) broadcastRadioPcm._lastLog = 0;
  if (Date.now() - broadcastRadioPcm._lastLog > 5000) {
    console.log(`[radio-monitor] Clients: ${clientCount}, Sent: ${sent}, Buf: ${buf.length} bytes`);
    broadcastRadioPcm._lastLog = Date.now();
  }
}

const radioMonitorUdp = dgram.createSocket('udp4');
radioMonitorUdp.on('message', (msg) => {
  broadcastRadioPcm(msg);
});
radioMonitorUdp.on('error', (err) => {
  console.error('Radio monitor UDP error:', err?.message || err);
});
try {
  radioMonitorUdp.bind(RADIO_MONITOR_UDP_PORT, RADIO_MONITOR_UDP_HOST, () => {
    console.log(`Radio monitor UDP listening on ${RADIO_MONITOR_UDP_HOST}:${RADIO_MONITOR_UDP_PORT}`);
  });
} catch (e) {
  console.error('Failed to bind radio monitor UDP:', e?.message || e);
}

const wssRadioMonitor = new WebSocketServer({ noServer: true });
wssRadioMonitor.on('connection', (ws, req) => {
  radioMonitorClients.add(ws);
  try {
    ws.send(JSON.stringify({ type: 'hello', format: 's16le', channels: 1, sampleRate: RADIO_MONITOR_SAMPLE_RATE }));
  } catch {}

  ws.on('close', () => {
    radioMonitorClients.delete(ws);
  });
});

function broadcastRadioSpectrum(msgObj) {
  if (!msgObj) return;
  const payload = JSON.stringify(msgObj);
  for (const ws of radioSpectrumClients) {
    if (!ws || ws.readyState !== 1) continue;
    if (ws.bufferedAmount > 512 * 1024) continue;
    try {
      ws.send(payload);
    } catch {
      // ignore
    }
  }
}

const radioSpectrumUdp = dgram.createSocket('udp4');
radioSpectrumUdp.on('message', (msg) => {
  try {
    const s = msg.toString('utf8');
    const obj = JSON.parse(s);
    radioSpectrumLastUdpAt = Date.now();
    if (obj?.type === 'fft') {
      radioSpectrumLastFftAt = radioSpectrumLastUdpAt;
    }
    if (obj?.type === 'status' && obj?.ok === false) {
      radioSpectrumLastErrorAt = radioSpectrumLastUdpAt;
      radioSpectrumLastErrorMessage = (obj?.message || obj?.error || '').toString();
    }
    broadcastRadioSpectrum(obj);
  } catch {
    radioSpectrumLastParseErrorAt = Date.now();
    logAnalyzer('udp-parse-error', {
      bytes: msg?.length || 0,
      sample: (msg ? msg.toString('utf8', 0, Math.min(140, msg.length)) : ''),
    });
  }
});
radioSpectrumUdp.on('error', (err) => {
  console.error('Radio spectrum UDP error:', err?.message || err);
});
try {
  radioSpectrumUdp.bind(RADIO_SPECTRUM_UDP_PORT, RADIO_SPECTRUM_UDP_HOST, () => {
    console.log(`Radio spectrum UDP listening on ${RADIO_SPECTRUM_UDP_HOST}:${RADIO_SPECTRUM_UDP_PORT}`);
  });
} catch (e) {
  console.error('Failed to bind radio spectrum UDP:', e?.message || e);
}

const wssRadioSpectrum = new WebSocketServer({ noServer: true });
wssRadioSpectrum.on('connection', (ws, req) => {
  radioSpectrumClients.add(ws);
  try {
    ws.send(JSON.stringify({ type: 'hello', stream: 'radio-spectrum' }));
  } catch {}
  logAnalyzer('ws-connect', { clientCount: radioSpectrumClients.size, user: ws.user?.employeeId || ws.user?.id || null });
  ws.on('close', () => {
    radioSpectrumClients.delete(ws);
    logAnalyzer('ws-close', { clientCount: radioSpectrumClients.size, user: ws.user?.employeeId || ws.user?.id || null });
  });
});

function broadcastRadioSpectrumStatus() {
  if (radioSpectrumClients.size === 0) return;
  const now = Date.now();
  const fftAgeMs = radioSpectrumLastFftAt ? (now - radioSpectrumLastFftAt) : null;

  // If the spectrum producer reported an error recently and we have no fresh FFT,
  // surface that error to the UI instead of flapping waiting/stalled.
  const hasRecentError = radioSpectrumLastErrorAt && (now - radioSpectrumLastErrorAt) < 20_000;
  const hasFreshFft = radioSpectrumLastFftAt && fftAgeMs != null && fftAgeMs <= 3000;
  if (hasRecentError && !hasFreshFft) {
    const status = {
      type: 'status',
      ok: false,
      state: 'error',
      message: radioSpectrumLastErrorMessage || 'Spectrum source error',
    };
    const stateKey = `${status.ok ? 'ok' : 'bad'}:${status.state}`;
    if (stateKey !== radioSpectrumLastState) {
      radioSpectrumLastState = stateKey;
      logAnalyzer('stream-state', { ok: status.ok, state: status.state, ageMs: null, clients: radioSpectrumClients.size });
    }
    broadcastRadioSpectrum(status);
    return;
  }

  let status = { type: 'status', ok: true, state: 'streaming' };
  if (!radioSpectrumLastFftAt && !radioSpectrumLastUdpAt) {
    status = { type: 'status', ok: true, state: 'waiting' };
  } else if (!radioSpectrumLastFftAt && radioSpectrumLastUdpAt) {
    // Producer is alive (sending status), but no FFT yet.
    status = { type: 'status', ok: true, state: 'waiting' };
  } else if (fftAgeMs != null && fftAgeMs > 3000) {
    status = { type: 'status', ok: false, state: 'stalled', ageMs: fftAgeMs };
  } else if (fftAgeMs != null) {
    status = { type: 'status', ok: true, state: 'streaming', ageMs: fftAgeMs };
  }

  if (radioSpectrumLastParseErrorAt && (now - radioSpectrumLastParseErrorAt) < 3000) {
    status = { type: 'status', ok: false, state: 'udp-parse-error' };
  }

  const stateKey = `${status.ok ? 'ok' : 'bad'}:${status.state}`;
  if (stateKey !== radioSpectrumLastState) {
    radioSpectrumLastState = stateKey;
    logAnalyzer('stream-state', { ok: status.ok, state: status.state, ageMs: status.ageMs ?? null, clients: radioSpectrumClients.size });
  }

  broadcastRadioSpectrum(status);
}

setInterval(broadcastRadioSpectrumStatus, 1000).unref?.();

// Start UPS email import scheduler
// Default: every 30 minutes between 8am-8pm (includes 8:00-19:30 + 20:00)
const UPS_IMPORT_CRON = process.env.UPS_EMAIL_IMPORT_CRON || '0,30 8-19 * * *;0 20 * * *';
const UPS_IMPORT_DAYS = parseInt(process.env.UPS_EMAIL_IMPORT_DAYS || '2', 10);
// Safer default: never delete emails unless explicitly enabled.
const UPS_DELETE_AFTER_IMPORT = process.env.UPS_EMAIL_DELETE_AFTER_IMPORT === 'true';
try {
  const upsScheduler = getUPSScheduler();
  upsScheduler.start(UPS_IMPORT_CRON, UPS_IMPORT_DAYS, UPS_DELETE_AFTER_IMPORT);
  console.log(`UPS scheduler active (cron=${UPS_IMPORT_CRON}, daysBack=${UPS_IMPORT_DAYS}, deleteAfterImport=${UPS_DELETE_AFTER_IMPORT})`);
} catch (e) {
  console.error('Failed to start UPS scheduler:', e.message);
}

// Use HTTP server so WebSocket upgrades work.
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(req.url || '', 'http://localhost').pathname;
  } catch {
    pathname = '';
  }

  if (pathname !== '/ws/radio-monitor' && pathname !== '/ws/radio-spectrum') {
    return;
  }

  const user = validateSessionFromCookie(req.headers.cookie || '');
  if (!user) {
    try {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    } catch {}
    try { socket.destroy(); } catch {}
    return;
  }

  if (pathname === '/ws/radio-monitor') {
    wssRadioMonitor.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      wssRadioMonitor.emit('connection', ws, req);
    });
    return;
  }

  wssRadioSpectrum.handleUpgrade(req, socket, head, (ws) => {
    ws.user = user;
    wssRadioSpectrum.emit('connection', ws, req);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🖥️  STOCKROOM DASHBOARD SERVER                          ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Local:   http://localhost:${PORT}                        ║`);
  console.log(`║  Network: http://<server-ip>:${PORT}                      ║`);
  console.log(`║  Press Ctrl+C to stop                                     ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
});

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
