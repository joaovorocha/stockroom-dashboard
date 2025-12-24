const authMiddleware = (req, res, next) => {
  const originalUrl = req.originalUrl || req.url || '';
  const baseUrl = req.baseUrl || '';
  const isApiRequest = originalUrl.startsWith('/api/') || baseUrl.startsWith('/api/');

  // Check if user has a valid session cookie
  const userSession = req.cookies.userSession;

  if (!userSession) {
    // No session found - redirect to login
    if (isApiRequest) {
      // For API requests, return 401
      return res.status(401).json({ error: 'Not authenticated' });
    } else {
      // For page requests, redirect to login
      return res.redirect('/login');
    }
  }

  try {
    // Parse the user session data
    const userData = JSON.parse(userSession);

    // Validate the session user still exists
    const fs = require('fs');
    const path = require('path');
    const usersFile = path.join(__dirname, '..', 'data', 'users.json');
    let currentUser = null;
    try {
      if (fs.existsSync(usersFile)) {
        const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        currentUser = (usersData.users || []).find(u => u.employeeId === userData.employeeId || u.id === userData.userId) || null;
      }
    } catch (e) {
      // Fail closed: if we can't validate against users.json, don't trust the cookie.
      console.error('Auth validation failed reading users.json:', e);
      currentUser = null;
    }

    if (!currentUser) {
      res.clearCookie('userSession');
      if (isApiRequest) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      return res.redirect('/login');
    }

    // Attach normalized user data to request
    const needsProfileCompletion = !String(currentUser.email || '').trim() || !String(currentUser.phone || '').trim();
    const mustChangePassword = !!currentUser.mustChangePassword;
    req.user = {
      userId: currentUser.id || userData.userId,
      employeeId: currentUser.employeeId || userData.employeeId,
      name: currentUser.name || userData.name,
      role: currentUser.role || userData.role,
      imageUrl: currentUser.imageUrl || userData.imageUrl,
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      isAdmin: !!currentUser.isAdmin,
      isManager: !!(currentUser.isManager || currentUser.isAdmin || (currentUser.role || '').toUpperCase() === 'MANAGEMENT'),
      canEditGameplan: !!(
        currentUser.canEditGameplan ||
        currentUser.isManager ||
        currentUser.isAdmin ||
        (currentUser.role || '').toUpperCase() === 'MANAGEMENT'
      ),
      needsProfileCompletion,
      mustChangePassword
    };

    // For page requests, force profile completion before accessing the app.
    if (!isApiRequest && (needsProfileCompletion || mustChangePassword)) {
      if (!originalUrl.startsWith('/complete-profile')) {
        return res.redirect('/complete-profile');
      }
    }

    next();
  } catch (error) {
    // Invalid session data
    res.clearCookie('userSession');
    if (isApiRequest) {
      return res.status(401).json({ error: 'Invalid session' });
    } else {
      return res.redirect('/login');
    }
  }
};

module.exports = authMiddleware;
