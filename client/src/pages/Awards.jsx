import React, { useState, useEffect } from 'react'
import client from '../api/client'

const Awards = () => {
  const [awards, setAwards] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchAwards()
  }, [])

  const fetchAwards = async () => {
    try {
      setLoading(true)
      // Only /awards/tomato endpoint exists in backend
      const tomatoRes = await client.get('/awards/tomato').catch(() => ({ data: {} }))

      setAwards({
        topSales: [],
        topScan: [],
        topTailor: [],
        topBoh: [],
        tomato: tomatoRes.data || {}
      })
      setLastUpdated(new Date().toLocaleString())
    } catch (err) {
      setError(err.message || 'Failed to load awards')
    } finally {
      setLoading(false)
    }
  }

  const renderTopList = (items, valueLabel = 'Score') => {
    if (!items || items.length === 0) {
      return <div style={{ color: 'var(--text-muted)', padding: '12px' }}>No data available</div>
    }
    return items.map((item, index) => (
      <div 
        key={index} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ 
            width: '24px', 
            height: '24px', 
            borderRadius: '50%', 
            background: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'var(--surface)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600
          }}>
            {index + 1}
          </span>
          {item.imageUrl && (
            <img 
              src={item.imageUrl} 
              alt="" 
              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <span style={{ fontWeight: 500 }}>{item.name || 'Unknown'}</span>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {item.value || item.count || item.score || '—'}
        </span>
      </div>
    ))
  }

  const renderTomatoList = (items, label) => {
    if (!items || items.length === 0) {
      return <div style={{ color: 'var(--text-muted)', padding: '12px' }}>No offenders 🎉</div>
    }
    return items.map((item, index) => (
      <div 
        key={index}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>🍅</span>
          <span>{item.name || 'Unknown'}</span>
        </div>
        <span className="badge badge-danger">{item.count || 0}</span>
      </div>
    ))
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading awards...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchAwards} style={{ marginLeft: '12px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>🏆 Team Awards</h1>
          <div className="last-updated" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {lastUpdated ? `Updated ${lastUpdated}` : 'Loading…'}
          </div>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>Celebrate top performers and recognize team achievements.</p>
      </div>

      {/* Top Performers Grid */}
      <div className="grid grid-2" style={{ marginTop: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Top Sales Associates</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {renderTopList(awards?.topSales, 'Sales')}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Best Daily Scan</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {renderTopList(awards?.topScan, 'Accuracy')}
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: '16px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Top Tailor Productivity</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {renderTopList(awards?.topTailor, 'Items')}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Top BOH Inventory Accuracy</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {renderTopList(awards?.topBoh, 'Accuracy')}
          </div>
        </div>
      </div>

      {/* Tomato Awards */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-header">
          <h3>🍅 Tomato Awards</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Most Lost Punch Requests</h4>
              <div className="card" style={{ margin: 0 }}>
                {renderTomatoList(awards?.tomato?.lostPunch)}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Most Missed Closing Duties</h4>
              <div className="card" style={{ margin: 0 }}>
                {renderTomatoList(awards?.tomato?.closingMissed)}
              </div>
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: '16px', marginTop: '16px' }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Most Missed Daily Scans</h4>
              <div className="card" style={{ margin: 0 }}>
                {renderTomatoList(awards?.tomato?.missedScans)}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Lowest Scan Completion Rate</h4>
              <div className="card" style={{ margin: 0 }}>
                {renderTomatoList(awards?.tomato?.lowestCompletion)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Awards
