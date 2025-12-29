const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const dal = require('../utils/dal');
const { sendPasswordResetEmail, getAppBaseUrl } = require('../utils/mailer');

const DATA_DIR = dal.paths.dataDir;
const USERS_FILE = dal.paths.usersFile;
const EMPLOYEES_FILE = dal.paths.employeesFile;
const ACTIVITY_LOG_FILE = dal.paths.activityLogFile;
const USER_UPLOADS_DIR = dal.paths.userUploadsDir;
const PASSWORD_RESET_TOKENS_FILE = path.join(DATA_DIR, 'password-reset-tokens.json');

// Avatar upload (stored locally, served via /user-uploads/* with auth)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    dal.ensureDir(USER_UPLOADS_DIR);
    cb(null, USER_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const userId = (req.params.id || 'user').toString().replace(/[^a-zA-Z0-9-_]/g, '');
    cb(null, `${userId}_${Date.now()}${safeExt}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Helper functions
function readJsonFile(filePath, defaultValue = {}) {
  return dal.readJson(filePath, defaultValue);
}

function writeJsonFile(filePath, data) {
  dal.writeJsonAtomic(filePath, data, { pretty: true });
}

function hashPassword(plain) {
  const password = (plain || '').toString();
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

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

  // LEGACY SUPPORT: plaintext passwords for old users
  return storedStr === password;
}

function isHashedPassword(value) {
  return (value || '').toString().startsWith('scrypt$');
}

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
    // Builder.io (iframe) requires SameSite=None + Secure; fall back to Lax for plain HTTP local dev.
    sameSite: secure ? 'none' : 'lax',
    secure
  };
}

function normalizeUserDefaults(user) {
  if (!user) return { changed: false };
  let changed = false;

  if (user.email === undefined) { user.email = ''; changed = true; }
  if (user.phone === undefined) { user.phone = ''; changed = true; }
  if (user.canEditGameplan === undefined) { user.canEditGameplan = false; changed = true; }
  if (user.canConfigRadio === undefined) { user.canConfigRadio = false; changed = true; }
  if (user.canManageLostPunch === undefined) { user.canManageLostPunch = false; changed = true; }
  if (user.mustChangePassword === undefined) { user.mustChangePassword = false; changed = true; }
  if (user.lastLogin === undefined) { user.lastLogin = null; changed = true; }

  // If a user has never logged in and password is empty, default to 1234 (hashed) and force change.
  if (!user.lastLogin && !String(user.password || '').trim()) {
    user.password = hashPassword('1234');
    user.mustChangePassword = true;
    changed = true;
  }

  return { changed };
}

function normalizeUsersData(usersData) {
  const users = Array.isArray(usersData?.users) ? usersData.users : [];
  let changed = false;
  for (const u of users) {
    if (normalizeUserDefaults(u).changed) changed = true;
  }
  return { changed };
}

function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('base64url');
}

function pruneResetTokens(tokens, nowMs) {
  const cutoff = nowMs - 7 * 24 * 60 * 60 * 1000; // keep 7 days of used tokens
  return (Array.isArray(tokens) ? tokens : []).filter(t => {
    const createdAt = Date.parse(t?.createdAt || '');
    const expiresAt = Date.parse(t?.expiresAt || '');
    const usedAt = Date.parse(t?.usedAt || '');

    if (Number.isFinite(expiresAt) && expiresAt > nowMs) return true;
    if (Number.isFinite(usedAt) && usedAt > cutoff) return true;
    if (Number.isFinite(createdAt) && createdAt > cutoff) return true;
    return false;
  });
}

// Sync user to employees-v2.json
function syncUserToEmployees(user) {
  const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });
  const roleToType = {
    'SA': 'SA',
    'BOH': 'BOH',
    'MANAGEMENT': 'MANAGEMENT',
    'TAILOR': 'TAILOR',
    'ADMIN': 'MANAGEMENT' // Admins show in management section
  };

  const targetType = roleToType[user.role] || 'SA';

  // Find and remove employee from any existing type
  let existingEmployee = null;
  for (const type of Object.keys(employees.employees)) {
    const index = employees.employees[type].findIndex(e =>
      e.name === user.name || e.employeeId === user.employeeId
    );
    if (index >= 0) {
      existingEmployee = employees.employees[type].splice(index, 1)[0];
      break;
    }
  }

  // Prepare employee data
  const employeeData = {
    id: existingEmployee?.id || `${targetType.toLowerCase()}-${Date.now()}`,
    name: user.name,
    type: targetType,
    imageUrl: user.imageUrl || '',
    employeeId: user.employeeId,
    ...(existingEmployee || {}) // Preserve existing metrics and assignments
  };

  // Update type in case it changed
  employeeData.type = targetType;
  employeeData.name = user.name;
  employeeData.imageUrl = user.imageUrl || employeeData.imageUrl || '';

  // Add type-specific defaults
  if (targetType === 'SA') {
    employeeData.zone = employeeData.zone || '';
    employeeData.fittingRoom = employeeData.fittingRoom || '';
    employeeData.individualTarget = employeeData.individualTarget || 0;
    employeeData.scheduledLunch = employeeData.scheduledLunch || '';
    employeeData.closingSections = employeeData.closingSections || [];
    employeeData.metrics = employeeData.metrics || {};
  } else if (targetType === 'BOH') {
    employeeData.shift = employeeData.shift || '';
    employeeData.lunch = employeeData.lunch || '';
    employeeData.taskOfTheDay = employeeData.taskOfTheDay || '';
    employeeData.metrics = employeeData.metrics || {};
  } else if (targetType === 'MANAGEMENT') {
    employeeData.zone = employeeData.zone || '';
    employeeData.shift = employeeData.shift || '';
    employeeData.role = employeeData.role || '';
    employeeData.lunch = employeeData.lunch || '';
  } else if (targetType === 'TAILOR') {
    employeeData.station = employeeData.station || '';
    employeeData.lunch = employeeData.lunch || '';
    employeeData.productivity = employeeData.productivity || 0;
  }

  // Ensure target type array exists
  if (!employees.employees[targetType]) {
    employees.employees[targetType] = [];
  }

  // Add employee to target type
  employees.employees[targetType].push(employeeData);

  employees.lastUpdated = dal.getBusinessDate();
  writeJsonFile(EMPLOYEES_FILE, employees);
}

function logActivity(action, userId, userName, details = {}) {
  const logs = readJsonFile(ACTIVITY_LOG_FILE, { logs: [] });
  logs.logs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    userId,
    userName,
    details,
    ip: '' // Would be filled from request
  });
  // Keep only last 1000 entries
  logs.logs = logs.logs.slice(0, 1000);
  writeJsonFile(ACTIVITY_LOG_FILE, logs);
}

function normalizeLoginId(value) {
  return value ? value.toString().trim().toLowerCase() : '';
}

function findUserByLogin(users, loginValue) {
  const target = normalizeLoginId(loginValue);
  if (!target) return null;

  return users.find(user => {
    const loginCandidates = [user.employeeId, user.loginAlias, user.email];
    return loginCandidates.some(candidate => normalizeLoginId(candidate) === target);
  }) || null;
}

function getVerifiedSessionUser(req) {
  const userSession = req.cookies.userSession;
  if (!userSession) return null;

  try {
    const session = JSON.parse(userSession);
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const currentUser = usersData.users.find(u => u.employeeId === session.employeeId || u.id === session.userId);
    if (!currentUser) return null;

    return {
      userId: currentUser.id,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      role: currentUser.role,
      imageUrl: currentUser.imageUrl,
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      isAdmin: !!currentUser.isAdmin,
      isManager: !!(currentUser.isManager || currentUser.isAdmin),
      canEditGameplan: !!(
        currentUser.canEditGameplan ||
        currentUser.isManager ||
        currentUser.isAdmin
      ),
      canConfigRadio: !!(currentUser.canConfigRadio || currentUser.isManager || currentUser.isAdmin),
      canManageLostPunch: !!(currentUser.canManageLostPunch || currentUser.isManager || currentUser.isAdmin)
    };
  } catch (_) {
    return null;
  }
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { employeeId, password, remember } = req.body;

  if (!employeeId || !password) {
    return res.status(400).json({ success: false, error: 'Employee ID and password are required' });
  }

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    // LEGACY SUPPORT: Ensure legacy users are normalized (role flags + missing fields).
    const normalized = normalizeUsersData(usersData);
    const user = findUserByLogin(usersData.users, employeeId);

    const isFirstLogin = !user?.lastLogin;

    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ success: false, error: 'Invalid Employee ID or password' });
    }

    // Opportunistic upgrade: if the password is still stored as plaintext, hash it after a successful login.
    if (user && user.password && !isHashedPassword(user.password)) {
      user.password = hashPassword(password);
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    if (normalized.changed) usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);

    const needsProfileCompletion = !String(user.email || '').trim() || !String(user.phone || '').trim();
    // Force password change on first login (especially when initial password is 1234).
    const mustChangePassword = !!user.mustChangePassword || isFirstLogin;

    // Create session data
    const sessionData = {
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      imageUrl: user.imageUrl,
      email: user.email || '',
      phone: user.phone || '',
      isAdmin: !!user.isAdmin,
      // Treat management and admins as managers even if the flag is missing
      isManager: !!(user.isManager || user.isAdmin),
      canEditGameplan: !!(user.canEditGameplan || user.isManager || user.isAdmin),
      canConfigRadio: !!(user.canConfigRadio || user.isManager || user.isAdmin),
      canManageLostPunch: !!(user.canManageLostPunch || user.isManager || user.isAdmin),
      needsProfileCompletion,
      mustChangePassword
    };

    // Set cookie
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
    res.cookie('userSession', JSON.stringify(sessionData), getUserSessionCookieOptions(req, { maxAge }));

    logActivity('LOGIN_SUCCESS', user.id, user.name, { role: user.role });

    return res.json({
      success: true,
      user: sessionData
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

// POST /api/auth/password-reset/request
// Body: { login: string } (employeeId/email)
router.post('/password-reset/request', async (req, res) => {
  const login = (req.body?.login || req.body?.employeeId || req.body?.email || '').toString().trim();
  if (!login) {
    return res.status(400).json({ success: false, error: 'Employee ID or email is required' });
  }

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const user = findUserByLogin(usersData.users, login);

    // Don't leak whether the account exists.
    if (!user) {
      return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
    }

    const email = (user.email || '').toString().trim();
    if (!email || !email.includes('@')) {
      return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
    }

    const now = Date.now();
    const tokensData = readJsonFile(PASSWORD_RESET_TOKENS_FILE, { tokens: [] });
    const tokens = pruneResetTokens(tokensData.tokens, now);

    const lastForUser = tokens
      .filter(t => t?.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0];

    if (lastForUser) {
      const lastCreated = Date.parse(lastForUser.createdAt || '');
      if (Number.isFinite(lastCreated) && now - lastCreated < 60 * 1000) {
        return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
      }
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString(); // 30 minutes

    tokens.unshift({
      id: `prt-${now}-${crypto.randomBytes(4).toString('hex')}`,
      userId: user.id,
      tokenHash: sha256Base64Url(token),
      createdAt: new Date(now).toISOString(),
      expiresAt,
      usedAt: null,
      ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString()
    });

    tokensData.tokens = tokens.slice(0, 2000);
    writeJsonFile(PASSWORD_RESET_TOKENS_FILE, tokensData);

    await sendPasswordResetEmail({ to: email, name: user.name, token });
    logActivity('PASSWORD_RESET_REQUEST', user.id, user.name, { via: 'email' });

    return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.json({ success: true, message: 'If that account exists, an email will be sent.' });
  }
});

// POST /api/auth/password-reset/confirm
// Body: { token, password, rememberDevice?, email?, phone? }
router.post('/password-reset/confirm', (req, res) => {
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
    const now = Date.now();
    const tokenHash = sha256Base64Url(token);

    const tokensData = readJsonFile(PASSWORD_RESET_TOKENS_FILE, { tokens: [] });
    const tokens = pruneResetTokens(tokensData.tokens, now);
    const tokenRecord = tokens.find(t => t?.tokenHash === tokenHash && !t?.usedAt);
    if (!tokenRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const expiresAtMs = Date.parse(tokenRecord.expiresAt || '');
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const user = usersData.users.find(u => u.id === tokenRecord.userId);
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    user.password = hashPassword(password);
    if (email) user.email = email;
    if (phone) user.phone = phone;
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();

    tokenRecord.usedAt = new Date(now).toISOString();
    tokensData.tokens = tokens;

    writeJsonFile(USERS_FILE, usersData);
    writeJsonFile(PASSWORD_RESET_TOKENS_FILE, tokensData);

    // Create session data + cookie (optional "remember this device").
    const sessionData = {
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      imageUrl: user.imageUrl,
      email: user.email || '',
      phone: user.phone || '',
      isAdmin: !!user.isAdmin,
      isManager: !!(user.isManager || user.isAdmin || user.role === 'MANAGEMENT'),
      canEditGameplan: !!(user.canEditGameplan || user.isManager || user.isAdmin || user.role === 'MANAGEMENT'),
      needsProfileCompletion: !String(user.email || '').trim() || !String(user.phone || '').trim(),
      mustChangePassword: false
    };

    const maxAge = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    res.cookie('userSession', JSON.stringify(sessionData), getUserSessionCookieOptions(req, { maxAge }));

    logActivity('PASSWORD_RESET', user.id, user.name, { via: 'email' });
    return res.json({ success: true, user: sessionData, redirectTo: getAppBaseUrl() + '/home' });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ success: false, error: 'Server error during password reset' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const userSession = req.cookies.userSession;
  if (userSession) {
    try {
      const userData = JSON.parse(userSession);
      logActivity('LOGOUT', userData.userId, userData.name, {});
    } catch (e) {}
  }
  res.clearCookie('userSession', getUserSessionCookieOptions(req));
  return res.json({ success: true });
});

// GET /api/auth/check - Check if user is authenticated
router.get('/check', (req, res) => {
  const userSession = req.cookies.userSession;

  if (!userSession) {
    return res.json({ authenticated: false });
  }

  try {
    const session = JSON.parse(userSession);
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const currentUser = usersData.users.find(u => u.employeeId === session.employeeId || u.id === session.userId);
    if (!currentUser) {
      res.clearCookie('userSession', getUserSessionCookieOptions(req));
      return res.json({ authenticated: false });
    }

    const userData = {
      userId: currentUser.id,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      role: currentUser.role,
      imageUrl: currentUser.imageUrl,
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      isAdmin: !!currentUser.isAdmin,
      isManager: !!(currentUser.isManager || currentUser.isAdmin),
      canEditGameplan: !!(currentUser.canEditGameplan || currentUser.isManager || currentUser.isAdmin),
      canConfigRadio: !!(currentUser.canConfigRadio || currentUser.isManager || currentUser.isAdmin),
      canManageLostPunch: !!(currentUser.canManageLostPunch || currentUser.isManager || currentUser.isAdmin),
      needsProfileCompletion: !String(currentUser.email || '').trim() || !String(currentUser.phone || '').trim(),
      mustChangePassword: !!currentUser.mustChangePassword
    };
    return res.json({
      authenticated: true,
      user: userData
    });
  } catch (error) {
    res.clearCookie('userSession', getUserSessionCookieOptions(req));
    return res.json({ authenticated: false });
  }
});

// POST /api/auth/switch - DEPRECATED/disabled (was an insecure user-impersonation endpoint)
router.post('/switch', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (currentUser) {
    logActivity('SWITCH_USER_DISABLED_LOGOUT', currentUser.userId, currentUser.name, {});
  }
  res.clearCookie('userSession', getUserSessionCookieOptions(req));
  return res.status(200).json({
    success: true,
    action: 'login',
    message: 'User switching is disabled. Please log in again.'
  });
});

// GET /api/auth/users - Get all users (managers/admins only)
router.get('/users', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isManager && !currentUser.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }

  const usersData = readJsonFile(USERS_FILE, { users: [] });
  const normalized = normalizeUsersData(usersData);
  if (normalized.changed) {
    usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);
  }
  // Remove passwords from response
  const users = usersData.users.map(u => ({ ...u, password: undefined }));
  return res.json({ users });
});

// POST /api/auth/users - Create new user (managers only)
router.post('/users', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isManager && !currentUser.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }

  try {
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

    const usersData = readJsonFile(USERS_FILE, { users: [] });

    // Check if employee ID already exists
    if (usersData.users.find(u => u.employeeId === employeeId)) {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }

    const newUser = {
      id: `user-${Date.now()}`,
      employeeId,
      name,
      password: hashPassword(password || '1234'),
      role,
      imageUrl: imageUrl || '',
      email: email || '',
      phone: phone || '',
      isManager: isManager || false,
      isAdmin: isAdmin || false,
      canEditGameplan: canEditGameplan !== undefined ? !!canEditGameplan : !!(isManager || isAdmin),
      canConfigRadio: !!canConfigRadio,
      canManageLostPunch: !!canManageLostPunch,
      mustChangePassword: mustChangePassword !== undefined ? !!mustChangePassword : true,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    normalizeUserDefaults(newUser);

    usersData.users.push(newUser);
    usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);

    // Sync to employees-v2.json
    syncUserToEmployees(newUser);

    logActivity('USER_CREATED', currentUser.userId, currentUser.name, {
      newUserId: newUser.id,
      newUserName: name
    });

    return res.json({ success: true, user: { ...newUser, password: undefined } });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/users/:id - Update user (managers only)
router.put('/users/:id', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isManager && !currentUser.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }

  try {
    const { id } = req.params;
    const updates = req.body;

    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const userIndex = usersData.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    const allowedFields = [
      'employeeId',
      'name',
      'password',
      'role',
      'imageUrl',
      'isManager',
      'email',
      'phone',
      'isAdmin',
      'canEditGameplan',
      'canConfigRadio',
      'canManageLostPunch',
      'mustChangePassword'
    ];

    if (updates.employeeId !== undefined) {
      const nextEmployeeId = String(updates.employeeId || '').trim();
      if (!nextEmployeeId) {
        return res.status(400).json({ error: 'Employee ID is required' });
      }

      const nextNorm = normalizeLoginId(nextEmployeeId);
      const collision = usersData.users.some((u, idx) => {
        if (idx === userIndex) return false;
        return normalizeLoginId(u?.employeeId) === nextNorm;
      });
      if (collision) {
        return res.status(400).json({ error: 'Employee ID already exists' });
      }
    }

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'password') {
          usersData.users[userIndex][field] = hashPassword(updates[field]);
        } else if (field === 'mustChangePassword') {
          usersData.users[userIndex][field] = !!updates[field];
        } else if (field === 'employeeId') {
          usersData.users[userIndex][field] = String(updates[field] || '').trim();
        } else {
          usersData.users[userIndex][field] = updates[field];
        }
      }
    });

    // Ensure default fields exist for older records.
    normalizeUserDefaults(usersData.users[userIndex]);

    // If the user has never logged in, default to forcing a change when password is set/updated,
    // unless explicitly overridden by mustChangePassword.
    if (!usersData.users[userIndex].lastLogin && updates.password !== undefined && updates.mustChangePassword === undefined) {
      usersData.users[userIndex].mustChangePassword = true;
    }

    usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);

    // Sync to employees-v2.json
    syncUserToEmployees(usersData.users[userIndex]);

    logActivity('USER_UPDATED', currentUser.userId, currentUser.name, {
      updatedUserId: id,
      fields: Object.keys(updates)
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/profile/complete
// Requires auth; Body: { email, phone, password, rememberDevice? }
router.post('/profile/complete', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ success: false, error: 'Not authenticated' });

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

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const user = usersData.users.find(u => u.id === currentUser.userId || u.employeeId === currentUser.employeeId);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    user.email = email;
    user.phone = phone;
    user.password = hashPassword(password);
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();
    writeJsonFile(USERS_FILE, usersData);

    const sessionData = {
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      imageUrl: user.imageUrl,
      email: user.email || '',
      phone: user.phone || '',
      isAdmin: !!user.isAdmin,
      isManager: !!(user.isManager || user.isAdmin || user.role === 'MANAGEMENT'),
      canEditGameplan: !!(user.canEditGameplan || user.isManager || user.isAdmin || user.role === 'MANAGEMENT'),
      needsProfileCompletion: false,
      mustChangePassword: false
    };

    const maxAge = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    res.cookie('userSession', JSON.stringify(sessionData), getUserSessionCookieOptions(req, { maxAge }));

    logActivity('PROFILE_COMPLETED', user.id, user.name, {});
    return res.json({ success: true, user: sessionData });
  } catch (error) {
    console.error('Profile completion error:', error);
    return res.status(500).json({ success: false, error: 'Server error saving profile' });
  }
});

// POST /api/auth/users/:id/photo - Upload user avatar (managers only)
router.post('/users/:id/photo', (req, res, next) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (!err) return next();
    const message = err?.message || 'Upload failed';
    return res.status(400).json({ error: message });
  });
}, (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isManager && !currentUser.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }

  try {
    const { id } = req.params;
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const userIndex = usersData.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    const imageUrl = `/user-uploads/${req.file.filename}`;
    usersData.users[userIndex].imageUrl = imageUrl;
    usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);

    // Sync to employees-v2.json
    syncUserToEmployees(usersData.users[userIndex]);

    logActivity('USER_PHOTO_UPDATED', currentUser.userId, currentUser.name, {
      updatedUserId: id,
      filename: req.file.filename
    });

    return res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('Error uploading user photo:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/users/:id - Delete user (admin only)
router.delete('/users/:id', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isAdmin) return res.status(403).json({ error: 'Access denied. Admin only.' });

  try {
    const { id } = req.params;
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const userIndex = usersData.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = usersData.users.splice(userIndex, 1)[0];
    usersData.lastUpdated = dal.getBusinessDate();
    writeJsonFile(USERS_FILE, usersData);

    // Also remove from employees-v2.json
    const employees = readJsonFile(EMPLOYEES_FILE, { employees: {} });
    for (const type of Object.keys(employees.employees)) {
      const empIndex = employees.employees[type].findIndex(e => 
        e.name === deletedUser.name || e.employeeId === deletedUser.employeeId
      );
      if (empIndex >= 0) {
        employees.employees[type].splice(empIndex, 1);
        break;
      }
    }
    writeJsonFile(EMPLOYEES_FILE, employees);

    logActivity('USER_DELETED', currentUser.userId, currentUser.name, {
      deletedUserId: id,
      deletedUserName: deletedUser.name
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/activity - Get activity log (managers only)
router.get('/activity', (req, res) => {
  const currentUser = getVerifiedSessionUser(req);
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  if (!currentUser.isManager && !currentUser.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Managers only.' });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = readJsonFile(ACTIVITY_LOG_FILE, { logs: [] });

    return res.json({ logs: logs.logs.slice(0, limit) });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
