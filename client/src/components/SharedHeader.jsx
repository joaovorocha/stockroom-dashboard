import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SharedHeader = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest('.header-user') && !e.target.closest('.user-dropdown')) {
        setShowUserMenu(false);
      }
      if (!e.target.closest('.mobile-menu-btn') && !e.target.closest('.mobile-menu-sheet')) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <header className="header">
        {/* Brand */}
        <div className="header-brand">
          <Link to="/" className="logo-link">
            <img src="/images/logo.png" alt="Suitsupply" className="logo-img" />
          </Link>
          <div className="header-title">
            <h1>Daily Game Plan</h1>
            <span className="location">San Francisco</span>
          </div>
        </div>

        {/* Center Logo */}
        <div className="header-center-logo">
          <img src="/images/suitsupply-logo.png" alt="Suitsupply" className="suitsupply-logo" />
        </div>

        {/* Navigation */}
        <nav className="header-nav">
          <Link to="/gameplan" className={isActive('/gameplan') ? 'active' : ''}>
            Game Plan
          </Link>
          <Link to="/shipments" className={isActive('/shipments') ? 'active' : ''}>
            Shipments
          </Link>
          <Link to="/closing-duties" className={isActive('/closing-duties') ? 'active' : ''}>
            Closing Duties
          </Link>
          <Link to="/time-off" className={isActive('/time-off') ? 'active' : ''}>
            Time Off
          </Link>
          {user?.role === 'MGMT' && (
            <Link to="/admin-users" className={isActive('/admin-users') ? 'active' : ''}>
              Admin
            </Link>
          )}
        </nav>

        {/* Actions */}
        <div className="header-actions">
          <div className="header-date">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
          
          {/* User Menu */}
          <div 
            className="header-user" 
            onClick={(e) => {
              e.stopPropagation();
              setShowUserMenu(!showUserMenu);
            }}
          >
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={user.name} className="user-avatar-img" />
            ) : (
              <div className="user-avatar-img" style={{ 
                background: '#e0e0e0', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '14px'
              }}>
                {user?.name?.charAt(0) || 'U'}
              </div>
            )}
            <span id="userName">{user?.name || 'User'}</span>
          </div>

          {/* User Dropdown */}
          <div className={`user-dropdown ${showUserMenu ? 'active' : ''}`}>
            <Link to="/" onClick={() => setShowUserMenu(false)}>Dashboard</Link>
            <Link to="/gameplan" onClick={() => setShowUserMenu(false)}>Game Plan</Link>
            <Link to="/time-off" onClick={() => setShowUserMenu(false)}>Time Off</Link>
            {user?.role === 'MGMT' && (
              <Link to="/admin-users" onClick={() => setShowUserMenu(false)}>Admin</Link>
            )}
            <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>Logout</a>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="mobile-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu(!showMobileMenu);
            }}
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${showMobileMenu ? 'active' : ''}`}>
        <div className="mobile-menu-sheet">
          <div className="mobile-menu-header">
            <h3 className="mobile-menu-title">Menu</h3>
            <button 
              className="mobile-menu-close"
              onClick={() => setShowMobileMenu(false)}
            >
              ✕
            </button>
          </div>
          <div className="mobile-menu-items">
            <Link 
              to="/" 
              className={`mobile-menu-item ${isActive('/') ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">📋</div>
                <span className="mobile-menu-label">Dashboard</span>
              </div>
            </Link>
            <Link 
              to="/gameplan" 
              className={`mobile-menu-item ${isActive('/gameplan') ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">📅</div>
                <span className="mobile-menu-label">Game Plan</span>
              </div>
            </Link>
            <Link 
              to="/shipments" 
              className={`mobile-menu-item ${isActive('/shipments') ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">📦</div>
                <span className="mobile-menu-label">Shipments</span>
              </div>
            </Link>
            <Link 
              to="/closing-duties" 
              className={`mobile-menu-item ${isActive('/closing-duties') ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">✅</div>
                <span className="mobile-menu-label">Closing Duties</span>
              </div>
            </Link>
            <Link 
              to="/time-off" 
              className={`mobile-menu-item ${isActive('/time-off') ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">🗓️</div>
                <span className="mobile-menu-label">Time Off</span>
              </div>
            </Link>
            {user?.role === 'MGMT' && (
              <Link 
                to="/admin-users" 
                className={`mobile-menu-item ${isActive('/admin-users') ? 'active' : ''}`}
                onClick={() => setShowMobileMenu(false)}
              >
                <div className="mobile-menu-item-left">
                  <div className="mobile-menu-icon">🔧</div>
                  <span className="mobile-menu-label">Admin</span>
                </div>
              </Link>
            )}
            <a 
              href="#" 
              className="mobile-menu-item"
              onClick={(e) => {
                e.preventDefault();
                setShowMobileMenu(false);
                handleLogout();
              }}
            >
              <div className="mobile-menu-item-left">
                <div className="mobile-menu-icon">🚪</div>
                <span className="mobile-menu-label">Logout</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default SharedHeader;
