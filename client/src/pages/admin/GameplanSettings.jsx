import React, { useState, useEffect } from 'react'
import client from '../../api/client'
import './GameplanSettings.css'

const GameplanSettings = () => {
  const [activeTab, setActiveTab] = useState('zones')
  const [settings, setSettings] = useState({
    zones: [],
    fittingRooms: [],
    shifts: [],
    closingSections: [],
    closingDutyMaxAssignees: 3,
    tailorStations: [],
    managementRoles: [],
    lunchTimes: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newItemInputs, setNewItemInputs] = useState({})

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await client.get('/gameplan/settings')
      setSettings(response.data)
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      await client.post('/gameplan/settings', settings)
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const addItem = (key) => {
    const newValue = newItemInputs[key]?.trim()
    if (!newValue) return

    const newItem = { id: `${key}-${Date.now()}`, name: newValue }
    setSettings(prev => ({
      ...prev,
      [key]: [...prev[key], newItem]
    }))
    setNewItemInputs(prev => ({ ...prev, [key]: '' }))
  }

  const removeItem = (key, index) => {
    if (!confirm('Are you sure you want to remove this item?')) return
    
    setSettings(prev => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index)
    }))
  }

  const updateItem = (key, index, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: prev[key].map((item, i) => 
        i === index ? { ...item, name: value } : item
      )
    }))
  }

  const moveItem = (key, fromIndex, toIndex) => {
    const items = [...settings[key]]
    const [movedItem] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, movedItem)
    
    setSettings(prev => ({
      ...prev,
      [key]: items
    }))
  }

  const renderSettingsList = (key, title, placeholder) => {
    const items = settings[key] || []
    
    return (
      <div className="settings-section">
        <div className="settings-header">
          <h3>{title}</h3>
          <span className="count-badge">{items.length} items</span>
        </div>
        
        <div className="settings-list">
          {items.map((item, index) => (
            <div key={item.id || index} className="settings-item">
              <span className="drag-handle">⋮⋮</span>
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(key, index, e.target.value)}
                className="item-input"
              />
              <div className="item-actions">
                {index > 0 && (
                  <button
                    onClick={() => moveItem(key, index, index - 1)}
                    className="btn-icon"
                    title="Move up"
                  >
                    ↑
                  </button>
                )}
                {index < items.length - 1 && (
                  <button
                    onClick={() => moveItem(key, index, index + 1)}
                    className="btn-icon"
                    title="Move down"
                  >
                    ↓
                  </button>
                )}
                <button
                  onClick={() => removeItem(key, index)}
                  className="btn-remove"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="add-item-row">
          <input
            type="text"
            placeholder={placeholder}
            value={newItemInputs[key] || ''}
            onChange={(e) => setNewItemInputs(prev => ({ ...prev, [key]: e.target.value }))}
            onKeyPress={(e) => e.key === 'Enter' && addItem(key)}
            className="add-input"
          />
          <button onClick={() => addItem(key)} className="btn-add">
            Add
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="admin-settings">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-settings">
      {/* Header */}
      <div className="admin-header">
        <div>
          <div className="breadcrumb">Admin Console</div>
          <h1>Store Settings</h1>
          <p className="subtitle">Configure zones, shifts, and store-specific options</p>
        </div>
        <button 
          onClick={saveSettings} 
          disabled={saving}
          className="btn-save"
        >
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'zones' ? 'active' : ''}`}
            onClick={() => setActiveTab('zones')}
          >
            📍 Sales Zones
          </button>
          <button
            className={`tab ${activeTab === 'fittingRooms' ? 'active' : ''}`}
            onClick={() => setActiveTab('fittingRooms')}
          >
            🚪 Fitting Rooms
          </button>
          <button
            className={`tab ${activeTab === 'shifts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shifts')}
          >
            ⏰ Shifts
          </button>
          <button
            className={`tab ${activeTab === 'closingSections' ? 'active' : ''}`}
            onClick={() => setActiveTab('closingSections')}
          >
            ✅ Closing Duties
          </button>
          <button
            className={`tab ${activeTab === 'tailorStations' ? 'active' : ''}`}
            onClick={() => setActiveTab('tailorStations')}
          >
            ✂️ Tailor Stations
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="settings-content">
        {activeTab === 'zones' && renderSettingsList(
          'zones',
          'Sales Zones',
          'Enter zone name (e.g., Casual, Front Wave)...'
        )}
        
        {activeTab === 'fittingRooms' && renderSettingsList(
          'fittingRooms',
          'Fitting Rooms',
          'Enter fitting room name (e.g., Hosp 1, Hallway 1)...'
        )}
        
        {activeTab === 'shifts' && renderSettingsList(
          'shifts',
          'Shifts',
          'Enter shift time (e.g., 8:00 AM - 5:00 PM)...'
        )}
        
        {activeTab === 'closingSections' && (
          <>
            <div className="settings-section" style={{ marginBottom: '16px' }}>
              <div className="settings-header">
                <h3>Closing Duty Capacity</h3>
              </div>
              <div className="settings-list" style={{ maxWidth: '240px' }}>
                <label className="item-input" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Max assignees per duty</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.closingDutyMaxAssignees || 3}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      closingDutyMaxAssignees: Number(e.target.value || 1)
                    }))}
                    className="item-input"
                    style={{ width: '80px' }}
                  />
                </label>
              </div>
            </div>
            {renderSettingsList(
              'closingSections',
              'Closing Duty Sections',
              'Enter closing section (e.g., Knit Table, Bays)...'
            )}
          </>
        )}
        
        {activeTab === 'tailorStations' && renderSettingsList(
          'tailorStations',
          'Tailor Stations',
          'Enter station name (e.g., Store 1, BOH 1)...'
        )}
      </div>

      {/* Save reminder */}
      <div className="save-reminder">
        <div className="reminder-content">
          <span className="reminder-icon">💡</span>
          <span>Changes are not saved automatically. Click "Save All Changes" when you're done.</span>
        </div>
      </div>
    </div>
  )
}

export default GameplanSettings
