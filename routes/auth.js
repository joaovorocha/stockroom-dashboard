const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees-v2.json');
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'activity-log.json');

// Helper functions
function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

  employees.lastUpdated = new Date().toISOString().split('T')[0];
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

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { employeeId, password, remember } = req.body;

  if (!employeeId || !password) {
    return res.status(400).json({ success: false, error: 'Employee ID and password are required' });
  }

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const user = findUserByLogin(usersData.users, employeeId);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, error: 'Invalid Employee ID or password' });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    writeJsonFile(USERS_FILE, usersData);

    // Create session data
    const sessionData = {
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      imageUrl: user.imageUrl,
      isAdmin: !!user.isAdmin,
      // Treat management and admins as managers even if the flag is missing
      isManager: !!(user.isManager || user.isAdmin || user.role === 'MANAGEMENT')
    };

    // Set cookie
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
    res.cookie('userSession', JSON.stringify(sessionData), {
      httpOnly: true,
      maxAge,
      sameSite: 'lax',
      secure: false
    });

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

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const userSession = req.cookies.userSession;
  if (userSession) {
    try {
      const userData = JSON.parse(userSession);
      logActivity('LOGOUT', userData.userId, userData.name, {});
    } catch (e) {}
  }
  res.clearCookie('userSession');
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
      res.clearCookie('userSession');
      return res.json({ authenticated: false });
    }

    const userData = {
      userId: currentUser.id,
      employeeId: currentUser.employeeId,
      name: currentUser.name,
      role: currentUser.role,
      imageUrl: currentUser.imageUrl,
      isAdmin: !!currentUser.isAdmin,
      isManager: !!(currentUser.isManager || currentUser.isAdmin || currentUser.role === 'MANAGEMENT')
    };
    return res.json({
      authenticated: true,
      user: userData
    });
  } catch (error) {
    res.clearCookie('userSession');
    return res.json({ authenticated: false });
  }
});

// POST /api/auth/switch - Switch to a different user (direct context switch)
router.post('/switch', (req, res) => {
  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID required' });
  }

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const user = usersData.users.find(u => u.employeeId === employeeId.toString());

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    writeJsonFile(USERS_FILE, usersData);

    // Create session data
    const sessionData = {
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      imageUrl: user.imageUrl,
      isManager: user.isManager || false,
      isAdmin: user.isAdmin || false
    };

    // Set cookie
    res.cookie('userSession', JSON.stringify(sessionData), {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: 'lax',
      secure: false
    });

    logActivity('USER_SWITCH', user.id, user.name, { role: user.role });

    return res.json({ success: true, user: sessionData });
  } catch (error) {
    console.error('Switch user error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users - Get all users (anyone authenticated can get list for switching)
router.get('/users', (req, res) => {
  const userSession = req.cookies.userSession;
  if (!userSession) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    // Remove passwords from response
    const users = usersData.users.map(u => ({
      ...u,
      password: undefined
    }));

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/users - Create new user (managers only)
router.post('/users', (req, res) => {
  const userSession = req.cookies.userSession;
  if (!userSession) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const currentUser = JSON.parse(userSession);
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const { employeeId, name, password, role, imageUrl, isManager } = req.body;

    if (!employeeId || !name || !password || !role) {
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
      password,
      role,
      imageUrl: imageUrl || '',
      isManager: isManager || false,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    usersData.users.push(newUser);
    usersData.lastUpdated = new Date().toISOString().split('T')[0];
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
  const userSession = req.cookies.userSession;
  if (!userSession) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const currentUser = JSON.parse(userSession);
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const { id } = req.params;
    const updates = req.body;

    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const userIndex = usersData.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    const allowedFields = ['name', 'password', 'role', 'imageUrl', 'isManager', 'email', 'phone', 'isAdmin'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        usersData.users[userIndex][field] = updates[field];
      }
    });

    usersData.lastUpdated = new Date().toISOString().split('T')[0];
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

// DELETE /api/auth/users/:id - Delete user (admin only)
router.delete('/users/:id', (req, res) => {
  const userSession = req.cookies.userSession;
  if (!userSession) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const currentUser = JSON.parse(userSession);
    if (!currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const { id } = req.params;
    const usersData = readJsonFile(USERS_FILE, { users: [] });
    const userIndex = usersData.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deletedUser = usersData.users.splice(userIndex, 1)[0];
    usersData.lastUpdated = new Date().toISOString().split('T')[0];
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
  const userSession = req.cookies.userSession;
  if (!userSession) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const currentUser = JSON.parse(userSession);
    if (!currentUser.isManager && !currentUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Managers only.' });
    }

    const limit = parseInt(req.query.limit) || 100;
    const logs = readJsonFile(ACTIVITY_LOG_FILE, { logs: [] });

    return res.json({ logs: logs.logs.slice(0, limit) });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
