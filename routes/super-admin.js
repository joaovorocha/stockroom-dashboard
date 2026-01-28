/**
 * Super Admin Routes
 * Phase 3: Multi-Store Admin Panel
 * 
 * Provides endpoints for:
 * - Dashboard overview
 * - Store management
 * - Global settings
 * - User management
 * - Support tickets
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/dal/pg');
const { 
  requireSuperAdmin, 
  requireStoreAdmin,
  getUserAccessibleStores,
  getUserStorePermissions
} = require('../middleware/storeAccess');

// ===================================
// DASHBOARD
// ===================================

// GET /api/super-admin/dashboard - Get dashboard overview
router.get('/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    // Get counts
    const [storesResult, usersResult, ticketsResult, settingsResult] = await Promise.all([
      query('SELECT COUNT(*) as count FROM stores WHERE is_active = true'),
      query('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
      query("SELECT COUNT(*) as count FROM support_tickets WHERE status IN ('open', 'in_progress')"),
      query('SELECT COUNT(*) as count FROM global_settings')
    ]);

    // Get recent activity
    const recentActivity = await query(`
      SELECT action, changes, created_at, user_id,
             (SELECT name FROM users WHERE id = user_audit_log.user_id) as user_name
      FROM user_audit_log 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    // Get store breakdown
    const storeBreakdown = await query(`
      SELECT 
        s.id, s.name, s.code,
        (SELECT COUNT(*) FROM user_store_access usa WHERE usa.store_id = s.id AND usa.is_active = true) as user_count
      FROM stores s
      WHERE s.is_active = true
      ORDER BY s.name
    `);

    // Get open tickets by priority
    const ticketsByPriority = await query(`
      SELECT priority, COUNT(*) as count 
      FROM support_tickets 
      WHERE status IN ('open', 'in_progress')
      GROUP BY priority
    `);

    return res.json({
      success: true,
      dashboard: {
        counts: {
          stores: parseInt(storesResult.rows[0]?.count || 0),
          users: parseInt(usersResult.rows[0]?.count || 0),
          openTickets: parseInt(ticketsResult.rows[0]?.count || 0),
          settings: parseInt(settingsResult.rows[0]?.count || 0)
        },
        recentActivity: recentActivity.rows,
        storeBreakdown: storeBreakdown.rows,
        ticketsByPriority: ticketsByPriority.rows
      }
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ===================================
// STORE MANAGEMENT
// ===================================

// GET /api/super-admin/stores - List all stores
router.get('/stores', requireSuperAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM user_store_access usa WHERE usa.store_id = s.id AND usa.is_active = true) as user_count,
        (SELECT COUNT(*) FROM store_settings ss WHERE ss.store_id = s.id) as settings_count
      FROM stores s
      ORDER BY s.name
    `);

    return res.json({
      success: true,
      stores: result.rows
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Stores list error:', error);
    return res.status(500).json({ error: 'Failed to load stores' });
  }
});

// GET /api/super-admin/stores/:id - Get store details
router.get('/stores/:id', requireSuperAdmin, async (req, res) => {
  try {
    const storeId = parseInt(req.params.id);

    const [storeResult, usersResult, settingsResult] = await Promise.all([
      query('SELECT * FROM stores WHERE id = $1', [storeId]),
      query(`
        SELECT u.id, u.name, u.email, u.access_role, usa.access_level
        FROM user_store_access usa
        JOIN users u ON u.id = usa.user_id
        WHERE usa.store_id = $1 AND usa.is_active = true
        ORDER BY u.name
      `, [storeId]),
      query(`
        SELECT ss.*, gs.description as global_description
        FROM store_settings ss
        LEFT JOIN global_settings gs ON gs.setting_key = ss.setting_key
        WHERE ss.store_id = $1
        ORDER BY ss.setting_key
      `, [storeId])
    ]);

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    return res.json({
      success: true,
      store: storeResult.rows[0],
      users: usersResult.rows,
      settings: settingsResult.rows
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Store details error:', error);
    return res.status(500).json({ error: 'Failed to load store details' });
  }
});

// PUT /api/super-admin/stores/:id - Update store
router.put('/stores/:id', requireSuperAdmin, async (req, res) => {
  try {
    const storeId = parseInt(req.params.id);
    const { name, address, city, state, zip, phone, timezone, is_active } = req.body;

    const result = await query(`
      UPDATE stores SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        state_province_old = COALESCE($4, state_province_old),
        zip = COALESCE($5, zip),
        phone = COALESCE($6, phone),
        timezone = COALESCE($7, timezone),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [name, address, city, state, zip, phone, timezone, is_active, storeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    return res.json({
      success: true,
      store: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Store update error:', error);
    return res.status(500).json({ error: 'Failed to update store' });
  }
});

// ===================================
// GLOBAL SETTINGS
// ===================================

// GET /api/super-admin/settings/global - List all global settings
router.get('/settings/global', requireSuperAdmin, async (req, res) => {
  try {
    const { category } = req.query;

    let queryStr = 'SELECT * FROM global_settings';
    const params = [];

    if (category) {
      queryStr += ' WHERE category = $1';
      params.push(category);
    }

    queryStr += ' ORDER BY category, setting_key';

    const result = await query(queryStr, params);

    // Group by category
    const grouped = result.rows.reduce((acc, setting) => {
      const cat = setting.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(setting);
      return acc;
    }, {});

    return res.json({
      success: true,
      settings: result.rows,
      grouped,
      categories: Object.keys(grouped)
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Global settings error:', error);
    return res.status(500).json({ error: 'Failed to load global settings' });
  }
});

// PUT /api/super-admin/settings/global/:key - Update global setting
router.put('/settings/global/:key', requireSuperAdmin, async (req, res) => {
  try {
    const settingKey = req.params.key;
    const { value, is_editable_by_store } = req.body;
    const userId = req.session?.userId;

    const result = await query(`
      UPDATE global_settings SET
        setting_value = $1,
        is_editable_by_store = COALESCE($2, is_editable_by_store),
        updated_by = $3,
        updated_at = NOW()
      WHERE setting_key = $4
      RETURNING *
    `, [value, is_editable_by_store, userId, settingKey]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    return res.json({
      success: true,
      setting: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Update setting error:', error);
    return res.status(500).json({ error: 'Failed to update setting' });
  }
});

// POST /api/super-admin/settings/global - Create new global setting
router.post('/settings/global', requireSuperAdmin, async (req, res) => {
  try {
    const { setting_key, setting_value, setting_type, category, description, is_editable_by_store } = req.body;
    const userId = req.session?.userId;

    if (!setting_key) {
      return res.status(400).json({ error: 'Setting key is required' });
    }

    const result = await query(`
      INSERT INTO global_settings (setting_key, setting_value, setting_type, category, description, is_editable_by_store, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [setting_key, setting_value, setting_type || 'string', category, description, is_editable_by_store || false, userId]);

    return res.json({
      success: true,
      setting: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Create setting error:', error);
    return res.status(500).json({ error: 'Failed to create setting' });
  }
});

// ===================================
// USER MANAGEMENT
// ===================================

// GET /api/super-admin/users - List all users
router.get('/users', requireSuperAdmin, async (req, res) => {
  try {
    const { store_id, role, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let queryStr = `
      SELECT 
        u.id, u.employee_id, u.name, u.email, u.access_role, u.job_role,
        u.is_super_admin, u.is_admin, u.is_manager, u.is_active,
        u.default_store_id, u.can_switch_stores, u.last_login,
        s.name as default_store_name, s.code as default_store_code,
        (SELECT COUNT(*) FROM user_store_access usa WHERE usa.user_id = u.id AND usa.is_active = true) as store_count
      FROM users u
      LEFT JOIN stores s ON s.id = u.default_store_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (store_id) {
      paramCount++;
      queryStr += ` AND u.id IN (SELECT user_id FROM user_store_access WHERE store_id = $${paramCount} AND is_active = true)`;
      params.push(parseInt(store_id));
    }

    if (role) {
      paramCount++;
      queryStr += ` AND u.access_role = $${paramCount}`;
      params.push(role);
    }

    if (search) {
      paramCount++;
      queryStr += ` AND (LOWER(u.name) LIKE $${paramCount} OR LOWER(u.email) LIKE $${paramCount} OR LOWER(u.employee_id) LIKE $${paramCount})`;
      params.push(`%${search.toLowerCase()}%`);
    }

    // Get total count
    const countResult = await query(queryStr.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM'), params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Add pagination
    queryStr += ` ORDER BY u.name LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), offset);

    const result = await query(queryStr, params);

    return res.json({
      success: true,
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Users list error:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/super-admin/users/:id - Get user details
router.get('/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const [userResult, accessResult] = await Promise.all([
      query('SELECT * FROM users WHERE id = $1', [userId]),
      query(`
        SELECT usa.*, s.name as store_name, s.code as store_code
        FROM user_store_access usa
        JOIN stores s ON s.id = usa.store_id
        WHERE usa.user_id = $1
        ORDER BY s.name
      `, [userId])
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    // Remove password hash from response
    delete user.password_hash;

    return res.json({
      success: true,
      user,
      storeAccess: accessResult.rows
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] User details error:', error);
    return res.status(500).json({ error: 'Failed to load user details' });
  }
});

// PUT /api/super-admin/users/:id - Update user
router.put('/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { 
      access_role, is_super_admin, is_admin, is_manager, 
      can_switch_stores, default_store_id, is_active 
    } = req.body;
    const adminUserId = req.session?.userId;

    const result = await query(`
      UPDATE users SET
        access_role = COALESCE($1, access_role),
        is_super_admin = COALESCE($2, is_super_admin),
        is_admin = COALESCE($3, is_admin),
        is_manager = COALESCE($4, is_manager),
        can_switch_stores = COALESCE($5, can_switch_stores),
        default_store_id = COALESCE($6, default_store_id),
        is_active = COALESCE($7, is_active),
        role_updated_by = $8,
        role_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $9
      RETURNING id, name, email, access_role, is_super_admin, is_admin, is_manager, can_switch_stores, default_store_id, is_active
    `, [access_role, is_super_admin, is_admin, is_manager, can_switch_stores, default_store_id, is_active, adminUserId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] User update error:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/super-admin/users/:id/store-access - Grant store access
router.post('/users/:id/store-access', requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { store_id, access_level } = req.body;
    const adminUserId = req.session?.userId;

    if (!store_id) {
      return res.status(400).json({ error: 'Store ID is required' });
    }

    const result = await query(`
      INSERT INTO user_store_access (user_id, store_id, access_level, granted_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, store_id) DO UPDATE SET
        access_level = EXCLUDED.access_level,
        is_active = true,
        granted_by = EXCLUDED.granted_by,
        granted_at = NOW(),
        revoked_at = NULL,
        revoked_by = NULL
      RETURNING *
    `, [userId, parseInt(store_id), access_level || 'view', adminUserId]);

    return res.json({
      success: true,
      access: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Grant access error:', error);
    return res.status(500).json({ error: 'Failed to grant store access' });
  }
});

// DELETE /api/super-admin/users/:id/store-access/:storeId - Revoke store access
router.delete('/users/:id/store-access/:storeId', requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const storeId = parseInt(req.params.storeId);
    const adminUserId = req.session?.userId;

    const result = await query(`
      UPDATE user_store_access SET
        is_active = false,
        revoked_by = $1,
        revoked_at = NOW()
      WHERE user_id = $2 AND store_id = $3
      RETURNING *
    `, [adminUserId, userId, storeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Access record not found' });
    }

    return res.json({
      success: true,
      message: 'Store access revoked'
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Revoke access error:', error);
    return res.status(500).json({ error: 'Failed to revoke store access' });
  }
});

// ===================================
// SUPPORT TICKETS
// ===================================

// GET /api/super-admin/tickets - List all tickets
router.get('/tickets', requireSuperAdmin, async (req, res) => {
  try {
    const { status, priority, store_id, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let queryStr = `
      SELECT 
        t.*,
        s.name as store_name, s.code as store_code,
        cu.name as created_by_name,
        au.name as assigned_to_name
      FROM support_tickets t
      LEFT JOIN stores s ON s.id = t.store_id
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN users au ON au.id = t.assigned_to
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      queryStr += ` AND t.status = $${paramCount}`;
      params.push(status);
    }

    if (priority) {
      paramCount++;
      queryStr += ` AND t.priority = $${paramCount}`;
      params.push(priority);
    }

    if (store_id) {
      paramCount++;
      queryStr += ` AND t.store_id = $${paramCount}`;
      params.push(parseInt(store_id));
    }

    queryStr += ` ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      t.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), offset);

    const result = await query(queryStr, params);

    return res.json({
      success: true,
      tickets: result.rows
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Tickets list error:', error);
    return res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// GET /api/super-admin/tickets/:id - Get ticket details
router.get('/tickets/:id', requireSuperAdmin, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    const [ticketResult, commentsResult] = await Promise.all([
      query(`
        SELECT t.*, s.name as store_name, cu.name as created_by_name, au.name as assigned_to_name
        FROM support_tickets t
        LEFT JOIN stores s ON s.id = t.store_id
        LEFT JOIN users cu ON cu.id = t.created_by
        LEFT JOIN users au ON au.id = t.assigned_to
        WHERE t.id = $1
      `, [ticketId]),
      query(`
        SELECT tc.*, u.name as user_name
        FROM ticket_comments tc
        LEFT JOIN users u ON u.id = tc.user_id
        WHERE tc.ticket_id = $1
        ORDER BY tc.created_at
      `, [ticketId])
    ]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.json({
      success: true,
      ticket: ticketResult.rows[0],
      comments: commentsResult.rows
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Ticket details error:', error);
    return res.status(500).json({ error: 'Failed to load ticket details' });
  }
});

// PUT /api/super-admin/tickets/:id - Update ticket
router.put('/tickets/:id', requireSuperAdmin, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { status, priority, assigned_to, resolution } = req.body;

    let updates = [];
    const params = [];
    let paramCount = 0;

    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
      
      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      } else if (status === 'closed') {
        updates.push('closed_at = NOW()');
      }
    }

    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }

    if (assigned_to !== undefined) {
      paramCount++;
      updates.push(`assigned_to = $${paramCount}`);
      params.push(assigned_to ? parseInt(assigned_to) : null);
    }

    if (resolution !== undefined) {
      paramCount++;
      updates.push(`resolution = $${paramCount}`);
      params.push(resolution);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    paramCount++;
    params.push(ticketId);

    const result = await query(`
      UPDATE support_tickets SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.json({
      success: true,
      ticket: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Ticket update error:', error);
    return res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// POST /api/super-admin/tickets/:id/comments - Add comment to ticket
router.post('/tickets/:id/comments', requireSuperAdmin, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { comment, is_internal } = req.body;
    const userId = req.session?.userId;

    if (!comment) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const result = await query(`
      INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [ticketId, userId, comment, is_internal || false]);

    // Update ticket's updated_at
    await query('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    return res.json({
      success: true,
      comment: result.rows[0]
    });

  } catch (error) {
    console.error('[SUPER-ADMIN] Add comment error:', error);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
