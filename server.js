require("dotenv").config();
const { initCache } = require('./src/utils/cache');

// Initialize cache
initCache();

// SECURITY PATCH: CRITICAL-01 - Redis session configuration
const { getSessionMiddleware } = require('./config/redis-session');

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth-pg');
const shipmentsRoutes = require('./routes/shipments');
const closingDutiesRoutes = require('./routes/closingDuties-pg');
const lostPunchRoutes = require('./routes/lostPunch-pg');
const gameplanRoutes = require('./routes/gameplan');
const timeoffRoutes = require('./routes/timeoff-pg');
const feedbackRoutes = require('./routes/feedback-pg');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/super-admin'); // Phase 3: Super Admin Panel
const storeAdminRoutes = require('./routes/store-admin'); // Phase 4: Store Admin Panel
const awardsRoutes = require('./routes/awards');
const expensesRoutes = require('./routes/expenses');
const storeRecoveryRoutes = require('./routes/storeRecovery');
const pickupsRoutes = require('./routes/pickups');
const waitwhileRoutes = require('./routes/waitwhile');
const manhattanRoutes = require('./routes/manhattan');
const rfidRoutes = require('./routes/rfid');
const clientLogsRoutes = require('./routes/clientLogs');
const printersRoutes = require('./routes/printers');
const mockApiRoutes = require('./routes/mock-api');
const webhookRoutes = require('./routes/webhooks'); // Import webhook routes
const aiAssignmentRoutes = require('./routes/ai-assignment'); // Import AI assignment routes
const systemHealthRoutes = require('./routes/system-health'); // Import system health routes

// SECURITY PATCH: CRITICAL-01 - Use Redis-based auth middleware
const authMiddleware = require('./middleware/auth-redis');
const dal = require('./utils/dal');
const { query: pgQuery } = require('./utils/dal/pg');
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

// SECURITY PATCH: CRITICAL-01 - Add Redis session middleware
app.use(getSessionMiddleware());

// --- Simple health check for network detection (NO AUTH) ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Webhook Endpoint (NO AUTH) ---
// This must come *before* the general auth middleware
app.use('/api/webhooks', webhookRoutes);

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

  // Allow Vite dev server origins for development
  const allowedDevOrigins = [
    'localhost:5174',
    '127.0.0.1:5174',
    '100.84.243.127:5174',
    '10.201.48.17:5174'
  ];

  // Prefer Origin when present.
  if (origin) {
    const originHost = getHostFromUrl(origin);
    if (!originHost) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
    // Allow if origin matches expected host OR is an allowed dev origin
    if (originHost !== expectedHost && !allowedDevOrigins.includes(originHost)) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
    return next();
  }

  // Fall back to Referer if Origin is absent.
  if (referer) {
    const refererHost = getHostFromUrl(referer);
    if (!refererHost) {
      return res.status(403).json({ error: 'Invalid referer' });
    }
    // Allow if referer matches expected host OR is an allowed dev origin
    if (refererHost !== expectedHost && !allowedDevOrigins.includes(refererHost)) {
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
app.use('/api/super-admin', authMiddleware, superAdminRoutes); // Phase 3: Super Admin Panel (auth check in routes)
app.use('/api/store-admin', authMiddleware, storeAdminRoutes); // Phase 4: Store Admin Panel
app.use('/api/awards', authMiddleware, awardsRoutes);
app.use('/api/expenses', authMiddleware, expensesRoutes);
app.use('/api/store-recovery', authMiddleware, storeRecoveryRoutes);
app.use('/api/pickups', authMiddleware, pickupsRoutes);
app.use('/api/waitwhile', authMiddleware, waitwhileRoutes);
app.use('/api/manhattan', authMiddleware, manhattanRoutes);
app.use('/api/rfid', authMiddleware, rfidRoutes);
app.use('/api/logs', clientLogsRoutes);
app.use('/api/system-health', authMiddleware, adminOnly, systemHealthRoutes);
app.use('/api/printers', authMiddleware, printersRoutes);
app.use('/api/ai', authMiddleware, aiAssignmentRoutes); // AI task assignment routes
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
  // Note: ADMIN role deprecated - all admins should use MANAGEMENT role with is_admin flag
  if (role === 'MANAGEMENT') return res.redirect('/gameplan-management');
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

app.get('/daily-scan-performance', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'daily-scan-performance.html'));
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
  const client = { id: "789272869624-v4ovr0dkttan1dj3skjibkik8n61ms7d.apps.googleusercontent.com", res };
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

// Start unified Gmail processor
const UNIFIED_GMAIL_CRON = process.env.UNIFIED_GMAIL_CRON || '*/30 * * * *'; // Every 30 minutes
try {
  const { getUnifiedProcessor } = require('./utils/unified-gmail-processor');
  const unifiedProcessor = getUnifiedProcessor();
  unifiedProcessor.start(UNIFIED_GMAIL_CRON);
  console.log(`Unified Gmail processor active (cron=${UNIFIED_GMAIL_CRON})`);
} catch (e) {
  console.error('Failed to start unified Gmail processor:', e.message);
}

// Start report email scheduler
const REPORT_EMAIL_CRON = process.env.REPORT_EMAIL_CRON || '0 */4 * * *'; // Every 4 hours
try {
  const cron = require('node-cron');
  cron.schedule(REPORT_EMAIL_CRON, async () => {
    try {
      const { sendDailyReport } = require('./scripts/send-daily-report');
      await sendDailyReport();
      console.log('Scheduled report email sent');
    } catch (e) {
      console.error('Failed to send scheduled report:', e.message);
    }
  });
  console.log(`Report email scheduler active (cron=${REPORT_EMAIL_CRON})`);
} catch (e) {
  console.error('Failed to start report scheduler:', e.message);
}

// Use HTTP server.
const server = http.createServer(app);


server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🖥️  STOCKROOM DASHBOARD SERVER                          ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Local:   http://localhost:${PORT}                        ║`);
  console.log(`║  Network: http://<server-ip>:${PORT}                      ║`);
  console.log(`║  Press Ctrl+C to stop                                     ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

  // Start System Health Monitoring Service
  try {
    const monitoringService = require('./utils/monitoring');
    await monitoringService.start();
  } catch (error) {
    console.error('⚠️  Failed to start monitoring service:', error.message);
  }
});

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
