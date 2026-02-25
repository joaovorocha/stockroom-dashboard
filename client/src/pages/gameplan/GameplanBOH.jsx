/**
 * GameplanBOH - Back of House focused view
 * Shows: Operations metrics, Inventory issues, Scan log, BOH assignments
 */
import React, { useState, useEffect } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import WelcomeCard from './components/WelcomeCard'
import EmployeeGrid from './components/EmployeeGrid'
import LunchTimeline from './components/LunchTimeline'

const GameplanBOH = ({ onOpenCalendar, onOpenEdit }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [gameplan, setGameplan] = useState({})
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
  const [currentDate, setCurrentDate] = useState('')
  const [opsMetrics, setOpsMetrics] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [gameplanRes, employeesRes, businessDayRes] = await Promise.all([
        client.get('/gameplan/today'),
        client.get('/gameplan/employees'),
        client.get('/gameplan/business-day')
      ])

      const gamePlanData = gameplanRes.data || {}
      const employeesData = employeesRes.data?.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] }
      
      // Merge employee data with assignments
      const assignments = gamePlanData.assignments || {}
      const mergedEmployees = {}
      
      Object.keys(employeesData).forEach(type => {
        mergedEmployees[type] = (employeesData[type] || []).map(emp => {
          const assignment = assignments[emp.id] || {}
          return {
            ...emp,
            isOff: assignment.isOff !== undefined ? assignment.isOff : emp.isOff,
            shift: assignment.shift || emp.shift || '',
            zones: assignment.zones || emp.zones || [],
            lunch: assignment.lunch || emp.lunch || '',
            taskOfTheDay: assignment.taskOfTheDay || emp.taskOfTheDay || ''
          }
        })
      })

      setGameplan(gamePlanData)
      setEmployees(mergedEmployees)
      setCurrentDate(businessDayRes.data?.date || new Date().toISOString().split('T')[0])

      // Try to load operations metrics
      try {
        const metricsRes = await client.get('/gameplan/metrics')
        setOpsMetrics(metricsRes.data || {})
      } catch (e) {
        // Use placeholder data
        setOpsMetrics({
          ontimeAlterations: '95%',
          overdueAlterations: 3,
          inventoryAccuracy: '99.2%',
          missingItems: '0.3%',
          overdueReserved: '1.2%',
          unexpectedItems: '0.5%',
          duePullbacks: 12
        })
      }
    } catch (err) {
      setError(err.message || 'Failed to load game plan')
    } finally {
      setLoading(false)
    }
  }

  // Get all employees for lunch
  const getAllEmployees = () => {
    return [
      ...(employees.SA || []),
      ...(employees.BOH || []),
      ...(employees.MANAGEMENT || []),
      ...(employees.TAILOR || [])
    ]
  }

  // Get current user's lunch
  const getCurrentUserLunch = () => {
    if (!user?.id) return null
    const assignment = gameplan.assignments?.[user.id]
    return assignment?.lunch || assignment?.scheduledLunch || null
  }

  // My assignment for BOH
  const renderMyAssignment = () => {
    if (!user?.id) return null
    const assignment = gameplan.assignments?.[user.id]
    if (!assignment) return null

    return (
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
        border: '1px solid #f59e0b',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600, color: '#92400e' }}>
          📦 Your Assignment Today
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          {assignment.shift && (
            <div>
              <div style={{ fontSize: '11px', color: '#b45309', textTransform: 'uppercase', marginBottom: '4px' }}>Shift</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.shift}</div>
            </div>
          )}
          {(assignment.lunch || assignment.scheduledLunch) && (
            <div>
              <div style={{ fontSize: '11px', color: '#b45309', textTransform: 'uppercase', marginBottom: '4px' }}>Lunch</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.lunch || assignment.scheduledLunch}</div>
            </div>
          )}
          {assignment.taskOfTheDay && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: '#b45309', textTransform: 'uppercase', marginBottom: '4px' }}>Task of the Day</div>
              <div style={{ fontSize: '14px' }}>{assignment.taskOfTheDay}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Operations Dashboard
  const renderOperationsDashboard = () => {
    return (
      <section style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>📊 Operations Dashboard</h2>

        {/* Health Metrics */}
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' }}>Health Metrics</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>On-Time Alterations</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{opsMetrics.ontimeAlterations || '95%'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target: 95%</div>
            </div>
            <div style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Overdue Alterations</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{opsMetrics.overdueAlterations || 3}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Count</div>
            </div>
            <div style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Inventory Accuracy</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{opsMetrics.inventoryAccuracy || '99.2%'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target: 99%</div>
            </div>
          </div>
        </div>

        {/* Inventory Issues */}
        <div>
          <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' }}>Inventory Issues</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Missing Items</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#b45309' }}>{opsMetrics.missingItems || '0.3%'}</div>
            </div>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Overdue Reserved</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#b45309' }}>{opsMetrics.overdueReserved || '1.2%'}</div>
            </div>
            <div style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Unexpected Items</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{opsMetrics.unexpectedItems || '0.5%'}</div>
            </div>
            <div style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Due Pullbacks</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{opsMetrics.duePullbacks || 12}</div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading game plan...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div style={{ 
          background: '#fee2e2', 
          border: '1px solid #ef4444', 
          borderRadius: '8px', 
          padding: '20px',
          color: '#991b1b'
        }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchData} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div style={{ 
        marginBottom: '16px', 
        paddingBottom: '12px', 
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end'
      }}>
        <div>
          <div style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            color: 'var(--text-secondary)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.5px',
            marginBottom: '4px'
          }}>
            Daily Operations
          </div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
            📦 Game Plan - Back of House
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {currentDate}
          </p>
        </div>
        <div>
          {gameplan.published ? (
            <span className="badge badge-success">Published</span>
          ) : (
            <span className="badge badge-warning">Draft</span>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {!gameplan.published && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong style={{ color: '#92400e' }}>Game Plan Not Published</strong>
            <div style={{ fontSize: '13px', color: '#b45309' }}>
              Today's game plan is being prepared.
            </div>
          </div>
        </div>
      )}

      {/* Welcome Card */}
      <WelcomeCard
        user={user}
        canEdit={!!onOpenEdit}
        onOpenCalendar={onOpenCalendar}
        onOpenEdit={onOpenEdit}
      />

      {/* My Assignment */}
      {renderMyAssignment()}

      {/* Operations Dashboard */}
      {renderOperationsDashboard()}

      {/* Lunch Timeline */}
      <LunchTimeline 
        employees={getAllEmployees()} 
        assignments={gameplan.assignments || {}}
        currentUserLunch={getCurrentUserLunch()}
      />

      {/* Notes */}
      {gameplan.notes && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #ffc107',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>📝 Today's Notes</h4>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{gameplan.notes}</div>
        </div>
      )}

      {/* BOH Team */}
      <EmployeeGrid 
        title="Back of House Team"
        icon="📦"
        employees={employees.BOH || []}
        assignments={gameplan.assignments || {}}
      />

      {/* Tailors */}
      <EmployeeGrid 
        title="Tailors"
        icon="✂️"
        employees={employees.TAILOR || []}
        assignments={gameplan.assignments || {}}
      />

      {/* View Calendar Button */}
      {onOpenCalendar && (
        <div style={{ textAlign: 'center', marginTop: '24px', marginBottom: '24px' }}>
          <button 
            onClick={onOpenCalendar}
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, var(--success), #22c55e)',
              padding: '16px 32px',
              fontSize: '16px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '10px',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
            }}
          >
            📅 View Game Plans
          </button>
        </div>
      )}
    </div>
  )
}

export default GameplanBOH
