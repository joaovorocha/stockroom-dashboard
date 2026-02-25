import React, { useEffect, useState } from 'react'
import client from '../../api/client'
import './StoreRecoverySettings.css'

const emptyConfig = {
  decodedText: '',
  baseUrl: '',
  authType: 'apiKey',
  headerName: 'x-api-key',
  apiKey: '',
  oauthDomain: '',
  oauthTokenUrl: '',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthResource: '',
  oauthScope: '',
  oauthGrantType: 'client_credentials',
  oauthCountryCode: ''
}

const StoreRecoverySettings = () => {
  const [config, setConfig] = useState(emptyConfig)
  const [meta, setMeta] = useState({ apiKeyMasked: '', hasApiKey: false, oauthClientSecretMasked: '', hasOauthClientSecret: false })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await client.get('/admin/store-recovery-config')
      const data = response.data || {}
      setConfig({
        ...emptyConfig,
        decodedText: data.decodedText || '',
        baseUrl: data.baseUrl || '',
        authType: data.authType || 'apiKey',
        headerName: data.headerName || 'x-api-key',
        oauthDomain: data.oauthDomain || '',
        oauthTokenUrl: data.oauthTokenUrl || '',
        oauthClientId: data.oauthClientId || '',
        oauthResource: data.oauthResource || '',
        oauthScope: data.oauthScope || '',
        oauthGrantType: data.oauthGrantType || 'client_credentials',
        oauthCountryCode: data.oauthCountryCode || ''
      })
      setMeta({
        apiKeyMasked: data.apiKeyMasked || '',
        hasApiKey: !!data.hasApiKey,
        oauthClientSecretMasked: data.oauthClientSecretMasked || '',
        hasOauthClientSecret: !!data.hasOauthClientSecret
      })
      setStatus('')
    } catch (err) {
      setStatus(err?.response?.data?.error || 'Failed to load Store Recovery config')
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      const payload = {
        decodedText: config.decodedText,
        baseUrl: config.baseUrl,
        authType: config.authType,
        headerName: config.headerName,
        apiKey: config.apiKey,
        oauthDomain: config.oauthDomain,
        oauthTokenUrl: config.oauthTokenUrl,
        oauthClientId: config.oauthClientId,
        oauthClientSecret: config.oauthClientSecret,
        oauthResource: config.oauthResource,
        oauthScope: config.oauthScope,
        oauthGrantType: config.oauthGrantType,
        oauthCountryCode: config.oauthCountryCode
      }
      const response = await client.post('/admin/store-recovery-config', payload)
      const data = response.data || {}
      setMeta({
        apiKeyMasked: data.apiKeyMasked || '',
        hasApiKey: !!data.hasApiKey,
        oauthClientSecretMasked: data.oauthClientSecretMasked || '',
        hasOauthClientSecret: !!data.hasOauthClientSecret
      })
      setConfig(prev => ({ ...prev, apiKey: '', oauthClientSecret: '' }))
      setStatus('Saved Store Recovery config')
    } catch (err) {
      setStatus(err?.response?.data?.error || 'Failed to save Store Recovery config')
    } finally {
      setSaving(false)
    }
  }

  const decodeBarcodeFromFile = async (file) => {
    if (!file) throw new Error('Choose an image first.')
    if (!('BarcodeDetector' in window)) {
      throw new Error('BarcodeDetector not supported in this browser. Use Chrome/Edge on desktop.')
    }
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'data_matrix'] })
    const bmp = await createImageBitmap(file)
    try {
      const codes = await detector.detect(bmp)
      if (!codes || !codes.length) return ''
      return codes[0].rawValue || ''
    } finally {
      try { bmp.close && bmp.close() } catch (_) {}
    }
  }

  const handleDecodeFile = async (event) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return
      const decoded = await decodeBarcodeFromFile(file)
      if (!decoded) {
        setStatus('No QR/DataMatrix found in that image.')
        return
      }
      setConfig(prev => ({ ...prev, decodedText: decoded }))
      setStatus('Decoded text loaded. Click Save to apply.')
    } catch (err) {
      setStatus(err.message || 'Failed to decode file')
    }
  }

  const looksLikeHexEpc = (value) => /^[0-9a-fA-F]{16,64}$/.test(value)
  const looksLikeEan = (value) => /^\d{13,14}$/.test(value)

  const handleTestLookup = async () => {
    try {
      setTestResult('Loading...')
      const raw = (testInput || '').trim()
      if (!raw) {
        setTestResult('Paste an EPC/SKU/EAN first.')
        return
      }
      let url = ''
      if (looksLikeHexEpc(raw)) url = `/store-recovery/lookup?epc=${encodeURIComponent(raw)}`
      else if (looksLikeEan(raw)) url = `/store-recovery/lookup?ean=${encodeURIComponent(raw)}`
      else url = `/store-recovery/lookup?sku=${encodeURIComponent(raw)}`

      const response = await client.get(url)
      setTestResult(JSON.stringify(response.data, null, 2))
    } catch (err) {
      const message = err?.response?.data || err?.message || 'Lookup failed'
      setTestResult(typeof message === 'string' ? message : JSON.stringify(message, null, 2))
    }
  }

  return (
    <div className="store-recovery">
      <div className="store-recovery-header">
        <h2>Store Recovery API</h2>
        <button className="btn-secondary" onClick={saveConfig} disabled={saving}>Save</button>
      </div>

      {loading && <div className="store-recovery-status">Loading Store Recovery config...</div>}
      {!loading && status && <div className="store-recovery-status">{status}</div>}

      {!loading && (
        <div className="store-recovery-grid">
          <div className="store-recovery-block">
            <label>QR/DataMatrix image</label>
            <input type="file" accept="image/*" onChange={handleDecodeFile} />
          </div>

          <div className="store-recovery-block">
            <label>Decoded / pasted text</label>
            <textarea
              rows="3"
              value={config.decodedText}
              onChange={(e) => setConfig(prev => ({ ...prev, decodedText: e.target.value }))}
            />
          </div>

          <div className="store-recovery-row">
            <div className="store-recovery-block">
              <label>API Base URL</label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
              />
            </div>
            <div className="store-recovery-block">
              <label>Auth Type</label>
              <select
                value={config.authType}
                onChange={(e) => setConfig(prev => ({ ...prev, authType: e.target.value }))}
              >
                <option value="apiKey">apiKey</option>
                <option value="oauth2">oauth2</option>
              </select>
            </div>
          </div>

          {config.authType === 'apiKey' && (
            <div className="store-recovery-row">
              <div className="store-recovery-block">
                <label>API Key Header</label>
                <input
                  type="text"
                  value={config.headerName}
                  onChange={(e) => setConfig(prev => ({ ...prev, headerName: e.target.value }))}
                />
              </div>
              <div className="store-recovery-block">
                <label>API Key (leave blank to keep existing)</label>
                <input
                  type="password"
                  value={config.apiKey}
                  placeholder={meta.hasApiKey ? meta.apiKeyMasked : ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                />
              </div>
            </div>
          )}

          {config.authType === 'oauth2' && (
            <>
              <div className="store-recovery-row">
                <div className="store-recovery-block">
                  <label>OAuth Domain</label>
                  <input
                    type="text"
                    value={config.oauthDomain}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthDomain: e.target.value }))}
                  />
                </div>
                <div className="store-recovery-block">
                  <label>OAuth Token URL</label>
                  <input
                    type="text"
                    value={config.oauthTokenUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthTokenUrl: e.target.value }))}
                  />
                </div>
              </div>
              <div className="store-recovery-row">
                <div className="store-recovery-block">
                  <label>Client ID</label>
                  <input
                    type="text"
                    value={config.oauthClientId}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthClientId: e.target.value }))}
                  />
                </div>
                <div className="store-recovery-block">
                  <label>Client Secret (leave blank to keep existing)</label>
                  <input
                    type="password"
                    value={config.oauthClientSecret}
                    placeholder={meta.hasOauthClientSecret ? meta.oauthClientSecretMasked : ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthClientSecret: e.target.value }))}
                  />
                </div>
              </div>
              <div className="store-recovery-row">
                <div className="store-recovery-block">
                  <label>Resource</label>
                  <input
                    type="text"
                    value={config.oauthResource}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthResource: e.target.value }))}
                  />
                </div>
                <div className="store-recovery-block">
                  <label>Scope</label>
                  <input
                    type="text"
                    value={config.oauthScope}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthScope: e.target.value }))}
                  />
                </div>
              </div>
              <div className="store-recovery-row">
                <div className="store-recovery-block">
                  <label>Grant Type</label>
                  <input
                    type="text"
                    value={config.oauthGrantType}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthGrantType: e.target.value }))}
                  />
                </div>
                <div className="store-recovery-block">
                  <label>Country Code</label>
                  <input
                    type="text"
                    value={config.oauthCountryCode}
                    onChange={(e) => setConfig(prev => ({ ...prev, oauthCountryCode: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="store-recovery-test">
            <h3>Test lookup</h3>
            <div className="store-recovery-row">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Paste EPC / SKU / EAN"
              />
              <button className="btn-secondary" onClick={handleTestLookup}>Test</button>
            </div>
            <pre>{testResult}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoreRecoverySettings
