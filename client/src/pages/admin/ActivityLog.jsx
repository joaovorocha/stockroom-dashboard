import React, { useEffect, useState } from 'react'
import client from '../../api/client'
import './ActivityLog.css'

const ActivityLog = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await client.get('/auth/activity?limit=100')
      setLogs(response.data?.logs || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="activity-log">
      <div className="activity-header">
        <div>
          <h2>Activity Log</h2>
          <p>Recent system activity</p>
        </div>
        <button className="btn-secondary" onClick={loadLogs}>Refresh</button>
      </div>

      {loading && <div className="activity-empty">Loading activity...</div>}
      {!loading && error && <div className="activity-error">{error}</div>}

      {!loading && !error && (
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>IP</th>
                <th>Region</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
                  <td>{log.userName || 'Unknown'}</td>
                  <td>{(log.action || '').replace(/_/g, ' ')}</td>
                  <td className="mono">{log.ipAddress || '—'}</td>
                  <td>{log.region || '—'}</td>
                  <td className="details">
                    <pre>{log.changes ? JSON.stringify(log.changes, null, 2) : '{}'}</pre>
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan="6" className="activity-empty">No activity yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ActivityLog
