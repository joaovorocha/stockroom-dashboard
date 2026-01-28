/**
 * Store Admin Routes
 * Tier 2 admin functionality - Store-level management
 * 
 * Access: Store admins and managers (for their assigned stores)
 * Super admins can also access all stores
 */

const express = require('express');
const router = express.Router();
const { query } = require('../database');
const { requireStoreAdmin, userHasStoreAccess } = require('../middleware/storeAccess');

/**
 * Middleware: Validate store access for all routes
 * Extracts storeId from params, query, or session
 */
const validateStoreAccess = async (req, res, next) => {
  try {
    // Get store ID from various sources
    const storeId = req.params.storeId || req.query.store_id || req.session?.activeStoreId;
    
    if (!storeId) {
      return res.status(400).json({ success: false, error: 'Store ID is required' });
    }

    // Super admins can access any store
    if (req.session?.isSuperAdmin) {
      req.storeId = parseInt(storeId);
      return next();
    }

    // Check if user has access to this store
    const hasAccess = await userHasStoreAccess(req.session.userId, storeId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Access denied to this store' });
    }

    // Check access level (admin or manager required for store admin)
    const accessCheck = await query(
      `SELECT access_role FROM user_store_access 
       WHERE user_id = $1 AND store_id = $2 AND is_active = true`,
      [req.session.userId, storeId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'No access to this store' });
    }

    const role = accessCheck.rows[0].access_role;
    if (!['admin', 'manager', 'super_admin'].includes(role)) {
      return res.status(403).json({ success: false, error: 'Admin or manager access required' });
    }

    req.storeId = parseInt(storeId);
    req.storeAccessRole = role;
    next();
  } catch (error) {
    console.error('Store access validation error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate store access' });
  }
};

// Apply store access validation to all routes
router.use(validateStoreAccess);

// ============================================
// STORE DASHBOARD
// ============================================

/**
 * GET /api/store-admin/dashboard
 * Get store dashboard overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const storeId = req.storeId;

    // Get store info
    const storeResult = await query(
      `SELECT id, name, code, region, timezone, is_active, created_at
       FROM stores WHERE id = $1`,
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }

    const store = storeResult.rows[0];

    // Get team count
    const teamCount = await query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       JOIN user_store_access usa ON u.id = usa.user_id
       WHERE usa.store_id = $1 AND usa.is_active = true`,
      [storeId]
    );

    // Get role breakdown
    const roleBreakdown = await query(
      `SELECT usa.access_role, COUNT(*) as count
       FROM user_store_access usa
       WHERE usa.store_id = $1 AND usa.is_active = true
       GROUP BY usa.access_role
       ORDER BY count DESC`,
      [storeId]
    );

    // Get today's scan stats (if daily_scan_results exists)
    let todaysScans = { count: 0, expected: 0, counted: 0 };
    try {
      const scanResult = await query(
        `SELECT COUNT(*) as count, 
                COALESCE(SUM(expected_units), 0) as expected,
                COALESCE(SUM(counted_units), 0) as counted
         FROM daily_scan_results 
         WHERE scan_date = CURRENT_DATE`,
        []
      );
      todaysScans = scanResult.rows[0];
    } catch (e) {
      // Table might not exist
    }

    // Get recent activity for this store
    const recentActivity = await query(
      `SELECT al.*, u.name as user_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.store_id = $1
       ORDER BY al.created_at DESC
       LIMIT 10`,
      [storeId]
    );

    // Get store settings count
    const settingsCount = await query(
      `SELECT COUNT(*) as count FROM store_settings WHERE store_id = $1`,
      [storeId]
    );

    res.json({
      success: true,
      dashboard: {
        store,
        stats: {
          teamMembers: parseInt(teamCount.rows[0].count),
          settingsCount: parseInt(settingsCount.rows[0].count),
          todaysScans
        },
        roleBreakdown: roleBreakdown.rows,
        recentActivity: recentActivity.rows
      }
    });
  } catch (error) {
    console.error('Error fetching store dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ============================================
// STORE SETTINGS
// ============================================

/**
 * GET /api/store-admin/settings
 * Get all settings for this store (store-specific + inherited global)
 */
