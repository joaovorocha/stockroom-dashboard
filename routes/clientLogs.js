/**
 * Client-side error logging endpoints
 * Receives JavaScript errors from the browser and logs them server-side
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const CLIENT_ERROR_LOG_FILE = path.join(__dirname, '../logs/client-errors.log');

// Ensure logs directory exists
async function ensureLogsDir() {
  const logsDir = path.dirname(CLIENT_ERROR_LOG_FILE);
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (e) {
    // Directory already exists
  }
}

// Format error entry for log file
function formatLogEntry(error, req) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: error.type || 'error',
    message: error.message,
    stack: error.stack,
    url: error.url,
    pathname: error.pathname,
    filename: error.filename,
    lineno: error.lineno,
    colno: error.colno,
    userAgent: error.userAgent || req.get('user-agent'),
    user: req.user ? {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    } : null,
    ip: req.ip
  };
  
  return JSON.stringify(entry);
}

// POST /api/logs/client-errors - Log client-side errors
router.post('/client-errors', async (req, res) => {
  try {
    await ensureLogsDir();
    
    const { errors } = req.body;
    
    if (!Array.isArray(errors) || errors.length === 0) {
      return res.status(400).json({ error: 'Invalid errors array' });
    }
    
    // Format and write errors to log file
    const logEntries = errors.map(error => formatLogEntry(error, req)).join('\n') + '\n';
    await fs.appendFile(CLIENT_ERROR_LOG_FILE, logEntries);
    
    // Also log to console for immediate visibility
    console.error(`[CLIENT ERROR] Logged ${errors.length} error(s) from ${req.user?.name || 'anonymous'}`);
    errors.forEach(error => {
      console.error(`  - ${error.type}: ${error.message} (${error.pathname})`);
    });
    
    res.json({ success: true, logged: errors.length });
  } catch (err) {
    console.error('[CLIENT ERROR LOGGER] Failed to log errors:', err);
    res.status(500).json({ error: 'Failed to log errors' });
  }
});

// GET /api/logs/client-errors - Get recent client errors (admin only)
router.get('/client-errors', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const limit = parseInt(req.query.limit) || 100;
    
    // Read log file
    const logContent = await fs.readFile(CLIENT_ERROR_LOG_FILE, 'utf-8');
    const lines = logContent.trim().split('\n').filter(Boolean);
    
    // Parse recent errors
    const errors = lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // Most recent first
    
    res.json({ errors });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ errors: [] });
    }
    console.error('[CLIENT ERROR LOGGER] Failed to read error log:', err);
    res.status(500).json({ error: 'Failed to read error log' });
  }
});

module.exports = router;
