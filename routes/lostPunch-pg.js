const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://suit:suit2024@localhost:5432/stockroom_dashboard'
});

// GET /api/lost-punch - Get all lost punch requests
router.get('/', async (req, res) => {
  try {
    // Get user from middleware (set by auth-pg.js)
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if user can manage lost punches
    const canManage = user.isManager || user.isAdmin || user.canManageLostPunch;

    let result;
    if (canManage) {
      // Return all lost punch requests for managers/admins
      result = await pool.query(`
        SELECT 
          lp.*,
          u.name as user_name,
          u.employee_id as user_employee_id,
          rb.name as reviewed_by_name,
          cb.name as completed_by_name
        FROM lost_punch_requests lp
        LEFT JOIN users u ON lp.user_id = u.id
        LEFT JOIN users rb ON lp.reviewed_by_user_id = rb.id
        LEFT JOIN users cb ON lp.completed_by_user_id = cb.id
        ORDER BY lp.submitted_at DESC
      `);
    } else {
      // Return only the user's own lost punch requests
      result = await pool.query(`
        SELECT 
          lp.*,
          u.name as user_name,
          u.employee_id as user_employee_id,
          rb.name as reviewed_by_name,
          cb.name as completed_by_name
        FROM lost_punch_requests lp
        LEFT JOIN users u ON lp.user_id = u.id
        LEFT JOIN users rb ON lp.reviewed_by_user_id = rb.id
        LEFT JOIN users cb ON lp.completed_by_user_id = cb.id
        WHERE lp.user_id = $1 OR lp.employee_id = $2
        ORDER BY lp.submitted_at DESC
      `, [user.userId, user.employeeId]);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lost punch requests:', error);
    res.status(500).json({ error: 'Failed to fetch lost punch requests' });
  }
});

// GET /api/lost-punch/:id - Get single lost punch request
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        lp.*,
        u.name as user_name,
        u.employee_id as user_employee_id,
        rb.name as reviewed_by_name,
        cb.name as completed_by_name
      FROM lost_punch_requests lp
      LEFT JOIN users u ON lp.user_id = u.id
      LEFT JOIN users rb ON lp.reviewed_by_user_id = rb.id
      LEFT JOIN users cb ON lp.completed_by_user_id = cb.id
      WHERE lp.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lost punch request not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching lost punch request:', error);
    res.status(500).json({ error: 'Failed to fetch lost punch request' });
  }
});

