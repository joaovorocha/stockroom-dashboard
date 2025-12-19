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

  const data = readJsonFile(TIMEOFF_FILE, { entries: [] });
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

  const data = readJsonFile(TIMEOFF_FILE, { entries: [] });

  const newEntry = {
    id: `entry-${Date.now()}`,
    employeeId: user.employeeId,
    employeeName: user.name,
    startDate,
    endDate,
    reason: reason || 'vacation',
    notes: notes || ''
  };

  data.entries.push(newEntry);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true, entry: newEntry });
});

// DELETE /api/timeoff/:id - Cancel own entry
router.delete('/:id', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const data = readJsonFile(TIMEOFF_FILE, { entries: [] });

  const entryIndex = data.entries.findIndex(r => r.id === id && r.employeeId === user.employeeId);
  if (entryIndex === -1) {
    return res.status(404).json({ error: 'Entry not found or not yours' });
  }

  data.entries.splice(entryIndex, 1);
  writeJsonFile(TIMEOFF_FILE, data);

  res.json({ success: true });
});

module.exports = router;
