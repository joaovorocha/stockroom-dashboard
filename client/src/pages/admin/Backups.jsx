import React from 'react'
import './Backups.css'

const Backups = () => {
  const downloadBackup = () => {
    window.location.href = '/api/admin/backup.zip'
  }

  const downloadExport = () => {
    window.location.href = '/api/admin/export.zip'
  }

  return (
    <div className="backups-page">
      <div className="backups-card">
        <h2>Backups</h2>
        <p>Download a full backup or a structured export.</p>
        <div className="backups-actions">
          <button className="btn-primary" onClick={downloadBackup}>Download Backup (.zip)</button>
          <button className="btn-secondary" onClick={downloadExport}>Download Structured Export (.zip)</button>
        </div>
      </div>
    </div>
  )
}

export default Backups
