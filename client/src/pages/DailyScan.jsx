import React, { useState, useEffect, useRef } from 'react'
import client from '../api/client'

const DailyScan = () => {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateFilter, setDateFilter] = useState('')
  const [stats, setStats] = useState({
    totalScans: 0,
    completionRate: 0,
    avgAccuracy: 0,
    topPerformer: null
  })
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchScans()
  }, [dateFilter])

  const fetchScans = async () => {
    try {
      setLoading(true)
      const params = dateFilter ? { days: 30 } : { days: 30 }
      const response = await client.get('/gameplan/scan-performance/history', { params })
      const data = response.data?.history || response.data || []
      setScans(Array.isArray(data) ? data : [])

      // Calculate stats
      const totalScans = data.length
      const completed = data.filter(s => s.completed).length
      const completionRate = totalScans > 0 ? (completed / totalScans) * 100 : 0
      const avgAccuracy = data.length > 0 
        ? data.reduce((sum, s) => sum + (parseFloat(s.accuracy) || 0), 0) / data.length 
        : 0
      const topPerformer = data.reduce((best, s) => {
        if (!best || (parseFloat(s.accuracy) || 0) > (parseFloat(best.accuracy) || 0)) return s
        return best
      }, null)

      setStats({ totalScans, completionRate, avgAccuracy, topPerformer })
    } catch (err) {
      setError(err.message || 'Failed to load scan performance data')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploading(true)
      await client.post('/daily-scan/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      })
      fetchScans()
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import scan data')
    } finally {
      setUploading(false)
    }
  }

  const getAccuracyColor = (accuracy) => {
    const val = parseFloat(accuracy) || 0
    if (val >= 95) return '#10b981'
    if (val >= 85) return '#f59e0b'
    return '#ef4444'
  }

  const getAccuracyClass = (accuracy) => {
    const val = parseFloat(accuracy) || 0
    if (val >= 95) return 'success'
    if (val >= 85) return 'warning'
    return 'error'
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading scan performance...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchScans} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Operations</div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>📊 Daily Scan Performance</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>Track and analyze daily inventory scan accuracy and completion rates.</p>
      </div>

      {/* Import Section */}
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '2px dashed var(--border)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Import Scan Data</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input 
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            style={{ flex: 1, minWidth: '200px', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}
          />
          <button 
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              padding: '10px 20px', 
              background: 'var(--primary)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              fontSize: '14px', 
              fontWeight: 600, 
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1
            }}
          >
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '2px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Scans</h4>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text)', margin: '8px 0' }}>{stats.totalScans}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Records loaded</div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: `2px solid ${getAccuracyColor(stats.completionRate)}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completion Rate</h4>
          <div style={{ fontSize: '32px', fontWeight: 700, color: getAccuracyColor(stats.completionRate), margin: '8px 0' }}>{stats.completionRate.toFixed(1)}%</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>of scans completed</div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: `2px solid ${getAccuracyColor(stats.avgAccuracy)}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Accuracy</h4>
          <div style={{ fontSize: '32px', fontWeight: 700, color: getAccuracyColor(stats.avgAccuracy), margin: '8px 0' }}>{stats.avgAccuracy.toFixed(1)}%</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>across all scans</div>
        </div>

        {stats.topPerformer && (
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '2px solid #10b981', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Performer</h4>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: '8px 0' }}>{stats.topPerformer.employee_name || 'Unknown'}</div>
            <div style={{ fontSize: '13px', color: '#10b981', marginTop: '4px' }}>{parseFloat(stats.topPerformer.accuracy || 0).toFixed(1)}% accuracy</div>
          </div>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Filter by Date</label>
          <input 
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}
          />
        </div>
        {dateFilter && (
          <button 
            onClick={() => setDateFilter('')}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--background)', cursor: 'pointer', marginTop: '18px' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Results Table */}
      <div style={{ background: 'var(--surface)', padding: 0, borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '32px', overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Scan Results</h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{scans.length} records</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Date</th>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Zone</th>
                <th style={{ textAlign: 'center', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Items</th>
                <th style={{ textAlign: 'center', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Accuracy</th>
                <th style={{ textAlign: 'center', fontSize: '12px', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No scan data available. Upload a CSV to get started.
                  </td>
                </tr>
              ) : (
                scans.map((scan, idx) => (
                  <tr key={scan.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 500 }}>{scan.employee_name || 'Unknown'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>{scan.scan_date || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>{scan.zone || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>{scan.items_scanned || 0}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>
                      <span style={{ 
                        fontWeight: 600, 
                        color: getAccuracyColor(scan.accuracy),
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: `${getAccuracyColor(scan.accuracy)}20`
                      }}>
                        {parseFloat(scan.accuracy || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>
                      {scan.completed ? (
                        <span style={{ color: '#10b981' }}>✓ Complete</span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}>⏳ Pending</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default DailyScan
