/**
 * Auth Middleware - PostgreSQL Version
 * Validates session tokens from PostgreSQL user_sessions table
 */

const { query } = require('../utils/dal/pg');

const authMiddleware = async (req, res, next) => {
  const xfProto = (req.get('x-forwarded-proto') || '').toString().toLowerCase();
  const isSecure = !!req.secure || xfProto.split(',')[0].trim() === 'https';
  const clearCookieOptions = { path: '/', sameSite: 'lax', secure: false };

  const originalUrl = req.originalUrl || req.url || '';
  const baseUrl = req.baseUrl || '';
  const isApiRequest = originalUrl.startsWith('/api/') || baseUrl.startsWith('/api/');

  // Check if user has a valid session cookie
  const sessionToken = req.cookies?.userSession;

  if (!sessionToken) {
    // No session found - redirect to login
    console.log(`[AUTH-MIDDLEWARE] No session token for ${req.method} ${originalUrl}`);
    console.log(`[AUTH-MIDDLEWARE] All cookies:`, req.cookies);
    console.log(`[AUTH-MIDDLEWARE] Cookie header:`, req.get('cookie'));
    if (isApiRequest) {
      return res.status(401).json({ error: 'Not authenticated' });
    } else {
      return res.redirect('/login');
    }
  }

  try {
    // Validate session token in PostgreSQL
    const result = await query(`
      SELECT 
        u.id, u.employee_id, u.name, u.email, u.role, 
        u.image_url, u.is_manager, u.is_admin, u.can_edit_gameplan,
        u.can_config_radio, u.can_manage_lost_punch, u.must_change_password
      FROM user_sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.session_token = $1 
        AND s.expires_at > NOW() 
        AND u.is_active = true
      LIMIT 1
    `, [sessionToken]);

    if (result.rows.length === 0) {
      // Invalid or expired session
      console.log(`[AUTH-MIDDLEWARE] Invalid/expired session for ${req.method} ${originalUrl}`);
      res.clearCookie('userSession', clearCookieOptions);
      if (isApiRequest) {
        return res.status(401).json({ error: 'Session expired' });
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
    console.error(`[AUTH-MIDDLEWARE] Error for ${req.method} ${originalUrl}:`, error.message);
    res.clearCookie('userSession', clearCookieOptions);
    if (isApiRequest) {
      return res.status(500).json({ error: 'Authentication error' });
    }
    return res.redirect('/login');
  }
};

module.exports = authMiddleware;
