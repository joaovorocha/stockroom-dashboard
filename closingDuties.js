const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const uploadPath = path.join(__dirname, '../data/closing-duties', date);

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/closing-duties/employees - Get all employees
router.get('/employees', (req, res) => {
  try {
    const employeesPath = path.join(__dirname, '../data/employees.json');
    const employeesData = fs.readFileSync(employeesPath, 'utf8');
    const employees = JSON.parse(employeesData);

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
    const logPath = path.join(__dirname, '../data/closing-duties-log.json');
    const logData = fs.readFileSync(logPath, 'utf8');
    const submissions = JSON.parse(logData);

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
    const logPath = path.join(__dirname, '../data/closing-duties-log.json');
    const logData = fs.readFileSync(logPath, 'utf8');
    const submissions = JSON.parse(logData);

    const dateSubmissions = submissions.filter(sub => sub.date === date);

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
router.post('/submit', upload.array('photos', 10), (req, res) => {
  try {
    const { userId, userName, notes, date, section } = req.body;
    const submissionDate = date || new Date().toISOString().split('T')[0];

    if (!userId || !userName) {
      return res.status(400).json({ error: 'User ID and name are required' });
    }

    if (!section) {
      return res.status(400).json({ error: 'Closing duty section is required' });
    }

    // Get uploaded file paths
    const photos = req.files.map(file => ({
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
    const logPath = path.join(__dirname, '../data/closing-duties-log.json');
    let submissions = [];
    try {
      const logData = fs.readFileSync(logPath, 'utf8');
      submissions = JSON.parse(logData);
    } catch (err) {
      // File doesn't exist or is empty, start with empty array
      submissions = [];
    }

    // Add new submission
    submissions.push(submission);

    // Write back to log
    fs.writeFileSync(logPath, JSON.stringify(submissions, null, 2));

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

module.exports = router;
