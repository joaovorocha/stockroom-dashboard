const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { compressUploadedImages } = require('../utils/image-compressor');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'feedback-uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `feedback-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for iPhone photos
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

function readFeedback() {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading feedback:', error);
  }
  return [];
}

function writeFeedback(feedback) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
}

// GET /api/feedback - Get all feedback
router.get('/', (req, res) => {
  const feedback = readFeedback();
  res.json(feedback);
});

// POST /api/feedback - Submit new feedback
router.post('/', upload.array('images', 5), compressUploadedImages({ maxWidth: 1920, maxHeight: 1920, quality: 80 }), (req, res) => {
  try {
    const { text, employeeName, employeeId, category } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Feedback text is required' });
    }

    const feedback = readFeedback();
    const newFeedback = {
      id: `feedback-${Date.now()}`,
      text,
      employeeName: employeeName || 'Anonymous',
      employeeId: employeeId || '',
      category: category || 'general',
      images: req.files ? req.files.map(f => `/feedback-uploads/${f.filename}`) : [],
      status: 'new',
      submittedAt: new Date().toISOString()
    };

    feedback.push(newFeedback);
    writeFeedback(feedback);

    res.json({ success: true, feedback: newFeedback });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// PATCH /api/feedback/:id - Update feedback status (managers only)
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { status, response, respondedBy } = req.body;

  const feedback = readFeedback();
  const feedbackIndex = feedback.findIndex(f => f.id === id);

  if (feedbackIndex === -1) {
    return res.status(404).json({ error: 'Feedback not found' });
  }

  if (status) feedback[feedbackIndex].status = status;
  if (response) {
    feedback[feedbackIndex].response = response;
    feedback[feedbackIndex].respondedBy = respondedBy;
    feedback[feedbackIndex].respondedAt = new Date().toISOString();
  }

  writeFeedback(feedback);

  res.json({ success: true, feedback: feedback[feedbackIndex] });
});

// DELETE /api/feedback/:id - Delete feedback (managers only)
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const feedback = readFeedback();
  const feedbackIndex = feedback.findIndex(f => f.id === id);

  if (feedbackIndex === -1) {
    return res.status(404).json({ error: 'Feedback not found' });
  }

  // Delete associated images
  const item = feedback[feedbackIndex];
  if (item.images) {
    item.images.forEach(img => {
      const imgPath = path.join(__dirname, '..', 'data', img);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    });
  }

  feedback.splice(feedbackIndex, 1);
  writeFeedback(feedback);

  res.json({ success: true });
});

module.exports = router;