// POST /api/lost-punch - Create new lost punch request
router.post('/api/lost-punch', async (req, res) => {
  try {
    const {
      employeeName,
      employeeId,
      missedDate,
      clockInTime,
      lunchOutTime,
      lunchInTime,
      clockOutTime,
      missedTime,
      punchType,
      reason
    } = req.body;

    // Find user by employee_id
    const userResult = await pool.query(
      'SELECT id FROM users WHERE employee_id = $1',
      [employeeId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const userId = userResult.rows[0].id;
    const id = `punch-${Date.now()}`;

    const result = await pool.query(`
      INSERT INTO lost_punch_requests (
        id, user_id, employee_name, employee_id, missed_date,
        clock_in_time, lunch_out_time, lunch_in_time, clock_out_time,
        missed_time, punch_type, reason, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      id, userId, employeeName, employeeId, missedDate,
      clockInTime, lunchOutTime, lunchInTime, clockOutTime,
      missedTime, punchType, reason, 'pending'
    ]);

    // Log audit trail
    await pool.query(`
      INSERT INTO user_audit_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `, [userId, 'LOST_PUNCH_CREATED', JSON.stringify({ id, missedDate })]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating lost punch request:', error);
    res.status(500).json({ error: 'Failed to create lost punch request' });
  }
});

// PUT /api/lost-punch/:id - Update lost punch request
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      reviewedByEmployeeId,
      completedByEmployeeId,
      clockInTime,
      lunchOutTime,
      lunchInTime,
      clockOutTime,
      missedTime,
      reason
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }

      if (clockInTime !== undefined) {
        updates.push(`clock_in_time = $${paramCount++}`);
        values.push(clockInTime);
      }

      if (lunchOutTime !== undefined) {
        updates.push(`lunch_out_time = $${paramCount++}`);
        values.push(lunchOutTime);
      }

      if (lunchInTime !== undefined) {
        updates.push(`lunch_in_time = $${paramCount++}`);
        values.push(lunchInTime);
      }

      if (clockOutTime !== undefined) {
        updates.push(`clock_out_time = $${paramCount++}`);
        values.push(clockOutTime);
      }

      if (missedTime !== undefined) {
        updates.push(`missed_time = $${paramCount++}`);
        values.push(missedTime);
      }

      if (reason !== undefined) {
        updates.push(`reason = $${paramCount++}`);
        values.push(reason);
      }

      if (reviewedByEmployeeId) {
        const reviewerResult = await client.query(
          'SELECT id FROM users WHERE employee_id = $1',
          [reviewedByEmployeeId]
        );
        if (reviewerResult.rows.length > 0) {
          updates.push(`reviewed_by_user_id = $${paramCount++}`);
          values.push(reviewerResult.rows[0].id);
          updates.push(`reviewed_at = NOW()`);
        }
      }

      if (completedByEmployeeId) {
        const completerResult = await client.query(
          'SELECT id FROM users WHERE employee_id = $1',
          [completedByEmployeeId]
        );
        if (completerResult.rows.length > 0) {
          updates.push(`completed_by_user_id = $${paramCount++}`);
          values.push(completerResult.rows[0].id);
          updates.push(`completed_at = NOW()`);
        }
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await client.query(`
        UPDATE lost_punch_requests
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Lost punch request not found' });
      }

      // Log audit trail
      await client.query(`
        INSERT INTO user_audit_log (user_id, action, details)
        VALUES ($1, $2, $3)
      `, [result.rows[0].user_id, 'LOST_PUNCH_UPDATED', JSON.stringify({ id, status })]);

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating lost punch request:', error);
    res.status(500).json({ error: 'Failed to update lost punch request' });
  }
});

// DELETE /api/lost-punch/:id - Delete lost punch request
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM lost_punch_requests WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lost punch request not found' });
    }

    // Log audit trail
    await pool.query(`
      INSERT INTO user_audit_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `, [result.rows[0].user_id, 'LOST_PUNCH_DELETED', JSON.stringify({ id })]);

    res.json({ message: 'Lost punch request deleted successfully' });
  } catch (error) {
    console.error('Error deleting lost punch request:', error);
    res.status(500).json({ error: 'Failed to delete lost punch request' });
  }
});

// POST /api/lost-punch/batch - Batch update punch requests
router.post('/batch', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { ids, status, reviewedBy } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    await client.query('BEGIN');

    // Find reviewer user if provided
    let reviewerId = null;
    if (reviewedBy) {
      const reviewerResult = await client.query(
        'SELECT id FROM users WHERE name = $1',
        [reviewedBy]
      );
      if (reviewerResult.rows.length > 0) {
        reviewerId = reviewerResult.rows[0].id;
      }
    }

    // Update all punches in batch
    for (const id of ids) {
      const updates = ['status = $2', 'updated_at = NOW()'];
      const values = [id, status];
      let paramCount = 3;

      if (reviewerId) {
        updates.push(`reviewed_by_user_id = $${paramCount++}`);
        values.push(reviewerId);
        updates.push('reviewed_at = NOW()');
      }

      await client.query(`
        UPDATE lost_punch_requests
        SET ${updates.join(', ')}
        WHERE id = $1
      `, values);
    }

    await client.query('COMMIT');
    res.json({ success: true, updated: ids.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error batch updating lost punches:', error);
    res.status(500).json({ error: 'Failed to batch update lost punches' });
  } finally {
    client.release();
  }
});

module.exports = router;
