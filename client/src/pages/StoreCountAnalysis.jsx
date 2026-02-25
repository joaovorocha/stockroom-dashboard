import React from 'react'

// Static data - will be replaced with API calls
const summaryCards = [
  { label: 'Total Scans', value: '1,240' },
  { label: 'Accuracy Rate', value: '98.4%' }
]

const teamRankings = [
  { rank: 1, team: 'Amsterdam Flagship', totalScans: 320, accuracy: '99.1%' },
  { rank: 2, team: 'Rotterdam', totalScans: 287, accuracy: '98.7%' },
  { rank: 3, team: 'The Hague', totalScans: 245, accuracy: '98.2%' },
  { rank: 4, team: 'Utrecht', totalScans: 201, accuracy: '97.9%' }
]

const StoreCountAnalysis = () => {
  return (
    <div className="container">
      {/* Executive Summary */}
      <section className="section">
        <div className="section-header">
          <h2>Executive Summary</h2>
        </div>
        <div className="grid grid-2" style={{ maxWidth: '400px' }}>
          {summaryCards.map((card) => (
            <div key={card.label} className="metric-card">
              <span className="metric-label">{card.label}</span>
              <span className="metric-value">{card.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Team Rankings */}
      <section className="section" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <h2>Team Rankings</h2>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Total Scans</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {teamRankings.map((row) => (
                  <tr key={row.rank}>
                    <td>{row.rank}</td>
                    <td>{row.team}</td>
                    <td>{row.totalScans}</td>
                    <td>
                      <span className="badge badge-success">{row.accuracy}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Detailed Metrics */}
      <section className="section" style={{ marginTop: '24px' }}>
        <div className="section-header">
          <h2>Detailed Metrics</h2>
        </div>
        <div className="grid grid-2">
          {/* Missed Units */}
          <div className="card">
            <div className="card-header">
              <h3>Missed Units</h3>
            </div>
            <div className="card-body">
              <div className="metric-card" style={{ marginBottom: '12px' }}>
                <span className="metric-label">Total Missed</span>
                <span className="metric-value">18</span>
                <span className="metric-change negative">+3 vs. last week</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <li>Outerwear: 7 units</li>
                <li>Accessories: 6 units</li>
                <li>Footwear: 5 units</li>
              </ul>
            </div>
          </div>

          {/* New Units */}
          <div className="card">
            <div className="card-header">
              <h3>New Units</h3>
            </div>
            <div className="card-body">
              <div className="metric-card" style={{ marginBottom: '12px' }}>
                <span className="metric-label">Units Captured</span>
                <span className="metric-value">132</span>
                <span className="metric-change positive">All locations</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <li>Amsterdam Flagship: 48 units</li>
                <li>Rotterdam: 38 units</li>
                <li>Others: 46 units</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default StoreCountAnalysis
