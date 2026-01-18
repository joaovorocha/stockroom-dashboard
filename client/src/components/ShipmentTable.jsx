import { useEffect, useState, useMemo } from 'react'
import api from '../api'

function safeText(value) {
  return value === undefined || value === null ? '' : String(value)
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return safeText(value)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
}

function getUpdatedDate(shipment) {
  return (
    shipment.updatedAt ||
    shipment.importedAt ||
    shipment.shippedAt ||
    shipment.shippedDate ||
    shipment.shipDate ||
    shipment.createdAt ||
    shipment.emailDate ||
    null
  )
}

export default function ShipmentTable() {
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadShipments() {
      try {
        setLoading(true)
        setError('')

        const response = await api.get('/api/shipments')
        const data = response.data
        const rows = Array.isArray(data) ? data : (data.shipments || [])

        if (isMounted) {
          setShipments(rows)
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load shipments')
          setShipments([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadShipments()

    return () => {
      isMounted = false
    }
  }, [])

  // Filter shipments based on search term and status filter
  const filteredShipments = useMemo(() => {
    return shipments.filter(shipment => {
      // Status filter: if a status is selected, only show shipments with that status
      if (statusFilter) {
        const shipmentStatus = safeText(shipment.status || shipment.lastUpsStatus || 'unknown').toLowerCase()
        if (shipmentStatus !== statusFilter.toLowerCase()) {
          return false
        }
      }

      // Search filter: if there's a search term, check multiple fields
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const searchableFields = [
          safeText(shipment.trackingNumber || shipment.tracking),
          safeText(shipment.customerName || shipment.destination),
          safeText(shipment.customerEmail),
          safeText(shipment.orderNumber),
          safeText(shipment.notes)
        ]
        
        // Check if any field contains the search term
        const matchesSearch = searchableFields.some(field => 
          field.toLowerCase().includes(term)
        )
        
        if (!matchesSearch) {
          return false
        }
      }

      return true
    })
  }, [shipments, searchTerm, statusFilter])

  if (loading) {
    return <div className="table-status">Loading shipments...</div>
  }

  if (error) {
    return <div className="table-status error">{error}</div>
  }

  if (!shipments.length) {
    return <div className="table-status">No shipments found.</div>
  }

  return (
    <div className="table-wrap">
      {/* Search and Filter Controls */}
      <div className="filters">
        <div className="filter-group">
          <label htmlFor="search">Search:</label>
          <input
            id="search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tracking, customer, order..."
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="status">Status:</label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-select"
          >
            <option value="">All Statuses</option>
            <option value="label-created">Label Created</option>
            <option value="in-transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="exception">Exception</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div className="results-count">
          Showing {filteredShipments.length} of {shipments.length} shipments
        </div>
      </div>

      <table className="table shipment-table">
        <thead>
          <tr>
            <th>Tracking Number</th>
            <th>Customer / Destination</th>
            <th>Status</th>
            <th>Estimated Delivery</th>
            <th>Updated Date</th>
          </tr>
        </thead>
        <tbody>
          {filteredShipments.map((s) => {
            const tracking = safeText(s.trackingNumber || s.tracking) || '—'
            const customer = safeText(s.customerName || s.destination) || '—'
            const status = safeText(s.status || s.lastUpsStatus || 'unknown')
            const estimatedDelivery = s.estimatedDeliveryAt || s.estimatedDelivery
            const updatedDate = getUpdatedDate(s)

            return (
              <tr key={s.id || tracking + customer}>
                <td className="mono">{tracking}</td>
                <td>{customer}</td>
                <td className="status">{status}</td>
                <td>{formatDate(estimatedDelivery)}</td>
                <td>{formatDate(updatedDate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
