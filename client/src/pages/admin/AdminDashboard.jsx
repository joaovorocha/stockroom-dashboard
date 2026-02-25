import React, { useState } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import StoreSettings from './StoreSettings'
import GameplanSettings from './GameplanSettings'
import Users from './Users'
import Health from './Health'
import Backups from './Backups'
import ActivityLog from './ActivityLog'
import './AdminDashboard.css'

const AdminDashboard = () => {
  const location = useLocation()
  
  const sections = [
    { path: 'store', label: 'Store Settings', icon: '🏪' },
    { path: 'gameplan', label: 'Gameplan Settings', icon: '⚙️' },
    { path: 'users', label: 'Users', icon: '👥' },
    { path: 'health', label: 'Health', icon: '💚' },
    { path: 'backups', label: 'Backups', icon: '💾' },
    { path: 'activity', label: 'Activity Log', icon: '📊' },
  ]

  const currentSection = sections.find(s => location.pathname.includes(s.path))

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="admin-header">
        <div>
          <div className="breadcrumb">Admin Console</div>
          <h1>{currentSection?.label || 'Dashboard'}</h1>
        </div>
      </div>

      {/* Navigation */}
      <div className="admin-nav">
        {sections.map(section => (
          <Link
            key={section.path}
            to={`/admin/${section.path}`}
            className={`admin-nav-item ${location.pathname.includes(section.path) ? 'active' : ''}`}
          >
            <span className="nav-icon">{section.icon}</span>
            <span className="nav-label">{section.label}</span>
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="admin-content">
        <Routes>
          <Route index element={<Navigate to="/admin/store" replace />} />
          <Route path="store" element={<StoreSettings />} />
          <Route path="gameplan" element={<GameplanSettings />} />
          <Route path="users" element={<Users />} />
          <Route path="health" element={<Health />} />
          <Route path="backups" element={<Backups />} />
          <Route path="activity" element={<ActivityLog />} />
        </Routes>
      </div>
    </div>
  )
}

export default AdminDashboard
