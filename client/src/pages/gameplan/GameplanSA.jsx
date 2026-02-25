/**
 * GameplanSA - Sales Associate focused view
 * Shows: Personal KPIs, Fitting rooms, Closing duties, My assignment, Team info
 */
import React, { useState, useEffect } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import WelcomeCard from './components/WelcomeCard'
import KPIRow from './components/KPIRow'
import EmployeeGrid from './components/EmployeeGrid'
import LunchTimeline from './components/LunchTimeline'
import AssignmentsStatus from './components/AssignmentsStatus'

const GameplanSA = ({ onOpenCalendar, onOpenEdit }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [gameplan, setGameplan] = useState({})
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
  const [metrics, setMetrics] = useState({})
  const [currentDate, setCurrentDate] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [gameplanRes, employeesRes, businessDayRes, metricsRes] = await Promise.all([
        client.get('/gameplan/today'),
        client.get('/gameplan/employees'),
        client.get('/gameplan/business-day'),
        client.get('/gameplan/metrics').catch(() => ({ data: {} }))
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
            fittingRoom: assignment.fittingRooms?.[0] || emp.fittingRoom || '',
            lunch: assignment.lunch || emp.lunch || '',
            taskOfTheDay: assignment.taskOfTheDay || emp.taskOfTheDay || ''
          }
        })
      })

      setGameplan(gamePlanData)
      setEmployees(mergedEmployees)
      setCurrentDate(businessDayRes.data?.date || new Date().toISOString().split('T')[0])
      setMetrics(metricsRes.data || {})
    } catch (err) {
      setError(err.message || 'Failed to load game plan')
    } finally {
      setLoading(false)
    }
  }

  // Format currency
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '--'
    // Handle object values
    if (typeof value === 'object') {
      value = value.salesAmount || value.value || 0
    }
    const num = parseFloat(value)
    if (isNaN(num)) return '--'
    if (num >= 1000) return '$' + (num / 1000).toFixed(1) + 'K'
    return '$' + num.toFixed(0)
  }

  // Safe value extraction
  const safeValue = (val, defaultVal = '--') => {
    if (val === null || val === undefined) return defaultVal
    if (typeof val === 'object') return val.value || val.amount || val.percent || defaultVal
    return val
  }

  // Build SA-specific KPIs
  const buildKPIs = () => {
    return [
      { 
        value: safeValue(metrics.dailyScanPercent, '99.7') + '%', 
        label: 'Daily Scan %', 
        color: '#22c55e', 
        icon: '📊' 
      },
      { 
        value: formatCurrency(safeValue(metrics.employeeDiscount, 3300)), 
        label: 'Employee Discount', 
        color: '#3b82f6' 
      },
      { 
        value: String(safeValue(metrics.retailWeek, 'Week 2')), 
        label: 'Retail Week' 
      },
      { 
        value: formatCurrency(safeValue(metrics.dailyTarget, 34000)), 
        label: 'Daily Target', 
        color: '#ef4444' 
      }
    ]
  }

  // Get my assignment
  const getMyAssignment = () => {
    if (!user?.id) return null
    return gameplan.assignments?.[user.id] || null
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
    const assignment = getMyAssignment()
    return assignment?.lunch || assignment?.scheduledLunch || null
  }

  // Status banner for unpublished plan
  const renderStatusBanner = () => {
    if (!gameplan.published) {
      return (
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
              Today's game plan is being prepared. Contact your manager on duty.
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // My assignment card
  const renderMyAssignment = () => {
    const assignment = getMyAssignment()
    if (!assignment) return null

    return (
      <div style={{
        background: 'linear-gradient(135deg, #e0f2fe, #dbeafe)',
        border: '1px solid #3b82f6',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600, color: '#1d4ed8' }}>
          📌 Your Assignment Today
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          {assignment.shift && (
            <div>
              <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>Shift</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.shift}</div>
            </div>
          )}
          {assignment.zones?.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>Zone</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.zones.join(', ')}</div>
            </div>
          )}
          {(assignment.fittingRoom || assignment.fitting_room) && (
            <div>
              <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>Fitting Room</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.fittingRoom || assignment.fitting_room}</div>
            </div>
          )}
          {(assignment.lunch || assignment.scheduledLunch) && (
            <div>
              <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>Lunch</div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>{assignment.lunch || assignment.scheduledLunch}</div>
            </div>
          )}
          {assignment.taskOfTheDay && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>Task of the Day</div>
              <div style={{ fontSize: '14px' }}>{assignment.taskOfTheDay}</div>
            </div>
          )}
        </div>
      </div>
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
            📋 Game Plan - Sales Associate
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
      {renderStatusBanner()}

      {/* Welcome Card */}
      <WelcomeCard
        user={user}
        canEdit={!!onOpenEdit}
        onOpenCalendar={onOpenCalendar}
        onOpenEdit={onOpenEdit}
      />

      {/* SA KPI Row */}
      <KPIRow kpis={buildKPIs()} />

      {/* My Assignment */}
      {renderMyAssignment()}

      {/* Lunch Timeline */}
      <LunchTimeline 
        employees={getAllEmployees()} 
        assignments={gameplan.assignments || {}}
        currentUserLunch={getCurrentUserLunch()}
      />

      {/* Assignments & Closing Duties */}
      <AssignmentsStatus 
        assignments={gameplan.assignments || {}}
        employees={employees}
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

      {/* Quick Reference: Store Support */}
      {(employees.MANAGEMENT?.length > 0 || employees.BOH?.length > 0) && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>👥 Store Support on Duty</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {employees.MANAGEMENT?.filter(e => {
              const a = gameplan.assignments?.[e.id]
              return !a?.isOff
            }).map(emp => (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: 'white',
                  fontWeight: 600
                }}>
                  {(emp.name || '').split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{emp.name?.split(' ')[0]}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Manager</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Overview */}
      <EmployeeGrid 
        title="Sales Associates"
        icon="👔"
        employees={employees.SA || []}
        assignments={gameplan.assignments || {}}
        showDetails={false}
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

export default GameplanSA
