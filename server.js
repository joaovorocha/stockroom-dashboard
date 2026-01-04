require("dotenv").config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const shipmentsRoutes = require('./routes/shipments');
const closingDutiesRoutes = require('./routes/closingDuties');
const lostPunchRoutes = require('./routes/lostPunch');
const gameplanRoutes = require('./routes/gameplan');
const timeoffRoutes = require('./routes/timeoff');
const feedbackRoutes = require('./routes/feedback');
const adminRoutes = require('./routes/admin');
const awardsRoutes = require('./routes/awards');
const radioRoutes = require('./routes/radio');
const expensesRoutes = require('./routes/expenses');
const storeRecoveryRoutes = require('./routes/storeRecovery');
const authMiddleware = require('./middleware/auth');
const { getUPSScheduler } = require('./utils/ups-scheduler');

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

function isRequestSecure(req) {
  const xfProto = (req.get('x-forwarded-proto') || '').toString().toLowerCase();
  return !!req.secure || xfProto.split(',')[0].trim() === 'https';
}

// Optional HTTPS enforcement (recommended in production behind a TLS proxy)
app.use((req, res, next) => {
  if (!FORCE_HTTPS) return next();
  if (isRequestSecure(req)) return next();

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
    '/manifest.webmanifest',
    '/sw.js'
  ]);

  // Auth routes are public (they handle their own checks).
  if (p.startsWith('/api/auth')) return next();

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
app.use('/closing-duties', authMiddleware, express.static(path.join(__dirname, 'data/closing-duties')));

// Routes - Order matters! More specific routes before generic ones
app.use('/api/auth', authRoutes);
app.use('/api/shipments', authMiddleware, shipmentsRoutes);
app.use('/api/closing-duties', authMiddleware, closingDutiesRoutes);
app.use('/api/lost-punch', authMiddleware, lostPunchRoutes);
app.use('/api/gameplan', authMiddleware, gameplanRoutes);
app.use('/api/timeoff', authMiddleware, timeoffRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);
app.use('/api/admin', authMiddleware, adminOnly, adminRoutes);
app.use('/api/awards', authMiddleware, awardsRoutes);
app.use('/api/radio', authMiddleware, radioRoutes);
app.use('/api/expenses', authMiddleware, expensesRoutes);
app.use('/api/store-recovery', authMiddleware, storeRecoveryRoutes);

// Serve feedback uploads (auth required)
app.use('/feedback-uploads', authMiddleware, express.static(path.join(__dirname, 'data/feedback-uploads')));

// Serve user uploaded avatars (auth required)
app.use('/user-uploads', authMiddleware, express.static(path.join(__dirname, 'data/user-uploads')));

// Redirect old pages to new ones
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login-v2.html'));
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

app.get('/radio-admin', authMiddleware, managerOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'radio-admin.html'));
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

// Use HTTP for development (avoids cookie issues with self-signed certs)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🖥️  STOCKROOM DASHBOARD SERVER                          ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Local:   http://localhost:${PORT}                        ║`);
  console.log(`║  Network: http://192.168.12.103:${PORT}                   ║`);
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
