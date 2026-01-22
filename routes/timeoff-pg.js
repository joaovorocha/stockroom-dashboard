/**
 * Time-Off Routes - PostgreSQL Version
 * Updated to use PostgreSQL instead of time-off.json
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/dal/pg');

// Helper: Log time-off audit trail
async function logTimeOffAudit(requestId, userId, action, oldStatus, newStatus, notes = '') {
  try {
    await query(`
      INSERT INTO timeoff_audit_log (request_id, user_id, action, old_status, new_status, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [requestId, userId, action, oldStatus, newStatus, notes]);
  } catch (err) {
    console.error('Error logging time-off audit:', err);
  }
}

// Helper: Normalize date to ISO format (YYYY-MM-DD)
function coerceIsoDate(d) {
  if (!d) return '';
  const s = d.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

// Helper: Format time-off entry for response
function formatTimeOffEntry(row) {
  return {
    id: row.id,
    employeeUserId: row.user_id ? `user-${row.user_id}` : null,
    employeeId: row.employee_id,
    employeeName: row.name,
    employeeImageUrl: row.image_url || '',
    startDate: coerceIsoDate(row.start_date),
    endDate: coerceIsoDate(row.end_date),
    reason: row.reason,
    notes: row.notes,
    status: row.status === 'approved' ? 'published' : row.status, // Map to legacy status
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by_name,
    workdayStatus: row.workday_status,
    processedAt: row.processed_at,
    processedBy: row.processed_by_name
  };
}

// GET /api/timeoff - Get all time-off data
router.get('/', async (req, res) => {
  try {
    const user = req.user; // Set by auth middleware

    // Get all time-off requests with user info
    const result = await query(`
      SELECT 
        t.id, t.user_id, t.start_date, t.end_date, t.reason, t.notes, 
        t.status, t.submitted_at, t.decided_at, t.workday_status, t.processed_at,
        u.employee_id, u.name, u.image_url,
        decided_by.name as decided_by_name,
        processed_by.name as processed_by_name
      FROM timeoff_requests t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users decided_by ON t.decided_by_user_id = decided_by.id
      LEFT JOIN users processed_by ON t.processed_by_user_id = processed_by.id
      ORDER BY t.start_date DESC, t.submitted_at DESC
    `);

    const entries = result.rows.map(formatTimeOffEntry);
    
    // Filter for current user's entries
    const myEntries = entries.filter(e => e.employeeUserId === `user-${user.id}` || e.employeeId === user.employee_id);

    return res.json({
      entries,
      myEntries
    });

  } catch (error) {
    console.error('Get time-off error:', error);
    return res.status(500).json({ error: 'Failed to get time-off data' });
  }
});

// POST /api/timeoff/request - Submit time-off request
router.post('/request', async (req, res) => {
  try {
    const user = req.user; // Set by auth middleware
    const { startDate, endDate, reason, notes } = req.body || {};
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const normalizedStart = coerceIsoDate(startDate);
    const normalizedEnd = coerceIsoDate(endDate);

    if (!normalizedStart || !normalizedEnd) {
      return res.status(400).json({ error: 'Invalid start or end date' });
    }

    // Check for existing request with same dates
    const existingResult = await query(`
      SELECT id 
      FROM timeoff_requests 
      WHERE user_id = $1 
        AND start_date = $2 
        AND end_date = $3
      LIMIT 1
    `, [user.id, normalizedStart, normalizedEnd]);

    if (existingResult.rows.length > 0) {
      // Update existing request instead of creating duplicate
      const existingId = existingResult.rows[0].id;
      
      await query(`
        UPDATE timeoff_requests 
        SET reason = $1, notes = $2, submitted_at = NOW(), updated_at = NOW()
        WHERE id = $3
      `, [reason || 'vacation', notes || '', existingId]);

      // Get updated request
      const updatedResult = await query(`
        SELECT 
          t.id, t.user_id, t.start_date, t.end_date, t.reason, t.notes, 
          t.status, t.submitted_at, t.decided_at, t.workday_status, t.processed_at,
          u.employee_id, u.name, u.image_url,
          decided_by.name as decided_by_name,
          processed_by.name as processed_by_name
        FROM timeoff_requests t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN users decided_by ON t.decided_by_user_id = decided_by.id
        LEFT JOIN users processed_by ON t.processed_by_user_id = processed_by.id
        WHERE t.id = $1
      `, [existingId]);

      return res.json({ 
        success: true, 
        request: formatTimeOffEntry(updatedResult.rows[0])
      });
    }

    // Create new request
    const newId = `req-${Date.now()}`;
    
    await query(`
      INSERT INTO timeoff_requests (
        id, user_id, start_date, end_date, reason, notes, 
        status, submitted_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
    `, [
      newId,
      user.id,
      normalizedStart,
      normalizedEnd,
      reason || 'vacation',
      notes || '',
      'approved' // Default to approved (legacy behavior - was 'published')
    ]);

    // Get newly created request
    const newResult = await query(`
      SELECT 
        t.id, t.user_id, t.start_date, t.end_date, t.reason, t.notes, 
        t.status, t.submitted_at, t.decided_at, t.workday_status, t.processed_at,
        u.employee_id, u.name, u.image_url,
        decided_by.name as decided_by_name,
        processed_by.name as processed_by_name
      FROM timeoff_requests t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users decided_by ON t.decided_by_user_id = decided_by.id
      LEFT JOIN users processed_by ON t.processed_by_user_id = processed_by.id
      WHERE t.id = $1
    `, [newId]);

    return res.json({ 
      success: true, 
      request: formatTimeOffEntry(newResult.rows[0])
    });

  } catch (error) {
    console.error('Submit time-off request error:', error);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
});

// PUT /api/timeoff/:id - Update own request
router.put('/:id', async (req, res) => {
  try {
    const user = req.user; // Set by auth middleware
    const { id } = req.params;
    const { startDate, endDate, reason, notes } = req.body || {};

    const nextStart = coerceIsoDate(startDate);
    const nextEnd = coerceIsoDate(endDate);
    
    if (!nextStart || !nextEnd) {
      return res.status(400).json({ error: 'Invalid start or end date' });
    }

    // Find request and verify ownership
    const requestResult = await query(`
      SELECT user_id 
      FROM timeoff_requests 
      WHERE id = $1
    `, [id]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];
    
    // Check if user owns this request (or is admin)
    if (!user.is_admin && request.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to update this request' });
    }

    // Update request
    await query(`
      UPDATE timeoff_requests 
      SET start_date = $1, 
          end_date = $2, 
          reason = $3, 
          notes = $4, 
          updated_at = NOW()
      WHERE id = $5
    `, [
      nextStart,
      nextEnd,
      reason !== undefined ? String(reason) : 'vacation',
      notes !== undefined ? String(notes) : '',
      id
    ]);

    // Log audit trail
    await logTimeOffAudit(
      id,
      user.id,
      'updated',
      null,
      null,
      `Updated dates: ${nextStart} to ${nextEnd}`
    );

    // Get updated request
    const updatedResult = await query(`
      SELECT 
        t.id, t.user_id, t.start_date, t.end_date, t.reason, t.notes, 
        t.status, t.submitted_at, t.decided_at, t.workday_status, t.processed_at,
        u.employee_id, u.name, u.image_url,
        decided_by.name as decided_by_name,
        processed_by.name as processed_by_name
      FROM timeoff_requests t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users decided_by ON t.decided_by_user_id = decided_by.id
      LEFT JOIN users processed_by ON t.processed_by_user_id = processed_by.id
      WHERE t.id = $1
    `, [id]);

    return res.json({ 
      success: true, 
      entry: formatTimeOffEntry(updatedResult.rows[0])
    });

  } catch (error) {
    console.error('Update time-off request error:', error);
    return res.status(500).json({ error: 'Failed to update request' });
  }
});

// DELETE /api/timeoff/:id - Cancel own request
router.delete('/:id', async (req, res) => {
  try {
    const user = req.user; // Set by auth middleware
    const { id } = req.params;
    // Find request and verify ownership
    const requestResult = await query(`
      SELECT user_id 
      FROM timeoff_requests 
      WHERE id = $1
    `, [id]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];
    
    // Check if user owns this request (or is admin)
    if (!user.is_admin && request.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this request' });
    }

    // Log audit trail before deletion
    await logTimeOffAudit(
      id,
      user.id,
      'cancelled',
      null,
      'cancelled',
      'Request cancelled by user'
    );

    // Delete request
    await query('DELETE FROM timeoff_requests WHERE id = $1', [id]);

    return res.json({ success: true });

  } catch (error) {
    console.error('Delete time-off request error:', error);
    return res.status(500).json({ error: 'Failed to delete request' });
  }
});

module.exports = router;
