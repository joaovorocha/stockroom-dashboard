import React, { useState, useEffect } from 'react'
import client from '../api/client'

const ClosingDuties = () => {
  const [duties, setDuties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('today')
  const [summary, setSummary] = useState({ total: 0, completed: 0, pending: 0 })

  useEffect(() => {
    fetchDuties()
  }, [])

  const fetchDuties = async () => {
    try {
      setLoading(true)
      const response = await client.get('/closing-duties', { withCredentials: true })
      const data = response.data?.submissions || response.data?.duties || []
      setDuties(Array.isArray(data) ? data : [])
      
      // Calculate summary
      const completed = data.filter(d => d.completed).length
      setSummary({
        total: data.length,
        completed,
        pending: data.length - completed
      })
    } catch (err) {
      setError(err.message || 'Failed to load closing duties')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading closing duties...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchDuties} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Daily Operations</div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>✅ Closing Duties</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>Track and complete end-of-day tasks.</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="summary-card" style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--primary)' }}>{summary.total}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Duties</div>
        </div>
        <div className="summary-card" style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)' }}>{summary.completed}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Completed</div>
        </div>
        <div className="summary-card" style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#ffc107' }}>{summary.pending}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Pending</div>
        </div>
        <div className="summary-card" style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--primary)' }}>
            {summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Completion Rate</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>
        <button 
          className={`tab ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'today' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'today' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            borderRadius: '6px 6px 0 0'
          }}
        >
          Today's Duties
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'history' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'history' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            borderRadius: '6px 6px 0 0'
          }}
        >
          History
        </button>
      </div>

      {/* Duties List */}
      <div>
        {duties.length === 0 ? (
          <div style={{ padding: '16px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
            No closing duties assigned for today.
          </div>
        ) : (
          duties.map((duty, index) => (
            <div 
              key={duty.id || index}
              className="card"
              style={{ 
                padding: '16px', 
                marginBottom: '12px',
                borderColor: duty.completed ? 'var(--success)' : '#ffc107',
                background: duty.completed ? '#f0fff4' : '#fffbeb'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>{duty.section_name || duty.section || duty.name || duty.user_name || 'Closing Submission'}</span>
                <span 
                  style={{ 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    fontWeight: 500,
                    background: duty.completed ? 'var(--success)' : '#ffc107',
                    color: duty.completed ? '#fff' : '#000'
                  }}
                >
                  {duty.completed ? 'Completed' : 'Pending'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {duty.assignedTo && <span>Assigned: {duty.assignedTo}</span>}
                {duty.completedAt && <span>Completed: {formatTime(duty.completedAt)}</span>}
                {duty.completedBy && <span>By: {duty.completedBy}</span>}
              </div>
              {duty.photos && duty.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {duty.photos.map((photo, i) => (
                    <img 
                      key={i}
                      src={photo}
                      alt={`Duty photo ${i + 1}`}
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ClosingDuties
