import React, { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Layout = () => {
  const location = useLocation()
  const { user, logout, isAdmin, isSuperAdmin } = useAuth()
  const [currentDate, setCurrentDate] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // Page title mapping - matches legacy SharedHeader.pageTitles
  const pageTitles = {
    '/home': 'Daily Operations',
    '/app': 'Daily Operations',
    '/qr-decode': 'QR Decode',
    '/dashboard': 'Game Plan',
    '/gameplan': 'Game Plan',
    '/awards': 'Team Awards',
    '/daily-scan-performance': 'Daily Scan Performance',
    '/expenses': 'Employee Discount',
    '/employee-discount': 'Employee Discount',
    '/shipments': 'Shipments',
    '/boh-shipments': 'BOH Shipments',
    '/lost-punch': 'Lost Punch',
    '/closing-duties': 'Closing Duties',
    '/time-off': 'Time Off',
    '/ops-dashboard': 'Looker Dashboards',
    '/admin': 'Admin Console'
  }

  // Menu items - matches legacy SharedHeader navItems
  const menuItems = [
    { href: '/home', label: 'Home', icon: '🏠' },
    { href: '/dashboard', label: 'Game Plan', icon: '📋' },
    { href: '/awards', label: 'Awards', icon: '🏆' },
    { href: '/daily-scan-performance', label: 'Daily Scan', icon: '📊' },
    { href: '/employee-discount', label: 'Employee Discount', icon: '💳' },
    { href: '/shipments', label: 'Shipments', icon: '📦' },
    { href: '/lost-punch', label: 'Lost Punch', icon: '🕒' },
    { href: '/closing-duties', label: 'Closing Duties', icon: '✅' },
    { href: '/time-off', label: 'Time Off', icon: '🗓️' },
    { href: '/ops-dashboard', label: 'Looker Dashboards', icon: '📈' },
    { href: '/admin', label: 'Admin Console', icon: '⚙️', adminOnly: true }
  ]

  // Nav links for desktop header (shown when NOT using hamburger)
  const navItems = [
    { href: '/dashboard', label: 'Game Plan', id: 'navGamePlan' },
    { href: '/awards', label: 'Awards', id: 'navAwards' },
    { href: '/daily-scan-performance', label: 'Daily Scan', id: 'navDailyScan' },
    { href: '/employee-discount', label: 'Employee Discount', id: 'navExpenses' },
    { href: '/shipments', label: 'Shipments', id: 'navShipments' },
    { href: '/lost-punch', label: 'Lost Punch', id: 'navLostPunch' },
    { href: '/closing-duties', label: 'Closing Duties', id: 'navClosingDuties' },
    { href: '/time-off', label: 'Time Off', id: 'navTimeOff' },
    { href: '/ops-dashboard', label: 'Looker Dashboards', id: 'navOpsDashboard' },
    { href: '/admin', label: 'Admin', id: 'navAdmin', adminOnly: true }
  ]

  useEffect(() => {
    const updateDate = () => {
      const today = new Date()
      setCurrentDate(
        today.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      )
    }
    updateDate()
  }, [])

  // Add hamburger nav class to body - matches legacy hamburgerNavOnDesktop: true
  useEffect(() => {
    document.body.classList.add('is-hamburger-nav')
    return () => document.body.classList.remove('is-hamburger-nav')
  }, [])

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const getPageTitle = () => pageTitles[location.pathname] || 'Daily Operations'
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Filter items based on user role
  const visibleMenuItems = menuItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    if (item.superAdminOnly && !isSuperAdmin) return false
    return true
  })

  const visibleNavItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    return true
  })

  const handleLogout = async (e) => {
    e.preventDefault()
    setMenuOpen(false)
    await logout()
  }

  return (
    <>
      {/* Header - matches legacy shared-header.js render() */}
      <header className="header">
        <div className="header-brand">
          {/* Hamburger button */}
          <button
            type="button"
            className="mobile-menu-btn"
            id="mobileMenuBtn"
            aria-label="Menu"
            onClick={() => setMenuOpen(true)}
          >
            &#9776;
          </button>
          
          <Link to="/home" className="logo-link">
            <img
              src="/icons/icon-32.png"
              alt="Daily Operations"
              className="logo-img"
              onError={(e) => {
                e.target.outerHTML = '<span class="logo-text">DAILY OPS</span>'
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

        {/* Desktop nav - hidden by is-hamburger-nav class */}
        <nav className="header-nav">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              id={item.id}
              className={isActive(item.href) ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-date">
            <span id="currentDate">{currentDate}</span>
          </div>
          <div className="header-user" id="userMenu">
            {user?.imageUrl && (
              <img 
                src={user.imageUrl} 
                alt={user.name || ''} 
                id="userAvatar"
                className="user-avatar-img"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <span id="userName">{user?.name || 'Guest'}</span>
            <div className="user-dropdown" id="userDropdown">
              <a href="#" id="logoutBtn" onClick={handleLogout}>Logout</a>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay - matches legacy structure exactly */}
      <div 
        className={`mobile-menu-overlay ${menuOpen ? 'active' : ''}`}
        id="mobileMenuOverlay"
        onClick={(e) => {
          if (e.target.id === 'mobileMenuOverlay') setMenuOpen(false)
        }}
      >
        <div 
          className="mobile-menu-sheet" 
          role="dialog" 
          aria-modal="true" 
          aria-label="Menu"
        >
          <div className="mobile-menu-header">
            <div className="mobile-menu-title">Menu</div>
            <button 
              type="button" 
              className="mobile-menu-close" 
              id="mobileMenuClose" 
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="mobile-menu-items" id="mobileMenuItems">
            {visibleMenuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`mobile-menu-item ${isActive(item.href) ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mobile-menu-item-left">
                  <span className="mobile-menu-icon">{item.icon}</span>
                  <span className="mobile-menu-label">{item.label}</span>
                </span>
              </Link>
            ))}
            <a 
              href="#" 
              className="mobile-menu-item" 
              onClick={handleLogout}
              style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}
            >
              <span className="mobile-menu-item-left">
                <span className="mobile-menu-icon">🚪</span>
                <span className="mobile-menu-label">Logout</span>
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="app-home">
        <Outlet />
      </main>
    </>
  )
}

export default Layout
