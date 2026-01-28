import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

/**
 * StoreDashboard Component
 * Main overview page for Store Admin Panel
 */
const StoreDashboard = () => {
  const { activeStore } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (activeStore?.id) {
      fetchDashboard();
    }
  }, [activeStore?.id]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/store-admin/dashboard?store_id=${activeStore.id}`,
        { withCredentials: true }
      );
      if (response.data.success) {
        setDashboard(response.data.dashboard);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading store dashboard...</div>;
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  const { store, stats, roleBreakdown, recentActivity } = dashboard || {};

  return (
    <div className="store-dashboard">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>
          🏪 {store?.name || 'Store'} Dashboard
        </h1>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center' }}>
          <code style={{ 
            background: '#e3f2fd', 
            color: '#1976d2',
            padding: '4px 10px', 
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            {store?.code}
          </code>
          {store?.region && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              📍 {store.region}
            </span>
          )}
          <span style={{
            background: store?.is_active ? '#e8f5e9' : '#ffebee',
            color: store?.is_active ? '#2e7d32' : '#c62828',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px'
          }}>
            {store?.is_active ? '● Active' : '○ Inactive'}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <StatCard 
          icon="👥" 
          label="Team Members" 
          value={stats?.teamMembers || 0} 
          link="/store/team"
          color="#4CAF50"
        />
        <StatCard 
          icon="⚙️" 
          label="Store Settings" 
          value={stats?.settingsCount || 0} 
          link="/store/settings"
          color="#2196F3"
        />
        <StatCard 
          icon="📊" 
          label="Today's Scans" 
          value={stats?.todaysScans?.count || 0} 
          link="/store/reports"
          color="#FF9800"
        />
        <StatCard 
          icon="📈" 
          label="Reports" 
          value="View" 
          link="/store/reports"
          color="#9C27B0"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Team Breakdown */}
        <div className="admin-card" style={cardStyle}>
          <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>
            👥 Team by Role
          </h3>
          {roleBreakdown?.length > 0 ? (
            <div>
              {roleBreakdown.map((item) => (
                <div key={item.access_role} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid #eee'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RoleBadge role={item.access_role} />
                    {formatRole(item.access_role)}
                  </span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#666', margin: 0 }}>No team members assigned</p>
          )}
          <Link to="/store/team" style={{ 
            display: 'block', 
            marginTop: '15px', 
            color: '#2196F3',
            textDecoration: 'none'
          }}>
            Manage team →
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="admin-card" style={cardStyle}>
          <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>
            📋 Recent Activity
          </h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {recentActivity?.length > 0 ? (
              recentActivity.slice(0, 10).map((activity, index) => (
                <div key={index} style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #eee',
                  fontSize: '13px'
                }}>
                  <div style={{ fontWeight: 500 }}>{formatAction(activity.action)}</div>
                  <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>
                    {activity.user_name || 'System'} • {formatTime(activity.created_at)}
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: '#666', margin: 0 }}>No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Scan Summary */}
      {stats?.todaysScans && (
        <div className="admin-card" style={{ ...cardStyle, marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>📊 Today's Scan Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div style={scanStatStyle}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#2196F3' }}>
                {stats.todaysScans.count}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>Items Scanned</div>
            </div>
            <div style={scanStatStyle}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#FF9800' }}>
                {stats.todaysScans.expected}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>Expected Units</div>
            </div>
            <div style={scanStatStyle}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#4CAF50' }}>
                {stats.todaysScans.counted}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>Counted Units</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="admin-card" style={{ ...cardStyle, marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>⚡ Quick Actions</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <Link to="/store/team" style={quickActionStyle}>
            👥 View Team
          </Link>
          <Link to="/store/settings" style={quickActionStyle}>
            ⚙️ Store Settings
          </Link>
          <Link to="/store/reports" style={quickActionStyle}>
            📈 View Reports
          </Link>
          <button onClick={fetchDashboard} style={quickActionStyle}>
            🔄 Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ icon, label, value, link, color }) => (
  <Link to={link} style={{ textDecoration: 'none' }}>
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    }}
    >
      <div style={{
        width: '45px',
        height: '45px',
        borderRadius: '10px',
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px'
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#666' }}>{label}</div>
      </div>
    </div>
  </Link>
);

const RoleBadge = ({ role }) => {
  const colors = {
    admin: '#4CAF50',
    manager: '#2196F3',
    user: '#9e9e9e'
  };
  return (
    <span style={{
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: colors[role] || '#999',
      display: 'inline-block'
    }} />
  );
};

// Styles
const cardStyle = {
  background: 'white',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
};

const scanStatStyle = {
  textAlign: 'center',
  padding: '15px',
  background: '#f9f9f9',
  borderRadius: '8px'
};

const quickActionStyle = {
  padding: '10px 16px',
  background: '#f5f7fa',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  textDecoration: 'none',
  color: '#333',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px'
};

// Helper functions
const formatRole = (role) => {
  const map = {
    admin: 'Administrators',
    manager: 'Managers',
    user: 'Team Members'
  };
  return map[role] || role;
};

const formatAction = (action) => {
  const map = {
    'LOGIN_SUCCESS': '🔓 User logged in',
    'LOGOUT': '🔒 User logged out',
    'STORE_SWITCH': '🔄 Store switched',
    'PASSWORD_CHANGE': '🔑 Password changed',
    'SETTING_UPDATE': '⚙️ Setting updated',
    'TEAM_UPDATE': '👥 Team updated'
  };
  return map[action] || action;
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
};

export default StoreDashboard;
