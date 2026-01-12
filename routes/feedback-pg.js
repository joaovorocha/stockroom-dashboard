const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://suit:suit2024@localhost:5432/stockroom_dashboard'
});

// GET /api/feedback - Get all feedback entries
router.get('/api/feedback', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.*,
        u.name as user_name,
        u.employee_id as user_employee_id
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.submitted_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// GET /api/feedback/:id - Get single feedback entry
router.get('/api/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        f.*,
        u.name as user_name,
        u.employee_id as user_employee_id
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// POST /api/feedback - Create new feedback entry
router.post('/api/feedback', async (req, res) => {
  try {
    const {
      employeeName,
      employeeId,
      category,
      message,
      isAnonymous
    } = req.body;

    let userId = null;

    // Find user by employee_id if not anonymous
    if (!isAnonymous && employeeId) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE employee_id = $1',
        [employeeId]
      );

      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    }

    const id = `feedback-${Date.now()}`;

    const result = await pool.query(`
      INSERT INTO feedback (
        id, user_id, employee_name, employee_id, category, 
        message, is_anonymous, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      id, userId, 
      isAnonymous ? 'Anonymous' : employeeName,
      isAnonymous ? null : employeeId,
      category, message, isAnonymous || false
    ]);

    // Log audit trail (only if not anonymous)
    if (userId) {
      await pool.query(`
        INSERT INTO user_audit_log (user_id, action, details)
        VALUES ($1, $2, $3)
      `, [userId, 'FEEDBACK_SUBMITTED', JSON.stringify({ id, category })]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ error: 'Failed to create feedback' });
  }
});

// PUT /api/feedback/:id - Update feedback entry (admin only)
router.put('/api/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (adminNotes !== undefined) {
      updates.push(`admin_notes = $${paramCount++}`);
      values.push(adminNotes);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE feedback
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// DELETE /api/feedback/:id - Delete feedback entry
router.delete('/api/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM feedback WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

module.exports = router;
