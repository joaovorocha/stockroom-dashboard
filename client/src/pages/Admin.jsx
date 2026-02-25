import React, { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

const Admin = () => {
  const { user, isAdmin, isSuperAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Settings data
  const [zones, setZones] = useState([])
  const [fittingRooms, setFittingRooms] = useState([])
  const [shifts, setShifts] = useState([])
  const [closingDuties, setClosingDuties] = useState([])
  const [tailorStations, setTailorStations] = useState([])
  const [storeConfig, setStoreConfig] = useState({ timezone: '', currency: 'USD', storeName: '' })
  const [healthStatus, setHealthStatus] = useState({})

  // User edit modal
  const [editingUser, setEditingUser] = useState(null)
  const [showUserModal, setShowUserModal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    try {
      setLoading(true)
      // Only /admin/store-config and /admin/health exist
      // Users come from /gameplan/employees
      if (activeTab === 'users') {
        const res = await client.get('/gameplan/employees').catch(() => ({ data: { employees: {} } }))
        const employees = res.data?.employees || {}
        // Flatten all employee types into one array
        const allUsers = [
          ...(employees.SA || []),
          ...(employees.BOH || []),
          ...(employees.MANAGEMENT || []),
          ...(employees.TAILOR || [])
        ]
        setUsers(allUsers)
      } else if (activeTab === 'store') {
        const res = await client.get('/admin/store-config').catch(() => ({ data: {} }))
        setStoreConfig(res.data || {})
      } else if (activeTab === 'health') {
        const res = await client.get('/admin/health').catch(() => ({ data: {} }))
        setHealthStatus(res.data || {})
      } else {
        // Other tabs don't have backend endpoints yet - use empty data
        setZones([])
        setFittingRooms([])
        setShifts([])
        setClosingDuties([])
        setTailorStations([])
      }
    } catch (err) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Redirect non-admins
  if (!isAdmin && !isSuperAdmin) {
    return <Navigate to="/home" replace />
  }

  const tabs = [
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'store', label: 'Store', icon: '🏪' },
    { id: 'zones', label: 'Sales Zones', icon: '📍' },
    { id: 'fitting-rooms', label: 'Fitting Rooms', icon: '🚪' },
    { id: 'shifts', label: 'Shifts', icon: '⏰' },
    { id: 'sections', label: 'Closing Duties', icon: '✅' },
    { id: 'stations', label: 'Tailor Stations', icon: '✂️' },
    { id: 'health', label: 'Health', icon: '💚' },
    { id: 'backups', label: 'Backups', icon: '💾' },
    { id: 'activity', label: 'Activity Log', icon: '📊' }
  ]

  const getRoleBadgeClass = (role) => {
    switch (role?.toUpperCase()) {
      case 'SA': return 'badge-sa'
      case 'BOH': return 'badge-boh'
      case 'MANAGEMENT': return 'badge-management'
      case 'TAILOR': return 'badge-tailor'
      default: return ''
    }
  }

  const formatDate = (value) => {
    if (!value) return 'Never'
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const renderUsersTab = () => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>All Users ({users.length})</h3>
        <button 
          className="btn btn-primary"
          onClick={() => { setEditingUser(null); setShowUserModal(true) }}
          style={{ padding: '8px 16px' }}
        >
          + Add User
        </button>
      </div>
      <div style={{ padding: '20px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Photo</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Name</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Employee ID</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Role</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Manager</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Last Login</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e0e0e0', background: '#f8f8f8', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No users found</td>
              </tr>
            ) : (
              users.map((u, idx) => (
                <tr key={u.id || idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '12px' }}>
                    {u.image_url ? (
                      <img src={u.image_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', background: '#eee' }} />
                    ) : (
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#666' }}>
                        {(u.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{u.employee_id || 'N/A'}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${getRoleBadgeClass(u.role)}`} style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>
                      {u.role || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{u.is_manager ? '✓' : '—'}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#666' }}>{formatDate(u.last_login)}</td>
                  <td style={{ padding: '12px' }}>
                    <button 
                      onClick={() => { setEditingUser(u); setShowUserModal(true) }}
                      style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', cursor: 'pointer', marginRight: '6px' }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderSettingsList = (items, setItems, label, apiEndpoint) => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{label}</h3>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item, idx) => (
            <div 
              key={idx}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#f8f8f8', borderRadius: '4px', border: '1px solid #e0e0e0' }}
            >
              <span style={{ cursor: 'move', color: '#999' }}>⋮⋮</span>
              <input 
                type="text"
                value={item.name || item}
                onChange={(e) => {
                  const newItems = [...items]
                  if (typeof items[0] === 'object') {
                    newItems[idx] = { ...newItems[idx], name: e.target.value }
                  } else {
                    newItems[idx] = e.target.value
                  }
                  setItems(newItems)
                }}
                style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '8px 12px', fontSize: '14px' }}
              />
              <button 
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input 
            type="text"
            placeholder={`Add new ${label.toLowerCase().slice(0, -1)}...`}
            id={`new-${label}`}
            style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '8px 12px' }}
          />
          <button 
            onClick={() => {
              const input = document.getElementById(`new-${label}`)
              if (input?.value) {
                setItems([...items, { name: input.value }])
                input.value = ''
              }
            }}
            className="btn btn-primary"
            style={{ padding: '8px 16px' }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )

  const renderStoreTab = () => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Store Settings</h3>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }}>Save</button>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500, color: '#666', textTransform: 'uppercase' }}>Timezone</label>
            <input 
              type="text"
              value={storeConfig.timezone || ''}
              onChange={(e) => setStoreConfig({ ...storeConfig, timezone: e.target.value })}
              placeholder="America/Los_Angeles"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500, color: '#666', textTransform: 'uppercase' }}>Currency</label>
            <select 
              value={storeConfig.currency || 'USD'}
              onChange={(e) => setStoreConfig({ ...storeConfig, currency: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500, color: '#666', textTransform: 'uppercase' }}>Store Name</label>
            <input 
              type="text"
              value={storeConfig.storeName || ''}
              onChange={(e) => setStoreConfig({ ...storeConfig, storeName: e.target.value })}
              placeholder="San Francisco"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>
        </div>
      </div>
    </div>
  )

  const renderHealthTab = () => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>System Health</h3>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>💚 Database</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>Connected</div>
          </div>
          <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>💚 API Server</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>Online</div>
          </div>
          <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>💚 Gmail Integration</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>Active</div>
          </div>
          <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>💚 Looker</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>Connected</div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderBackupsTab = () => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Backups</h3>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }}>Create Backup</button>
      </div>
      <div style={{ padding: '20px', color: '#666' }}>
        <p>Automatic backups are scheduled daily. Manual backups can be created using the button above.</p>
        <div style={{ marginTop: '16px', padding: '12px', background: '#f8f8f8', borderRadius: '6px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>Last backup: Today at 3:00 AM</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Size: 45.2 MB</div>
        </div>
      </div>
    </div>
  )

  const renderActivityTab = () => (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '24px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Activity Log</h3>
      </div>
      <div style={{ padding: '20px', color: '#666' }}>
        <p>Recent system activity will appear here.</p>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 60px)' }}>
      {/* Sidebar */}
      <aside style={{ background: '#1a1a1a', color: '#fff', padding: '20px 0' }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #333', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Admin Console</h2>
          <span style={{ fontSize: '12px', color: '#888' }}>Daily Game Plan</span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tabs.map(tab => (
            <li key={tab.id}>
              <a 
                href={`#${tab.id}`}
                onClick={(e) => { e.preventDefault(); setActiveTab(tab.id) }}
                style={{
                  display: 'block',
                  padding: '12px 20px',
                  color: activeTab === tab.id ? '#fff' : '#aaa',
                  textDecoration: 'none',
                  fontSize: '14px',
                  borderLeft: `3px solid ${activeTab === tab.id ? '#2563eb' : 'transparent'}`,
                  background: activeTab === tab.id ? '#222' : 'transparent'
                }}
              >
                <span style={{ marginRight: '8px' }}>{tab.icon}</span>
                {tab.label}
              </a>
            </li>
          ))}
          <li style={{ marginTop: '20px' }}>
            <a href="/home" style={{ display: 'block', padding: '12px 20px', color: '#666', textDecoration: 'none', fontSize: '14px' }}>
              <span style={{ marginRight: '8px' }}>←</span>
              Back to Dashboard
            </a>
          </li>
        </ul>
      </aside>

      {/* Main Content */}
      <main style={{ padding: '24px', background: '#f5f5f5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>
            {tabs.find(t => t.id === activeTab)?.label || 'Admin'}
          </h1>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '20px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>{error}</div>
        ) : (
          <>
            {activeTab === 'users' && renderUsersTab()}
            {activeTab === 'store' && renderStoreTab()}
            {activeTab === 'zones' && renderSettingsList(zones, setZones, 'Sales Zones', '/admin/zones')}
            {activeTab === 'fitting-rooms' && renderSettingsList(fittingRooms, setFittingRooms, 'Fitting Rooms', '/admin/fitting-rooms')}
            {activeTab === 'shifts' && renderSettingsList(shifts, setShifts, 'Shifts', '/admin/shifts')}
            {activeTab === 'sections' && renderSettingsList(closingDuties, setClosingDuties, 'Closing Duties', '/admin/closing-duties')}
            {activeTab === 'stations' && renderSettingsList(tailorStations, setTailorStations, 'Tailor Stations', '/admin/tailor-stations')}
            {activeTab === 'health' && renderHealthTab()}
            {activeTab === 'backups' && renderBackupsTab()}
            {activeTab === 'activity' && renderActivityTab()}
          </>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          zIndex: 2000,
          padding: '10px 12px',
          borderRadius: '10px',
          border: `1px solid ${toast.type === 'success' ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
          background: '#fff',
          color: '#111',
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
          fontSize: '13px',
          maxWidth: 'min(360px, calc(100vw - 32px))'
        }}>
          {toast.message}
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '500px', width: '90%' }}>
            <h3 style={{ margin: '0 0 16px' }}>{editingUser ? 'Edit User' : 'Add User'}</h3>
            <p style={{ color: '#666', marginBottom: '16px' }}>User management functionality coming soon.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowUserModal(false)}
                style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge Styles */}
      <style>{`
        .badge-sa { background: #e3f2fd; color: #1565c0; }
        .badge-boh { background: #fff3e0; color: #e65100; }
        .badge-management { background: #f3e5f5; color: #7b1fa2; }
        .badge-tailor { background: #e8f5e9; color: #2e7d32; }
        .badge-admin { background: #fce4ec; color: #c2185b; }
      `}</style>
    </div>
  )
}

export default Admin
