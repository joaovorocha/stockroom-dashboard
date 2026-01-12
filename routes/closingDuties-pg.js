const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://suit:suit2024@localhost:5432/stockroom_dashboard'
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/uploads/closing-duties');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/closing-duties - Get all closing duty submissions
router.get('/api/closing-duties', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cd.*,
        u.name as user_name,
        u.employee_id as user_employee_id,
        COUNT(cdp.id) as photo_count
      FROM closing_duties cd
      LEFT JOIN users u ON cd.user_id = u.id
      LEFT JOIN closing_duty_photos cdp ON cd.id = cdp.duty_id
      GROUP BY cd.id, u.name, u.employee_id
      ORDER BY cd.date DESC, cd.submitted_at DESC
    `);

    res.json({
      success: true,
      submissions: result.rows
    });
  } catch (error) {
    console.error('Error fetching closing duties:', error);
    res.status(500).json({ error: 'Failed to fetch closing duties' });
  }
});

// GET /api/closing-duties/:date - Get submissions for a specific date
router.get('/api/closing-duties/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    const result = await pool.query(`
      SELECT 
        cd.*,
        u.name as user_name,
        u.employee_id as user_employee_id,
        COUNT(cdp.id) as photo_count
      FROM closing_duties cd
      LEFT JOIN users u ON cd.user_id = u.id
      LEFT JOIN closing_duty_photos cdp ON cd.id = cdp.duty_id
      WHERE cd.date = $1
      GROUP BY cd.id, u.name, u.employee_id
      ORDER BY cd.submitted_at DESC
    `, [date]);

    res.json({
      success: true,
      date: date,
      submissions: result.rows
    });
  } catch (error) {
    console.error('Error fetching closing duties for date:', error);
    res.status(500).json({ error: 'Failed to fetch closing duties' });
  }
});

// GET /api/closing-duties/:id - Get single closing duty submission with photos
router.get('/api/closing-duties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const dutyResult = await pool.query(`
      SELECT 
        cd.*,
        u.name as user_name,
        u.employee_id as user_employee_id
      FROM closing_duties cd
      LEFT JOIN users u ON cd.user_id = u.id
      WHERE cd.id = $1
    `, [id]);

    if (dutyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Closing duty not found' });
    }

    const photosResult = await pool.query(`
      SELECT id, filename, path, size, uploaded_at
      FROM closing_duty_photos
      WHERE duty_id = $1
      ORDER BY uploaded_at ASC
    `, [id]);

    const duty = dutyResult.rows[0];
    duty.photos = photosResult.rows;

    res.json(duty);
  } catch (error) {
    console.error('Error fetching closing duty:', error);
    res.status(500).json({ error: 'Failed to fetch closing duty' });
  }
});

// POST /api/closing-duties - Create new closing duty submission
router.post('/api/closing-duties', upload.array('photos', 10), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { userName, date, notes } = req.body;

    // Find user by name
    const userResult = await client.query(
      'SELECT id, employee_id FROM users WHERE name = $1',
      [userName]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const id = `closing-${Date.now()}`;

    // Insert closing duty
    const dutyResult = await client.query(`
      INSERT INTO closing_duties (
        id, user_id, user_name, date, notes, photo_count, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [id, userId, userName, date, notes, req.files ? req.files.length : 0]);

    // Insert photos if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(`
          INSERT INTO closing_duty_photos (duty_id, filename, path, size)
          VALUES ($1, $2, $3, $4)
        `, [id, file.filename, file.path, file.size]);
      }
    }

    // Log audit trail
    await client.query(`
      INSERT INTO user_audit_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `, [userId, 'CLOSING_DUTY_CREATED', JSON.stringify({ id, date, photoCount: req.files?.length || 0 })]);

    await client.query('COMMIT');

    // Fetch complete record with photos
    const photosResult = await client.query(
      'SELECT * FROM closing_duty_photos WHERE duty_id = $1',
      [id]
    );

    const duty = dutyResult.rows[0];
    duty.photos = photosResult.rows;

    res.json(duty);
  } catch (error) {
    await client.query('ROLLBACK');
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
    }

    console.error('Error creating closing duty:', error);
    res.status(500).json({ error: 'Failed to create closing duty' });
  } finally {
    client.release();
  }
});

// PUT /api/closing-duties/:id - Update closing duty submission
router.put('/api/closing-duties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(`
      UPDATE closing_duties
      SET notes = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Closing duty not found' });
    }

    // Log audit trail
    await pool.query(`
      INSERT INTO user_audit_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `, [result.rows[0].user_id, 'CLOSING_DUTY_UPDATED', JSON.stringify({ id })]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating closing duty:', error);
    res.status(500).json({ error: 'Failed to update closing duty' });
  }
});

