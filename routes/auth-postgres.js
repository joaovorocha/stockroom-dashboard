/**
 * Auth Routes - PostgreSQL Version
 * Updated to use PostgreSQL instead of users.json
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, getClient } = require('../utils/dal/pg');

// Helper: Hash password with scrypt
function hashPassword(plain) {
  const password = (plain || '').toString();
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

// Helper: Verify password
function verifyPassword(plain, stored) {
  const password = (plain || '').toString();
  const storedStr = (stored || '').toString();
  if (!storedStr) return false;

  if (storedStr.startsWith('scrypt$')) {
    const parts = storedStr.split('$');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, derived);
  }

  // Legacy plaintext (should not exist after migration)
  return storedStr === password;
}

// Helper: Cookie options
function isRequestSecure(req) {
  if (req?.secure) return true;
  const xfProto = (req?.get?.('x-forwarded-proto') || '').toString().toLowerCase();
  return xfProto.split(',')[0].trim() === 'https';
}

function getUserSessionCookieOptions(req, { maxAge } = {}) {
  const secure = isRequestSecure(req);
  return {
    httpOnly: true,
    path: '/',
    maxAge,
    sameSite: secure ? 'none' : 'lax',
    secure
  };
}

// Helper: Normalize login ID
function normalizeLoginId(value) {
  return value ? value.toString().trim().toLowerCase() : '';
}

// Helper: Find user by login (employee_id, login_alias, or email)
async function findUserByLogin(loginValue) {
  const target = normalizeLoginId(loginValue);
  if (!target) return null;

  const result = await query(`
    SELECT * FROM users 
    WHERE is_active = true AND (
      LOWER(employee_id) = $1 OR 
      LOWER(login_alias) = $1 OR 
      LOWER(email) = $1
    )
    LIMIT 1
  `, [target]);

  return result.rows[0] || null;
}

// Helper: Create session
async function createSession(userId, req) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await query(`
    INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    userId,
    sessionToken,
    req.ip || req.connection?.remoteAddress,
    req.get('user-agent'),
    expiresAt
  ]);

  return sessionToken;
}

// Helper: Log audit
async function logUserAudit(userId, action, changes = {}, req) {
  await query(`
    INSERT INTO user_audit_log (user_id, action, changes, ip_address)
    VALUES ($1, $2, $3, $4)
  `, [
    userId,
    action,
    JSON.stringify(changes),
    req.ip || req.connection?.remoteAddress
  ]);
}

// ======================
// LOGIN
// ======================
router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Login ID and password are required' });
    }

    // Find user
    const user = await findUserByLogin(loginId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    // Log audit
    await logUserAudit(user.id, 'login', { method: 'password' }, req);

    // Create session
    const sessionToken = await createSession(user.id, req);

    // Set cookie
    res.cookie('userSession', sessionToken, getUserSessionCookieOptions(req, { maxAge: 30 * 24 * 60 * 60 * 1000 }));

    // Return user data
    return res.json({
      success: true,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        imageUrl: user.image_url,
        isManager: user.is_manager,
        isAdmin: user.is_admin,
        canEditGameplan: user.can_edit_gameplan,
        mustChangePassword: user.must_change_password
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ======================
// LOGOUT
// ======================
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies?.userSession;
    if (sessionToken) {
      // Delete session from database
      await query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
    }

    res.clearCookie('userSession', getUserSessionCookieOptions(req));
    return res.json({ success: true });

  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// ======================
// GET CURRENT USER
// ======================
router.get('/me', async (req, res) => {
  try {
    const sessionToken = req.cookies?.userSession;
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Find session
    const sessionResult = await query(`
      SELECT u.* 
      FROM user_sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.session_token = $1 AND s.expires_at > NOW() AND u.is_active = true
      LIMIT 1
    `, [sessionToken]);

    const user = sessionResult.rows[0];
    if (!user) {
      res.clearCookie('userSession', getUserSessionCookieOptions(req));
      return res.status(401).json({ error: 'Session expired' });
    }

    return res.json({
      id: user.id,
      employeeId: user.employee_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      imageUrl: user.image_url,
      isManager: user.is_manager,
      isAdmin: user.is_admin,
      canEditGameplan: user.can_edit_gameplan,
      mustChangePassword: user.must_change_password
    });

  } catch (err) {
    console.error('Get current user error:', err);
    return res.status(500).json({ error: 'Failed to get user' });
  }
});

// ======================
// CHANGE PASSWORD
// ======================
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const sessionToken = req.cookies?.userSession;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    // Get user from session
    const sessionResult = await query(`
      SELECT u.* 
      FROM user_sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.session_token = $1 AND s.expires_at > NOW()
      LIMIT 1
    `, [sessionToken]);

    const user = sessionResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Verify current password
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newHash = hashPassword(newPassword);

    // Update password
    await query(`
      UPDATE users 
      SET password_hash = $1, must_change_password = false, updated_at = NOW() 
      WHERE id = $2
    `, [newHash, user.id]);

    // Log audit
    await logUserAudit(user.id, 'password_changed', { forced: false }, req);

    return res.json({ success: true, message: 'Password changed successfully' });

  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

// ======================
// LIST USERS (admin only)
// ======================
router.get('/users', async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await query(`
      SELECT 
        id, employee_id, login_alias, name, email, phone, role, 
        image_url, is_manager, is_admin, can_edit_gameplan, 
        is_active, last_login, created_at
      FROM users 
      WHERE is_active = true 
      ORDER BY name
    `);

    return res.json({
      users: result.rows.map(u => ({
        id: u.id,
        employeeId: u.employee_id,
        loginAlias: u.login_alias,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        imageUrl: u.image_url,
        isManager: u.is_manager,
        isAdmin: u.is_admin,
        canEditGameplan: u.can_edit_gameplan,
        lastLogin: u.last_login,
        createdAt: u.created_at
      }))
    });

  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

module.exports = router;
