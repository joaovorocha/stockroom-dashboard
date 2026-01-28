import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * GlobalSettings Component
 * Manage global system settings across all stores
 */
const GlobalSettings = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editedSettings, setEditedSettings] = useState({});
  const [successMessage, setSuccessMessage] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/super-admin/settings/global', { withCredentials: true });
      if (response.data.success) {
        setSettings(response.data.settings);
        // Initialize edited settings with current values
        const initial = {};
        response.data.settings.forEach(s => {
          initial[s.setting_key] = s.setting_value;
        });
        setEditedSettings(initial);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setEditedSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    try {
      setSaving(true);
      setSuccessMessage(null);
      
      const response = await axios.put(
        `/api/super-admin/settings/global/${key}`,
        { value: editedSettings[key] },
        { withCredentials: true }
      );
      
      if (response.data.success) {
        setSettings(prev => 
          prev.map(s => s.setting_key === key ? response.data.setting : s)
        );
        setSuccessMessage(`Setting "${key}" saved successfully`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setSuccessMessage(null);
      
      // Find changed settings
      const changedSettings = settings.filter(s => 
        editedSettings[s.setting_key] !== s.setting_value
      );
      
      // Save each changed setting
      for (const setting of changedSettings) {
        await axios.put(
          `/api/super-admin/settings/global/${setting.setting_key}`,
          { value: editedSettings[setting.setting_key] },
          { withCredentials: true }
        );
      }
      
      setSuccessMessage(`${changedSettings.length} settings saved successfully`);
      await fetchSettings(); // Refresh
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = settings.some(s => editedSettings[s.setting_key] !== s.setting_value);

  // Get unique categories
  const categories = ['all', ...new Set(settings.map(s => s.category || 'general'))];
  
  // Filter settings by category
  const filteredSettings = categoryFilter === 'all' 
    ? settings 
    : settings.filter(s => (s.category || 'general') === categoryFilter);

  // Group settings by category for display
  const groupedSettings = filteredSettings.reduce((acc, setting) => {
    const category = setting.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(setting);
    return acc;
  }, {});

  if (loading) {
    return <div className="admin-loading">Loading settings...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => { setError(null); fetchSettings(); }} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="global-settings">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>⚙️ Global Settings</h1>
            <p style={{ margin: '5px 0 0', color: '#666' }}>
              Manage system-wide settings for all stores
            </p>
          </div>
          {hasChanges && (
            <button 
              onClick={handleSaveAll}
              disabled={saving}
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
              {saving ? 'Saving...' : '💾 Save All Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div style={{
          background: '#e8f5e9',
          color: '#2e7d32',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          ✅ {successMessage}
        </div>
      )}

      {/* Category Filter */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                background: categoryFilter === cat ? '#2196F3' : '#f0f0f0',
                color: categoryFilter === cat ? 'white' : '#333',
                transition: 'all 0.2s'
              }}
            >
              {cat === 'all' ? '🔍 All' : getCategoryIcon(cat) + ' ' + formatCategory(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Settings by Category */}
      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <div key={category} className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>
            {getCategoryIcon(category)} {formatCategory(category)}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {categorySettings.map(setting => (
              <SettingRow
                key={setting.setting_key}
                setting={setting}
                value={editedSettings[setting.setting_key]}
                onChange={(value) => handleChange(setting.setting_key, value)}
                onSave={() => handleSave(setting.setting_key)}
                hasChange={editedSettings[setting.setting_key] !== setting.setting_value}
                saving={saving}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Add New Setting */}
      <AddSettingForm onAdd={fetchSettings} />
    </div>
  );
};

/**
 * Individual Setting Row
 */
const SettingRow = ({ setting, value, onChange, onSave, hasChange, saving }) => {
  const getInputType = () => {
    if (setting.setting_key.includes('email') || setting.setting_key.includes('notify')) {
      return 'email';
    }
    if (setting.setting_key.includes('enabled') || setting.setting_key.includes('active')) {
      return 'toggle';
    }
    if (setting.setting_key.includes('time') || setting.setting_key.includes('hour')) {
      return 'time';
    }
    if (setting.setting_key.includes('count') || setting.setting_key.includes('limit') || setting.setting_key.includes('threshold')) {
      return 'number';
    }
    return 'text';
  };

  const inputType = getInputType();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 15px',
      background: hasChange ? '#fff8e1' : '#f9f9f9',
      borderRadius: '8px',
      border: hasChange ? '1px solid #ffca28' : '1px solid transparent'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '14px' }}>{formatSettingKey(setting.setting_key)}</div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
          Key: <code style={{ background: '#eee', padding: '1px 4px', borderRadius: '3px' }}>
            {setting.setting_key}
          </code>
        </div>
        {setting.description && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            {setting.description}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {inputType === 'toggle' ? (
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={value === 'true' || value === true}
              onChange={(e) => onChange(e.target.checked.toString())}
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ marginLeft: '8px', fontSize: '14px' }}>
              {value === 'true' || value === true ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        ) : (
          <input
            type={inputType === 'number' ? 'number' : 'text'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '200px',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              textAlign: 'right'
            }}
          />
        )}
        
        {hasChange && (
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: '6px 12px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Add New Setting Form
 */
const AddSettingForm = ({ onAdd }) => {
  const [expanded, setExpanded] = useState(false);
  const [newSetting, setNewSetting] = useState({
    key: '',
    value: '',
    category: 'general'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newSetting.key || !newSetting.value) return;

    try {
      setSaving(true);
      setError(null);
      
      await axios.post(
        '/api/super-admin/settings/global',
        {
          key: newSetting.key,
          value: newSetting.value,
          category: newSetting.category
        },
        { withCredentials: true }
      );
      
      setNewSetting({ key: '', value: '', category: 'general' });
      setExpanded(false);
      onAdd();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-card" style={cardStyle}>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: '100%',
            padding: '15px',
            border: '2px dashed #ddd',
            borderRadius: '8px',
            background: 'transparent',
            cursor: 'pointer',
            color: '#666',
            fontSize: '14px'
          }}
        >
          ➕ Add New Setting
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>➕ Add New Setting</h3>
          
          {error && (
            <div style={{
              background: '#ffebee',
              color: '#c62828',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            <div>
              <label style={labelStyle}>Setting Key</label>
              <input
                type="text"
                value={newSetting.key}
                onChange={(e) => setNewSetting({ ...newSetting, key: e.target.value })}
                placeholder="e.g., max_login_attempts"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Value</label>
              <input
                type="text"
                value={newSetting.value}
                onChange={(e) => setNewSetting({ ...newSetting, value: e.target.value })}
                placeholder="e.g., 5"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={newSetting.category}
                onChange={(e) => setNewSetting({ ...newSetting, category: e.target.value })}
                style={inputStyle}
              >
                <option value="general">General</option>
                <option value="email">Email</option>
                <option value="security">Security</option>
                <option value="notifications">Notifications</option>
                <option value="scanning">Scanning</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setExpanded(false)}
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
              {saving ? 'Adding...' : 'Add Setting'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// Helper functions
const formatSettingKey = (key) => {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatCategory = (category) => {
  return category.charAt(0).toUpperCase() + category.slice(1);
};

const getCategoryIcon = (category) => {
  const icons = {
    general: '📋',
    email: '📧',
    security: '🔒',
    notifications: '🔔',
    scanning: '📊',
    system: '⚙️'
  };
  return icons[category] || '📋';
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

export default GlobalSettings;
