const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUNCH_LOG_FILE = path.join(DATA_DIR, 'lost-punch-log.json');

function readPunches() {
  try {
    if (fs.existsSync(PUNCH_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(PUNCH_LOG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading punches:', error);
  }
  return [];
}

function writePunches(punches) {
  fs.writeFileSync(PUNCH_LOG_FILE, JSON.stringify(punches, null, 2));
}

// GET /api/lost-punch - Get all punches
router.get('/', (req, res) => {
  const punches = readPunches();
  res.json(punches);
});

// POST /api/lost-punch - Submit new punch
router.post('/', (req, res) => {
  const {
    employeeName,
    employeeId,
    missedDate,
    reason,
    managerOnDuty,
    clockInTime,
    lunchOutTime,
    lunchInTime,
    clockOutTime,
    missedTime, // legacy
    punchType // legacy
  } = req.body;

  if (!employeeName || !employeeId || !missedDate || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalized = {
    clockInTime: clockInTime || '',
    lunchOutTime: lunchOutTime || '',
    lunchInTime: lunchInTime || '',
    clockOutTime: clockOutTime || ''
  };

  // Backward compatibility: map legacy fields if new fields not provided
  if (!normalized.clockInTime && !normalized.lunchOutTime && !normalized.lunchInTime && !normalized.clockOutTime) {
    if (missedTime && punchType) {
      if (punchType === 'clock-in') normalized.clockInTime = missedTime;
      if (punchType === 'clock-out') normalized.clockOutTime = missedTime;
      if (punchType === 'meal-start') normalized.lunchOutTime = missedTime;
      if (punchType === 'meal-end') normalized.lunchInTime = missedTime;
    }
  }

  const hasAtLeastOneTime = !!(
    normalized.clockInTime ||
    normalized.lunchOutTime ||
    normalized.lunchInTime ||
    normalized.clockOutTime ||
    missedTime
  );
  if (!hasAtLeastOneTime) {
    return res.status(400).json({ error: 'Please provide at least one time' });
  }

  const punches = readPunches();
  const newPunch = {
    id: `punch-${Date.now()}`,
    employeeName,
    employeeId,
    missedDate,
    clockInTime: normalized.clockInTime,
    lunchOutTime: normalized.lunchOutTime,
    lunchInTime: normalized.lunchInTime,
    clockOutTime: normalized.clockOutTime,
    missedTime: missedTime || '',
    punchType: punchType || '',
    managerOnDuty,
    reason,
    status: 'pending',
    submittedAt: new Date().toISOString()
  };

  punches.push(newPunch);
  writePunches(punches);

  res.json({ success: true, punch: newPunch });
});

// PATCH /api/lost-punch/:id - Update punch status
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { status, reviewedBy } = req.body;

  const punches = readPunches();
  const punchIndex = punches.findIndex(p => p.id === id);

  if (punchIndex === -1) {
    return res.status(404).json({ error: 'Punch not found' });
  }

  punches[punchIndex].status = status;
  punches[punchIndex].reviewedBy = reviewedBy;
  punches[punchIndex].reviewedAt = new Date().toISOString();

  writePunches(punches);

  res.json({ success: true, punch: punches[punchIndex] });
});

// POST /api/lost-punch/batch - Batch update punch statuses
router.post('/batch', (req, res) => {
  const { ids, status, reviewedBy } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No punch IDs provided' });
  }

  const punches = readPunches();
  const reviewedAt = new Date().toISOString();
  let updated = 0;

  ids.forEach(id => {
    const punchIndex = punches.findIndex(p => p.id === id);
    if (punchIndex !== -1) {
      punches[punchIndex].status = status;
      punches[punchIndex].reviewedBy = reviewedBy;
      punches[punchIndex].reviewedAt = reviewedAt;
      updated++;
    }
  });

  writePunches(punches);

  res.json({ success: true, updated });
});

// GET /api/lost-punch/my-entries - Get logged-in user's entries (legacy support)
router.get('/my-entries', (req, res) => {
  const userId = req.cookies?.user_id;
  if (!userId) {
    return res.json({ success: true, entries: [] });
  }

  const punches = readPunches();
  const userEntries = punches.filter(entry => entry.employeeId === userId);

  res.json({ success: true, entries: userEntries });
});

// POST /api/lost-punch/submit - Submit punch (legacy support)
router.post('/submit', (req, res) => {
  const {
    employeeId,
    employeeName,
    missedDate,
    reason,
    manager,
    clockInTime,
    lunchOutTime,
    lunchInTime,
    clockOutTime,
    missedTime,
    punchType
  } = req.body;

  if (!employeeId || !employeeName || !missedDate || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalized = {
    clockInTime: clockInTime || '',
    lunchOutTime: lunchOutTime || '',
    lunchInTime: lunchInTime || '',
    clockOutTime: clockOutTime || ''
  };

  if (!normalized.clockInTime && !normalized.lunchOutTime && !normalized.lunchInTime && !normalized.clockOutTime) {
    if (missedTime && punchType) {
      if (punchType === 'clock-in') normalized.clockInTime = missedTime;
      if (punchType === 'clock-out') normalized.clockOutTime = missedTime;
      if (punchType === 'meal-start') normalized.lunchOutTime = missedTime;
      if (punchType === 'meal-end') normalized.lunchInTime = missedTime;
    }
  }

  const hasAtLeastOneTime = !!(
    normalized.clockInTime ||
    normalized.lunchOutTime ||
    normalized.lunchInTime ||
    normalized.clockOutTime ||
    missedTime
  );
  if (!hasAtLeastOneTime) {
    return res.status(400).json({ error: 'Please provide at least one time' });
  }

  const punches = readPunches();
  const entry = {
    id: `punch-${Date.now()}`,
    employeeId,
    employeeName,
    missedDate,
    clockInTime: normalized.clockInTime,
    lunchOutTime: normalized.lunchOutTime,
    lunchInTime: normalized.lunchInTime,
    clockOutTime: normalized.clockOutTime,
    missedTime: missedTime || '',
    punchType: punchType || '',
    reason,
    managerOnDuty: manager || '',
    status: 'pending',
    submittedAt: new Date().toISOString()
  };

  punches.push(entry);
  writePunches(punches);

  res.json({ success: true, message: 'Lost punch submitted successfully', entry });
});

module.exports = router;
