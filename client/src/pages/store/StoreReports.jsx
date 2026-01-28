import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

/**
 * StoreReports Component
 * Store analytics and reporting dashboard
 */
const StoreReports = () => {
  const { activeStore } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    if (activeStore?.id) {
      fetchReport();
    }
  }, [activeStore?.id, activeTab, days]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let endpoint;
      switch (activeTab) {
        case 'summary':
          endpoint = 'summary';
          break;
        case 'team':
          endpoint = 'team-activity';
          break;
        case 'scans':
          endpoint = 'scans';
          break;
        default:
          endpoint = 'summary';
      }
      
      const response = await axios.get(
        `/api/store-admin/reports/${endpoint}?store_id=${activeStore.id}&days=${days}`,
        { withCredentials: true }
      );
      
      if (response.data.success) {
        setReportData(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'summary', label: '📊 Summary', icon: '📊' },
    { id: 'team', label: '👥 Team Activity', icon: '👥' },
    { id: 'scans', label: '📦 Scan Reports', icon: '📦' },
  ];

  return (
    <div className="store-reports">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>📈 Store Reports</h1>
        <p style={{ margin: '5px 0 0', color: '#666' }}>
          Analytics and insights for {activeStore?.name}
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              background: activeTab === tab.id ? '#4CAF50' : 'white',
              color: activeTab === tab.id ? 'white' : '#333',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
        
        {/* Period Selector */}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            style={{
              padding: '12px 16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
          <button onClick={fetchReport} style={{ marginLeft: '15px', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Loading report...</div>
      ) : (
        <>
          {activeTab === 'summary' && <SummaryReport data={reportData} days={days} />}
          {activeTab === 'team' && <TeamActivityReport data={reportData} days={days} />}
          {activeTab === 'scans' && <ScanReport data={reportData} days={days} />}
        </>
      )}
    </div>
  );
};

/**
 * Summary Report
 */
const SummaryReport = ({ data, days }) => {
  const { reports } = data || {};
  
  return (
    <div className="summary-report">
      {/* Activity by Type */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>📊 Activity Breakdown</h3>
        
        {reports?.activityByType?.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
            {reports.activityByType.map((item, index) => (
              <div key={index} style={{
                background: '#f9f9f9',
                padding: '15px',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#2196F3' }}>
                  {item.count}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  {formatAction(item.action)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#666' }}>No activity data for this period</p>
        )}
      </div>

      {/* Activity by Day Chart */}
      <div className="admin-card" style={{ ...cardStyle, marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>📅 Daily Activity</h3>
        
        {reports?.activityByDay?.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px', padding: '10px 0' }}>
            {reports.activityByDay.slice(0, 30).reverse().map((day, index) => {
              const maxCount = Math.max(...reports.activityByDay.map(d => parseInt(d.count)));
              const height = maxCount > 0 ? (parseInt(day.count) / maxCount) * 100 : 0;
              
              return (
                <div 
                  key={index}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title={`${formatDate(day.date)}: ${day.count} actions`}
                >
                  <div style={{
                    width: '100%',
                    height: `${height}%`,
                    minHeight: '4px',
                    background: 'linear-gradient(180deg, #4CAF50 0%, #81C784 100%)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s'
                  }} />
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: '#666' }}>No daily data available</p>
        )}
      </div>

      {/* Top Users */}
      <div className="admin-card" style={cardStyle}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>🏆 Top Active Users</h3>
        
        {reports?.topUsers?.length > 0 ? (
          <div>
            {reports.topUsers.map((user, index) => (
              <div key={index} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: index < reports.topUsers.length - 1 ? '1px solid #eee' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: index < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][index] : '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: index < 3 ? 'white' : '#666'
                  }}>
                    {index + 1}
                  </span>
                  <span style={{ fontWeight: 500 }}>{user.name}</span>
                </div>
                <span style={{
                  background: '#e3f2fd',
                  color: '#1976d2',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 500
                }}>
                  {user.activity_count} actions
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#666' }}>No user activity data</p>
        )}
      </div>
    </div>
  );
};

/**
 * Team Activity Report
 */
const TeamActivityReport = ({ data, days }) => {
  const { teamActivity } = data || {};
  
  return (
    <div className="team-activity-report">
      <div className="admin-card" style={cardStyle}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>
          👥 Team Activity - Last {days} Days
        </h3>
        
        {teamActivity?.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={thStyle}>Team Member</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                <th style={thStyle}>Last Activity</th>
                <th style={thStyle}>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {teamActivity.map((member, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: member.image_url ? `url(${member.image_url}) center/cover` : getAvatarColor(member.name),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '14px'
                      }}>
                        {!member.image_url && getInitials(member.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{member.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      background: parseInt(member.total_actions) > 0 ? '#e8f5e9' : '#f5f5f5',
                      color: parseInt(member.total_actions) > 0 ? '#2e7d32' : '#999',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 600
                    }}>
                      {member.total_actions}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: '#666' }}>
                      {member.last_activity ? formatTimeAgo(member.last_activity) : 'No activity'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: '#666' }}>
                      {member.last_login ? formatTimeAgo(member.last_login) : 'Never'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
            No team activity data for this period
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Scan Report
 */
const ScanReport = ({ data, days }) => {
  const { daily, summary } = data || {};
  
  return (
    <div className="scan-report">
      {/* Summary Stats */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '15px',
          marginBottom: '20px'
        }}>
          <StatCard label="Total Scans" value={summary.total_scans || 0} icon="📦" color="#4CAF50" />
          <StatCard label="Expected Units" value={summary.total_expected || 0} icon="📋" color="#2196F3" />
          <StatCard label="Counted Units" value={summary.total_counted || 0} icon="✅" color="#FF9800" />
          <StatCard label="Days with Scans" value={summary.days_with_scans || 0} icon="📅" color="#9C27B0" />
          <StatCard label="Unique Scanners" value={summary.unique_scanners || 0} icon="👥" color="#E91E63" />
        </div>
      )}

      {/* Daily Breakdown */}
      <div className="admin-card" style={cardStyle}>
        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>📅 Daily Scan Performance</h3>
        
        {daily?.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={thStyle}>Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Items</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Expected</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Counted</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{formatDate(day.scan_date)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{day.items_scanned}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{day.expected}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{day.counted}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span style={{
                      background: parseFloat(day.accuracy_pct) >= 95 ? '#e8f5e9' : 
                                  parseFloat(day.accuracy_pct) >= 80 ? '#fff3e0' : '#ffebee',
                      color: parseFloat(day.accuracy_pct) >= 95 ? '#2e7d32' : 
                             parseFloat(day.accuracy_pct) >= 80 ? '#e65100' : '#c62828',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      {day.accuracy_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
            No scan data available for this period
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Stat Card
 */
const StatCard = ({ label, value, icon, color }) => (
  <div style={{
    ...cardStyle,
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      borderRadius: '10px',
      background: `${color}15`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px'
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{label}</div>
    </div>
  </div>
);

// Helper functions
const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4'];
  const index = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[index];
};

const formatAction = (action) => {
  return action?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || action;
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

const formatTimeAgo = (date) => {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
};

// Styles
const cardStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 10px',
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#666',
  fontWeight: 600
};

const tdStyle = {
  padding: '14px 10px',
  fontSize: '14px'
};

export default StoreReports;