// DELETE /api/closing-duties/:id - Delete closing duty submission
router.delete('/api/closing-duties/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Get photos to delete files
    const photosResult = await client.query(
      'SELECT path FROM closing_duty_photos WHERE duty_id = $1',
      [id]
    );

    // Delete from database
    const result = await client.query(
      'DELETE FROM closing_duties WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Closing duty not found' });
    }

    // Log audit trail
    await client.query(`
      INSERT INTO user_audit_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `, [result.rows[0].user_id, 'CLOSING_DUTY_DELETED', JSON.stringify({ id })]);

    await client.query('COMMIT');

    // Delete photo files from disk
    for (const photo of photosResult.rows) {
      try {
        await fs.unlink(photo.path);
      } catch (unlinkError) {
        console.error('Error deleting photo file:', unlinkError);
      }
    }

    res.json({ message: 'Closing duty deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting closing duty:', error);
    res.status(500).json({ error: 'Failed to delete closing duty' });
  } finally {
    client.release();
  }
});

// POST /api/closing-duties/:id/photos - Add photos to existing closing duty
router.post('/api/closing-duties/:id/photos', upload.array('photos', 10), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Verify duty exists
    const dutyResult = await client.query(
      'SELECT * FROM closing_duties WHERE id = $1',
      [id]
    );

    if (dutyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Closing duty not found' });
    }

    // Insert photos
    const photos = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const photoResult = await client.query(`
          INSERT INTO closing_duty_photos (duty_id, filename, path, size)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [id, file.filename, file.path, file.size]);
        photos.push(photoResult.rows[0]);
      }

      // Update photo count
      await client.query(`
        UPDATE closing_duties
        SET photo_count = photo_count + $1, updated_at = NOW()
        WHERE id = $2
      `, [req.files.length, id]);
    }

    await client.query('COMMIT');
    res.json({ photos });
  } catch (error) {
    await client.query('ROLLBACK');
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }
    }

    console.error('Error adding photos:', error);
    res.status(500).json({ error: 'Failed to add photos' });
  } finally {
    client.release();
  }
});

// DELETE /api/closing-duties/:dutyId/photos/:photoId - Delete a photo
router.delete('/api/closing-duties/:dutyId/photos/:photoId', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { dutyId, photoId } = req.params;

    // Get photo path
    const photoResult = await client.query(
      'SELECT path FROM closing_duty_photos WHERE id = $1 AND duty_id = $2',
      [photoId, dutyId]
    );

    if (photoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Delete from database
    await client.query(
      'DELETE FROM closing_duty_photos WHERE id = $1',
      [photoId]
    );

    // Update photo count
    await client.query(`
      UPDATE closing_duties
      SET photo_count = photo_count - 1, updated_at = NOW()
      WHERE id = $1
    `, [dutyId]);

    await client.query('COMMIT');

    // Delete file from disk
    try {
      await fs.unlink(photoResult.rows[0].path);
    } catch (unlinkError) {
      console.error('Error deleting photo file:', unlinkError);
    }

    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  } finally {
    client.release();
  }
});

module.exports = router;
