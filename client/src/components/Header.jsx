import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const Header = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState('');
  const [shipmentsBadge, setShipmentsBadge] = useState(0);
  const [expensesBadge, setExpensesBadge] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Page title mapping
  const pageTitles = {
    '/': 'Daily Operations',
    '/home': 'Daily Operations',
    '/dashboard': 'Game Plan',
    '/gameplan': 'Game Plan',
    '/awards': 'Team Awards',
    '/expenses': 'Employee Discount',
    '/employee-discount': 'Employee Discount',
    '/shipments': 'Shipments',
    '/boh-shipments': 'BOH Shipments',
    '/scanner': 'Scanner',
    '/radio': 'Radio Transcription',
    '/radio-transcripts': 'Radio Transcripts',
    '/lost-punch': 'Lost Punch',
    '/closing-duties': 'Closing Duties',
    '/time-off': 'Time Off',
    '/ops-dashboard': 'Looker Dashboards',
    '/admin': 'Admin Console',
    '/admin-users': 'Admin Console',
    '/feedback': 'Feedback'
  };

  // Menu items
  const menuIcons = {
    '/': '🏠',
    '/gameplan': '📋',
    '/awards': '🏆',
    '/expenses': '💳',
    '/shipments': '📦',
    '/scanner': '📷',
    '/radio-transcripts': '📝',
    '/lost-punch': '🕒',
    '/closing-duties': '✅',
    '/time-off': '🗓️',
    '/ops-dashboard': '📈',
    '/admin-users': '🔐'
  };

  const navItems = [
    { href: '/gameplan', label: 'Game Plan' },
    { href: '/awards', label: 'Awards' },
    { href: '/expenses', label: 'Employee Discount', badge: expensesBadge },
    { href: '/radio-transcripts', label: 'Radio Transcripts' },
    { href: '/shipments', label: 'Shipments', badge: shipmentsBadge },
    { href: '/scanner', label: 'Scanner' },
    { href: '/lost-punch', label: 'Lost Punch' },
    { href: '/closing-duties', label: 'Closing Duties' },
    { href: '/time-off', label: 'Time Off' },
    { href: '/ops-dashboard', label: 'Looker Dashboards' },
    { href: '/admin-users', label: 'Admin', adminOnly: true }
  ];

  // Get page title
  const getPageTitle = () => {
    return pageTitles[location.pathname] || 'Daily Operations';
  };

  // Update date
  useEffect(() => {
    const updateDate = () => {
      const today = new Date();
      setCurrentDate(
        today.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      );
    };
    updateDate();
    const interval = setInterval(updateDate, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Load shipments badge
  useEffect(() => {
    const loadShipmentsBadge = async () => {
      try {
        const response = await api.get('/api/shipments/summary');
        if (response.data?.pending) {
          setShipmentsBadge(response.data.pending);
        }
      } catch (err) {
        console.error('Failed to load shipments badge:', err);
      }
    };
    loadShipmentsBadge();
    const interval = setInterval(loadShipmentsBadge, 300000); // Every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    await logout();
  };

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <Link to="/" className="logo-link">
            <img
              src="/icons/icon-32.png"
              alt="Daily Operations"
              className="logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<span class="logo-text">DAILY OPS</span>';
              }}
            />
          </Link>
          <div className="header-title">
            <h1>{getPageTitle()}</h1>
            <span className="location">San Francisco</span>
          </div>
        </div>

        <div className="header-center-logo">
          <img
            src="https://cdn.freebiesupply.com/logos/large/2x/suitsupply-logo-logo-svg-vector.svg"
            alt="Suitsupply"
            className="suitsupply-logo"
          />
        </div>

        <nav className="header-nav">
          {navItems.map((item) => {
            // Hide admin-only items for non-admin users
            if (item.adminOnly && user?.role !== 'MGMT' && !user?.isAdmin) {
              return null;
            }

            return (
              <Link
                key={item.href}
                to={item.href}
                className={isActive(item.href) ? 'active' : ''}
              >
                {item.label}
                {item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions">
          <div className="header-date">
            <span>{currentDate}</span>
          </div>
          <div className="header-user">
            {user?.imageUrl && (
              <img src={user.imageUrl} alt={user.name} className="user-avatar-img" />
            )}
            <span>{user?.name || 'Guest'}</span>
            <div className="user-dropdown">
              <a href="#" onClick={handleLogout}>
                Logout
              </a>
            </div>
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay active" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div className="mobile-menu-title">Menu</div>
              <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                ×
              </button>
            </div>
            <div className="mobile-menu-items">
              {navItems.map((item) => {
                if (item.adminOnly && user?.role !== 'MGMT' && !user?.isAdmin) {
                  return null;
                }
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`mobile-menu-item ${isActive(item.href) ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div className="mobile-menu-item-left">
                      <div className="mobile-menu-icon">{menuIcons[item.href] || '📄'}</div>
                      <span className="mobile-menu-label">{item.label}</span>
                    </div>
                    {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                );
              })}
              <a href="#" onClick={handleLogout} className="mobile-menu-item">
                <div className="mobile-menu-item-left">
                  <div className="mobile-menu-icon">🚪</div>
                  <span className="mobile-menu-label">Logout</span>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
