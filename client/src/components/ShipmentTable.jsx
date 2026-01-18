import { useEffect, useState } from 'react'
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
      <table className="shipment-table">
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
          {shipments.map((s) => {
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
