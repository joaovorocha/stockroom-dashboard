import React, { useState, useEffect } from 'react'
import client from '../api/client'

const Shipments = () => {
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Summary counts
  const [counts, setCounts] = useState({
    all: 0,
    labelCreated: 0,
    inTransit: 0,
    delivered: 0,
    unknown: 0
  })

  useEffect(() => {
    fetchShipments()
  }, [])

  const fetchShipments = async () => {
    try {
      setLoading(true)
      const response = await client.get('/shipments', { withCredentials: true })
      const data = response.data?.shipments || response.data || []
      setShipments(Array.isArray(data) ? data : [])
      updateCounts(data)
    } catch (err) {
      setError(err.message || 'Failed to load shipments')
    } finally {
      setLoading(false)
    }
  }

  const updateCounts = (data) => {
    const items = Array.isArray(data) ? data : []
    setCounts({
      all: items.length,
      labelCreated: items.filter(s => s.status?.toLowerCase().includes('label')).length,
      inTransit: items.filter(s => s.status?.toLowerCase().includes('transit')).length,
      delivered: items.filter(s => s.status?.toLowerCase().includes('delivered')).length,
      unknown: items.filter(s => s.status?.toLowerCase().includes('unknown')).length
    })
  }

  const filteredShipments = shipments.filter(s => {
    // Status filter
    if (statusFilter && !s.status?.toLowerCase().includes(statusFilter)) {
      return false
    }
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const haystack = [
        s.trackingNumber,
        s.customerName,
        s.destination,
        s.notes,
        s.orderNumber
      ].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase()
    if (s.includes('delivered')) return 'delivered'
    if (s.includes('transit')) return 'in-transit'
    if (s.includes('label')) return 'label-created'
    return 'unknown'
  }

  const formatDate = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading shipments...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchShipments} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Daily Operations</div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>📦 Shipments</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>Track and manage all shipments and packages for your store.</p>
      </div>

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '10px', margin: '10px 0 14px' }}>
        <div 
          className="summary-item" 
          style={{ cursor: 'pointer', background: !statusFilter ? 'var(--surface-hover)' : 'var(--surface)' }}
          onClick={() => setStatusFilter('')}
        >
          <div className="count" style={{ fontSize: '18px', paddingTop: '8px' }}>All</div>
          <div className="label">{counts.all} total</div>
        </div>
        <div 
          className="summary-item" 
          style={{ cursor: 'pointer', background: statusFilter === 'label' ? 'var(--surface-hover)' : 'var(--surface)' }}
          onClick={() => setStatusFilter('label')}
        >
          <div className="count">{counts.labelCreated}</div>
          <div className="label">Label Created</div>
        </div>
        <div 
          className="summary-item" 
          style={{ cursor: 'pointer', background: statusFilter === 'transit' ? 'var(--surface-hover)' : 'var(--surface)' }}
          onClick={() => setStatusFilter('transit')}
        >
          <div className="count">{counts.inTransit}</div>
          <div className="label">In Transit</div>
        </div>
        <div 
          className="summary-item" 
          style={{ cursor: 'pointer', background: statusFilter === 'delivered' ? 'var(--surface-hover)' : 'var(--surface)' }}
          onClick={() => setStatusFilter('delivered')}
        >
          <div className="count">{counts.delivered}</div>
          <div className="label">Delivered</div>
        </div>
        <div 
          className="summary-item" 
          style={{ cursor: 'pointer', background: statusFilter === 'unknown' ? 'var(--surface-hover)' : 'var(--surface)' }}
          onClick={() => setStatusFilter('unknown')}
        >
          <div className="count">{counts.unknown}</div>
          <div className="label">Unknown</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '8px', margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search tracking, customer, address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-control"
          style={{ flex: 1, minWidth: '220px', padding: '8px 10px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-control"
          style={{ padding: '8px 10px' }}
        >
          <option value="">All statuses</option>
          <option value="label">Label created</option>
          <option value="transit">In transit</option>
          <option value="delivered">Delivered</option>
          <option value="unknown">Unknown</option>
        </select>
        <div className="summary-item" style={{ padding: '4px 12px', textAlign: 'center', minWidth: '80px' }}>
          <div className="count">{filteredShipments.length}</div>
          <div className="label">Shown</div>
        </div>
      </div>

      {/* Shipment List */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {filteredShipments.length === 0 ? (
          <div style={{ padding: '16px', border: '1px dashed var(--border)', borderRadius: '10px', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
            No shipments match your filters.
          </div>
        ) : (
          filteredShipments.map((shipment, index) => (
            <div key={shipment.id || index} className="card" style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px' }}>
                    {shipment.trackingNumber || 'No tracking'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {shipment.customerName || 'Unknown customer'}
                  </div>
                </div>
                <span className={`status-pill ${getStatusClass(shipment.status)}`}>
                  {shipment.status || 'Unknown'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginTop: '10px' }}>
                <div className="field">
                  <label>Destination</label>
                  <div>{shipment.destination || 'N/A'}</div>
                </div>
                <div className="field">
                  <label>Created</label>
                  <div>{formatDate(shipment.createdAt)}</div>
                </div>
                <div className="field">
                  <label>Order #</label>
                  <div>{shipment.orderNumber || 'N/A'}</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <a 
                  href={`https://www.ups.com/track?tracknum=${encodeURIComponent(shipment.trackingNumber || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '13px' }}
                >
                  Track on UPS →
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Shipments
