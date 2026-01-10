const express = require('express');
const router = express.Router();
const dal = require('../utils/dal');

const PUNCH_LOG_FILE = dal.paths.lostPunchLogFile;

function canManage(user) {
  return !!(user?.isAdmin || user?.isManager || user?.canManageLostPunch);
}

function readPunches() {
  try {
    const parsed = dal.readJson(PUNCH_LOG_FILE, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading punches:', error);
  }
  return [];
}

function writePunches(punches) {
  dal.writeJsonAtomic(PUNCH_LOG_FILE, punches, { pretty: true });
}

// GET /api/lost-punch - Get all punches
router.get('/', (req, res) => {
  const punches = readPunches();
  const user = req.user || null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (canManage(user)) return res.json(punches);
  const mine = punches.filter(p => (p.employeeId || '').toString().trim() === (user.employeeId || '').toString().trim());
  return res.json(mine);
});

// POST /api/lost-punch - Submit new punch
router.post('/', (req, res) => {
  const user = req.user || null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const {
    missedDate,
    reason,
    managerOnDuty,
    clockInTime,
    lunchOutTime,
    lunchInTime,
    clockOutTime,
    missedTime, // LEGACY SUPPORT: legacy field
    punchType // LEGACY SUPPORT: legacy field
  } = req.body;

  const employeeName = user.name || '';
  const employeeId = user.employeeId || '';

  if (!employeeName || !employeeId || !missedDate || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalized = {
    clockInTime: clockInTime || '',
    lunchOutTime: lunchOutTime || '',
    lunchInTime: lunchInTime || '',
    clockOutTime: clockOutTime || ''
  };

  // LEGACY SUPPORT: Backward compatibility - map legacy fields if new fields not provided
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
	    employeeUserId: user.userId || '',
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
  const user = req.user || null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!canManage(user)) return res.status(403).json({ error: 'Manager access required' });

  const { id } = req.params;
  const { status, reviewedBy } = req.body || {};

  const punches = readPunches();
  const punchIndex = punches.findIndex(p => p.id === id);

  if (punchIndex === -1) {
    return res.status(404).json({ error: 'Punch not found' });
  }

	  if (status) {
	    const nextStatus = status.toString().toLowerCase();
	    if (!['pending', 'approved', 'denied'].includes(nextStatus)) {
	      return res.status(400).json({ error: 'Invalid status' });
	    }
	    punches[punchIndex].status = nextStatus;
	    punches[punchIndex].reviewedBy = reviewedBy || user.name || '';
	    punches[punchIndex].reviewedAt = new Date().toISOString();
	  }

  writePunches(punches);

  res.json({ success: true, punch: punches[punchIndex] });
});

// POST /api/lost-punch/batch - Batch update punch statuses
router.post('/batch', (req, res) => {
  const user = req.user || null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!canManage(user)) return res.status(403).json({ error: 'Manager access required' });

  const { ids, status, reviewedBy } = req.body || {};

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No punch IDs provided' });
  }

	  const punches = readPunches();
	  const reviewedAt = new Date().toISOString();
	  let updated = 0;
	  const nextStatus = status ? status.toString().toLowerCase() : null;
	  if (nextStatus && !['pending', 'approved', 'denied'].includes(nextStatus)) {
	    return res.status(400).json({ error: 'Invalid status' });
	  }

	  ids.forEach(id => {
	    const punchIndex = punches.findIndex(p => p.id === id);
	    if (punchIndex !== -1) {
	      if (nextStatus) {
	        punches[punchIndex].status = nextStatus;
	        punches[punchIndex].reviewedBy = reviewedBy || user.name || '';
	        punches[punchIndex].reviewedAt = reviewedAt;
	      }
	      updated++;
	    }
	  });

  writePunches(punches);

  res.json({ success: true, updated });
});

// LEGACY SUPPORT: GET /api/lost-punch/my-entries - legacy support for old clients
router.get('/my-entries', (req, res) => {
  const user = req.user || null;
  if (!user) return res.status(401).json({ success: false, error: 'Not authenticated', entries: [] });

  const punches = readPunches();
  const empId = (user.employeeId || '').toString().trim();
  const userEntries = punches.filter(entry => (entry.employeeId || '').toString().trim() === empId);

  res.json({ success: true, entries: userEntries });
});

// LEGACY SUPPORT: POST /api/lost-punch/submit - legacy support for old clients
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
