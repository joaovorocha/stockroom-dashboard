require("dotenv").config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const shipmentsRoutes = require('./routes/shipments');
const closingDutiesRoutes = require('./routes/closingDuties');
const lostPunchRoutes = require('./routes/lostPunch');
const gameplanRoutes = require('./routes/gameplan');
const timeoffRoutes = require('./routes/timeoff');
const feedbackRoutes = require('./routes/feedback');
const authMiddleware = require('./middleware/auth');
const { getUPSScheduler } = require('./utils/ups-scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve closing duties photos
app.use('/closing-duties', express.static(path.join(__dirname, 'data/closing-duties')));

// Routes - Order matters! More specific routes before generic ones
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentsRoutes); // No auth required for shipments
app.use('/api/closing-duties', closingDutiesRoutes); // No auth required
app.use('/api/lost-punch', lostPunchRoutes); // No auth required for submission
app.use('/api/gameplan', gameplanRoutes); // Gameplan API - No auth required
app.use('/api/timeoff', timeoffRoutes); // Time off API
app.use('/api/feedback', feedbackRoutes); // Feedback API
app.use('/api', authMiddleware, apiRoutes); // Generic API routes with auth

// Serve feedback uploads
app.use('/feedback-uploads', express.static(path.join(__dirname, 'data/feedback-uploads')));

// Redirect old pages to new ones
app.get('/login', (req, res) => {
  res.redirect('/login-v2');
});

app.get('/gameplan', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/gameplan-v2', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/index.html', (req, res) => {
  res.redirect('/login-v2');
});

// Serve HTML pages
app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/gameplan-edit', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gameplan-edit.html'));
});

app.get('/ops-dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops-dashboard.html'));
});

app.get('/time-off', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'time-off.html'));
});

app.get('/login-v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login-v2.html'));
});

app.get('/shipments', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shipments.html'));
});

app.get('/shipments-processing', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shipments-processing.html'));
});

app.get('/scanner', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get('/closing-duties', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'closing-duties.html'));
});

app.get('/lost-punch', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lost-punch.html'));
});

app.get('/admin', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/feedback', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

app.get('/', (req, res) => {
  res.redirect('/login-v2');
});

// ===== Server-Sent Events (SSE) for Real-Time Updates =====
let sseClients = [];

// SSE endpoint for real-time updates
app.get('/api/sse/updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
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

// Start UPS email import scheduler (every 10 minutes by default)
const UPS_IMPORT_CRON = process.env.UPS_EMAIL_IMPORT_CRON || '*/10 * * * *';
const UPS_IMPORT_DAYS = parseInt(process.env.UPS_EMAIL_IMPORT_DAYS || '2', 10);
const UPS_DELETE_AFTER_IMPORT = process.env.UPS_EMAIL_DELETE_AFTER_IMPORT !== 'false';
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
