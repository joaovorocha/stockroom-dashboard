import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

/**
 * AdminDashboard Component
 * Main overview page for Super Admin Panel
 */
const AdminDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/super-admin/dashboard', { withCredentials: true });
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
    return <div className="admin-loading">Loading dashboard...</div>;
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

  const { counts, recentActivity, storeBreakdown, ticketsByPriority } = dashboard || {};

  return (
    <div className="admin-dashboard">
      <div className="admin-header" style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>Super Admin Dashboard</h1>
        <p style={{ margin: '5px 0 0', color: '#666' }}>
          Overview of all stores and system status
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <StatCard 
          icon="🏪" 
          label="Active Stores" 
          value={counts?.stores || 0} 
          link="/admin/stores"
          color="#4CAF50"
        />
        <StatCard 
          icon="👥" 
          label="Total Users" 
          value={counts?.users || 0} 
          link="/admin/users"
          color="#2196F3"
        />
        <StatCard 
          icon="🎫" 
          label="Open Tickets" 
          value={counts?.openTickets || 0} 
          link="/admin/tickets"
          color={counts?.openTickets > 5 ? '#f44336' : '#FF9800'}
        />
        <StatCard 
          icon="⚙️" 
          label="Settings" 
          value={counts?.settings || 0} 
          link="/admin/settings"
          color="#9C27B0"
        />
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Store Breakdown */}
        <div className="admin-card" style={cardStyle}>
          <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>
            🏪 Store Overview
          </h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={thStyle}>Store</th>
                  <th style={thStyle}>Code</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {storeBreakdown?.map((store) => (
                  <tr key={store.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>{store.name}</td>
                    <td style={tdStyle}>
                      <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: '4px' }}>
                        {store.code}
                      </code>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{store.user_count}</td>
                    <td style={tdStyle}>
                      <Link to={`/admin/stores/${store.id}`} style={{ color: '#2196F3', textDecoration: 'none' }}>
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Ticket Summary */}
          <div className="admin-card" style={cardStyle}>
            <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>
              🎫 Open Tickets by Priority
            </h3>
            {ticketsByPriority?.length > 0 ? (
              <div>
                {ticketsByPriority.map((item) => (
                  <div key={item.priority} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #eee'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <PriorityBadge priority={item.priority} />
                      {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                    </span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#666', margin: 0 }}>No open tickets 🎉</p>
            )}
            <Link to="/admin/tickets" style={{ 
              display: 'block', 
              marginTop: '15px', 
              color: '#2196F3',
              textDecoration: 'none'
            }}>
              View all tickets →
            </Link>
          </div>

          {/* Recent Activity */}
          <div className="admin-card" style={cardStyle}>
            <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>
              📋 Recent Activity
            </h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {recentActivity?.slice(0, 8).map((activity, index) => (
                <div key={index} style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #eee',
                  fontSize: '13px'
                }}>
                  <div style={{ fontWeight: 500 }}>{formatAction(activity.action)}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {activity.user_name || 'System'} • {formatTime(activity.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="admin-card" style={{ ...cardStyle, marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>⚡ Quick Actions</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <Link to="/admin/users?action=new" className="btn" style={quickActionStyle}>
            ➕ Add User
          </Link>
          <Link to="/admin/settings" className="btn" style={quickActionStyle}>
            ⚙️ Edit Settings
          </Link>
          <Link to="/admin/tickets?status=open" className="btn" style={quickActionStyle}>
            🎫 View Open Tickets
          </Link>
          <button onClick={fetchDashboard} style={quickActionStyle}>
            🔄 Refresh Data
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
        width: '50px',
        height: '50px',
        borderRadius: '12px',
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px'
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
        <div style={{ fontSize: '14px', color: '#666' }}>{label}</div>
      </div>
    </div>
  </Link>
);

const PriorityBadge = ({ priority }) => {
  const colors = {
    urgent: '#f44336',
    high: '#FF9800',
    medium: '#2196F3',
    low: '#4CAF50'
  };
  return (
    <span style={{
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: colors[priority] || '#999',
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

const thStyle = {
  textAlign: 'left',
  padding: '10px 8px',
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#666',
  fontWeight: 600
};

const tdStyle = {
  padding: '12px 8px',
  fontSize: '14px'
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
const formatAction = (action) => {
  const map = {
    'LOGIN_SUCCESS': '🔓 User logged in',
    'LOGOUT': '🔒 User logged out',
    'STORE_SWITCH': '🔄 Store switched',
    'PASSWORD_CHANGE': '🔑 Password changed',
    'USER_CREATED': '👤 User created',
    'USER_UPDATED': '✏️ User updated'
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

export default AdminDashboard;
