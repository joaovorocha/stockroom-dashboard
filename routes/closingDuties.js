const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dal = require('../utils/dal');

const CLOSING_DUTIES_DIR = dal.paths.closingDutiesDir;
const CLOSING_DUTIES_LOG_FILE = dal.paths.closingDutiesLogFile;
const EMPLOYEES_FILE = dal.paths.employeesFile;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const uploadPath = path.join(CLOSING_DUTIES_DIR, date);
    dal.ensureDir(uploadPath);

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const userId = req.body.userId || 'unknown';
    const ext = path.extname(file.originalname);
    cb(null, `${userId}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  // iPhone images can be large; keep this permissive but bounded.
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (req, file, cb) => {
    // iPhone photos can be HEIC/HEIF; allow those alongside common web image types.
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
    const extOk = allowedTypes.test(path.extname(file.originalname || '').toLowerCase());
    const mimeOk = allowedTypes.test((file.mimetype || '').toLowerCase());

    // Some mobile browsers may send a generic mimetype (ex: application/octet-stream).
    // Accept if either the extension or mimetype indicates an allowed image.
    if (extOk || mimeOk) {
      return cb(null, true);
    } else {
      cb(new Error(`Only image files are allowed (jpg, png, gif, webp, heic). Received: ${file.mimetype || 'unknown'} (${file.originalname || 'unknown'})`));
    }
  }
});

// GET /api/closing-duties/employees - Get all employees
router.get('/employees', (req, res) => {
  try {
    const employees = dal.readJson(EMPLOYEES_FILE, {});

    return res.json({
      success: true,
      employees: employees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/closing-duties - Get all closing duties submissions
router.get('/', (req, res) => {
  try {
    const submissions = dal.readJson(CLOSING_DUTIES_LOG_FILE, []);

    return res.json({
      success: true,
      submissions: submissions.reverse() // Most recent first
    });
  } catch (error) {
    console.error('Error fetching closing duties:', error);
    return res.status(500).json({ error: 'Failed to fetch closing duties' });
  }
});

// GET /api/closing-duties/:date - Get submissions for a specific date
router.get('/:date', (req, res) => {
  try {
    const { date } = req.params;
    const submissions = dal.readJson(CLOSING_DUTIES_LOG_FILE, []);

    const normalized = dateSubmissionsNormalized(submissions);
    const dateSubmissions = normalized.filter(sub => sub.date === date);

    return res.json({
      success: true,
      date: date,
      submissions: dateSubmissions
    });
  } catch (error) {
    console.error('Error fetching closing duties for date:', error);
    return res.status(500).json({ error: 'Failed to fetch closing duties' });
  }
});

// POST /api/closing-duties/submit - Submit closing duties with photos and section
router.post('/submit', (req, res) => {
  upload.array('photos', 10)(req, res, (err) => {
    if (err) {
      const message = err?.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }

    try {
      const { userId, userName, notes, date, section } = req.body;
      const submissionDate = date || new Date().toISOString().split('T')[0];

      if (!userId || !userName) {
        return res.status(400).json({ error: 'User ID and name are required' });
      }

      if (!section) {
        return res.status(400).json({ error: 'Closing duty section is required' });
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return res.status(400).json({ error: 'At least 1 photo is required' });
      }

      // Get uploaded file paths
      const photos = files.map(file => ({
        filename: file.filename,
        path: `/closing-duties/${submissionDate}/${file.filename}`,
        size: file.size,
        uploadedAt: new Date().toISOString()
      }));

      // Create submission record
      const submission = {
        id: `${userId}_${Date.now()}`,
        userId: userId,
        userName: userName,
        date: submissionDate,
        submittedAt: new Date().toISOString(),
        photos: photos,
        notes: notes || '',
        section,
        photoCount: photos.length
      };

      // Read existing log
      let submissions = [];
      try {
        submissions = dal.readJson(CLOSING_DUTIES_LOG_FILE, []);
      } catch (e) {
        submissions = [];
      }

      // Add new submission (allow duplicates per user/section)
      submissions.push(submission);

      // Write back to log
      dal.writeJsonAtomic(CLOSING_DUTIES_LOG_FILE, submissions, { pretty: true });

      return res.json({
        success: true,
        message: 'Closing duties submitted successfully',
        submission: submission
      });
    } catch (error) {
      console.error('Error submitting closing duties:', error);
      return res.status(500).json({ error: 'Failed to submit closing duties' });
    }
  });
});

// Normalize submissions to latest data shape
function dateSubmissionsNormalized(submissions) {
  if (!Array.isArray(submissions)) return [];
  return submissions.map(sub => ({
    ...sub,
    userName: sub.userName || sub.employeeName || 'Unknown',
    photos: (sub.photos || []).map(p => {
      if (typeof p === 'string') {
        return { path: p };
      }
      return p;
    })
  }));
}

module.exports = router;
