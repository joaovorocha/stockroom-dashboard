/**
 * GameplanCalendar - Month view calendar with assignment preview
 * NEW FEATURE: Click on a day to see all employee assignments for that date
 */
import React, { useState, useEffect } from 'react'
import client from '../../api/client'

const GameplanCalendar = ({ onBack, onEditDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarData, setCalendarData] = useState({ plans: {}, stats: {} })
  const [loading, setLoading] = useState(true)
  const [previewDate, setPreviewDate] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetchCalendarData()
  }, [currentDate])

  const fetchCalendarData = async () => {
    try {
      setLoading(true)
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const res = await client.get(`/gameplan/calendar/${year}/${month}`)
      setCalendarData(res.data || { plans: {}, stats: {} })
    } catch (err) {
      console.error('Failed to fetch calendar:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch assignment preview for a date
  const fetchPreview = async (dateStr) => {
    try {
      setPreviewLoading(true)
      setPreviewDate(dateStr)
      const res = await client.get(`/gameplan/date/${dateStr}`)
      setPreviewData(res.data)
    } catch (err) {
      console.error('Failed to fetch preview:', err)
      setPreviewData(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Navigate months
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setPreviewDate(null)
    setPreviewData(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setPreviewDate(null)
    setPreviewData(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setPreviewDate(null)
    setPreviewData(null)
  }

  // Build calendar grid
  const buildCalendarDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = firstDay.getDay() // 0 = Sunday
    const totalDays = lastDay.getDate()
    const today = new Date().toISOString().split('T')[0]

    const days = []

    // Padding for days before month starts
    for (let i = 0; i < startPadding; i++) {
      const prevDate = new Date(year, month, -startPadding + i + 1)
      days.push({
        date: prevDate.toISOString().split('T')[0],
        day: prevDate.getDate(),
        isOtherMonth: true
      })
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d)
      const dateStr = date.toISOString().split('T')[0]
      const plan = calendarData.plans?.[dateStr]

      days.push({
        date: dateStr,
        day: d,
        isOtherMonth: false,
        isToday: dateStr === today,
        hasPlan: !!plan,
        published: plan?.published || false,
        locked: plan?.locked || false
      })
    }

    // Padding for days after month ends (fill to 42 = 6 weeks)
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i)
      days.push({
        date: nextDate.toISOString().split('T')[0],
        day: nextDate.getDate(),
        isOtherMonth: true
      })
    }

    return days
  }

  // Get status badge color
  const getStatusColor = (day) => {
    if (day.locked) return '#ef4444'
    if (day.published) return '#22c55e'
    if (day.hasPlan) return '#f59e0b'
    return 'transparent'
  }

  // Format month name
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const days = buildCalendarDays()
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="container" style={{ maxWidth: '1200px' }}>
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
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>📅 Game Plan Calendar</h1>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>{monthName}</h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={goToPrevMonth} className="btn btn-secondary" style={{ padding: '6px 12px' }}>‹</button>
            <button onClick={goToToday} className="btn btn-secondary" style={{ padding: '6px 12px' }}>Today</button>
            <button onClick={goToNextMonth} className="btn btn-secondary" style={{ padding: '6px 12px' }}>›</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
          <span>📋 Total: <strong>{calendarData.stats?.total || 0}</strong></span>
          <span style={{ color: '#22c55e' }}>✓ Published: <strong>{calendarData.stats?.published || 0}</strong></span>
          <span style={{ color: '#f59e0b' }}>📝 Drafts: <strong>{calendarData.stats?.drafts || 0}</strong></span>
        </div>
      </div>

      {/* Main Layout: Calendar + Preview Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Calendar Grid */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Weekday Headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--background)'
          }}>
            {weekdays.map(day => (
              <div key={day} style={{
                padding: '12px 8px',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: '14px',
                color: 'var(--text)',
                borderBottom: '1px solid var(--border)'
              }}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading calendar...
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '1px',
              background: 'var(--border)'
            }}>
              {days.map((day, index) => (
                <div
                  key={index}
                  onClick={() => !day.isOtherMonth && fetchPreview(day.date)}
                  style={{
                    background: day.isToday ? '#f0f9ff' : day.isOtherMonth ? '#f8fafc' : 'white',
                    minHeight: '90px',
                    padding: '8px',
                    cursor: day.isOtherMonth ? 'default' : 'pointer',
                    position: 'relative',
                    transition: 'background 0.15s',
                    opacity: day.isOtherMonth ? 0.5 : 1,
                    border: previewDate === day.date ? '2px solid var(--primary)' : '2px solid transparent'
                  }}
                >
                  <div style={{
                    fontWeight: day.isToday ? 700 : 600,
                    fontSize: '14px',
                    marginBottom: '6px',
                    color: day.isToday ? 'var(--primary)' : day.isOtherMonth ? 'var(--text-secondary)' : 'var(--text)'
                  }}>
                    {day.day}
                  </div>

                  {/* Plan Status Indicator */}
                  {day.hasPlan && !day.isOtherMonth && (
                    <div style={{
                      padding: '3px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 500,
                      textAlign: 'center',
                      background: day.locked ? '#fee2e2' : day.published ? '#d1fae5' : '#fef3c7',
                      color: day.locked ? '#991b1b' : day.published ? '#065f46' : '#92400e',
                      border: `1px solid ${getStatusColor(day)}`
                    }}>
                      {day.locked ? '🔒 Locked' : day.published ? '✓ Published' : '📝 Draft'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
          position: 'sticky',
          top: '20px',
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto'
        }}>
          {!previewDate ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>👆</div>
              <div>Click on a date to preview assignments</div>
            </div>
          ) : previewLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
              <div>Loading assignments...</div>
            </div>
          ) : (
            <div>
              {/* Preview Header */}
              <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                    {new Date(previewDate + 'T12:00:00').toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </h3>
                  {onEditDate && (
                    <button 
                      onClick={() => onEditDate(previewDate)} 
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {previewData?.published ? '✓ Published' : previewData ? '📝 Draft' : 'No plan created'}
                </div>
              </div>

              {/* Assignment Preview */}
              {previewData?.assignments && Object.keys(previewData.assignments).length > 0 ? (
                <div>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Assignments ({Object.keys(previewData.assignments).length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(previewData.assignments).map(([empId, assignment]) => {
                      const isOff = assignment.isOff || assignment.is_off
                      return (
                        <div 
                          key={empId}
                          style={{
                            background: isOff ? '#f3f4f6' : 'var(--background)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            opacity: isOff ? 0.7 : 1
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>
                              {assignment.name || assignment.employeeName || `Employee ${empId}`}
                            </span>
                            {isOff ? (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Day Off</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {assignment.shift || '--'}
                              </span>
                            )}
                          </div>
                          {!isOff && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {assignment.zones?.length > 0 && <span>Zone: {assignment.zones.join(', ')} · </span>}
                              {(assignment.fittingRoom || assignment.fitting_room) && <span>FR: {assignment.fittingRoom || assignment.fitting_room} · </span>}
                              {assignment.taskOfTheDay && <span>Task: {assignment.taskOfTheDay}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                  No assignments for this date
                  {onEditDate && (
                    <div style={{ marginTop: '12px' }}>
                      <button 
                        onClick={() => onEditDate(previewDate)} 
                        className="btn btn-primary"
                      >
                        Create Plan
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Preview */}
              {previewData?.notes && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>📝 Notes</h4>
                  <div style={{ 
                    fontSize: '13px', 
                    whiteSpace: 'pre-wrap',
                    background: '#fffbeb',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ffc107'
                  }}>
                    {previewData.notes}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '24px',
        marginTop: '20px',
        padding: '12px 16px',
        background: 'var(--surface)',
        borderRadius: '8px',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#d1fae5', border: '1px solid #22c55e', borderRadius: '3px' }}></div>
          Published
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '3px' }}></div>
          Draft
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '3px' }}></div>
          Locked
        </div>
      </div>
    </div>
  )
}

export default GameplanCalendar
