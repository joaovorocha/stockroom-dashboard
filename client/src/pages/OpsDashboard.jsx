import React, { useState } from 'react'

const OpsDashboard = () => {
  const [activeTab, setActiveTab] = useState('storesWtd')

  const dashboards = [
    { 
      id: 'storesWtd', 
      label: 'Store Performance',
      title: 'Store Performance',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/603?Regional+Manager=&Region=&Location=San+Francisco&Predefined+Period=Last+Week&Select+Currency=USD&Location+Type=Store%2COutlet&Employee+Name='
    },
    { 
      id: 'storesPrev', 
      label: 'OPS Dashboard',
      title: 'OPS Dashboard',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/1104?Period=last+week&Location+Name=San+Francisco&Regional+Manager=&Region='
    },
    { 
      id: 'finishedWeek', 
      label: 'Tailor Audit',
      title: 'Tailor Audit',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/1542?Finished++Week=1+week+ago+for+1+week&Location+Name=San+Francisco'
    },
    { 
      id: 'closingQuality', 
      label: 'Alterations per Employee',
      title: 'Alterations per Employee',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/1240?Finished++Week=1+week+ago+for+1+week&Location+Name=San+Francisco&Employee+Full+Name=&Difficulty+Level=&Description='
    },
    { 
      id: 'employeePurchases', 
      label: 'Employee Discount',
      title: 'Employee Discount',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/1543?Employee+Name=&Location+Name=San+Francisco'
    },
    { 
      id: 'tailor', 
      label: 'Tailor Dashboard',
      title: 'Tailor Dashboard',
      url: 'https://lookersuitsupply.cloud.looker.com/embed/dashboards/1544?Location+Name=San+Francisco'
    }
  ]

  const activeDashboard = dashboards.find(d => d.id === activeTab) || dashboards[0]

  return (
    <div>
      {/* Sub-header */}
      <div style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '18px', margin: 0 }}>Operations Dashboards</h2>
      </div>

      <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap' }}>
          {dashboards.map(dashboard => (
            <button
              key={dashboard.id}
              onClick={() => setActiveTab(dashboard.id)}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: activeTab === dashboard.id ? 'var(--primary)' : 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === dashboard.id ? '#fff' : 'var(--text-secondary)',
                borderRadius: '4px'
              }}
            >
              {dashboard.label}
            </button>
          ))}
        </div>

        {/* Dashboard Frame */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Info Bar */}
          <div style={{ 
            padding: '16px 20px', 
            background: 'var(--background)', 
            borderBottom: '1px solid var(--border)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <h3 style={{ fontSize: '16px', margin: 0 }}>{activeDashboard.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <a 
                href={activeDashboard.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ 
                  fontSize: '13px', 
                  color: 'var(--text-secondary)', 
                  textDecoration: 'none', 
                  border: '1px solid var(--border)', 
                  padding: '6px 10px', 
                  borderRadius: '6px', 
                  background: 'var(--surface)' 
                }}
              >
                Open in Looker →
              </a>
            </div>
          </div>

          {/* iFrame */}
          <iframe
            src={activeDashboard.url}
            title={activeDashboard.title}
            allowFullScreen
            style={{
              display: 'block',
              width: '100%',
              height: '900px',
              border: 'none'
            }}
          />
        </div>

        {/* Footer Note */}
        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          These dashboards are powered by Looker. Data refreshes automatically.
        </div>
      </div>
    </div>
  )
}

export default OpsDashboard
