import React, { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const Gameplan = () => {
  const { user, isManager } = useAuth()
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
  const [gameplan, setGameplan] = useState({ notes: '', assignments: {}, published: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentDate, setCurrentDate] = useState('')
  const [activeSection, setActiveSection] = useState('SA')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [employeesRes, gameplanRes, businessDayRes] = await Promise.all([
        client.get('/gameplan/employees'),
        client.get('/gameplan/today'),
        client.get('/gameplan/business-day')
      ])

      setEmployees(employeesRes.data?.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
      setGameplan(gameplanRes.data || { notes: '', assignments: {}, published: false })
      setCurrentDate(businessDayRes.data?.date || new Date().toISOString().slice(0, 10))
    } catch (err) {
      setError(err.message || 'Failed to load game plan')
    } finally {
      setLoading(false)
    }
  }

  const getAssignment = (employeeId) => {
    return gameplan.assignments?.[employeeId] || {}
  }

  const formatShift = (shift) => {
    if (!shift) return '—'
    return shift
  }

  const sections = [
    { key: 'SA', label: 'Sales Associates', icon: '👔' },
    { key: 'BOH', label: 'Back of House', icon: '📦' },
    { key: 'MANAGEMENT', label: 'Management', icon: '👔' },
    { key: 'TAILOR', label: 'Tailors', icon: '✂️' }
  ]

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading game plan...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchData} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const currentEmployees = employees[activeSection] || []

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Daily Operations</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>📋 Game Plan</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{currentDate}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {gameplan.published ? (
              <span className="badge badge-success">Published</span>
            ) : (
              <span className="badge badge-warning">Draft</span>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {gameplan.notes && (
        <div className="card" style={{ marginBottom: '16px', background: '#fffbeb', borderColor: '#ffc107' }}>
          <div className="card-body">
            <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>📝 Manager Notes</h4>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{gameplan.notes}</p>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
        {sections.map(section => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            style={{
              padding: '10px 16px',
              border: activeSection === section.key ? '2px solid var(--primary)' : '1px solid var(--border)',
              borderRadius: '8px',
              background: activeSection === section.key ? 'var(--primary)' : 'var(--background)',
              color: activeSection === section.key ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{section.icon}</span>
            {section.label}
            <span style={{ 
              background: activeSection === section.key ? 'rgba(255,255,255,0.3)' : 'var(--surface)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px'
            }}>
              {(employees[section.key] || []).length}
            </span>
          </button>
        ))}
      </div>

      {/* Employee Cards */}
      <div style={{ display: 'grid', gap: '12px' }}>
        {currentEmployees.length === 0 ? (
          <div style={{ padding: '24px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center' }}>
            No employees in this section
          </div>
        ) : (
          currentEmployees.map((emp) => {
            const assignment = getAssignment(emp.id)
            const isOff = assignment.isOff

            return (
              <div 
                key={emp.id}
                className="card"
                style={{ 
                  padding: '16px',
                  opacity: isOff ? 0.6 : 1,
                  background: isOff ? 'var(--surface)' : 'var(--background)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {emp.imageUrl ? (
                      <img 
                        src={emp.imageUrl} 
                        alt={emp.name}
                        style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        borderRadius: '50%', 
                        background: 'var(--surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: 'var(--text-secondary)'
                      }}>
                        {(emp.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{emp.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {emp.role || activeSection}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {isOff ? (
                      <span className="badge badge-secondary">Day Off</span>
                    ) : (
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>
                        {formatShift(assignment.shift)}
                      </span>
                    )}
                  </div>
                </div>

                {!isOff && (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                    gap: '12px', 
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)'
                  }}>
                    {assignment.zones && assignment.zones.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Zone</div>
                        <div style={{ fontSize: '14px' }}>{assignment.zones.join(', ')}</div>
                      </div>
                    )}
                    {assignment.fittingRoom && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Fitting Room</div>
                        <div style={{ fontSize: '14px' }}>{assignment.fittingRoom}</div>
                      </div>
                    )}
                    {assignment.lunch && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Lunch</div>
                        <div style={{ fontSize: '14px' }}>{assignment.lunch}</div>
                      </div>
                    )}
                    {assignment.taskOfTheDay && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Task of the Day</div>
                        <div style={{ fontSize: '14px' }}>{assignment.taskOfTheDay}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default Gameplan
