/**
 * LunchTimeline - Visual timeline of team lunch schedules
 */
import React from 'react'

const LunchTimeline = ({ employees = [], assignments = {}, currentUserLunch = null }) => {
  // Collect all lunches with times
  const lunches = employees
    .map(emp => {
      const assignment = assignments[emp.id] || assignments[emp.employee_id] || {}
      const lunch = assignment.lunch || assignment.scheduledLunch
      if (!lunch || assignment.isOff) return null
      return {
        id: emp.id || emp.employee_id,
        name: emp.name || emp.full_name,
        time: lunch,
        avatar: emp.imageUrl || emp.image_url
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by time
      const timeA = a.time.replace(':', '')
      const timeB = b.time.replace(':', '')
      return timeA.localeCompare(timeB)
    })

  if (lunches.length === 0) return null

  return (
    <div className="lunch-timeline-section" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '16px',
      marginBottom: '20px'
    }}>
      <div className="timeline-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🍽️</span>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Team Lunch Schedule</span>
        </div>
        {currentUserLunch && (
          <span style={{ 
            fontSize: '13px', 
            color: 'var(--primary)',
            fontWeight: 500
          }}>
            Your lunch: {currentUserLunch}
          </span>
        )}
      </div>

      <div className="lunch-timeline" style={{
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        paddingBottom: '8px'
      }}>
        {lunches.map((lunch) => {
          const initials = lunch.name.split(' ').map(n => n[0]).join('').slice(0, 2)
          return (
            <div 
              key={lunch.id}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                minWidth: '60px'
              }}
            >
              {lunch.avatar ? (
                <img 
                  src={lunch.avatar}
                  alt={lunch.name}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              ) : (
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'white'
                }}>
                  {initials}
                </div>
              )}
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{lunch.time}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {lunch.name.split(' ')[0]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LunchTimeline
