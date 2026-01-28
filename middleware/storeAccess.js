/**
 * Store Access Middleware
 * Phase 2: Multi-Store Login & Admin Panel
 * 
 * Provides middleware functions for:
 * - Checking user store access
 * - Requiring super admin role
 * - Requiring store admin role
 * - Validating store context in requests
 */

const { query } = require('../utils/dal/pg');

/**
 * Check if user has access to a specific store
 * Uses the database function user_has_store_access()
 */
async function userHasStoreAccess(userId, storeId, requiredLevel = null) {
  try {
    const result = await query(
      'SELECT user_has_store_access($1, $2, $3) as has_access',
      [userId, storeId, requiredLevel]
    );
    return result.rows[0]?.has_access === true;
  } catch (error) {
    console.error('[STORE_ACCESS] Error checking access:', error.message);
    return false;
  }
}

/**
 * Get all stores a user can access
 * Uses the database function get_user_accessible_stores()
 */
async function getUserAccessibleStores(userId) {
  try {
    const result = await query(
      'SELECT * FROM get_user_accessible_stores($1)',
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('[STORE_ACCESS] Error getting accessible stores:', error.message);
    return [];
  }
}

/**
 * Get user's super admin status and store permissions
 */
async function getUserStorePermissions(userId) {
  try {
    const result = await query(`
      SELECT 
        u.id,
        u.access_role,
        u.is_super_admin,
        u.default_store_id,
        u.can_switch_stores,
        u.last_store_id,
        s.name as default_store_name,
        s.code as default_store_code
      FROM users u
      LEFT JOIN stores s ON s.id = u.default_store_id
      WHERE u.id = $1 AND u.is_active = true
    `, [userId]);
    
    if (result.rows.length === 0) return null;
    
    const user = result.rows[0];
    const stores = await getUserAccessibleStores(userId);
    
    return {
      userId: user.id,
      accessRole: user.access_role,
      isSuperAdmin: user.is_super_admin,
      defaultStoreId: user.default_store_id,
      defaultStoreName: user.default_store_name,
      defaultStoreCode: user.default_store_code,
      canSwitchStores: user.can_switch_stores || user.is_super_admin,
      lastStoreId: user.last_store_id,
      accessibleStores: stores
    };
  } catch (error) {
    console.error('[STORE_ACCESS] Error getting permissions:', error.message);
    return null;
  }
}

/**
 * Middleware: Attach store context to request
 * Adds req.storeContext with user's store permissions
 */
const attachStoreContext = async (req, res, next) => {
  if (!req.user || !req.user.userId) {
    return next();
  }

  try {
    const permissions = await getUserStorePermissions(req.user.userId);
    if (permissions) {
      req.storeContext = permissions;
      
      // Also add to user object for convenience
      req.user.isSuperAdmin = permissions.isSuperAdmin;
      req.user.accessRole = permissions.accessRole;
      req.user.canSwitchStores = permissions.canSwitchStores;
      req.user.accessibleStores = permissions.accessibleStores;
    }
  } catch (error) {
    console.error('[STORE_ACCESS] Error attaching context:', error.message);
  }
  
  next();
};

/**
 * Middleware: Check if user has access to requested store
 * Expects store_id in req.params.storeId, req.body.store_id, or req.query.store_id
 */
const checkStoreAccess = (requiredLevel = null) => {
  return async (req, res, next) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get store ID from various sources
    const storeId = parseInt(
      req.params.storeId || 
      req.body.store_id || 
      req.query.store_id ||
      req.session?.activeStoreId
    );

    if (!storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }

    // Check access
    const hasAccess = await userHasStoreAccess(userId, storeId, requiredLevel);
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Access denied to this store',
        requiredLevel: requiredLevel || 'any'
      });
    }

    // Attach store ID to request
    req.activeStoreId = storeId;
    next();
  };
};

/**
 * Middleware: Require super admin role
 */
const requireSuperAdmin = async (req, res, next) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await query(
      'SELECT is_super_admin FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_super_admin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    req.user.isSuperAdmin = true;
    next();
  } catch (error) {
    console.error('[STORE_ACCESS] Error checking super admin:', error.message);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
};

/**
 * Middleware: Require store admin or higher for a specific store
 */
const requireStoreAdmin = async (req, res, next) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get store ID
  const storeId = parseInt(
    req.params.storeId || 
    req.body.store_id || 
    req.query.store_id ||
    req.session?.activeStoreId
  );

  if (!storeId) {
    return res.status(400).json({ error: 'Store ID is required' });
  }

  // Check for admin level access
  const hasAccess = await userHasStoreAccess(userId, storeId, 'admin');
  if (!hasAccess) {
    return res.status(403).json({ error: 'Store admin access required' });
  }

  req.activeStoreId = storeId;
  next();
};

/**
 * Middleware: Validate active store in session
 * Ensures the user's session has a valid active store
 */
const validateActiveStore = async (req, res, next) => {
  const userId = req.user?.userId;
  const activeStoreId = req.session?.activeStoreId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!activeStoreId) {
    return res.status(400).json({ 
      error: 'No active store selected',
      code: 'STORE_SELECTION_REQUIRED'
    });
  }

  // Verify user still has access to this store
  const hasAccess = await userHasStoreAccess(userId, activeStoreId);
  if (!hasAccess) {
    // Clear invalid store from session
    req.session.activeStoreId = null;
    return res.status(403).json({ 
      error: 'Access to selected store has been revoked',
      code: 'STORE_ACCESS_REVOKED'
    });
  }

  req.activeStoreId = activeStoreId;
  next();
};

/**
 * Set active store in session and update user's last_store_id
 */
async function setActiveStore(req, storeId) {
  const userId = req.user?.userId || req.session?.userId;
  
  if (!userId || !storeId) {
    throw new Error('User ID and Store ID are required');
  }

  // Verify access
  const hasAccess = await userHasStoreAccess(userId, storeId);
  if (!hasAccess) {
    throw new Error('Access denied to this store');
  }

  // Update session
  if (req.session) {
    req.session.activeStoreId = storeId;
  }

  // Update user's last_store_id in database
  await query(
    'UPDATE users SET last_store_id = $1, updated_at = NOW() WHERE id = $2',
    [storeId, userId]
  );

  // Get store details
  const storeResult = await query(
    'SELECT id, name, code FROM stores WHERE id = $1',
    [storeId]
  );

  return storeResult.rows[0] || null;
}

module.exports = {
  userHasStoreAccess,
  getUserAccessibleStores,
  getUserStorePermissions,
  attachStoreContext,
  checkStoreAccess,
  requireSuperAdmin,
  requireStoreAdmin,
  validateActiveStore,
  setActiveStore
};
