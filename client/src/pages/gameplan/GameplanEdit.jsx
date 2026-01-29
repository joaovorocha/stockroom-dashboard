/**
 * GameplanEdit - Full editor for creating/modifying game plans
 * Matches legacy gameplan-edit.html structure
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import client from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import './GameplanEdit.css'

const GameplanEdit = ({ date, onBack, onOpenCalendar }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] })
  const [assignments, setAssignments] = useState({})
  const [dailyScanAssignedId, setDailyScanAssignedId] = useState(null)
  const [notes, setNotes] = useState('')
  const [published, setPublished] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [currentDate, setCurrentDate] = useState(date || new Date().toISOString().split('T')[0])
  const [initialSnapshot, setInitialSnapshot] = useState({ assignments: {}, notes: '' })
  const [settings, setSettings] = useState({ zones: [], fittingRooms: [], shifts: [], lunchTimes: [], closingSections: [] })
  const [metrics, setMetrics] = useState({})
  const [storeConfig, setStoreConfig] = useState({ currency: 'USD' })
  const [weekKey, setWeekKey] = useState(null)
  const [weeklyGoalEnabled, setWeeklyGoalEnabled] = useState(false)
  const [weeklyGoalPercents, setWeeklyGoalPercents] = useState([15, 15, 14, 14, 14, 14, 14])
  const [weeklyGoalMeta, setWeeklyGoalMeta] = useState({ updatedAt: null, updatedBy: null })
  const [manualWeeklyGoal, setManualWeeklyGoal] = useState({ enabled: false, value: '' })
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const notesEditorRef = useRef(null)

  useEffect(() => {
    fetchData()
  }, [currentDate])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [employeesRes, gameplanRes, settingsRes, dailyScanRes, metricsRes, storeConfigRes] = await Promise.all([
        client.get('/gameplan/employees'),
        client.get(`/gameplan/date/${currentDate}`),
        client.get('/gameplan/settings'),
        client.get('/gameplan/daily-scan/check', { params: { date: currentDate } }).catch(() => ({ data: { assigned: false } })),
        client.get('/gameplan/metrics').catch(() => ({ data: {} })),
        client.get('/gameplan/store-config').catch(() => ({ data: { currency: 'USD' } }))
      ])

      const emps = employeesRes.data?.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] }
      setEmployees(emps)

      const gamePlanData = gameplanRes.data || {}
      const existingAssignments = gamePlanData.assignments || {}
      
      // Build assignments object with all employees
      const initialAssignments = {}
      Object.values(emps).flat().forEach(emp => {
        const assignment = existingAssignments[emp.id] || {}
        initialAssignments[emp.id] = {
          name: emp.name,
          type: emp.type || emp.employeeType || 'SA',
          isOff: assignment.isOff !== undefined ? assignment.isOff : (emp.isOff || false),
          shift: assignment.shift || emp.shift || '',
          zones: assignment.zones || emp.zones || [],
          fittingRoom: assignment.fittingRooms?.[0] || emp.fittingRoom || '',
          lunch: assignment.lunch || emp.lunch || '',
          taskOfTheDay: assignment.taskOfTheDay || emp.taskOfTheDay || '',
          closingSections: assignment.closingSections || emp.closingSections || []
        }
      })
      
      setAssignments(initialAssignments)
      setNotes(gamePlanData.notes || '')
      setInitialSnapshot({ assignments: initialAssignments, notes: gamePlanData.notes || '' })
      setPublished(gamePlanData.isPublished || false)
      setLocked(gamePlanData.locked || false)
      setSettings({
        zones: settingsRes.data?.zones?.map(z => z.name) || [],
        fittingRooms: settingsRes.data?.fittingRooms?.map(fr => fr.name) || [],
        shifts: settingsRes.data?.shifts?.map(s => s.name) || [],
        lunchTimes: settingsRes.data?.lunchTimes || [],
        closingSections: settingsRes.data?.closingSections?.map(s => s.name) || []
      })
      setMetrics(metricsRes.data || {})
      setStoreConfig(storeConfigRes.data || { currency: 'USD' })
      setDailyScanAssignedId(dailyScanRes.data?.assigned ? dailyScanRes.data?.employeeId : null)
    } catch (err) {
      setError(err.message || 'Failed to load game plan')
    } finally {
      setLoading(false)
    }
  }

  const getWeekKeyFromMetrics = (retailWeek, dateStr) => {
    const weekNumber = retailWeek?.weekNumber
    if (!weekNumber) return null
    const baseDate = retailWeek?.weekStart ? new Date(`${retailWeek.weekStart}T12:00:00`) : new Date(`${dateStr}T12:00:00`)
    const year = baseDate.getFullYear()
    return `${year}-W${String(weekNumber).padStart(2, '0')}`
  }

  useEffect(() => {
    const retailWeek = metrics?.retailWeek || {}
    const key = getWeekKeyFromMetrics(retailWeek, currentDate)
    setWeekKey(key)
  }, [metrics, currentDate])

  useEffect(() => {
    const loadWeeklyGoal = async () => {
      if (!weekKey) return
      try {
        const res = await client.get(`/gameplan/weekly-goal-distribution/${weekKey}`)
        const dist = res.data || { enabled: false, percents: [15, 15, 14, 14, 14, 14, 14] }
        setWeeklyGoalEnabled(!!dist.enabled)
        setWeeklyGoalPercents(Array.isArray(dist.percents) ? dist.percents : [15, 15, 14, 14, 14, 14, 14])
        setWeeklyGoalMeta({ updatedAt: dist.updatedAt || null, updatedBy: dist.updatedBy || null })
      } catch (_) {
        setWeeklyGoalEnabled(false)
        setWeeklyGoalPercents([15, 15, 14, 14, 14, 14, 14])
        setWeeklyGoalMeta({ updatedAt: null, updatedBy: null })
      }

      try {
        const raw = localStorage.getItem(`manualWeeklyGoal:${weekKey}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          setManualWeeklyGoal({
            enabled: parsed?.enabled === true,
            value: parsed?.value ?? ''
          })
        } else {
          setManualWeeklyGoal({ enabled: false, value: '' })
        }
      } catch (_) {
        setManualWeeklyGoal({ enabled: false, value: '' })
      }
    }
    loadWeeklyGoal()
  }, [weekKey])

  // Update assignment for an employee
  const updateAssignment = useCallback((empId, field, value) => {
    setAssignments(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }))
    setHasChanges(true)
  }, [])

  // Toggle day off
  const toggleDayOff = useCallback((empId) => {
    setAssignments(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        isOff: !prev[empId]?.isOff
      }
    }))
    setHasChanges(true)
  }, [])

  // Toggle zone
  const toggleZone = useCallback((empId, zone) => {
    setAssignments(prev => {
      const current = prev[empId]?.zones || []
      const newZones = current.includes(zone)
        ? current.filter(z => z !== zone)
        : [...current, zone]
      return {
        ...prev,
        [empId]: {
          ...prev[empId],
          zones: newZones
        }
      }
    })
    setHasChanges(true)
  }, [])

  const toggleClosingSection = useCallback((empId, section) => {
    setAssignments(prev => {
      const current = prev[empId]?.closingSections || []
      const assignedCount = Object.values(prev || {}).filter(a => (a?.closingSections || []).includes(section)).length
      const isCurrentlyAssigned = current.includes(section)
      if (!isCurrentlyAssigned && assignedCount >= MAX_CLOSING_ASSIGNEES) return prev
      const newSections = current.includes(section)
        ? current.filter(s => s !== section)
        : [...current, section]
      return {
        ...prev,
        [empId]: {
          ...prev[empId],
          closingSections: newSections
        }
      }
    })
    setHasChanges(true)
  }, [])

  const assignDailyScan = async (empId, assign) => {
    try {
      if (assign && dailyScanAssignedId && dailyScanAssignedId !== empId) {
        const ok = confirm('Daily Scan is already assigned. Reassign to this employee?')
        if (!ok) return
      }
      await client.post('/gameplan/daily-scan/assign', { employeeId: empId, assign, date: currentDate })
      setDailyScanAssignedId(assign ? empId : null)
    } catch (err) {
      alert('Failed to assign Daily Scan: ' + (err.response?.data?.error || err.message))
    }
  }

  // Save all changes
  const saveChanges = async (publish = false) => {
    try {
      setSaving(true)
      await client.post('/gameplan/save', {
        date: currentDate,
        assignments,
        notes,
        publish
      })
      setPublished(publish)
      setInitialSnapshot({ assignments, notes })
      setHasChanges(false)
      alert(publish ? 'Game plan published!' : 'Game plan saved as draft')
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  // Date navigation
  const goToDate = (newDate) => {
    if (hasChanges && !confirm('You have unsaved changes. Continue?')) return
    setCurrentDate(newDate)
    setHasChanges(false)
  }

  const goToPrevDay = () => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - 1)
    goToDate(d.toISOString().split('T')[0])
  }

  const goToNextDay = () => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + 1)
    goToDate(d.toISOString().split('T')[0])
  }

  // Is today?
  const isToday = currentDate === new Date().toISOString().split('T')[0]
  const isFuture = new Date(currentDate) > new Date()

  const statusInfo = (() => {
    if (hasChanges) {
      return { label: 'Unsaved changes', color: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' }
    }
    if (isToday && !published) {
      return { label: 'Today not published', color: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '⛔' }
    }
    if (isFuture && !published) {
      return { label: 'Future draft', color: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '📝' }
    }
    if (isFuture && published) {
      return { label: 'Future scheduled', color: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: '📅' }
    }
    return { label: 'All changes saved', color: '#dcfce7', border: '#22c55e', text: '#166534', icon: '✅' }
  })()

  const ZONES = settings.zones || []
  const FITTING_ROOMS = settings.fittingRooms || []
  const SHIFTS = settings.shifts || []
  const LUNCH_TIMES = settings.lunchTimes || []
  const CLOSING_SECTIONS = settings.closingSections || []
  const MAX_CLOSING_ASSIGNEES = Number(settings.closingDutyMaxAssignees || 3)

  const retailWeek = metrics?.retailWeek || {}
  const weeklyTarget = manualWeeklyGoal.enabled && manualWeeklyGoal.value !== ''
    ? Number(manualWeeklyGoal.value)
    : Number(retailWeek?.target || 0)

  const formatCurrency = (amount) => {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '--'
    const currency = (storeConfig?.currency || 'USD').toString().trim() || 'USD'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  }

  const weekStartDate = (() => {
    if (retailWeek?.weekStart) return new Date(`${retailWeek.weekStart}T12:00:00`)
    const d = new Date(`${currentDate}T12:00:00`)
    const start = new Date(d)
    start.setDate(d.getDate() - d.getDay())
    return start
  })()

  const weekDates = [...Array(7)].map((_, idx) => {
    const d = new Date(weekStartDate)
    d.setDate(weekStartDate.getDate() + idx)
    return d
  })

  const weekTotal = weeklyGoalPercents.reduce((a, b) => a + Number(b || 0), 0)

  const updateWeeklyPercent = (index, value) => {
    const next = [...weeklyGoalPercents]
    next[index] = Number(value)
    setWeeklyGoalPercents(next)
  }

  const normalizeWeeklyPercents = () => {
    const total = weeklyGoalPercents.reduce((a, b) => a + Number(b || 0), 0)
    if (!total) return
    const scaled = weeklyGoalPercents.map(p => Math.round((Number(p || 0) / total) * 100 * 100) / 100)
    const sum = scaled.reduce((a, b) => a + b, 0)
    const diff = Math.round((100 - sum) * 100) / 100
    scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + diff) * 100) / 100
    setWeeklyGoalPercents(scaled)
  }

  const saveWeeklyGoalDistribution = async () => {
    if (!weekKey) return
    try {
      await client.post(`/gameplan/weekly-goal-distribution/${weekKey}`, {
        enabled: weeklyGoalEnabled,
        percents: weeklyGoalPercents
      })
      alert('Weekly goal distribution saved')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save weekly goal distribution')
    }
  }

  const setManualGoalEnabled = (enabled) => {
    const next = { ...manualWeeklyGoal, enabled }
    setManualWeeklyGoal(next)
    if (weekKey) {
      localStorage.setItem(`manualWeeklyGoal:${weekKey}`, JSON.stringify(next))
    }
  }

  const setManualGoalValue = (value) => {
    const next = { ...manualWeeklyGoal, value }
    setManualWeeklyGoal(next)
    if (weekKey) {
      localStorage.setItem(`manualWeeklyGoal:${weekKey}`, JSON.stringify(next))
    }
  }

  const execCommand = (cmd, value = null) => {
    document.execCommand(cmd, false, value)
  }

  const onNotesInput = () => {
    const html = notesEditorRef.current?.innerHTML || ''
    setNotes(html)
    setHasChanges(true)
  }

  useEffect(() => {
    if (!notesEditorRef.current) return
    if (notesEditorRef.current.innerHTML !== notes) {
      notesEditorRef.current.innerHTML = notes || ''
    }
  }, [notes])

  const fittingRoomAssignments = Object.entries(assignments || {}).reduce((acc, [empId, assignment]) => {
    const room = (assignment?.fittingRoom || '').trim()
    if (room) {
      acc[room] = {
        employeeId: empId,
        name: assignment?.name || 'Assigned'
      }
    }
    return acc
  }, {})

  const closingDutyAssignments = Object.values(assignments || {}).reduce((acc, assignment) => {
    const sections = assignment?.closingSections || []
    sections.forEach(section => {
      if (!acc[section]) acc[section] = []
      if (assignment?.name && !acc[section].includes(assignment.name)) {
        acc[section].push(assignment.name)
      }
    })
    return acc
  }, {})

  // Render employee edit card
  const renderEmployeeCard = (emp) => {
    const assignment = assignments[emp.id] || {}
    const isOff = assignment.isOff

    return (
      <div 
        key={emp.id}
        className="edit-card"
        style={{
          flex: '0 0 auto',
          width: '280px',
          background: isOff ? '#eef0f3' : 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          opacity: isOff ? 0.7 : 1,
          scrollSnapAlign: 'start'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              {(emp.name || '').split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{emp.name?.split(' ')[0] || 'Unknown'}</h4>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{emp.type || 'SA'}</span>
            </div>
          </div>

          {/* Day Off Toggle */}
          <label className="toggle-switch" aria-label={`Toggle ${emp.name} day off`}>
            <input 
              type="checkbox" 
              checked={isOff || false}
              onChange={() => toggleDayOff(emp.id)}
            />
            <span className="toggle-slider" />
            <span className="toggle-label">Day Off</span>
          </label>
        </div>

        {/* Fields (hidden when off) */}
        {!isOff && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Shift */}
            <div className="edit-field">
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Shift
              </label>
              <select
                value={assignment.shift || ''}
                onChange={(e) => updateAssignment(emp.id, 'shift', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              >
                <option value="">-- Select --</option>
                {SHIFTS.map(shift => (
                  <option key={shift} value={shift}>{shift}</option>
                ))}
              </select>
            </div>

            {/* Zones (for SA) */}
            {(emp.type === 'SA' || !emp.type) && (
              <div className="edit-field">
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Zones
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ZONES.map(zone => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => toggleZone(emp.id, zone)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: (assignment.zones || []).includes(zone) ? 'var(--primary)' : 'var(--surface)',
                        color: (assignment.zones || []).includes(zone) ? 'white' : 'var(--text)',
                        cursor: 'pointer'
                      }}
                    >
                      {zone}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fitting Room (for SA) */}
            {(emp.type === 'SA' || !emp.type) && (
              <div className="edit-field">
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Fitting Room
                </label>
                <select
                  value={assignment.fittingRoom || ''}
                  onChange={(e) => updateAssignment(emp.id, 'fittingRoom', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                >
                  <option value="">-- Select --</option>
                  {FITTING_ROOMS.map(fr => {
                    const assignedTo = fittingRoomAssignments[fr]
                    const takenByOther = assignedTo && assignedTo.employeeId !== emp.id
                    const label = takenByOther ? `${fr} (Taken by ${assignedTo.name})` : fr
                    return (
                      <option key={fr} value={fr} disabled={takenByOther}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                {assignment.fittingRoom && (
                  <div
                    className={
                      fittingRoomAssignments[assignment.fittingRoom]?.employeeId === emp.id
                        ? 'status-pill status-pill--good'
                        : 'status-pill status-pill--warn'
                    }
                  >
                    {fittingRoomAssignments[assignment.fittingRoom]?.employeeId === emp.id
                      ? 'Assigned to you'
                      : `Taken by ${fittingRoomAssignments[assignment.fittingRoom]?.name || 'another associate'}`}
                  </div>
                )}
              </div>
            )}
            {/* Daily Scan */}
            {(emp.type === 'SA' || emp.type === 'MANAGEMENT' || !emp.type) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={dailyScanAssignedId === emp.id}
                  onChange={(e) => assignDailyScan(emp.id, e.target.checked)}
                  disabled={!!dailyScanAssignedId && dailyScanAssignedId !== emp.id}
                />
                Daily Scan
              </label>
            )}

            {/* Closing Duties */}
            {CLOSING_SECTIONS.length > 0 && (emp.type === 'MANAGEMENT' || emp.type === 'SA' || emp.type === 'BOH') && (
              <div className="edit-field">
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Closing Duties
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {CLOSING_SECTIONS.map(section => {
                    const assignedCount = closingDutyAssignments[section]?.length || 0
                    const isSelected = (assignment.closingSections || []).includes(section)
                    const dutyStateClass = assignedCount >= MAX_CLOSING_ASSIGNEES
                      ? 'duty-chip--full'
                      : assignedCount > 0
                        ? 'duty-chip--partial'
                        : 'duty-chip--empty'
                    return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => toggleClosingSection(emp.id, section)}
                      className={`duty-chip ${dutyStateClass} ${isSelected ? 'duty-chip--selected' : ''}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: (assignment.closingSections || []).includes(section) ? 'var(--primary)' : 'var(--surface)',
                        color: (assignment.closingSections || []).includes(section) ? 'white' : 'var(--text)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      {(closingDutyAssignments[section]?.length || 0) > 0 && (
                        <span className="duty-balloon">
                          {closingDutyAssignments[section].join(', ')}
                        </span>
                      )}
                      {(closingDutyAssignments[section]?.length || 0) > 0 && (
                        <span className="duty-slot">
                          {(closingDutyAssignments[section]?.length || 0)}/{MAX_CLOSING_ASSIGNEES}
                        </span>
                      )}
                      {section}
                    </button>
                  )})}
                </div>
              </div>
            )}

            {/* Lunch */}
            <div className="edit-field">
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Lunch
              </label>
              <select
                value={assignment.lunch || ''}
                onChange={(e) => updateAssignment(emp.id, 'lunch', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              >
                <option value="">-- Select --</option>
                {LUNCH_TIMES.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>

            {/* Task of the Day */}
            <div className="edit-field">
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Task of the Day
              </label>
              <input
                type="text"
                value={assignment.taskOfTheDay || ''}
                onChange={(e) => updateAssignment(emp.id, 'taskOfTheDay', e.target.value)}
                placeholder="Special task..."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>
        )}
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
    <div className="container" style={{ maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
            ← Back
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>✏️ Edit Game Plan</h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Date Navigation */}
          <button onClick={goToPrevDay} className="btn btn-secondary" style={{ padding: '6px 10px' }}>‹</button>
          <input 
            type="date" 
            value={currentDate}
            onChange={(e) => goToDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}
          />
          <button onClick={goToNextDay} className="btn btn-secondary" style={{ padding: '6px 10px' }}>›</button>

          {/* Calendar Button */}
          {onOpenCalendar && (
            <button onClick={onOpenCalendar} className="btn btn-secondary">
              📅 Calendar
            </button>
          )}
        </div>
      </div>

      {/* Date Banner */}
      {(isToday || isFuture) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 14px',
          borderRadius: '8px',
          fontWeight: 600,
          marginBottom: '16px',
          color: isToday ? '#064e3b' : '#794c00',
          background: isToday 
            ? 'linear-gradient(90deg, rgba(220,253,230,0.9), rgba(235,252,238,0.85))'
            : 'linear-gradient(90deg, rgba(255,250,205,0.95), rgba(255,249,196,0.9))',
          border: `1px solid ${isToday ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.12)'}`
        }}>
          <span>{isToday ? '📅 Today\'s Game Plan' : '🗓️ Future Game Plan'}</span>
          {published && <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓ Published</span>}
          {locked && <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#dc2626' }}>🔒 Locked</span>}
        </div>
      )}

      <div className="edit-goal-notes-row">
        <section className="section-card" style={{ marginBottom: '20px' }}>
          <div className="section-title" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Weekly Goal Distribution</h3>
              <button className="btn btn-sm" type="button" onClick={() => alert('The weekly goal distribution is linked to all days in this retail week.')}>ℹ️</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manualWeeklyGoal.enabled}
                  onChange={(e) => setManualGoalEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <span>Manual Target</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="$148,000.00"
                value={manualWeeklyGoal.value}
                onChange={(e) => setManualGoalValue(e.target.value)}
                disabled={!manualWeeklyGoal.enabled}
                style={{ width: '100%', fontSize: '16px', height: '48px', padding: '12px', border: '2px solid var(--border)', borderRadius: '8px', fontWeight: 600 }}
              />
            </div>

            <div style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, height: '28px', display: 'flex', alignItems: 'center' }}>Auto Target</div>
              <input
                type="text"
                value={formatCurrency(retailWeek?.target || 0)}
                disabled
                style={{ width: '100%', background: '#f3f4f6', cursor: 'not-allowed', fontSize: '16px', height: '48px', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontWeight: 600, color: 'var(--text-secondary)' }}
              />
            </div>
          </div>

          <div style={{ background: '#f8f9fa', border: '2px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={weeklyGoalEnabled}
                  onChange={(e) => setWeeklyGoalEnabled(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <span>Adjust Daily %</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm btn-outline" type="button" onClick={normalizeWeeklyPercents}>Normalize</button>
                <button className="btn btn-sm btn-primary" type="button" onClick={saveWeeklyGoalDistribution}>Save</button>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Retail Week {retailWeek?.weekNumber || '--'} • Target {formatCurrency(weeklyTarget)}
              {weeklyGoalMeta.updatedBy ? ` • Updated by ${weeklyGoalMeta.updatedBy}` : ''}
            </div>
            <div className="weekly-goal-grid">
              {weekDates.map((d, idx) => (
                <React.Fragment key={idx}>
                  <div className="weekly-goal-day">
                    <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className="weekly-goal-date">{d.getMonth() + 1}/{d.getDate()}</div>
                  </div>
                  <div className="weekly-goal-slider-wrap">
                    <button
                      type="button"
                      className="weekly-goal-step-btn"
                      onClick={() => updateWeeklyPercent(idx, Math.max(0, Number(weeklyGoalPercents[idx]) - 1))}
                      disabled={!weeklyGoalEnabled}
                    >−</button>
                    <input
                      type="range"
                      className="weekly-goal-slider"
                      min="0"
                      max="40"
                      step="0.5"
                      value={weeklyGoalPercents[idx]}
                      onChange={(e) => updateWeeklyPercent(idx, e.target.value)}
                      disabled={!weeklyGoalEnabled}
                    />
                    <button
                      type="button"
                      className="weekly-goal-step-btn"
                      onClick={() => updateWeeklyPercent(idx, Math.min(40, Number(weeklyGoalPercents[idx]) + 1))}
                      disabled={!weeklyGoalEnabled}
                    >+</button>
                  </div>
                  <div className="weekly-goal-percent">{Number(weeklyGoalPercents[idx]).toFixed(1)}%</div>
                  <div className="weekly-goal-amount">{formatCurrency((weeklyTarget || 0) * (Number(weeklyGoalPercents[idx]) / 100))}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid var(--border)' }}>
              <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600 }}>Total</div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>{weekTotal.toFixed(1)}%</div>
            </div>
          </div>
        </section>

        <section className={`notes-card ${notesCollapsed ? 'collapsed' : ''}`} style={{ marginBottom: '20px' }}>
          <div className="notes-card-header" onClick={() => setNotesCollapsed(!notesCollapsed)}>
            <h3 style={{ margin: 0 }}>📝 Notes</h3>
            <span className="notes-card-toggle">▾</span>
          </div>
          <div className="notes-card-body">
            <div className="notes-editor-container">
              <div className="notes-toolbar">
                <select onChange={(e) => execCommand('fontName', e.target.value)} defaultValue="Arial">
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Courier New">Courier New</option>
                </select>
                <span className="toolbar-divider" />
                <select onChange={(e) => execCommand('fontSize', e.target.value)} defaultValue="3">
                  <option value="1">8pt</option>
                  <option value="2">10pt</option>
                  <option value="3">12pt</option>
                  <option value="4">14pt</option>
                  <option value="5">18pt</option>
                  <option value="6">24pt</option>
                  <option value="7">36pt</option>
                </select>
                <span className="toolbar-divider" />
                <button type="button" onClick={() => execCommand('bold')}><b>B</b></button>
                <button type="button" onClick={() => execCommand('italic')}><i>I</i></button>
                <button type="button" onClick={() => execCommand('underline')}><u>U</u></button>
                <button type="button" onClick={() => execCommand('strikeThrough')}><s>S</s></button>
                <span className="toolbar-divider" />
                <input type="color" onChange={(e) => execCommand('foreColor', e.target.value)} defaultValue="#000000" />
                <input type="color" onChange={(e) => execCommand('hiliteColor', e.target.value)} defaultValue="#ffff00" />
                <span className="toolbar-divider" />
                <button type="button" onClick={() => execCommand('justifyLeft')}>⫷</button>
                <button type="button" onClick={() => execCommand('justifyCenter')}>≡</button>
                <button type="button" onClick={() => execCommand('justifyRight')}>⫸</button>
                <span className="toolbar-divider" />
                <button type="button" onClick={() => execCommand('insertUnorderedList')}>•</button>
                <button type="button" onClick={() => execCommand('insertOrderedList')}>#</button>
                <span className="toolbar-divider" />
                <button type="button" onClick={() => {
                  const url = prompt('Enter URL')
                  if (url) execCommand('createLink', url)
                }}>🔗</button>
                <span className="toolbar-divider" />
                <button type="button" onClick={() => execCommand('indent')}>→</button>
                <button type="button" onClick={() => execCommand('outdent')}>←</button>
                <button type="button" onClick={() => {
                  const emoji = prompt('Emoji')
                  if (emoji) execCommand('insertText', emoji)
                }}>😀</button>
                <button type="button" onClick={() => execCommand('removeFormat')}>✕</button>
              </div>
              <div
                className="notes-editor"
                ref={notesEditorRef}
                contentEditable
                placeholder="Enter today's game plan notes..."
                onInput={onNotesInput}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Employee Sections */}
      {['MANAGEMENT', 'SA', 'BOH', 'TAILOR'].map(type => {
        const emps = employees[type] || []
        if (emps.length === 0) return null

        const labels = {
          MANAGEMENT: { title: 'Managers', icon: '👔' },
          SA: { title: 'Sales Associates', icon: '👔' },
          BOH: { title: 'Back of House', icon: '📦' },
          TAILOR: { title: 'Tailors', icon: '✂️' }
        }

        return (
          <section key={type} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {labels[type].icon} {labels[type].title}
              </h3>
              <span style={{
                background: '#e0e3ea',
                color: '#374151',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                padding: '2px 10px'
              }}>{emps.length}</span>
            </div>

            <div style={{
              display: 'flex',
              gap: '16px',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: '8px'
            }}>
              {emps.map(emp => renderEmployeeCard(emp))}
            </div>
          </section>
        )
      })}

      {/* Save Actions */}
      <div style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '16px',
        width: 'calc(100% - 64px)',
        maxWidth: '1400px',
        background: statusInfo.color,
        border: `1px solid ${statusInfo.border}`,
        borderRadius: '12px',
        padding: '14px 18px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50
      }}>
        <div style={{ fontSize: '13px', color: statusInfo.text, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <span>{statusInfo.icon}</span>
          <span>{statusInfo.label}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="date" 
            value={currentDate}
            onChange={(e) => goToDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}
          />
          <button 
            onClick={() => {
              if (!confirm('Clear all assignments and notes?')) return
              const cleared = {}
              Object.keys(assignments).forEach(id => {
                cleared[id] = { ...assignments[id], isOff: false, shift: '', zones: [], fittingRoom: '', lunch: '', taskOfTheDay: '' }
              })
              setAssignments(cleared)
              setNotes('')
              setHasChanges(true)
            }}
            className="btn btn-secondary"
          >
            Clear All
          </button>
          <button 
            onClick={() => {
              if (!confirm('Discard all changes?')) return
              setAssignments(initialSnapshot.assignments || {})
              setNotes(initialSnapshot.notes || '')
              setHasChanges(false)
            }}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button 
            onClick={() => saveChanges(false)}
            disabled={saving || locked}
            className="btn btn-secondary"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button 
            onClick={() => saveChanges(true)}
            disabled={saving || locked}
            className="btn btn-primary"
            style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
          >
            {saving ? 'Publishing...' : '📣 Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GameplanEdit
