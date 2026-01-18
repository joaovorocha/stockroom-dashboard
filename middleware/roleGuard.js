/**
 * Role-Based Access Control Middleware
 * Enforces role-specific permissions for protected routes
 * 
 * SECURITY PATCH: CRITICAL-02 from SYSTEM_AUDIT_REPORT.md
 * Addresses inconsistent role verification across backend routes
 */

/**
 * Require user to be a Manager
 * Checks: isManager flag OR role === 'MANAGEMENT' OR isAdmin
 */
function requireManager(req, res, next) {
  const user = req.user;
  
  if (!user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  const hasPermission = user.isManager || user.isAdmin || user.role === 'MANAGEMENT';
  
  if (!hasPermission) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    return res.status(403).send('Manager access required');
  }

  return next();
}

/**
 * Require user to be an Administrator
 * Strictest permission - only isAdmin flag
 */
function requireAdmin(req, res, next) {
  const user = req.user;
  
  if (!user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  if (!user.isAdmin) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    return res.status(403).send('Administrator access required');
  }

  return next();
}

/**
 * Require user to have gameplan editor permissions
 * Checks: canEditGameplan OR isManager OR isAdmin
 */
function requireGameplanEditor(req, res, next) {
  const user = req.user;
  
  if (!user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  const hasPermission = user.canEditGameplan || user.isManager || user.isAdmin || user.role === 'MANAGEMENT';
  
  if (!hasPermission) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Gameplan editor access required' });
    }
    return res.status(403).send('Gameplan editor access required');
  }

  return next();
}

/**
 * Require specific role(s)
 * @param {string|string[]} allowedRoles - Role or array of roles
 * @returns {function} Express middleware
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }

    // Admin always has access
    if (user.isAdmin) {
      return next();
    }

    const userRole = (user.role || '').toUpperCase();
    const hasRole = roles.some(role => userRole === role.toUpperCase());
    
    if (!hasRole) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ 
          error: `Access denied. Required role(s): ${roles.join(', ')}` 
        });
      }
      return res.status(403).send(`Access denied. Required role(s): ${roles.join(', ')}`);
    }

    return next();
  };
}

/**
 * Require user to own the resource OR be a manager
 * Used for user-specific resources (e.g., time-off requests, expenses)
 * @param {string} paramName - Name of URL parameter containing user ID (default: 'id')
 */
function requireOwnerOrManager(paramName = 'id') {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }

    // Admins and managers always have access
    if (user.isAdmin || user.isManager) {
      return next();
    }

    const resourceUserId = req.params[paramName] || req.body.user_id || req.body.employee_id;
    const currentUserId = user.id || user.userId || user.employee_id;
    
    // Check if user owns this resource
    if (resourceUserId && resourceUserId.toString() === currentUserId.toString()) {
      return next();
    }

    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'You can only access your own resources' });
    }
    return res.status(403).send('You can only access your own resources');
  };
}

module.exports = {
  requireManager,
  requireAdmin,
  requireGameplanEditor,
  requireRole,
  requireOwnerOrManager
};
