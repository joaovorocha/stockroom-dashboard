/**
 * Auth Middleware - Redis Session Version
 * SECURITY PATCH: CRITICAL-01 from SYSTEM_AUDIT_REPORT.md
 * 
 * Validates sessions from Redis store instead of PostgreSQL
 * Benefits:
 * - Faster session lookups (in-memory)
 * - Automatic expiration handling
 * - Reduced database load
 * - Industry standard architecture
 */

const { query } = require('../utils/dal/pg');

const authMiddleware = async (req, res, next) => {
  const xfProto = (req.get('x-forwarded-proto') || '').toString().toLowerCase();
  const isSecure = !!req.secure || xfProto.split(',')[0].trim() === 'https';
  const clearCookieOptions = { path: '/', sameSite: 'lax', secure: isSecure };

  const originalUrl = req.originalUrl || req.url || '';
  const baseUrl = req.baseUrl || '';
  const isApiRequest = originalUrl.startsWith('/api/') || baseUrl.startsWith('/api/');

  // Check if user has a valid Redis session
  if (!req.session || !req.session.userId) {
    // No session found - check for dev bypass
    if (process.env.DEV_AUTH_BYPASS === 'true') {
      const devEmail = process.env.DEV_AUTH_USER_EMAIL || req.get('x-dev-user');
      if (devEmail) {
        try {
          const r = await query('SELECT id, employee_id, name, email, role, image_url, is_manager, is_admin, can_edit_gameplan, can_config_radio, can_manage_lost_punch, must_change_password FROM users WHERE email = $1 LIMIT 1', [devEmail]);
          if (r.rows && r.rows.length > 0) {
            const user = r.rows[0];
            req.user = {
              userId: user.id,
              id: user.id,
              employeeId: user.employee_id,
              name: user.name,
              email: user.email || '',
              role: user.role,
              imageUrl: user.image_url,
              isManager: user.is_manager,
              isAdmin: user.is_admin,
              canEditGameplan: user.can_edit_gameplan,
              canConfigRadio: user.can_config_radio,
              canManageLostPunch: user.can_manage_lost_punch,
              needsProfileCompletion: !String(user.email || '').trim(),
              mustChangePassword: user.must_change_password
            };
            return next();
          }
        } catch (err) {
          console.error('[AUTH-MIDDLEWARE] DEV_AUTH_BYPASS lookup error:', err.message);
        }
      }
    }

    if (isApiRequest) {
      return res.status(401).json({ error: 'Not authenticated' });
    } else {
      return res.redirect('/login');
    }
  }

  try {
    const userId = req.session.userId;

    // Check if session is expired (Redis handles TTL but double-check)
    if (req.session.expiresAt && req.session.expiresAt < Date.now()) {
      req.session.destroy();
      if (isApiRequest) {
        return res.status(401).json({ error: 'Session expired' });
      }
      return res.redirect('/login');
    }

    // Get user from PostgreSQL database
    const result = await query(`
      SELECT 
        id, employee_id, name, email, role, 
        image_url, is_manager, is_admin, can_edit_gameplan,
        can_config_radio, can_manage_lost_punch, must_change_password
      FROM users 
      WHERE id = $1 AND is_active = true
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      // User not found or inactive - destroy session
      req.session.destroy();
      if (isApiRequest) {
        return res.status(401).json({ error: 'User not found' });
      }
      return res.redirect('/login');
    }

    const user = result.rows[0];

    // Attach normalized user data to request
    const needsProfileCompletion = !String(user.email || '').trim();

    req.user = {
      userId: user.id,
      id: user.id,
      employeeId: user.employee_id,
      name: user.name,
      email: user.email || '',
      role: user.role,
      imageUrl: user.image_url,
      isManager: user.is_manager,
      isAdmin: user.is_admin,
      canEditGameplan: user.can_edit_gameplan,
      canConfigRadio: user.can_config_radio,
      canManageLostPunch: user.can_manage_lost_punch,
      needsProfileCompletion,
      mustChangePassword: user.must_change_password
    };

    next();

  } catch (error) {
    console.error('[AUTH-MIDDLEWARE] Error:', error);
    if (req.session) {
      req.session.destroy();
    }
    if (isApiRequest) {
      return res.status(500).json({ error: 'Authentication error' });
    }
    return res.redirect('/login');
  }
};

module.exports = authMiddleware;
