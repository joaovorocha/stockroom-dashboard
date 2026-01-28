/**
 * Audit Logging Middleware
 * Phase 5: Testing & Security
 * 
 * Logs admin actions for compliance and debugging
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'suit'
});

// Actions that should be logged
const LOGGED_ACTIONS = [
  // Super Admin actions
  'CREATE_STORE',
  'UPDATE_STORE',
  'DELETE_STORE',
  'CREATE_USER',
  'UPDATE_USER',
  'DELETE_USER',
  'GRANT_STORE_ACCESS',
  'REVOKE_STORE_ACCESS',
  'UPDATE_GLOBAL_SETTING',
  // Store Admin actions
  'UPDATE_STORE_SETTING',
  'UPDATE_TEAM_MEMBER_ROLE',
  'REMOVE_TEAM_MEMBER',
  'INVITE_TEAM_MEMBER',
  // Auth actions
  'LOGIN',
  'LOGOUT',
  'SWITCH_STORE',
  'LOGIN_FAILED'
];

/**
 * Log an admin action to the database
 */
async function logAction(action, userId, storeId, details = {}, req = null) {
  try {
    // Get IP and user agent if request is provided
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null) : null;
    const userAgent = req ? req.headers['user-agent'] : null;
    
    await pool.query(`
      INSERT INTO admin_audit_log 
        (action, user_id, store_id, details, ip_address, user_agent, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      action,
      userId,
      storeId,
      JSON.stringify(details),
      ipAddress,
      userAgent
    ]);
    
    return true;
  } catch (error) {
    console.error('Audit log error:', error.message);
    // Don't throw - audit logging shouldn't break the app
    return false;
  }
}

/**
 * Middleware to auto-log certain route actions
 */
function auditMiddleware(action) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json to log after response
    res.json = async function(data) {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300 && data.success !== false) {
        const userId = req.session?.userId || req.user?.id || null;
        const storeId = req.params?.storeId || req.body?.store_id || req.session?.activeStoreId || null;
        
        // Build details object
        const details = {
          method: req.method,
          path: req.path,
          params: req.params,
          // Don't log sensitive data
          body: sanitizeBody(req.body)
        };
        
        await logAction(action, userId, storeId, details, req);
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Remove sensitive fields from body before logging
 */
function sanitizeBody(body) {
  if (!body) return {};
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'api_key'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Get audit logs with filtering
 */
async function getAuditLogs(options = {}) {
  const {
    userId = null,
    storeId = null,
    action = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  } = options;
  
  let query = `
    SELECT 
      al.*,
      u.name as user_name,
      u.email as user_email,
      s.name as store_name
    FROM admin_audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    LEFT JOIN stores s ON al.store_id = s.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (userId) {
    query += ` AND al.user_id = $${paramIndex++}`;
    params.push(userId);
  }
  
  if (storeId) {
    query += ` AND al.store_id = $${paramIndex++}`;
    params.push(storeId);
  }
  
  if (action) {
    query += ` AND al.action = $${paramIndex++}`;
    params.push(action);
  }
  
  if (startDate) {
    query += ` AND al.created_at >= $${paramIndex++}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND al.created_at <= $${paramIndex++}`;
    params.push(endDate);
  }
  
  query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = {
  logAction,
  auditMiddleware,
  getAuditLogs,
  LOGGED_ACTIONS
};
