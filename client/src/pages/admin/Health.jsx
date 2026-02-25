import React, { useEffect, useState } from 'react'
import client from '../../api/client'
import './Health.css'

const Health = () => {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadHealth()
  }, [])

  const loadHealth = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await client.get('/admin/health')
      setHealth(response.data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="health-page">
      <div className="health-header">
        <div>
          <h2>Server Health</h2>
          <p>Live system metrics</p>
        </div>
        <button className="btn-secondary" onClick={loadHealth}>Refresh</button>
      </div>

      {loading && <div className="health-empty">Loading health...</div>}
      {!loading && error && <div className="health-error">{error}</div>}

      {!loading && !error && health && (
        <div className="health-grid">
          <div className="health-card">
            <h3>Runtime</h3>
            <p>Node: {health.runtime?.versions?.node || '—'}</p>
            <p>Env: {health.runtime?.env?.nodeEnv || '—'}</p>
            <p>Port: {health.runtime?.env?.port || '—'}</p>
          </div>
          <div className="health-card">
            <h3>CPU</h3>
            <p>Cores: {health.os?.cpuCores || '—'}</p>
            <p>Load Avg: {Array.isArray(health.os?.loadavg) ? health.os.loadavg.map(v => Number(v).toFixed(2)).join(', ') : '—'}</p>
          </div>
          <div className="health-card">
            <h3>Memory</h3>
            <p>RSS: {health.process?.rssBytes ? `${Math.round(health.process.rssBytes / 1024 / 1024)} MB` : '—'}</p>
            <p>Heap Used: {health.process?.heapUsedBytes ? `${Math.round(health.process.heapUsedBytes / 1024 / 1024)} MB` : '—'}</p>
          </div>
          <div className="health-card">
            <h3>Disk</h3>
            <p>Total: {health.disk?.totalBytes ? `${Math.round(health.disk.totalBytes / 1024 / 1024 / 1024)} GB` : '—'}</p>
            <p>Free: {health.disk?.availBytes ? `${Math.round(health.disk.availBytes / 1024 / 1024 / 1024)} GB` : '—'}</p>
          </div>
          <div className="health-card">
            <h3>Users</h3>
            <p>Active: {health.users?.activeCount ?? '—'}</p>
            <p>Window: {health.users?.windowMs ? `${Math.round(health.users.windowMs / 60000)} min` : '—'}</p>
          </div>
          <div className="health-card">
            <h3>GPU</h3>
            <p>{health.gpu?.available ? `${health.gpu.gpus?.length || 0} GPU(s)` : 'Not available'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Health
