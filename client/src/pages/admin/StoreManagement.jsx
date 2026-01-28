import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

/**
 * StoreManagement Component
 * Manage all stores - list view and individual store details
 */
const StoreManagement = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();

  // If storeId is present, show detail view
  if (storeId) {
    return <StoreDetail storeId={storeId} navigate={navigate} />;
  }

  return <StoreList navigate={navigate} />;
};

/**
 * Store List View
 */
const StoreList = ({ navigate }) => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/super-admin/stores', { withCredentials: true });
      if (response.data.success) {
        setStores(response.data.stores);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  // Get unique regions for filter
  const regions = [...new Set(stores.map(s => s.region).filter(Boolean))];

  // Filter stores
  const filteredStores = stores.filter(store => {
    const matchesSearch = 
      store.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRegion = regionFilter === 'all' || store.region === regionFilter;
    return matchesSearch && matchesRegion;
  });

  if (loading) {
    return <div className="admin-loading">Loading stores...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchStores} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="store-management">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>🏪 Store Management</h1>
        <p style={{ margin: '5px 0 0', color: '#666' }}>
          Manage {stores.length} stores across all regions
        </p>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search stores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ minWidth: '150px' }}>
            <select 
              value={regionFilter} 
              onChange={(e) => setRegionFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Regions</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stores Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '15px'
      }}>
        {filteredStores.map(store => (
          <div 
            key={store.id} 
            className="admin-card store-card"
            style={{
              ...cardStyle,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onClick={() => navigate(`/admin/stores/${store.id}`)}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 5px', fontSize: '16px' }}>{store.name}</h3>
                <code style={{ 
                  background: '#e3f2fd', 
                  color: '#1976d2',
                  padding: '2px 8px', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  {store.code}
                </code>
              </div>
              <span style={{
                background: store.is_active ? '#e8f5e9' : '#ffebee',
                color: store.is_active ? '#2e7d32' : '#c62828',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 500
              }}>
                {store.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>
              {store.region && <div>📍 Region: {store.region}</div>}
              <div>👥 Users: {store.user_count || 0}</div>
              {store.timezone && <div>🕐 {store.timezone}</div>}
            </div>
          </div>
        ))}
      </div>

      {filteredStores.length === 0 && (
        <div className="admin-card" style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#666' }}>No stores match your search criteria</p>
        </div>
      )}
    </div>
  );
};

/**
 * Store Detail View
 */
const StoreDetail = ({ storeId, navigate }) => {
  const [store, setStore] = useState(null);
  const [storeSettings, setStoreSettings] = useState([]);
  const [storeUsers, setStoreUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchStoreDetails();
  }, [storeId]);

  const fetchStoreDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/super-admin/stores/${storeId}`, { withCredentials: true });
      if (response.data.success) {
        setStore(response.data.store);
        setStoreSettings(response.data.settings || []);
        setStoreUsers(response.data.users || []);
        setFormData(response.data.store);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load store details');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await axios.put(
        `/api/super-admin/stores/${storeId}`,
        formData,
        { withCredentials: true }
      );
      if (response.data.success) {
        setStore(response.data.store);
        setEditMode(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = async (settingKey, newValue) => {
    try {
      // POST to settings endpoint (would need a store-specific settings endpoint)
      // For now, update local state
      setStoreSettings(prev => 
        prev.map(s => s.setting_key === settingKey ? { ...s, setting_value: newValue } : s)
      );
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading store details...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchStoreDetails} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="store-detail">
      {/* Header with back button */}
      <div style={{ marginBottom: '20px' }}>
        <Link to="/admin/stores" style={{ color: '#666', textDecoration: 'none', fontSize: '14px' }}>
          ← Back to Stores
        </Link>
      </div>

      <div className="admin-header" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>
            {store?.name}
          </h1>
          <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <code style={{ 
              background: '#e3f2fd', 
              color: '#1976d2',
              padding: '4px 10px', 
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              {store?.code}
            </code>
            <span style={{
              background: store?.is_active ? '#e8f5e9' : '#ffebee',
              color: store?.is_active ? '#2e7d32' : '#c62828',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 500
            }}>
              {store?.is_active ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>
        <div>
          {editMode ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setEditMode(false)} 
                style={{ ...btnStyle, background: '#f5f5f5', color: '#333' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving}
                style={{ ...btnStyle, background: '#4CAF50', color: 'white' }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setEditMode(true)} 
              style={{ ...btnStyle, background: '#2196F3', color: 'white' }}
            >
              ✏️ Edit Store
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Store Info */}
        <div className="admin-card" style={cardStyle}>
          <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>📋 Store Information</h3>
          
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={labelStyle}>Store Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Store Code</label>
                <input
                  type="text"
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  style={inputStyle}
                  disabled
                />
                <small style={{ color: '#666' }}>Store code cannot be changed</small>
              </div>
              <div>
                <label style={labelStyle}>Region</label>
                <input
                  type="text"
                  value={formData.region || ''}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <input
                  type="text"
                  value={formData.timezone || ''}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  Store is Active
                </label>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <InfoRow label="Name" value={store?.name} />
              <InfoRow label="Code" value={store?.code} />
              <InfoRow label="Region" value={store?.region || 'Not set'} />
              <InfoRow label="Timezone" value={store?.timezone || 'Not set'} />
              <InfoRow label="Email Pattern" value={store?.email_pattern || 'Not set'} />
              <InfoRow label="Created" value={formatDate(store?.created_at)} />
            </div>
          )}
        </div>

        {/* Store Users */}
        <div className="admin-card" style={cardStyle}>
          <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>
            👥 Store Users ({storeUsers.length})
          </h3>
          
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {storeUsers.length > 0 ? (
              storeUsers.map(user => (
                <div key={user.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px',
                  borderBottom: '1px solid #eee'
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{user.email}</div>
                  </div>
                  <span style={{
                    background: getRoleBg(user.access_role),
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500
                  }}>
                    {user.access_role}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: '#666', textAlign: 'center' }}>No users assigned to this store</p>
            )}
          </div>

          <Link 
            to={`/admin/users?store=${storeId}`} 
            style={{ 
              display: 'block', 
              marginTop: '15px', 
              color: '#2196F3',
              textDecoration: 'none',
              fontSize: '14px'
            }}
          >
            Manage users →
          </Link>
        </div>
      </div>

      {/* Store Settings */}
      <div className="admin-card" style={{ ...cardStyle, marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>⚙️ Store Settings</h3>
        
        {storeSettings.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '15px' 
          }}>
            {storeSettings.map(setting => (
              <div key={setting.setting_key} style={{
                padding: '12px',
                background: '#f9f9f9',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px' }}>{formatSettingKey(setting.setting_key)}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{setting.setting_key}</div>
                  </div>
                  <input
                    type="text"
                    value={setting.setting_value || ''}
                    onChange={(e) => handleSettingChange(setting.setting_key, e.target.value)}
                    style={{ ...inputStyle, width: '150px', textAlign: 'right' }}
                    disabled={!editMode}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#666' }}>No store-specific settings configured</p>
        )}
      </div>
    </div>
  );
};

// Helper Components
const InfoRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span style={{ color: '#666' }}>{label}</span>
    <span style={{ fontWeight: 500 }}>{value}</span>
  </div>
);

// Helper Functions
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

const formatSettingKey = (key) => {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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

const btnStyle = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};

export default StoreManagement;
