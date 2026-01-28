import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';

/**
 * UserManagement Component
 * Manage users and their store access across the system
 */
const UserManagement = () => {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(searchParams.get('action') === 'new');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, storesRes] = await Promise.all([
        axios.get('/api/super-admin/users', { withCredentials: true }),
        axios.get('/api/super-admin/stores', { withCredentials: true })
      ]);
      
      if (usersRes.data.success) {
        setUsers(usersRes.data.users);
      }
      if (storesRes.data.success) {
        setStores(storesRes.data.stores);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || 
      (roleFilter === 'super_admin' && user.is_super_admin) ||
      (roleFilter !== 'super_admin' && !user.is_super_admin);
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return <div className="admin-loading">Loading users...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchData} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="user-management">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>👥 User Management</h1>
            <p style={{ margin: '5px 0 0', color: '#666' }}>
              Manage {users.length} users and their store access
            </p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '12px 24px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            ➕ Add User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ minWidth: '150px' }}>
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Users</option>
              <option value="super_admin">Super Admins</option>
              <option value="regular">Regular Users</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="admin-card" style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Stores</th>
              <th style={thStyle}>Last Login</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: getAvatarColor(user.name),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{user.name}</div>
                      {user.id_number && (
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          ID: {user.id_number}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: '#666' }}>{user.email}</span>
                </td>
                <td style={tdStyle}>
                  {user.is_super_admin ? (
                    <span style={{
                      background: '#e8f5e9',
                      color: '#2e7d32',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 500
                    }}>
                      ⭐ Super Admin
                    </span>
                  ) : (
                    <span style={{
                      background: '#f5f5f5',
                      color: '#666',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      User
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    background: '#e3f2fd',
                    color: '#1976d2',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500
                  }}>
                    {user.store_count || 0}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: '#666', fontSize: '13px' }}>
                    {user.last_login ? formatDate(user.last_login) : 'Never'}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button
                    onClick={() => setSelectedUser(user)}
                    style={{
                      padding: '6px 12px',
                      background: '#f5f5f5',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Manage Access →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            No users match your search criteria
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          stores={stores}
          onClose={() => setSelectedUser(null)}
          onUpdate={fetchData}
        />
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          stores={stores}
          onClose={() => setShowAddModal(false)}
          onAdd={fetchData}
        />
      )}
    </div>
  );
};

/**
 * User Detail Modal - Manage store access
 */
const UserDetailModal = ({ user, stores, onClose, onUpdate }) => {
  const [userStores, setUserStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [addStoreId, setAddStoreId] = useState('');
  const [addStoreRole, setAddStoreRole] = useState('user');

  useEffect(() => {
    fetchUserDetails();
  }, [user.id]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/super-admin/users/${user.id}`, { withCredentials: true });
      if (response.data.success) {
        setUserStores(response.data.user.stores || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async () => {
    if (!addStoreId) return;
    
    try {
      setSaving(true);
      await axios.post(
        `/api/super-admin/users/${user.id}/store-access`,
        { store_id: addStoreId, access_role: addStoreRole },
        { withCredentials: true }
      );
      setAddStoreId('');
      setAddStoreRole('user');
      await fetchUserDetails();
      onUpdate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAccess = async (storeId) => {
    if (!confirm('Are you sure you want to revoke access to this store?')) return;
    
    try {
      setSaving(true);
      await axios.delete(
        `/api/super-admin/users/${user.id}/store-access/${storeId}`,
        { withCredentials: true }
      );
      await fetchUserDetails();
      onUpdate();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke access');
    } finally {
      setSaving(false);
    }
  };

  // Get stores user doesn't have access to
  const availableStores = stores.filter(
    store => !userStores.some(us => us.store_id === store.id)
  );

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>👤 {user.name}</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
            {error}
          </div>
        )}

        {/* User Info */}
        <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div><strong>Email:</strong> {user.email}</div>
            <div><strong>ID Number:</strong> {user.id_number || 'N/A'}</div>
            <div><strong>Role:</strong> {user.is_super_admin ? '⭐ Super Admin' : 'User'}</div>
            <div><strong>Created:</strong> {formatDate(user.created_at)}</div>
          </div>
        </div>

        {/* Current Store Access */}
        <h3 style={{ margin: '0 0 15px' }}>🏪 Store Access ({userStores.length})</h3>
        
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
            {userStores.length > 0 ? (
              userStores.map(store => (
                <div key={store.store_id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px',
                  borderBottom: '1px solid #eee'
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{store.store_name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Role: <span style={{
                        background: getRoleBg(store.access_role),
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>{store.access_role}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeAccess(store.store_id)}
                    disabled={saving}
                    style={{
                      padding: '4px 10px',
                      background: '#ffebee',
                      color: '#c62828',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <p style={{ color: '#666', textAlign: 'center' }}>No store access assigned</p>
            )}
          </div>
        )}

        {/* Grant Access Form */}
        {availableStores.length > 0 && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
            <h4 style={{ margin: '0 0 15px' }}>➕ Grant Store Access</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={addStoreId}
                onChange={(e) => setAddStoreId(e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              >
                <option value="">Select store...</option>
                {availableStores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))}
              </select>
              <select
                value={addStoreRole}
                onChange={(e) => setAddStoreRole(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={handleGrantAccess}
                disabled={saving || !addStoreId}
                style={{
                  padding: '10px 20px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Grant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Add User Modal
 */
const AddUserModal = ({ stores, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    id_number: '',
    is_super_admin: false,
    stores: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      
      // Note: This would need a POST /api/super-admin/users endpoint
      await axios.post('/api/super-admin/users', formData, { withCredentials: true });
      
      onAdd();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>➕ Add New User</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Password *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>ID Number</label>
              <input
                type="text"
                value={formData.id_number}
                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={formData.is_super_admin}
                  onChange={(e) => setFormData({ ...formData, is_super_admin: e.target.checked })}
                />
                Grant Super Admin access
              </label>
            </div>
          </div>

          <div style={{ marginTop: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 20px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper functions
const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4'];
  const index = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[index];
};

const getRoleBg = (role) => {
  const colors = {
    'super_admin': '#e8f5e9',
    'admin': '#e3f2fd',
    'manager': '#fff3e0',
    'user': '#f5f5f5'
  };
  return colors[role] || '#f5f5f5';
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Styles
const cardStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: '#333'
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 10px',
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#666',
  fontWeight: 600
};

const tdStyle = {
  padding: '14px 10px',
  fontSize: '14px'
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '25px',
  width: '90%',
  maxHeight: '90vh',
  overflowY: 'auto'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  color: '#666'
};

export default UserManagement;
