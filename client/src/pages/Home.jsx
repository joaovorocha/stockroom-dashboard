import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const baseTiles = [
  { href: '/dashboard', icon: '📋', title: 'Game Plan', subtitle: 'Daily assignments' },
  { href: '/store-count-analysis', icon: '📊', title: 'Store Count', subtitle: 'Analysis' },
  { href: '/awards', icon: '🏆', title: 'Awards', subtitle: 'Celebrate wins' },
  { href: '/daily-scan-performance', icon: '📈', title: 'Daily Scan', subtitle: 'Scan performance' },
  { href: '/employee-discount', icon: '💳', title: 'Employee Discount', subtitle: 'Spending limits' },
  { href: '/shipments', icon: '📦', title: 'Shipments', subtitle: 'UPS capture' },
  { href: '/lost-punch', icon: '🕒', title: 'Lost Punch', subtitle: 'Time adjustments' },
  { href: '/closing-duties', icon: '✅', title: 'Closing Duties', subtitle: 'Checklist' },
  { href: '/time-off', icon: '🗓️', title: 'Time Off', subtitle: 'Calendar' },
  { href: '/ops-dashboard', icon: '📊', title: 'Looker Dashboards', subtitle: 'Operations' }
]

const Home = () => {
  const { isAdmin, isSuperAdmin } = useAuth()
  const tiles = [...baseTiles]

  if (isAdmin || isSuperAdmin) {
    tiles.push({ href: '/admin', icon: '⚙️', title: 'Admin Console', subtitle: 'Settings & users' })
  }

  return (
    <>
      <div className="app-home-title">
        <h2>Quick Access</h2>
        <p className="muted">Tap a tile to open a section. Tap the logo anytime to return here.</p>
      </div>

      <div className="app-tiles" id="appTiles">
        {tiles.map((tile) => (
          <Link key={tile.href} className="app-tile" to={tile.href}>
            <div className="app-tile-icon">{tile.icon}</div>
            <div className="app-tile-text">
              <div className="app-tile-title">{tile.title}</div>
              <div className="app-tile-subtitle">{tile.subtitle}</div>
            </div>
          </Link>
        ))}
      </div>

      <section className="section" style={{ marginTop: '14px' }}>
        <div className="section-header">
          <h2>Today</h2>
        </div>
        <div className="metrics-content">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Shift</span>
              <span className="metric-value">--</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Position</span>
              <span className="metric-value">--</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Zone</span>
              <span className="metric-value">--</span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Home
