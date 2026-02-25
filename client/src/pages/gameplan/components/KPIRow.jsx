/**
 * KPIRow - Horizontal row of KPI boxes
 * Used by management view for stats overview
 */
import React from 'react'

const KPIBox = ({ value, label, color, icon }) => {
  // Safety: ensure value is primitive (string/number), not object
  let displayValue = value
  if (typeof value === 'object' && value !== null) {
    displayValue = value.value || value.amount || value.percent || JSON.stringify(value)
  }
  
  return (
    <div className="kpi-box" style={{
      flex: '1 1 0',
      minWidth: '120px',
      height: '72px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '8px 10px',
      transition: 'box-shadow 0.2s'
    }}>
      <span style={{
        fontSize: '18px',
        fontWeight: 700,
        color: color || 'var(--text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}
        {displayValue}
      </span>
      <span style={{
        fontSize: '11px',
        color: 'var(--text-secondary)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {label}
      </span>
    </div>
  )
}

const KPIRow = ({ kpis = [] }) => {
  if (!kpis || kpis.length === 0) return null

  return (
    <div className="manager-stat-cards" style={{
      display: 'flex',
      flexWrap: 'nowrap',
      gap: '12px',
      width: '100%',
      margin: '12px 0 18px 0',
      alignItems: 'center',
      overflowX: 'auto',
      paddingBottom: '4px',
      height: '96px'
    }}>
      {kpis.map((kpi, index) => (
        <KPIBox 
          key={index}
          value={kpi.value}
          label={kpi.label}
          color={kpi.color}
          icon={kpi.icon}
        />
      ))}
    </div>
  )
}

export { KPIBox }
export default KPIRow
