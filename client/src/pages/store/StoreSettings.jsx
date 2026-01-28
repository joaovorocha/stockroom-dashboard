import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

/**
 * StoreSettings Component
 * Manage store-specific settings (editable where allowed)
 */
const StoreSettings = () => {
  const { activeStore } = useAuth();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [editedValues, setEditedValues] = useState({});
  const [successMessage, setSuccessMessage] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    if (activeStore?.id) {
      fetchSettings();
    }
  }, [activeStore?.id]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/store-admin/settings?store_id=${activeStore.id}`,
        { withCredentials: true }
      );
      if (response.data.success) {
        setSettings(response.data.settings);
        // Initialize edited values
        const initial = {};
        response.data.settings.forEach(s => {
          initial[s.setting_key] = s.setting_value;
        });
        setEditedValues(initial);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    try {
      setSaving(key);
      setSuccessMessage(null);
      
      const response = await axios.put(
        `/api/store-admin/settings/${key}?store_id=${activeStore.id}`,
        { value: editedValues[key] },
        { withCredentials: true }
      );
      
      if (response.data.success) {
        setSettings(prev => 
          prev.map(s => s.setting_key === key ? { ...s, setting_value: editedValues[key], is_overridden: true } : s)
        );
        setSuccessMessage(`Setting "${formatSettingKey(key)}" saved`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save setting');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (key) => {
    if (!confirm('Reset this setting to the global default?')) return;
    
    try {
      setSaving(key);
      await axios.delete(
        `/api/store-admin/settings/${key}?store_id=${activeStore.id}`,
        { withCredentials: true }
      );
      
      await fetchSettings();
      setSuccessMessage('Setting reset to global default');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset setting');
    } finally {
      setSaving(null);
    }
  };

  // Get unique categories
  const categories = ['all', ...new Set(settings.map(s => s.category || 'general'))];
  
  // Filter settings by category
  const filteredSettings = categoryFilter === 'all' 
    ? settings 
    : settings.filter(s => (s.category || 'general') === categoryFilter);

  // Group by category
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
        <button onClick={() => { setError(null); fetchSettings(); }}>Retry</button>
      </div>
    );
  }

  return (
    <div className="store-settings">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>⚙️ Store Settings</h1>
        <p style={{ margin: '5px 0 0', color: '#666' }}>
          Configure settings for {activeStore?.name}
        </p>
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
                background: categoryFilter === cat ? '#4CAF50' : '#f0f0f0',
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
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categorySettings.map(setting => (
              <SettingRow
                key={setting.setting_key}
                setting={setting}
                value={editedValues[setting.setting_key]}
                onChange={(value) => handleChange(setting.setting_key, value)}
                onSave={() => handleSave(setting.setting_key)}
                onReset={() => handleReset(setting.setting_key)}
                hasChange={editedValues[setting.setting_key] !== setting.setting_value}
                saving={saving === setting.setting_key}
              />
            ))}
          </div>
        </div>
      ))}

      {filteredSettings.length === 0 && (
        <div className="admin-card" style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#666' }}>No settings found for this category</p>
        </div>
      )}
    </div>
  );
};

/**
 * Individual Setting Row
 */
const SettingRow = ({ setting, value, onChange, onSave, onReset, hasChange, saving }) => {
  const canEdit = setting.can_edit;
  
  const getInputType = () => {
    if (setting.setting_type === 'boolean') return 'toggle';
    if (setting.setting_type === 'number') return 'number';
    return 'text';
  };

  const inputType = getInputType();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 15px',
      background: hasChange ? '#fff8e1' : (setting.is_overridden ? '#e8f5e9' : '#f9f9f9'),
      borderRadius: '8px',
      border: hasChange ? '1px solid #ffca28' : '1px solid transparent',
      opacity: canEdit ? 1 : 0.7
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 500, fontSize: '14px' }}>
            {formatSettingKey(setting.setting_key)}
          </span>
          {setting.is_overridden && (
            <span style={{
              background: '#4CAF50',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px'
            }}>
              CUSTOM
            </span>
          )}
          {!canEdit && (
            <span style={{
              background: '#ff9800',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px'
            }}>
              READ ONLY
            </span>
          )}
        </div>
        {setting.description && (
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            {setting.description}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {inputType === 'toggle' ? (
          <label style={{ display: 'flex', alignItems: 'center', cursor: canEdit ? 'pointer' : 'not-allowed' }}>
            <input
              type="checkbox"
              checked={value === 'true' || value === true}
              onChange={(e) => onChange(e.target.checked.toString())}
              disabled={!canEdit}
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
            disabled={!canEdit}
            style={{
              width: '180px',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              textAlign: 'right',
              cursor: canEdit ? 'text' : 'not-allowed'
            }}
          />
        )}
        
        {hasChange && canEdit && (
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
            {saving ? '...' : 'Save'}
          </button>
        )}
        
        {setting.is_overridden && canEdit && !hasChange && (
          <button
            onClick={onReset}
            disabled={saving}
            style={{
              padding: '6px 12px',
              background: '#f5f5f5',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
            title="Reset to global default"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
};

// Helper functions
const formatSettingKey = (key) => {
  return key
    .replace(/^(system|legal|support|store)\./, '')
    .split(/[._]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatCategory = (category) => {
  return category.charAt(0).toUpperCase() + category.slice(1);
};

const getCategoryIcon = (category) => {
  const icons = {
    general: '📋',
    system: '⚙️',
    email: '📧',
    security: '🔒',
    notifications: '🔔',
    scanning: '📊',
    legal: '⚖️',
    support: '🎫',
    operations: '🏭'
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

export default StoreSettings;
