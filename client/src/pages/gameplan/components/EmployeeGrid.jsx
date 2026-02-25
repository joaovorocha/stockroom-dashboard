/**
 * EmployeeGrid - Horizontal scrollable grid of employee cards
 * Matches legacy .employee-grid styling
 */
import React from 'react'

const EmployeeCard = ({ employee, assignment = {}, showDetails = true }) => {
  const name = employee?.name || employee?.full_name || 'Unknown'
  const avatar = employee?.imageUrl || employee?.image_url
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const isOff = assignment?.isOff || assignment?.is_off
  const shift = assignment?.shift || '--'
  const zones = assignment?.zones || []
  const fittingRoom = assignment?.fittingRoom || assignment?.fitting_room
  const lunch = assignment?.lunch || assignment?.scheduledLunch

  return (
    <div 
      className="employee-card"
      style={{
        flex: '0 0 auto',
        minWidth: '200px',
        maxWidth: '240px',
        scrollSnapAlign: 'start',
        background: isOff ? '#eef0f3' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '14px',
        opacity: isOff ? 0.7 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        {avatar ? (
          <img 
            src={avatar} 
            alt={name}
            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: isOff ? '#d1d5db' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
            color: 'white'
          }}>
            {initials}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{name.split(' ')[0]}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {isOff ? 'Day Off' : shift}
          </div>
        </div>
      </div>

      {showDetails && !isOff && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {zones.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Zone:</strong> {zones.join(', ')}
            </div>
          )}
          {fittingRoom && (
            <div style={{ marginBottom: '4px' }}>
              <strong>FR:</strong> {fittingRoom}
            </div>
          )}
          {lunch && (
            <div>
              <strong>Lunch:</strong> {lunch}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const EmployeeGrid = ({ 
  title, 
  employees = [], 
  assignments = {},
  icon,
  showDetails = true,
  emptyMessage = 'No employees' 
}) => {
  if (!employees || employees.length === 0) {
    return (
      <section className="section boxed-section" style={{ marginBottom: '20px' }}>
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{icon} {title}</h2>
          <span className="section-count" style={{
            background: '#e0e3ea',
            color: '#374151',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            padding: '2px 10px'
          }}>0</span>
        </div>
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          color: 'var(--text-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: '8px'
        }}>
          {emptyMessage}
        </div>
      </section>
    )
  }

  return (
    <section className="section boxed-section" style={{ marginBottom: '20px' }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{icon} {title}</h2>
        <span className="section-count" style={{
          background: '#e0e3ea',
          color: '#374151',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          padding: '2px 10px'
        }}>{employees.length}</span>
      </div>
      <div 
        className="employee-grid" 
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '8px',
          scrollBehavior: 'smooth'
        }}
      >
        {employees.map((emp) => (
          <EmployeeCard 
            key={emp.id || emp.employee_id}
            employee={emp}
            assignment={assignments[emp.id] || assignments[emp.employee_id] || {}}
            showDetails={showDetails}
          />
        ))}
      </div>
    </section>
  )
}

export { EmployeeCard }
export default EmployeeGrid
