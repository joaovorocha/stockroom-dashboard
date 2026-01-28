import React from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * StoreAdminLayout Component
 * Layout shell for Store Admin Panel (Tier 2)
 * Accessible by store admins and managers
 */
const StoreAdminLayout = () => {
  const { user, isAuthenticated, loading, activeStore } = useAuth();
  const location = useLocation();

  // Loading state
  if (loading) {
    return (
      <div style={loadingStyle}>
        <div className="spinner"></div>
        <p>Loading store admin panel...</p>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has admin/manager access to current store
  const hasStoreAdminAccess = user?.isSuperAdmin || 
    ['admin', 'manager'].includes(user?.storeAccessRole);

  if (!hasStoreAdminAccess) {
    return (
      <div style={accessDeniedStyle}>
        <div style={accessDeniedCardStyle}>
          <h2 style={{ margin: '0 0 15px', fontSize: '24px' }}>🔒 Access Denied</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            You need store admin or manager access to view this panel.
          </p>
          <Link to="/" style={backLinkStyle}>← Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Navigation items for store admin
  const navItems = [
    { path: '/store', icon: '📊', label: 'Dashboard', exact: true },
    { path: '/store/settings', icon: '⚙️', label: 'Settings' },
    { path: '/store/team', icon: '👥', label: 'Team' },
    { path: '/store/reports', icon: '📈', label: 'Reports' },
  ];

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div style={layoutStyle}>
      {/* Sidebar */}
      <aside style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <div style={{ fontSize: '24px', marginBottom: '5px' }}>🏪</div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Store Admin</h2>
          {activeStore && (
            <div style={{ 
              fontSize: '12px', 
              color: '#a0aec0', 
              marginTop: '4px',
              background: 'rgba(255,255,255,0.1)',
              padding: '4px 8px',
              borderRadius: '4px'
            }}>
              {activeStore.name}
            </div>
          )}
        </div>

        <nav style={navStyle}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                ...navItemStyle,
                background: isActive(item.path, item.exact) ? 'rgba(255,255,255,0.15)' : 'transparent',
                borderLeft: isActive(item.path, item.exact) ? '3px solid #4CAF50' : '3px solid transparent',
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={sidebarFooterStyle}>
          {user?.isSuperAdmin && (
            <Link to="/admin" style={superAdminLinkStyle}>
              ⭐ Super Admin Panel
            </Link>
          )}
          <Link to="/" style={backToAppStyle}>
            ← Back to App
          </Link>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '10px' }}>
            Role: {user?.storeAccessRole || 'N/A'}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={mainStyle}>
        <Outlet />
      </main>
    </div>
  );
};

// Styles
const layoutStyle = {
  display: 'flex',
  minHeight: '100vh',
  background: '#f5f7fa'
};

const sidebarStyle = {
  width: '240px',
  background: 'linear-gradient(180deg, #2d3748 0%, #1a202c 100%)',
  color: 'white',
  display: 'flex',
  flexDirection: 'column',
  position: 'fixed',
  height: '100vh',
  left: 0,
  top: 0
};

const sidebarHeaderStyle = {
  padding: '25px 20px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  textAlign: 'center'
};

const navStyle = {
  flex: 1,
  padding: '15px 0'
};

const navItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 20px',
  color: '#e2e8f0',
  textDecoration: 'none',
  fontSize: '14px',
  transition: 'all 0.2s'
};

const sidebarFooterStyle = {
  padding: '20px',
  borderTop: '1px solid rgba(255,255,255,0.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const superAdminLinkStyle = {
  display: 'block',
  padding: '10px',
  background: 'rgba(236, 201, 75, 0.15)',
  color: '#ecc94b',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '13px',
  textAlign: 'center'
};

const backToAppStyle = {
  display: 'block',
  padding: '10px',
  background: 'rgba(255,255,255,0.1)',
  color: '#e2e8f0',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '13px',
  textAlign: 'center'
};

const mainStyle = {
  flex: 1,
  marginLeft: '240px',
  padding: '30px',
  minHeight: '100vh'
};

const loadingStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: '#f5f7fa'
};

const accessDeniedStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: '#f5f7fa'
};

const accessDeniedCardStyle = {
  background: 'white',
  padding: '40px',
  borderRadius: '12px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  textAlign: 'center',
  maxWidth: '400px'
};

const backLinkStyle = {
  color: '#4CAF50',
  textDecoration: 'none',
  fontWeight: 500
};

export default StoreAdminLayout;
