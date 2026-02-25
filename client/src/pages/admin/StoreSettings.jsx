import React, { useState, useEffect } from 'react'
import client from '../../api/client'
import StoreRecoverySettings from './StoreRecoverySettings'
import './StoreSettings.css'

const StoreSettings = () => {
  const [settings, setSettings] = useState({
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    dayStart: '12:00',
    requireSaShift: false,
    tomatoStartDate: '2026-01-20',
    employeeDiscountLimit: 2500
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      // Load from multiple endpoints
      const storeConfig = await client.get('/admin/store-config')
      const tomatoConfig = await client.get('/admin/tomato-awards')
      const discountConfig = await client.get('/admin/work-expenses-config')
      
      setSettings({
        timezone: storeConfig.data?.timeZone || 'America/Los_Angeles',
        currency: storeConfig.data?.currency || 'USD',
        dayStart: storeConfig.data?.dayStart || '00:00',
        requireSaShift: storeConfig.data?.requireSaShift || false,
        tomatoStartDate: tomatoConfig.data?.tomatoStartDate || '2026-01-20',
        employeeDiscountLimit: discountConfig.data?.globalYearlyLimit || 3300
      })
      setLastUpdated(storeConfig.data?.updatedAt)
    } catch (error) {
      console.error('Error loading settings:', error)
      alert('Failed to load settings: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      // Save to different endpoints
      await client.post('/admin/store-config', {
        timeZone: settings.timezone,
        currency: settings.currency,
        dayStart: settings.dayStart,
        requireSaShift: settings.requireSaShift
      })
      
      await client.post('/admin/work-expenses-config', {
        globalYearlyLimit: settings.employeeDiscountLimit
      })
      
      alert('Settings saved successfully!')
      loadSettings()
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleResetTomato = async () => {
    if (!confirm('Reset tomato awards? This will start tracking from today.')) return
    
    try {
      await client.post('/admin/tomato-awards/reset')
      alert('Tomato awards reset successfully!')
      loadSettings()
    } catch (error) {
      console.error('Error resetting tomato awards:', error)
      alert('Failed to reset tomato awards')
    }
  }

  return (
    <div className="store-settings">
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '16px', color: '#666' }}>
          Loading settings...
        </div>
      )}
      
      {!loading && (
        <>
          <div className="settings-grid">
            {/* Store Settings Card */}
            <div className="settings-card">
              <h2>Store Settings</h2>
          
          <div className="form-group">
            <label>TIMEZONE</label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            >
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="Europe/London">Europe/London</option>
            </select>
          </div>

          <div className="form-group">
            <label>CURRENCY</label>
            <select
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div className="form-group">
            <label>NEW DAY STARTS</label>
            <input
              type="time"
              value={settings.dayStart}
              onChange={(e) => setSettings({ ...settings, dayStart: e.target.value })}
            />
          </div>

          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.requireSaShift}
                onChange={(e) => setSettings({ ...settings, requireSaShift: e.target.checked })}
              />
              Require SA Shift to be working
            </label>
          </div>

          <p className="help-text">
            These settings control store-day calculations (daily reset) and currency formatting.
          </p>
          
          {lastUpdated && (
            <p className="meta-text">
              Last updated {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

            {/* Tomato Awards Card */}
            <div className="settings-card">
              <h2>Tomato Awards</h2>
              <p className="info-text">
                Tracking starts on: <strong>{settings.tomatoStartDate}</strong>
              </p>
              <button onClick={handleResetTomato} className="btn-secondary">
                Reset Tomato Awards
              </button>
            </div>

            {/* Employee Discount Card */}
            <div className="settings-card">
              <h2>Employee Discount Policy</h2>
              <p className="info-text">
                40% discount up to <strong>$2,500</strong> retail value per calendar year (local currency equivalent).
              </p>
              
              <div className="form-group">
                <label>YEARLY RETAIL LIMIT (USD)</label>
                <input
                  type="number"
                  value={settings.employeeDiscountLimit}
                  onChange={(e) => setSettings({ ...settings, employeeDiscountLimit: parseInt(e.target.value) })}
                />
              </div>
              
              {lastUpdated && (
                <p className="meta-text">
                  Last updated {new Date(lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <StoreRecoverySettings />

          {/* Save Button */}
          <div className="save-actions">
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="btn-save"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default StoreSettings
