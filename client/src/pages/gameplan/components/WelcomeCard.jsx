/**
 * WelcomeCard - User greeting with avatar and role info
 * Matches legacy welcome-card styling
 */
import React from 'react'

const WelcomeCard = ({ 
  user, 
  onOpenCalendar, 
  onOpenEdit, 
  canEdit = false,
  lastSync = null,
  recordsImported = null,
  children 
}) => {
  const userName = user?.name || user?.full_name || 'Team Member'
  const userRole = user?.role || user?.access_role || user?.employeeType || 'Team Member'
  const userAvatar = user?.imageUrl || user?.image_url || user?.avatar
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="welcome-card" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
      marginBottom: '20px'
    }}>
      <div className="welcome-header" style={{
        display: 'grid',
        gridTemplateColumns: canEdit ? '1fr auto 280px' : '1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Profile Section */}
        <div className="welcome-profile" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {userAvatar ? (
            <img 
              src={userAvatar} 
              alt={userName}
              style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                objectFit: 'cover',
                border: '3px solid var(--primary)'
              }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: '600',
              color: 'white'
            }}>
              {initials}
            </div>
          )}
          <div className="welcome-info">
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>
              Welcome, <span>{userName.split(' ')[0]}</span>!
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              {userRole}
            </p>
          </div>
        </div>

        {/* Slot for middle content (upcoming plans, etc) */}
        {children}

        {/* Right Actions (managers) */}
        {canEdit && (
          <div className="welcome-right" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '12px',
            alignItems: 'stretch'
          }}>
            <div className="welcome-action-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {onOpenCalendar && (
                <button 
                  onClick={onOpenCalendar}
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  View Calendar
                </button>
              )}
              {onOpenEdit && (
                <button 
                  onClick={() => onOpenEdit()}
                  className="btn btn-primary"
                  style={{ flex: 1, minWidth: '120px', background: 'var(--success)', borderColor: 'var(--success)' }}
                >
                  📅 Edit TODAY Game Plan
                </button>
              )}
            </div>

            {/* Data Import Status */}
            {(lastSync || recordsImported !== null) && (
              <div style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px'
              }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600 }}>📊 Data Import</h4>
                {lastSync && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Last Looker sync:</span>
                    <span>{lastSync}</span>
                  </div>
                )}
                {recordsImported !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Records imported:</span>
                    <span>{recordsImported}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default WelcomeCard
