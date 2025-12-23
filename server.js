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
const authMiddleware = require('./middleware/auth');
const { getUPSScheduler } = require('./utils/ups-scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

function managerOnly(req, res, next) {
  const user = req.user;
  if (user?.isManager || user?.isAdmin || user?.role === 'MANAGEMENT') return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Manager access required' });
  return res.status(403).send('Manager access required');
}

function gameplanEditorOnly(req, res, next) {
  const user = req.user;
  if (user?.canEditGameplan || user?.isManager || user?.isAdmin || user?.role === 'MANAGEMENT') return next();
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

// Basic security headers (keeps inline scripts working; CSP intentionally not set here)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
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

// Require auth for direct HTML file access (prevents bypassing app routes via express.static)
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) return authMiddleware(req, res, next);
  return next();
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

// Serve feedback uploads (auth required)
app.use('/feedback-uploads', authMiddleware, express.static(path.join(__dirname, 'data/feedback-uploads')));

// Serve user uploaded avatars (auth required)
app.use('/user-uploads', authMiddleware, express.static(path.join(__dirname, 'data/user-uploads')));

// Redirect old pages to new ones
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login-v2.html'));
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
  res.redirect('/login');
});

// Serve HTML pages
app.get('/dashboard', authMiddleware, (req, res) => {
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

app.get('/app', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Extra safety: accept common unicode dash variants in the Operations route.
app.get(/^\/operations[‐‑‒–—−﹣－]metrics$/, authMiddleware, (req, res) => {
  return res.redirect('/operations-metrics');
});

app.get('/operations-metrics', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operations-metrics.html'));
});

app.get('/shipments-processing', authMiddleware, (req, res) => {
  res.redirect('/shipments');
});

app.get('/ups-extension', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ups-extension.html'));
});

// CampusShip import page removed (shipments are captured from UPS emails now).

app.get('/scanner', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get('/radio', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'radio.html'));
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

app.get('/home', authMiddleware, (req, res) => {
  const suffix = req.url && req.url !== '/home' ? req.url.slice('/home'.length) : '';
  res.redirect(`/dashboard${suffix}`);
});

app.get('/', (req, res) => {
  // If already authenticated, go home; otherwise go to login
  const userSession = req.cookies.userSession;
  if (userSession) return res.redirect('/app');
  res.redirect('/login');
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
