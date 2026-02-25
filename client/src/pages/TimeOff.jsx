import React, { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const TimeOff = () => {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [myEntries, setMyEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    notes: ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchTimeOff()
  }, [])

  const fetchTimeOff = async () => {
    try {
      setLoading(true)
      const response = await client.get('/timeoff', { withCredentials: true })
      setEntries(response.data?.entries || [])
      setMyEntries(response.data?.myEntries || [])
    } catch (err) {
      setError(err.message || 'Failed to load time-off data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.startDate || !formData.endDate) {
      alert('Please select start and end dates')
      return
    }
    try {
      setSubmitting(true)
      await client.post('/timeoff/request', formData, { withCredentials: true })
      setShowModal(false)
      setFormData({ startDate: '', endDate: '', reason: '', notes: '' })
      fetchTimeOff()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = []

    // Add days from previous month to fill first week
    const startDayOfWeek = firstDay.getDay()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      days.push({ date: d, otherMonth: true })
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), otherMonth: false })
    }

    // Add days from next month to fill last week
    const remaining = 42 - days.length // 6 weeks
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), otherMonth: true })
    }

    return days
  }

  const formatDateKey = (date) => {
    return date.toISOString().slice(0, 10)
  }

  const isToday = (date) => {
    const today = new Date()
    return formatDateKey(date) === formatDateKey(today)
  }

  const getEventsForDate = (date) => {
    const dateKey = formatDateKey(date)
    return entries.filter(e => {
      return dateKey >= e.startDate && dateKey <= e.endDate
    })
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'approved':
      case 'published':
        return 'success'
      case 'pending':
        return 'warning'
      case 'denied':
        return 'danger'
      default:
        return 'secondary'
    }
  }

  const getEventColor = (entry) => {
    const colors = [
      '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63',
      '#00BCD4', '#795548', '#607D8B', '#FF5722', '#3F51B5'
    ]
    const hash = (entry.employeeName || '').split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const days = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading time-off calendar...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchTimeOff} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Daily Operations</div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>📅 Time Off Calendar</h1>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          style={{ padding: '10px 20px' }}
        >
          + Request Time Off
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>
        <button 
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'calendar' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'calendar' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            borderRadius: '6px 6px 0 0'
          }}
        >
          Calendar View
        </button>
        <button 
          className={`tab ${activeTab === 'my-requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-requests')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'my-requests' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'my-requests' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            borderRadius: '6px 6px 0 0'
          }}
        >
          My Requests ({myEntries.length})
        </button>
      </div>

      {activeTab === 'calendar' && (
        <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>{monthName}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={prevMonth} style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', borderRadius: '4px' }}>
                ← Prev
              </button>
              <button onClick={() => setCurrentMonth(new Date())} style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', borderRadius: '4px' }}>
                Today
              </button>
              <button onClick={nextMonth} style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', borderRadius: '4px' }}>
                Next →
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {day}
              </div>
            ))}
            {days.map((day, idx) => {
              const events = getEventsForDate(day.date)
              return (
                <div 
                  key={idx}
                  style={{
                    minHeight: '100px',
                    padding: '8px',
                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                    borderBottom: '1px solid var(--border)',
                    background: isToday(day.date) ? '#e3f2fd' : day.otherMonth ? 'var(--surface)' : 'var(--background)',
                    opacity: day.otherMonth ? 0.5 : 1
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                    {day.date.getDate()}
                  </div>
                  {events.slice(0, 3).map((event, i) => (
                    <div 
                      key={i}
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        marginBottom: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        background: getEventColor(event),
                        color: '#fff',
                        fontWeight: 500
                      }}
                      title={event.employeeName}
                    >
                      {event.employeeName}
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      +{events.length - 3} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'my-requests' && (
        <div>
          {myEntries.length === 0 ? (
            <div style={{ padding: '24px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              You haven't submitted any time-off requests yet.
            </div>
          ) : (
            myEntries.map((entry, idx) => (
              <div 
                key={entry.id || idx}
                className="card"
                style={{ padding: '16px', marginBottom: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600 }}>
                    {entry.startDate} → {entry.endDate}
                  </span>
                  <span 
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      background: `var(--${getStatusClass(entry.status)})`,
                      color: '#fff'
                    }}
                  >
                    {entry.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Reason</label>
                    <div>{entry.reason || 'N/A'}</div>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Submitted</label>
                    <div>{entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString() : 'N/A'}</div>
                  </div>
                  {entry.decidedBy && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Decided By</label>
                      <div>{entry.decidedBy}</div>
                    </div>
                  )}
                </div>
                {entry.notes && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <strong>Notes:</strong> {entry.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Request Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'var(--background)', borderRadius: '8px', padding: '24px', maxWidth: '400px', width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px' }}>Request Time Off</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Start Date *</label>
                <input 
                  type="date" 
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '8px' }}
                  required
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>End Date *</label>
                <input 
                  type="date" 
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '8px' }}
                  required
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Reason</label>
                <select 
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">Select reason...</option>
                  <option value="Vacation">Vacation</option>
                  <option value="Personal">Personal</option>
                  <option value="Medical">Medical</option>
                  <option value="Family">Family</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Notes</label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '8px', minHeight: '80px' }}
                  placeholder="Any additional details..."
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TimeOff
