const authMiddleware = (req, res, next) => {
  // Check if user has a valid session cookie
  const userSession = req.cookies.userSession;

  if (!userSession) {
    // No session found - redirect to login
    if (req.path.startsWith('/api/')) {
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

    // Attach user data to request for use in routes
    req.user = userData;

    next();
  } catch (error) {
    // Invalid session data
    res.clearCookie('userSession');
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Invalid session' });
    } else {
      return res.redirect('/login');
    }
  }
};

module.exports = authMiddleware;
