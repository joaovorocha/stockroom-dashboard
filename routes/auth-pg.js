/**
 * Auth Routes - PostgreSQL Version
 * Complete replacement of auth.js using PostgreSQL database
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('../utils/dal/pg');
const { sendPasswordResetEmail, getAppBaseUrl: getAppBaseUrlFromMailer } = require('../utils/mailer');
const { compressUploadedImages } = require('../utils/image-compressor');

// Constants
const UPLOAD_DIR = path.join(__dirname, '../public/user-uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Avatar upload configuration
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `avatar-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

// ===================================
// HELPER FUNCTIONS
// ===================================

// Hash password with scrypt
function hashPassword(plain) {
  const password = (plain || '').toString();
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

// Verify password
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

  // Legacy plaintext fallback
  return storedStr === password;
}

// Check if request is secure (HTTPS)
function isRequestSecure(req) {
  if (req?.secure) return true;
  const xfProto = (req?.get?.('x-forwarded-proto') || '').toString().toLowerCase();
  const isSecure = xfProto.split(',')[0].trim() === 'https';
  return isSecure;
}

// Cookie options
function getUserSessionCookieOptions(req, { maxAge } = {}) {
  const secure = isRequestSecure(req);
  // Always use 'lax' for better compatibility - 'none' requires HTTPS everywhere
  return {
    httpOnly: true,
    path: '/',
    maxAge,
    sameSite: 'lax',
    secure
  };
}

// Normalize login ID
function normalizeLoginId(value) {
  return value ? value.toString().trim().toLowerCase() : '';
}

// SHA256 hash for tokens
function sha256Base64Url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

// Get app base URL (use mailer's version if available, otherwise use default)
function getAppBaseUrl() {
  return getAppBaseUrlFromMailer ? getAppBaseUrlFromMailer() : (process.env.APP_BASE_URL || 'https://stockroom.suitsd.com');
}

// ===================================
// DATABASE HELPERS
// ===================================

// Find user by login (employee_id, login_alias, or email)
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

// Create session
async function createSession(userId, req, maxAge) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (maxAge || 24 * 60 * 60 * 1000));

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

// Get user from session token
async function getUserFromSession(sessionToken) {
  if (!sessionToken) return null;

  const result = await query(`
    SELECT u.* 
    FROM user_sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.session_token = $1 
      AND s.expires_at > NOW() 
      AND u.is_active = true
    LIMIT 1
  `, [sessionToken]);

  return result.rows[0] || null;
}

// Log audit
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

// Format user for response
function formatUserResponse(user) {
  const needsProfileCompletion = !String(user.email || '').trim() || !String(user.phone || '').trim();
  
  return {
    userId: user.id,
    employeeId: user.employee_id,
    name: user.name,
    email: user.email || '',
    phone: user.phone || '',
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
}

// Get verified session user
async function getVerifiedSessionUser(req) {
  const sessionToken = req.cookies?.userSession;
  if (!sessionToken) return null;

  const user = await getUserFromSession(sessionToken);
  if (!user) return null;

  return formatUserResponse(user);
}

// ===================================
// ROUTES
// ===================================

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { employeeId, password, remember } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    console.log(`[LOGIN] Attempt for Employee ID: ${employeeId} from IP: ${clientIp}`);

    if (!employeeId || !password) {
      console.log(`[LOGIN] Failed: Missing credentials for ${employeeId}`);
      return res.status(400).json({ success: false, error: 'Employee ID and password are required' });
    }

    // Find user
    const user = await findUserByLogin(employeeId);
    if (!user) {
      console.log(`[LOGIN] Failed: User not found for Employee ID: ${employeeId}`);
      await query(`
        INSERT INTO user_audit_log (user_id, action, changes, ip_address)
        VALUES (NULL, $1, $2, $3)
      `, ['LOGIN_FAILED_USER_NOT_FOUND', JSON.stringify({ employeeId }), clientIp]);
      return res.status(401).json({ success: false, error: 'Invalid Employee ID or password' });
    }

    // Verify password
    if (!verifyPassword(password, user.password_hash)) {
      console.log(`[LOGIN] Failed: Invalid password for Employee ID: ${employeeId} (User: ${user.name})`);
      await query(`
        INSERT INTO user_audit_log (user_id, action, changes, ip_address)
        VALUES ($1, $2, $3, $4)
      `, [user.id, 'LOGIN_FAILED_BAD_PASSWORD', JSON.stringify({ employeeId }), clientIp]);
      return res.status(401).json({ success: false, error: 'Invalid Employee ID or password' });
    }

    console.log(`[LOGIN] Success: ${user.name} (${employeeId})`);

    // Check if first login
    const isFirstLogin = !user.last_login;

    // Force password change on first login or if flag is set
    const mustChangePassword = user.must_change_password || isFirstLogin;

    // Update last login
    await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    // Log audit
    await logUserAudit(user.id, 'LOGIN_SUCCESS', { role: user.role }, req);

    // Create session
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const sessionToken = await createSession(user.id, req, maxAge);

    // Set cookie
    const cookieOptions = getUserSessionCookieOptions(req, { maxAge });
    console.log('[LOGIN] Setting cookie with options:', { ...cookieOptions, token: sessionToken.substring(0, 20) + '...' });
    res.cookie('userSession', sessionToken, cookieOptions);

    // Return user data
    const userData = formatUserResponse(user);
    userData.mustChangePassword = mustChangePassword;

    console.log('[LOGIN] Responding with success for user:', user.name);
    return res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    const clientIp = req.ip || req.connection.remoteAddress;
    console.error('[LOGIN] Exception:', error);
    console.error('[LOGIN] Stack trace:', error.stack);
    
    // Log to database
    try {
      await query(`
        INSERT INTO user_audit_log (user_id, action, changes, ip_address)
        VALUES (NULL, $1, $2, $3)
      `, ['LOGIN_ERROR', JSON.stringify({ error: error.message, stack: error.stack }), clientIp]);
    } catch (logError) {
      console.error('[LOGIN] Failed to log error to database:', logError);
    }
    
    return res.status(500).json({ success: false, error: 'Server error during login. Please contact support.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies?.userSession;
    if (sessionToken) {
      // Get user before deleting session
      const user = await getUserFromSession(sessionToken);
      if (user) {
        await logUserAudit(user.id, 'LOGOUT', {}, req);
      }
      
      // Delete session
      await query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
    }

    res.clearCookie('userSession', getUserSessionCookieOptions(req));
    return res.json({ success: true });

  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('userSession', getUserSessionCookieOptions(req));
    return res.json({ success: true });
  }
});

// GET /api/auth/check - Check if user is authenticated
router.get('/check', async (req, res) => {
  try {
    const sessionToken = req.cookies?.userSession;
    if (!sessionToken) {
      console.log('[AUTH-CHECK] No session token found');
      return res.json({ authenticated: false });
    }

    const user = await getUserFromSession(sessionToken);
    if (!user) {
      console.log('[AUTH-CHECK] Session token invalid or expired:', sessionToken.substring(0, 20) + '...');
      res.clearCookie('userSession', getUserSessionCookieOptions(req));
      return res.json({ authenticated: false });
    }

    console.log(`[AUTH-CHECK] Valid session for user: ${user.name} (${user.employee_id})`);
    return res.json({
      authenticated: true,
      user: formatUserResponse(user)
    });

  } catch (error) {
    console.error('[AUTH-CHECK] Exception:', error);
    console.error('[AUTH-CHECK] Stack:', error.stack);
    res.clearCookie('userSession', getUserSessionCookieOptions(req));
    return res.json({ authenticated: false, error: error.message });
  }
});

// POST /api/auth/password-reset/request
router.post('/password-reset/request', async (req, res) => {
  const login = (req.body?.login || req.body?.employeeId || req.body?.email || '').toString().trim();
  
  if (!login) {
    return res.status(400).json({ success: false, error: 'Employee ID or email is required' });
  }

  try {
    const user = await findUserByLogin(login);

    // Don't leak whether the account exists
    if (!user) {
      return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
    }

    const email = (user.email || '').toString().trim();
    if (!email || !email.includes('@')) {
      return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
    }

    // Check for recent token
    const recentCheck = await query(`
      SELECT created_at 
      FROM password_reset_tokens 
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'
      ORDER BY created_at DESC 
      LIMIT 1
    `, [user.id]);

    if (recentCheck.rows.length > 0) {
      return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256Base64Url(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store token
    await query(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address)
      VALUES ($1, $2, $3, $4)
    `, [user.id, tokenHash, expiresAt, req.ip || req.connection?.remoteAddress]);

    // Send email
    await sendPasswordResetEmail({ to: email, name: user.name, token });
    
    // Log audit
    await logUserAudit(user.id, 'PASSWORD_RESET_REQUEST', { via: 'email' }, req);

    return res.json({ success: true, message: 'If that account exists, an email will be sent.' });

  } catch (error) {
    console.error('Password reset request error:', error);
    return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
  }
});

// POST /api/auth/password-reset/confirm
router.post('/password-reset/confirm', async (req, res) => {
  const token = (req.body?.token || '').toString().trim();
  const password = (req.body?.password || '').toString();
  const rememberDevice = !!req.body?.rememberDevice;
  const email = (req.body?.email || '').toString().trim();
  const phone = (req.body?.phone || '').toString().trim();

  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Token and new password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
  }

  try {
    const tokenHash = sha256Base64Url(token);

    // Find valid token
    const tokenResult = await query(`
      SELECT * FROM password_reset_tokens 
      WHERE token_hash = $1 
        AND used_at IS NULL 
        AND expires_at > NOW()
      LIMIT 1
    `, [tokenHash]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const tokenRecord = tokenResult.rows[0];

    // Get user
    const userResult = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [tokenRecord.user_id]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const user = userResult.rows[0];

    // Update user password
    const newHash = hashPassword(password);
    const updateQuery = `
      UPDATE users 
      SET password_hash = $1, 
          ${email ? 'email = $2,' : ''} 
          ${phone ? 'phone = $3,' : ''} 
          must_change_password = false, 
          updated_at = NOW() 
      WHERE id = $4
    `;
    const updateParams = [newHash];
    if (email) updateParams.push(email);
    if (phone) updateParams.push(phone);
    updateParams.push(user.id);
    
    await query(updateQuery, updateParams);

    // Mark token as used
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);

    // Update user object for response
    if (email) user.email = email;
    if (phone) user.phone = phone;

    // Log audit
    await logUserAudit(user.id, 'PASSWORD_RESET', { via: 'email' }, req);

    // Create session
    const maxAge = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const sessionToken = await createSession(user.id, req, maxAge);
    res.cookie('userSession', sessionToken, getUserSessionCookieOptions(req, { maxAge }));

    return res.json({ 
      success: true, 
      user: formatUserResponse(user),
      redirectTo: getAppBaseUrl() + '/home'
    });

  } catch (error) {
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ success: false, error: 'Server error during password reset' });
  }
});

// POST /api/auth/profile/complete
router.post('/profile/complete', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const email = (req.body?.email || '').toString().trim();
    const phone = (req.body?.phone || '').toString().trim();
    const password = (req.body?.password || '').toString();
    const rememberDevice = !!req.body?.rememberDevice;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone is required' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }

    const newHash = hashPassword(password);

    // Update user
    await query(`
      UPDATE users 
      SET email = $1, phone = $2, password_hash = $3, must_change_password = false, updated_at = NOW() 
      WHERE id = $4
    `, [email, phone, newHash, currentUser.userId]);

    // Log audit
    await logUserAudit(currentUser.userId, 'PROFILE_COMPLETED', {}, req);

    // Create new session
    const sessionToken = req.cookies?.userSession;
    await query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
    
    const maxAge = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const newSessionToken = await createSession(currentUser.userId, req, maxAge);
    res.cookie('userSession', newSessionToken, getUserSessionCookieOptions(req, { maxAge }));

    // Get updated user
    const userResult = await query('SELECT * FROM users WHERE id = $1', [currentUser.userId]);
    const updatedUser = formatUserResponse(userResult.rows[0]);

    return res.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error('Profile completion error:', error);
    return res.status(500).json({ success: false, error: 'Server error saving profile' });
  }
});

// POST /api/auth/switch - DEPRECATED (disabled for security)
router.post('/switch', async (req, res) => {
  const currentUser = await getVerifiedSessionUser(req);
  if (currentUser) {
    await logUserAudit(currentUser.userId, 'SWITCH_USER_DISABLED_LOGOUT', {}, req);
  }
  res.clearCookie('userSession', getUserSessionCookieOptions(req));
  return res.status(200).json({
    success: true,
    action: 'login',
    message: 'User switching is disabled. Please log in again.'
  });
});

// GET /api/auth/users - Get all users (managers/admins only)
router.get('/users', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const result = await query(`
      SELECT 
        id, employee_id, login_alias, name, email, phone, role, 
        image_url, is_manager, is_admin, can_edit_gameplan, 
        can_config_radio, can_manage_lost_punch,
        is_active, last_login, created_at
      FROM users 
      WHERE is_active = true 
      ORDER BY name
    `);

    const users = result.rows.map(u => ({
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
      canConfigRadio: u.can_config_radio,
      canManageLostPunch: u.can_manage_lost_punch,
      lastLogin: u.last_login,
      createdAt: u.created_at
    }));

    return res.json({ users });

  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users - Create new user (managers only)
router.post('/users', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const {
      employeeId,
      name,
      password,
      role,
      imageUrl,
      isManager,
      isAdmin,
      canEditGameplan,
      canConfigRadio,
      canManageLostPunch,
      email,
      phone,
      mustChangePassword
    } = req.body;

    if (!employeeId || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if employee ID already exists
    const existing = await findUserByLogin(employeeId);
    if (existing) {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }

    const passwordHash = hashPassword(password || '1234');

    // Get store_id (default to San Francisco for now)
    const storeResult = await query('SELECT id FROM stores WHERE code = $1 LIMIT 1', ['SF']);
    const storeId = storeResult.rows[0]?.id || 1;

    // Insert user
    const result = await query(`
      INSERT INTO users (
        store_id, employee_id, name, password_hash, role, 
        email, phone, image_url,
        is_manager, is_admin, can_edit_gameplan, can_config_radio, can_manage_lost_punch,
        must_change_password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      storeId,
      employeeId,
      name,
      passwordHash,
      role,
      email || '',
      phone || '',
      imageUrl || '',
      !!isManager,
      !!isAdmin,
      canEditGameplan !== undefined ? !!canEditGameplan : !!(isManager || isAdmin),
      !!canConfigRadio,
      !!canManageLostPunch,
      mustChangePassword !== undefined ? !!mustChangePassword : true
    ]);

    const newUser = result.rows[0];

    // Log audit
    await logUserAudit(currentUser.userId, 'USER_CREATED', {
      newUserId: newUser.id,
      newUserName: name
    }, req);

    return res.json({ 
      success: true, 
      user: {
        id: newUser.id,
        employeeId: newUser.employee_id,
        name: newUser.name,
        role: newUser.role,
        email: newUser.email,
        phone: newUser.phone,
        imageUrl: newUser.image_url,
        isManager: newUser.is_manager,
        isAdmin: newUser.is_admin,
        canEditGameplan: newUser.can_edit_gameplan,
        canConfigRadio: newUser.can_config_radio,
        canManageLostPunch: newUser.can_manage_lost_punch
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/users/:id - Update user (managers only)
router.put('/users/:id', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const { id } = req.params;
    const updates = req.body;

    // Get existing user
    const userResult = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check for employee ID collision
    if (updates.employeeId !== undefined) {
      const nextEmployeeId = String(updates.employeeId || '').trim();
      if (!nextEmployeeId) {
        return res.status(400).json({ error: 'Employee ID is required' });
      }

      const collision = await query(`
        SELECT id FROM users 
        WHERE id != $1 AND LOWER(employee_id) = $2 AND is_active = true
      `, [id, normalizeLoginId(nextEmployeeId)]);

      if (collision.rows.length > 0) {
        return res.status(400).json({ error: 'Employee ID already exists' });
      }
    }

    // Build update query
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = {
      employeeId: 'employee_id',
      name: 'name',
      role: 'role',
      email: 'email',
      phone: 'phone',
      imageUrl: 'image_url',
      isManager: 'is_manager',
      isAdmin: 'is_admin',
      canEditGameplan: 'can_edit_gameplan',
      canConfigRadio: 'can_config_radio',
      canManageLostPunch: 'can_manage_lost_punch',
      mustChangePassword: 'must_change_password'
    };

    for (const [jsField, dbField] of Object.entries(allowedFields)) {
      if (updates[jsField] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(updates[jsField]);
      }
    }

    // Handle password separately
    if (updates.password !== undefined) {
      setClauses.push(`password_hash = $${paramIndex++}`);
      params.push(hashPassword(updates.password));
      
      // If user has never logged in, force password change unless explicitly overridden
      if (!user.last_login && updates.mustChangePassword === undefined) {
        setClauses.push(`must_change_password = true`);
      }
    }

    if (setClauses.length === 0) {
      return res.json({ success: true });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    await query(`
      UPDATE users 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `, params);

    // Log audit
    await logUserAudit(currentUser.userId, 'USER_UPDATED', {
      updatedUserId: id,
      fields: Object.keys(updates)
    }, req);

    return res.json({ success: true });

  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/users/:id - Delete user (admin only)
router.delete('/users/:id', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { id } = req.params;

    // Get user before deleting
    const userResult = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = userResult.rows[0];

    // Soft delete (set is_active = false)
    await query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

    // Delete all sessions for this user
    await query('DELETE FROM user_sessions WHERE user_id = $1', [id]);

    // Log audit
    await logUserAudit(currentUser.userId, 'USER_DELETED', {
      deletedUserId: id,
      deletedUserName: deletedUser.name
    }, req);

    return res.json({ success: true });

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users/:id/photo - Upload user avatar (managers only)
router.post('/users/:id/photo', 
  (req, res, next) => {
    avatarUpload.single('photo')(req, res, (err) => {
      if (!err) return next();
      const message = err?.message || 'Upload failed';
      return res.status(400).json({ error: message });
    });
  }, 
  compressUploadedImages({ maxWidth: 800, maxHeight: 800, quality: 85 }), 
  async (req, res) => {
    try {
      const currentUser = await getVerifiedSessionUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      if (!currentUser.isManager && !currentUser.isAdmin) {
        return res.status(403).json({ error: 'Access denied. Managers only.' });
      }

      const { id } = req.params;

      // Check user exists
      const userResult = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No photo uploaded' });
      }

      const imageUrl = `/user-uploads/${req.file.filename}`;

      // Update user image
      await query('UPDATE users SET image_url = $1, updated_at = NOW() WHERE id = $2', [imageUrl, id]);

      // Log audit
      await logUserAudit(currentUser.userId, 'USER_PHOTO_UPDATED', {
        updatedUserId: id,
        filename: req.file.filename
      }, req);

      return res.json({ success: true, imageUrl });

    } catch (error) {
      console.error('Error uploading user photo:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// GET /api/auth/activity - Get activity log (managers only)
router.get('/activity', async (req, res) => {
  try {
    const currentUser = await getVerifiedSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const limit = parseInt(req.query.limit) || 100;

    const result = await query(`
      SELECT 
        a.id, a.user_id, a.action, a.changes, a.ip_address, a.created_at,
        u.name as user_name, u.employee_id
      FROM user_audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT $1
    `, [limit]);

    const logs = result.rows.map(log => ({
      id: log.id,
      userId: log.user_id,
      userName: log.user_name,
      employeeId: log.employee_id,
      action: log.action,
      changes: log.changes,
      ipAddress: log.ip_address,
      createdAt: log.created_at
    }));

    return res.json({ logs });

  } catch (error) {
    console.error('Get activity log error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
