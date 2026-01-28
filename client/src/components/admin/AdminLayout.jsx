import React from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * AdminLayout Component
 * Provides the layout shell for the Super Admin Panel
 * Includes sidebar navigation and main content area
 */
const AdminLayout = () => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Loading state
  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Loading admin panel...</p>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Not a super admin
  if (!user?.isSuperAdmin) {
    return (
      <div className="admin-access-denied">
        <h1>🚫 Access Denied</h1>
        <p>You need Super Admin privileges to access this area.</p>
        <Link to="/" className="btn btn-primary">Return to Dashboard</Link>
      </div>
    );
  }

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: '📊', exact: true },
    { path: '/admin/stores', label: 'Stores', icon: '🏪' },
    { path: '/admin/users', label: 'Users', icon: '👥' },
    { path: '/admin/settings', label: 'Global Settings', icon: '⚙️' },
    { path: '/admin/tickets', label: 'Support Tickets', icon: '🎫' },
  ];

  const isActive = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="admin-sidebar" style={{
        width: '250px',
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
        color: 'white',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo/Title */}
        <div className="admin-logo" style={{ 
          padding: '0 20px 20px', 
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            🔧 Super Admin
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: '12px', opacity: 0.7 }}>
            {user?.name || 'Admin User'}
          </p>
        </div>

        {/* Navigation */}
        <nav className="admin-nav" style={{ flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                color: isActive(item.path, item.exact) ? '#fff' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
                background: isActive(item.path, item.exact) ? 'rgba(255,255,255,0.1)' : 'transparent',
                borderLeft: isActive(item.path, item.exact) ? '3px solid #e94560' : '3px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="admin-sidebar-footer" style={{ 
          padding: '20px', 
          borderTop: '1px solid rgba(255,255,255,0.1)',
          marginTop: 'auto'
        }}>
          <Link to="/" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            color: 'rgba(255,255,255,0.7)',
            textDecoration: 'none',
            fontSize: '14px'
          }}>
            ← Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main" style={{
        flex: 1,
        background: '#f5f7fa',
        padding: '30px',
        overflowY: 'auto'
      }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
