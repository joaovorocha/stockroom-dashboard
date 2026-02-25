import React, { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const Expenses = () => {
  const { user, isAdmin, isManager } = useAuth()
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [summary, setSummary] = useState({
    myTotal: 0,
    myLimit: 3000,
    storeTotal: 0
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      // Only /expenses endpoint exists - no /expenses/employees
      const ordersRes = await client.get('/expenses')

      const ordersData = ordersRes.data?.orders || ordersRes.data || []
      setOrders(Array.isArray(ordersData) ? ordersData : [])
      setEmployees([]) // No employees endpoint

      // Calculate summaries
      const myOrders = ordersData.filter(o => o.employee_id === user?.employeeId)
      const myTotal = myOrders.reduce((sum, o) => sum + (parseFloat(o.retail_value) || 0), 0)
      const storeTotal = ordersData.reduce((sum, o) => sum + (parseFloat(o.retail_value) || 0), 0)

      setSummary({
        myTotal,
        myLimit: user?.discountLimit || 3000,
        storeTotal
      })
    } catch (err) {
      setError(err.message || 'Failed to load employee discount data')
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = orders.filter(o => {
    if (selectedEmployee && o.employee_id !== selectedEmployee) return false
    if (dateRange.start && o.order_date < dateRange.start) return false
    if (dateRange.end && o.order_date > dateRange.end) return false
    return true
  })

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
  }

  const formatDate = (value) => {
    if (!value) return 'N/A'
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const percentUsed = summary.myLimit > 0 ? Math.min((summary.myTotal / summary.myLimit) * 100, 100) : 0
  const isOverLimit = summary.myTotal > summary.myLimit

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading employee discount data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ padding: '20px', background: '#f8d7da', color: '#721c24' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-secondary" onClick={fetchData} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '18px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '14px 0 16px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Employee Discount Orders</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ background: 'var(--primary)', color: '#fff', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 }}>2025</span>
        </div>
      </div>

      {/* Limit Banner */}
      {isOverLimit && (
        <div style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px', margin: '10px 0 14px' }}>
          ⚠️ You have exceeded your annual discount limit of {formatCurrency(summary.myLimit)}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>My Retail Value Total</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px', color: isOverLimit ? '#dc2626' : 'inherit' }}>
            {formatCurrency(summary.myTotal)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {percentUsed.toFixed(0)}% of limit used
          </div>
          <div style={{ height: '8px', background: 'rgba(0,0,0,0.08)', borderRadius: '999px', overflow: 'hidden', marginTop: '8px' }}>
            <div style={{ height: '100%', width: `${percentUsed}%`, background: isOverLimit ? '#dc2626' : 'var(--primary)' }} />
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', minWidth: '220px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>My Retail Value Limit</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px' }}>{formatCurrency(summary.myLimit)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Set by admin</div>
        </div>
        {(isAdmin || isManager) && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', minWidth: '220px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Store Retail Value Total</div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px' }}>{formatCurrency(summary.storeTotal)}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>All employees combined</div>
          </div>
        )}
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '10px', padding: '12px 14px', flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📋</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            40% employee discount, <strong>$3,000/yr max</strong>. Must be present, manager applies. Work email only. No manual discounts. No contractors.
          </span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
        {(isAdmin || isManager) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Employee</label>
            <select 
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">All Employees</option>
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Start Date</label>
          <input 
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>End Date</label>
          <input 
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <button 
          onClick={() => { setSelectedEmployee(''); setDateRange({ start: '', end: '' }) }}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', fontSize: '12px' }}
        >
          Reset
        </button>
      </div>

      {/* Orders Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '10px 12px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '10px 12px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Order #</th>
                <th style={{ textAlign: 'left', fontSize: '12px', padding: '10px 12px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Date</th>
                <th style={{ textAlign: 'right', fontSize: '12px', padding: '10px 12px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Retail Value</th>
                <th style={{ textAlign: 'right', fontSize: '12px', padding: '10px 12px', color: 'var(--text-secondary)', background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>Discount</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No orders found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => (
                  <tr key={order.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {order.employee_image_url ? (
                          <img 
                            src={order.employee_image_url} 
                            alt="" 
                            style={{ width: '28px', height: '28px', borderRadius: '999px', objectFit: 'cover', border: '1px solid var(--border)' }}
                          />
                        ) : (
                          <div style={{ width: '28px', height: '28px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {getInitials(order.employee_name)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{order.employee_name || 'Unknown'}</div>
                          {order.employee_email && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{order.employee_email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'monospace' }}>{order.order_number || 'N/A'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                      {formatDate(order.order_date)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(order.retail_value)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {order.discount_percent || 40}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        Showing {filteredOrders.length} of {orders.length} orders
      </div>
    </div>
  )
}

export default Expenses