router.get('/settings', async (req, res) => {
  try {
    const storeId = req.storeId;

    // Get global settings that can be overridden
    const globalSettings = await query(
      `SELECT setting_key, setting_value, setting_type, category, description,
              is_editable_by_store
       FROM global_settings
       ORDER BY category, setting_key`
    );

    // Get store-specific settings
    const storeSettings = await query(
      `SELECT ss.*, u.name as updated_by_name
       FROM store_settings ss
       LEFT JOIN users u ON ss.updated_by = u.id
       WHERE ss.store_id = $1
       ORDER BY ss.category, ss.setting_key`,
      [storeId]
    );

    // Merge settings - store settings override global
    const storeSettingsMap = {};
    storeSettings.rows.forEach(s => {
      storeSettingsMap[s.setting_key] = s;
    });

    const mergedSettings = globalSettings.rows.map(global => {
      const storeOverride = storeSettingsMap[global.setting_key];
      return {
        ...global,
        setting_value: storeOverride?.setting_value || global.setting_value,
        is_overridden: !!storeOverride,
        store_updated_at: storeOverride?.updated_at,
        store_updated_by: storeOverride?.updated_by_name,
        can_edit: global.is_editable_by_store || req.session?.isSuperAdmin
      };
    });

    // Add store-only settings (not in global)
    const globalKeys = new Set(globalSettings.rows.map(g => g.setting_key));
    storeSettings.rows
      .filter(s => !globalKeys.has(s.setting_key))
      .forEach(s => {
        mergedSettings.push({
          ...s,
          is_store_only: true,
          can_edit: true
        });
      });

    res.json({
      success: true,
      settings: mergedSettings,
      storeSettings: storeSettings.rows
    });
  } catch (error) {
    console.error('Error fetching store settings:', error);
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

/**
 * PUT /api/store-admin/settings/:key
 * Update a store setting (only if editable by store)
 */
router.put('/settings/:key', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }

    // Check if this setting can be edited by store
    const globalCheck = await query(
      `SELECT is_editable_by_store FROM global_settings WHERE setting_key = $1`,
      [key]
    );

    const isGlobalSetting = globalCheck.rows.length > 0;
    const canEdit = !isGlobalSetting || 
                    globalCheck.rows[0].is_editable_by_store || 
                    req.session?.isSuperAdmin;

    if (!canEdit) {
      return res.status(403).json({ 
        success: false, 
        error: 'This setting cannot be modified at the store level' 
      });
    }

    // Upsert store setting
    const result = await query(
      `INSERT INTO store_settings (store_id, setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, setting_key) 
       DO UPDATE SET setting_value = $3, updated_by = $4, updated_at = NOW()
       RETURNING *`,
      [storeId, key, value, req.session.userId]
    );

    res.json({
      success: true,
      setting: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating store setting:', error);
    res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

/**
 * DELETE /api/store-admin/settings/:key
 * Reset a store setting to global default
 */
router.delete('/settings/:key', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { key } = req.params;

    await query(
      `DELETE FROM store_settings WHERE store_id = $1 AND setting_key = $2`,
      [storeId, key]
    );

    res.json({ success: true, message: 'Setting reset to global default' });
  } catch (error) {
    console.error('Error resetting store setting:', error);
    res.status(500).json({ success: false, error: 'Failed to reset setting' });
  }
});

// ============================================
// TEAM MANAGEMENT
// ============================================

/**
 * GET /api/store-admin/team
 * Get all team members for this store
 */
router.get('/team', async (req, res) => {
  try {
    const storeId = req.storeId;

    const team = await query(
      `SELECT u.id, u.name, u.email, u.id_number, u.role_title, u.image_url,
              u.created_at, u.last_login,
              usa.access_role, usa.granted_at, usa.is_active,
              grantor.name as granted_by_name
       FROM users u
       JOIN user_store_access usa ON u.id = usa.user_id
       LEFT JOIN users grantor ON usa.granted_by = grantor.id
       WHERE usa.store_id = $1
       ORDER BY 
         CASE usa.access_role 
           WHEN 'admin' THEN 1 
           WHEN 'manager' THEN 2 
           ELSE 3 
         END,
         u.name`,
      [storeId]
    );

    // Get role counts
    const roleCounts = await query(
      `SELECT access_role, COUNT(*) as count
       FROM user_store_access
       WHERE store_id = $1 AND is_active = true
       GROUP BY access_role`,
      [storeId]
    );

    res.json({
      success: true,
      team: team.rows,
      roleCounts: roleCounts.rows,
      totalMembers: team.rows.length
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ success: false, error: 'Failed to load team' });
  }
});

/**
 * PUT /api/store-admin/team/:userId/role
 * Update a team member's role (admin/manager only can do this)
 */
router.put('/team/:userId/role', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { userId } = req.params;
    const { access_role } = req.body;

    // Only admins can change roles
    if (req.storeAccessRole !== 'admin' && !req.session?.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only store admins can change roles' });
    }

    // Cannot change super admin roles
    const targetUser = await query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
    if (targetUser.rows[0]?.is_super_admin) {
      return res.status(403).json({ success: false, error: 'Cannot modify super admin roles' });
    }

    // Valid roles
    const validRoles = ['admin', 'manager', 'user'];
    if (!validRoles.includes(access_role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const result = await query(
      `UPDATE user_store_access 
       SET access_role = $1, updated_at = NOW()
       WHERE user_id = $2 AND store_id = $3
       RETURNING *`,
      [access_role, userId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    res.json({
      success: true,
      access: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating team member role:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/store-admin/team/:userId
 * Remove a team member from this store
 */
router.delete('/team/:userId', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { userId } = req.params;

    // Only admins can remove team members
    if (req.storeAccessRole !== 'admin' && !req.session?.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only store admins can remove team members' });
    }

    // Cannot remove yourself
    if (parseInt(userId) === req.session.userId) {
      return res.status(400).json({ success: false, error: 'Cannot remove yourself from the team' });
    }

    // Soft delete - set is_active to false
    const result = await query(
      `UPDATE user_store_access 
       SET is_active = false, updated_at = NOW()
       WHERE user_id = $1 AND store_id = $2
       RETURNING *`,
      [userId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    res.json({ success: true, message: 'Team member removed from store' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ success: false, error: 'Failed to remove team member' });
  }
});

/**
 * POST /api/store-admin/team/invite
 * Invite/add a user to this store
 */
router.post('/team/invite', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { user_id, email, access_role = 'user' } = req.body;

    // Only admins can invite
    if (req.storeAccessRole !== 'admin' && !req.session?.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only store admins can invite team members' });
    }

    // Find user by ID or email
    let targetUserId = user_id;
    if (!targetUserId && email) {
      const userResult = await query(`SELECT id FROM users WHERE email = $1`, [email]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      targetUserId = userResult.rows[0].id;
    }

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'User ID or email is required' });
    }

    // Check if already a member
    const existing = await query(
      `SELECT * FROM user_store_access WHERE user_id = $1 AND store_id = $2`,
      [targetUserId, storeId]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].is_active) {
        return res.status(400).json({ success: false, error: 'User is already a team member' });
      }
      // Reactivate
      await query(
        `UPDATE user_store_access 
         SET is_active = true, access_role = $1, granted_by = $2, granted_at = NOW()
         WHERE user_id = $3 AND store_id = $4`,
        [access_role, req.session.userId, targetUserId, storeId]
      );
    } else {
      // Insert new access
      await query(
        `INSERT INTO user_store_access (user_id, store_id, access_role, granted_by, granted_at, is_active)
         VALUES ($1, $2, $3, $4, NOW(), true)`,
        [targetUserId, storeId, access_role, req.session.userId]
      );
    }

    // Fetch the user info
    const user = await query(
      `SELECT u.id, u.name, u.email, usa.access_role
       FROM users u
       JOIN user_store_access usa ON u.id = usa.user_id
       WHERE u.id = $1 AND usa.store_id = $2`,
      [targetUserId, storeId]
    );

    res.json({
      success: true,
      message: 'Team member added',
      member: user.rows[0]
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ success: false, error: 'Failed to add team member' });
  }
});

// ============================================
// STORE REPORTS & ANALYTICS
// ============================================

/**
 * GET /api/store-admin/reports/summary
 * Get store summary report
 */
router.get('/reports/summary', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { days = 30 } = req.query;

    // Daily scan stats
    let scanStats = [];
    try {
      const scans = await query(
        `SELECT scan_date, 
                COUNT(*) as scan_count,
                SUM(expected_units) as total_expected,
                SUM(counted_units) as total_counted
         FROM daily_scan_results
         WHERE scan_date >= CURRENT_DATE - $1::integer
         GROUP BY scan_date
         ORDER BY scan_date DESC`,
        [days]
      );
      scanStats = scans.rows;
    } catch (e) {
      // Table might not exist
    }

    // Activity by day
    const activityByDay = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM activity_logs
       WHERE store_id = $1 AND created_at >= CURRENT_DATE - $2::integer
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [storeId, days]
    );

    // Activity by type
    const activityByType = await query(
      `SELECT action, COUNT(*) as count
       FROM activity_logs
       WHERE store_id = $1 AND created_at >= CURRENT_DATE - $2::integer
       GROUP BY action
       ORDER BY count DESC`,
      [storeId, days]
    );

    // Top users by activity
    const topUsers = await query(
      `SELECT u.name, COUNT(al.*) as activity_count
       FROM activity_logs al
       JOIN users u ON al.user_id = u.id
       WHERE al.store_id = $1 AND al.created_at >= CURRENT_DATE - $2::integer
       GROUP BY u.id, u.name
       ORDER BY activity_count DESC
       LIMIT 10`,
      [storeId, days]
    );

    res.json({
      success: true,
      reports: {
        period: `Last ${days} days`,
        scanStats,
        activityByDay: activityByDay.rows,
        activityByType: activityByType.rows,
        topUsers: topUsers.rows
      }
    });
  } catch (error) {
    console.error('Error generating reports:', error);
    res.status(500).json({ success: false, error: 'Failed to generate reports' });
  }
});

/**
 * GET /api/store-admin/reports/team-activity
 * Get detailed team activity report
 */
router.get('/reports/team-activity', async (req, res) => {
  try {
    const storeId = req.storeId;
    const { days = 7 } = req.query;

    const teamActivity = await query(
      `SELECT u.id, u.name, u.email, u.image_url,
              COUNT(al.id) as total_actions,
              MAX(al.created_at) as last_activity,
              u.last_login
       FROM users u
       JOIN user_store_access usa ON u.id = usa.user_id
       LEFT JOIN activity_logs al ON u.id = al.user_id 
         AND al.store_id = $1 
         AND al.created_at >= CURRENT_DATE - $2::integer
       WHERE usa.store_id = $1 AND usa.is_active = true
       GROUP BY u.id, u.name, u.email, u.image_url, u.last_login
       ORDER BY total_actions DESC`,
      [storeId, days]
    );

    res.json({
      success: true,
      teamActivity: teamActivity.rows,
      period: `Last ${days} days`
    });
  } catch (error) {
    console.error('Error fetching team activity:', error);
    res.status(500).json({ success: false, error: 'Failed to load team activity' });
  }
});

/**
 * GET /api/store-admin/reports/scans
 * Get scan performance report
 */
router.get('/reports/scans', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    let scanData = { daily: [], summary: {} };
    
    try {
      // Daily breakdown
      const daily = await query(
        `SELECT scan_date,
                COUNT(*) as items_scanned,
                SUM(expected_units) as expected,
                SUM(counted_units) as counted,
                ROUND(AVG(CASE WHEN expected_units > 0 
                  THEN (counted_units::float / expected_units) * 100 
                  ELSE 100 END), 2) as accuracy_pct
         FROM daily_scan_results
         WHERE scan_date >= CURRENT_DATE - $1::integer
         GROUP BY scan_date
         ORDER BY scan_date DESC`,
        [days]
      );

      // Summary
      const summary = await query(
        `SELECT 
           COUNT(*) as total_scans,
           SUM(expected_units) as total_expected,
           SUM(counted_units) as total_counted,
           COUNT(DISTINCT scan_date) as days_with_scans,
           COUNT(DISTINCT counted_by) as unique_scanners
         FROM daily_scan_results
         WHERE scan_date >= CURRENT_DATE - $1::integer`,
        [days]
      );

      scanData = {
        daily: daily.rows,
        summary: summary.rows[0]
      };
    } catch (e) {
      // Table might not exist
    }

    res.json({
      success: true,
      ...scanData,
      period: `Last ${days} days`
    });
  } catch (error) {
    console.error('Error fetching scan reports:', error);
    res.status(500).json({ success: false, error: 'Failed to load scan reports' });
  }
});

module.exports = router;
