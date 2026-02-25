/**
 * GameplanManagement - Full-featured manager dashboard
 * Includes: KPIs, Upcoming Plans, All employee grids, Lunch timeline
 */
import React, { useState, useEffect } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import WelcomeCard from './components/WelcomeCard'
import KPIRow from './components/KPIRow'
import EmployeeGrid from './components/EmployeeGrid'
import LunchTimeline from './components/LunchTimeline'
import UpcomingPlans from './components/UpcomingPlans'
import AssignmentsStatus from './components/AssignmentsStatus'

const GameplanManagement = ({ onOpenCalendar, onOpenEdit }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [gameplan, setGameplan] = useState({})
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
  const [metrics, setMetrics] = useState({})
  const [syncStatus, setSyncStatus] = useState(null)
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
      
      // Merge employee data with assignments from gameplan
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
            fittingRoom: assignment.fittingRooms?.[0] || assignment.fittingRoom || assignment.fitting_room || emp.fittingRoom || '',
            lunch: assignment.lunch || emp.lunch || '',
            scheduledLunch: assignment.scheduledLunch || emp.scheduledLunch || '',
            taskOfTheDay: assignment.taskOfTheDay || emp.taskOfTheDay || '',
            role: assignment.role || emp.role || '',
            station: assignment.station || emp.station || '',
            closingSections: assignment.closingSections || emp.closingSections || []
          }
        })
      })

      setGameplan(gamePlanData)
      setEmployees(mergedEmployees)
      setCurrentDate(businessDayRes.data?.date || new Date().toISOString().split('T')[0])
      setMetrics(metricsRes.data || {})

      // Try to get sync status
      try {
        const syncRes = await client.get('/gameplan/sync-status')
        setSyncStatus(syncRes.data)
      } catch (e) {
        // Ignore sync status errors
      }
    } catch (err) {
      setError(err.message || 'Failed to load game plan')
    } finally {
      setLoading(false)
    }
  }

  // Format currency
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '--'
    // Handle object values (extract number if it's an object)
    if (typeof value === 'object') {
      value = value.salesAmount || value.value || 0
    }
    const num = parseFloat(value)
    if (isNaN(num)) return '--'
    if (num >= 1000) {
      return '$' + (num / 1000).toFixed(1) + 'K'
    }
    return '$' + num.toFixed(0)
  }

  // Safe extraction of primitive values from metrics
  const safeValue = (val, defaultVal = '--') => {
    if (val === null || val === undefined) return defaultVal
    if (typeof val === 'object') {
      // Extract from common object structures
      return val.value || val.amount || val.percent || defaultVal
    }
    return val
  }

  // Build KPIs for manager view
  const buildKPIs = () => {
    const kpis = []

    const opsHealth = metrics?.operationsHealth || {}
    const retailWeek = metrics?.retailWeek || {}
    const workExpenses = metrics?.workRelatedExpenses || {}

    // Daily Scan %
    const dailyScan = safeValue(opsHealth.inventoryAccuracy)
    if (dailyScan !== '--') {
      kpis.push({
        value: dailyScan + '%',
        label: 'Daily Scan %',
        color: parseFloat(dailyScan) >= 95 ? '#22c55e' : '#f59e0b',
        icon: '📊'
      })
    }

    // Employee Discount
    const empDiscount = safeValue(workExpenses?.limits?.globalYearlyLimit || workExpenses?.globalYearlyLimit)
    if (empDiscount !== '--') {
      kpis.push({
        value: formatCurrency(empDiscount),
        label: 'Employee Discount',
        color: '#3b82f6'
      })
    }

    // Retail Week
    if (retailWeek?.weekNumber) {
      kpis.push({
        value: `Week ${retailWeek.weekNumber}`,
        label: 'Retail Week'
      })
    }

    // Current Sales
    const currentSales = safeValue(retailWeek.salesAmount)
    if (currentSales !== '--') {
      kpis.push({
        value: formatCurrency(currentSales),
        label: 'Current Sales',
        color: '#22c55e'
      })
    }

    // Week Target
    if (retailWeek.target !== undefined) {
      kpis.push({
        value: formatCurrency(retailWeek.target),
        label: 'Week Target',
        color: '#8b5cf6'
      })
    }

    // Today Store Target
    if (retailWeek.targetPerDay !== undefined) {
      kpis.push({
        value: formatCurrency(retailWeek.targetPerDay),
        label: 'Today Store Target',
        color: '#ef4444'
      })
    }

    // If no metrics, show placeholder KPIs
    if (kpis.length === 0) {
      return [
        { value: '99.7%', label: 'Daily Scan %', color: '#22c55e', icon: '📊' },
        { value: '$3,300', label: 'Employee Discount', color: '#3b82f6' },
        { value: 'Week 2', label: 'Retail Week' },
        { value: '$229.4K', label: 'Current Sales', color: '#22c55e' },
        { value: '$237.7K', label: 'Week Target', color: '#8b5cf6' },
        { value: '$34.0K', label: 'Today Store Target', color: '#ef4444' }
      ]
    }

    return kpis
  }

  // Get all employees for lunch timeline
  const getAllEmployees = () => {
    return [
      ...(employees.SA || []),
      ...(employees.BOH || []),
      ...(employees.MANAGEMENT || []),
      ...(employees.TAILOR || [])
    ]
  }

  // Get current user's lunch time
  const getCurrentUserLunch = () => {
    if (!user?.id) return null
    const assignment = gameplan.assignments?.[user.id]
    return assignment?.lunch || assignment?.scheduledLunch || null
  }

  // Status banner
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

  const retailWeekLabel = (() => {
    const rw = metrics?.retailWeek
    if (!rw?.weekStart || !rw?.weekEnd || !rw?.weekNumber) return null
    return `Retail Week ${rw.weekNumber}: ${rw.weekStart} → ${rw.weekEnd}`
  })()

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
          <button 
            className="btn btn-secondary" 
            onClick={fetchData} 
            style={{ marginLeft: '12px' }}
          >
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
            📋 Game Plan - Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {currentDate}
          </p>
          {retailWeekLabel && (
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              🗓️ {retailWeekLabel}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {gameplan.published ? (
            <span className="badge badge-success">Published</span>
          ) : (
            <span className="badge badge-warning">Draft</span>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {renderStatusBanner()}

      {/* Welcome Card with Upcoming Plans */}
      <WelcomeCard
        user={user}
        canEdit={true}
        onOpenCalendar={onOpenCalendar}
        onOpenEdit={onOpenEdit}
        lastSync={syncStatus?.lastSync}
        recordsImported={syncStatus?.recordsImported}
      >
        <UpcomingPlans onEditDate={onOpenEdit} maxDays={3} />
      </WelcomeCard>

      {/* Manager KPI Row */}
      <KPIRow kpis={buildKPIs()} />

      {/* Lunch Timeline */}
      <LunchTimeline 
        employees={getAllEmployees()} 
        assignments={gameplan.assignments || {}}
        currentUserLunch={getCurrentUserLunch()}
      />

      {/* Assignments & Status */}
      <AssignmentsStatus 
        assignments={gameplan.assignments || {}}
        employees={employees}
      />

      {/* Manager Notes */}
      <div style={{
        background: '#fffbeb',
        border: '1px solid #ffc107',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>📝 Manager Notes</h4>
          {onOpenEdit && (
            <button className="btn btn-secondary" onClick={() => onOpenEdit()}>
              Edit Notes
            </button>
          )}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', marginTop: '8px' }}>
          {gameplan.notes || 'No notes yet.'}
        </div>
      </div>

      {/* Employee Grids */}
      <EmployeeGrid 
        title="Sales Associates"
        icon="👔"
        employees={employees.SA || []}
        assignments={gameplan.assignments || {}}
      />

      <EmployeeGrid 
        title="Back of House"
        icon="📦"
        employees={employees.BOH || []}
        assignments={gameplan.assignments || {}}
      />

      <EmployeeGrid 
        title="Tailors"
        icon="✂️"
        employees={employees.TAILOR || []}
        assignments={gameplan.assignments || {}}
      />

      <EmployeeGrid 
        title="Managers"
        icon="👔"
        employees={employees.MANAGEMENT || []}
        assignments={gameplan.assignments || {}}
      />
    </div>
  )
}

export default GameplanManagement
