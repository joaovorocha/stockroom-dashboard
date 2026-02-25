import React, { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const LostPunch = () => {
  const { user, isManager, isAdmin } = useAuth()
  const [requests, setRequests] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('submit')
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    missedDate: '',
    clockInTime: '',
    lunchOutTime: '',
    lunchInTime: '',
    clockOutTime: '',
    punchType: 'clock-in',
    reason: ''
  })

  const canManage = isManager || isAdmin || user?.canManageLostPunch

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const response = await client.get('/lost-punch', { withCredentials: true })
      const data = Array.isArray(response.data) ? response.data : []
      
      // Split into my requests vs all (for managers)
      if (canManage) {
        setRequests(data)
        setMyRequests(data.filter(r => r.user_id === user?.id))
      } else {
        setMyRequests(data)
        setRequests([])
      }
    } catch (err) {
      setError(err.message || 'Failed to load lost punch requests')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.missedDate) {
      alert('Please select the date of the missed punch')
      return
    }
    try {
      setSubmitting(true)
      await client.post('/lost-punch', {
        ...formData,
        employeeName: user?.name,
        employeeId: user?.employeeId
      }, { withCredentials: true })
      setFormData({
        missedDate: '',
        clockInTime: '',
        lunchOutTime: '',
        lunchInTime: '',
        clockOutTime: '',
        punchType: 'clock-in',
        reason: ''
      })
      setActiveTab('history')
      fetchRequests()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async (id) => {
    if (!confirm('Approve this lost punch request?')) return
    try {
      await client.put(`/lost-punch/${id}/approve`, {}, { withCredentials: true })
      fetchRequests()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve request')
    }
  }

  const handleDeny = async (id) => {
    const reason = prompt('Reason for denial (optional):')
    try {
      await client.put(`/lost-punch/${id}/deny`, { reason }, { withCredentials: true })
      fetchRequests()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deny request')
    }
  }

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'approved'
      case 'pending':
        return 'pending'
      case 'denied':
        return 'denied'
      default:
        return ''
    }
  }

  const formatDate = (value) => {
    if (!value) return 'N/A'
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading lost punch requests...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchRequests} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Daily Operations</div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>🕒 Lost Punch</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Submit and review time clock correction requests.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button 
          className={`tab ${activeTab === 'submit' ? 'active' : ''}`}
          onClick={() => setActiveTab('submit')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'submit' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'submit' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            borderRadius: '6px 6px 0 0'
          }}
        >
          Submit Request
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
          My History ({myRequests.length})
        </button>
        {canManage && (
          <button 
            className={`tab ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === 'review' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'review' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              borderRadius: '6px 6px 0 0'
            }}
          >
            Manager Review {pendingCount > 0 && <span style={{ background: '#dc3545', color: '#fff', borderRadius: '10px', padding: '2px 8px', marginLeft: '6px', fontSize: '11px' }}>{pendingCount}</span>}
          </button>
        )}
      </div>

      {/* Submit Tab */}
      {activeTab === 'submit' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ marginBottom: '18px' }}>
            <h3 style={{ margin: '0 0 6px' }}>Report a missed punch</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Share the date and any times you need corrected. Managers get notified immediately.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Date of missed punch *</label>
                <input 
                  type="date"
                  value={formData.missedDate}
                  onChange={(e) => setFormData({ ...formData, missedDate: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Punch Type *</label>
                <select 
                  value={formData.punchType}
                  onChange={(e) => setFormData({ ...formData, punchType: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                >
                  <option value="clock-in">Clock In</option>
                  <option value="lunch-out">Lunch Out</option>
                  <option value="lunch-in">Lunch In</option>
                  <option value="clock-out">Clock Out</option>
                  <option value="multiple">Multiple Punches</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Clock In Time</label>
                <input 
                  type="time"
                  value={formData.clockInTime}
                  onChange={(e) => setFormData({ ...formData, clockInTime: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Lunch Out</label>
                <input 
                  type="time"
                  value={formData.lunchOutTime}
                  onChange={(e) => setFormData({ ...formData, lunchOutTime: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Lunch In</label>
                <input 
                  type="time"
                  value={formData.lunchInTime}
                  onChange={(e) => setFormData({ ...formData, lunchInTime: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Clock Out Time</label>
                <input 
                  type="time"
                  value={formData.clockOutTime}
                  onChange={(e) => setFormData({ ...formData, clockOutTime: e.target.value })}
                  className="form-control"
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Reason / Notes *</label>
              <textarea 
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="form-control"
                style={{ width: '100%', padding: '10px', minHeight: '80px' }}
                placeholder="Explain what happened..."
                required
              />
            </div>

            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '16px', marginTop: '8px' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitting}
                style={{ padding: '12px 24px' }}
              >
                {submitting ? 'Submitting...' : 'Submit Lost Punch Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {myRequests.length === 0 ? (
            <div style={{ padding: '24px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              You haven't submitted any lost punch requests.
            </div>
          ) : (
            myRequests.map((req, idx) => (
              <div 
                key={req.id || idx}
                className={`punch-card ${getStatusClass(req.status)}`}
                style={{ 
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px',
                  borderColor: req.status === 'approved' ? 'var(--success)' : req.status === 'denied' ? 'var(--danger)' : '#ffc107'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{formatDate(req.missed_date)}</span>
                  <span 
                    className={`punch-status ${getStatusClass(req.status)}`}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      background: req.status === 'approved' ? 'var(--success)' : req.status === 'denied' ? 'var(--danger)' : '#ffc107',
                      color: req.status === 'pending' ? '#000' : '#fff'
                    }}
                  >
                    {req.status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</label>
                    <div>{req.punch_type || 'N/A'}</div>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submitted</label>
                    <div>{formatDate(req.submitted_at)}</div>
                  </div>
                  {req.reviewed_by_name && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reviewed By</label>
                      <div>{req.reviewed_by_name}</div>
                    </div>
                  )}
                </div>
                {req.reason && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <strong>Reason:</strong> {req.reason}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Manager Review Tab */}
      {activeTab === 'review' && canManage && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Pending Approvals</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '13px' }}>Review and approve or deny lost punch requests from your team.</p>
          </div>

          {requests.filter(r => r.status === 'pending').length === 0 ? (
            <div style={{ padding: '24px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              🎉 No pending requests to review.
            </div>
          ) : (
            requests.filter(r => r.status === 'pending').map((req, idx) => (
              <div 
                key={req.id || idx}
                className="punch-card pending"
                style={{ 
                  background: 'var(--background)',
                  border: '1px solid #ffc107',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '15px' }}>{req.user_name || 'Unknown'}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '13px' }}>#{req.user_employee_id}</span>
                  </div>
                  <span style={{ fontWeight: 500 }}>{formatDate(req.missed_date)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Type</label>
                    <div>{req.punch_type || 'N/A'}</div>
                  </div>
                  {req.clock_in_time && <div><label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Clock In</label><div>{req.clock_in_time}</div></div>}
                  {req.lunch_out_time && <div><label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Lunch Out</label><div>{req.lunch_out_time}</div></div>}
                  {req.lunch_in_time && <div><label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Lunch In</label><div>{req.lunch_in_time}</div></div>}
                  {req.clock_out_time && <div><label style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Clock Out</label><div>{req.clock_out_time}</div></div>}
                </div>
                {req.reason && (
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <strong>Reason:</strong> {req.reason}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                  <button 
                    className="btn btn-success"
                    onClick={() => handleApprove(req.id)}
                    style={{ padding: '8px 16px' }}
                  >
                    ✓ Approve
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDeny(req.id)}
                    style={{ padding: '8px 16px' }}
                  >
                    ✗ Deny
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Previously reviewed */}
          {requests.filter(r => r.status !== 'pending').length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>Previously Reviewed</h4>
              {requests.filter(r => r.status !== 'pending').slice(0, 10).map((req, idx) => (
                <div 
                  key={req.id || idx}
                  style={{ 
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{req.user_name}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '12px', fontSize: '13px' }}>{formatDate(req.missed_date)}</span>
                  </div>
                  <span 
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      background: req.status === 'approved' ? 'var(--success)' : 'var(--danger)',
                      color: '#fff'
                    }}
                  >
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LostPunch
