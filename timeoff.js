const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TIMEOFF_FILE = path.join(DATA_DIR, 'time-off.json');

function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getUserFromCookie(req) {
  const userSession = req.cookies.userSession;
  if (!userSession) return null;
  try {
    return JSON.parse(userSession);
  } catch (e) {
    return null;
  }
}

// GET /api/timeoff - Get all time off data
router.get('/', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const data = readJsonFile(TIMEOFF_FILE, { requests: [], approved: [], denied: [] });
  res.json(data);
});

// POST /api/timeoff/request - Submit time off request
router.post('/request', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { startDate, endDate, reason, notes } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start and end dates are required' });
  }

  const data = readJsonFile(TIMEOFF_FILE, { requests: [], approved: [], denied: [] });

  const newRequest = {
    id: `req-${Date.now()}`,
    employeeId: user.employeeId,
    employeeName: user.name,
    startDate,
    endDate,
    reason: reason || 'vacation',
    notes: notes || '',
    status: 'pending',
    submittedAt: new Date().toISOString()
  };

  data.requests.push(newRequest);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true, request: newRequest });
});

// POST /api/timeoff/:id/approve - Approve request (managers only)
router.post('/:id/approve', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user || (!user.isManager && !user.isAdmin)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { id } = req.params;
  const data = readJsonFile(TIMEOFF_FILE, { requests: [], approved: [], denied: [] });

  const requestIndex = data.requests.findIndex(r => r.id === id);
  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const request = data.requests.splice(requestIndex, 1)[0];
  request.status = 'approved';
  request.approvedBy = user.name;
  request.approvedAt = new Date().toISOString();

  data.approved.push(request);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true });
});

// POST /api/timeoff/:id/deny - Deny request (managers only)
router.post('/:id/deny', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user || (!user.isManager && !user.isAdmin)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { id } = req.params;
  const data = readJsonFile(TIMEOFF_FILE, { requests: [], approved: [], denied: [] });

  const requestIndex = data.requests.findIndex(r => r.id === id);
  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const request = data.requests.splice(requestIndex, 1)[0];
  request.status = 'denied';
  request.deniedBy = user.name;
  request.deniedAt = new Date().toISOString();

  data.denied.push(request);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true });
});

// DELETE /api/timeoff/:id - Cancel own request
router.delete('/:id', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const data = readJsonFile(TIMEOFF_FILE, { requests: [], approved: [], denied: [] });

  const requestIndex = data.requests.findIndex(r => r.id === id && r.employeeId === user.employeeId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found or not yours' });
  }

  data.requests.splice(requestIndex, 1);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true });
});

module.exports = router;
