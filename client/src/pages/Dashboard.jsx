import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import QuickAccessTile from '../components/QuickAccessTile';
import api from '../api';

const Dashboard = () => {
  const { user } = useAuth();
  const [todayData, setTodayData] = useState({
    shift: '--',
    position: '--',
    zone: '--',
    lunch: '--',
    fittingRoom: '--',
  });
  const [pendingUsers, setPendingUsers] = useState(0);
  const [storeLocation, setStoreLocation] = useState('San Francisco');

  useEffect(() => {
    // Fetch today's gameplan data for the user
    const fetchTodayData = async () => {
      try {
        const response = await api.get('/api/gameplan/today');
        const gameplan = response.data;
        
        if (gameplan && gameplan.assignments && user?.employeeId) {
          const assignment = gameplan.assignments[user.employeeId];
          if (assignment) {
            setTodayData({
              shift: assignment.shift || '--',
              position: assignment.position || '--',
              zone: assignment.zone || '--',
              lunch: assignment.lunch || '--',
              fittingRoom: assignment.fittingRoom || '--',
            });
          }
        }
      } catch (error) {
        console.error('Error fetching gameplan:', error);
      }
    };

    // Fetch pending user approvals count (admin only)
    const fetchPendingUsers = async () => {
      if (user?.isAdmin || user?.isManager) {
        try {
          const response = await api.get('/api/auth/users');
          const users = response.data.users || [];
          const pending = users.filter(u => u.needsProfileCompletion || u.mustChangePassword).length;
          setPendingUsers(pending);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      }
    };

    // Get store location from store config
    const fetchStoreLocation = async () => {
      try {
        const response = await api.get('/api/gameplan/store-config');
        if (response.data?.location) {
          setStoreLocation(response.data.location);
        }
      } catch (error) {
        console.error('Error fetching store config:', error);
      }
    };

    if (user) {
      fetchTodayData();
      fetchPendingUsers();
      fetchStoreLocation();
    }
  }, [user]);

  const handleComingSoon = (e, feature) => {
    e.preventDefault();
    alert(`${feature} - Coming Soon!`);
  };

  return (
    <main className="app-home">
      <div className="app-home-title">
        <h2>Quick Access</h2>
        <p className="muted">Tap a tile to open a section. Tap the logo anytime to return here.</p>
      </div>

      <div className="app-tiles">
        <QuickAccessTile
          to="/gameplan"
          icon="📋"
          title="Game Plan"
          subtitle="Daily assignments"
        />

        <QuickAccessTile
          to="#"
          icon="🛠️"
          title="Operations"
          subtitle="Metrics"
          onClick={(e) => handleComingSoon(e, 'Operations')}
        />

        <QuickAccessTile
          to="#"
          icon="🏆"
          title="Awards"
          subtitle="Celebrate wins"
          onClick={(e) => handleComingSoon(e, 'Awards')}
        />

        <QuickAccessTile
          to="#"
          icon="💳"
          title="Employee Discount"
          subtitle="Orders"
          onClick={(e) => handleComingSoon(e, 'Employee Discount')}
        />

        <QuickAccessTile
          to="/shipments"
          icon="📦"
          title="Shipments"
          subtitle="UPS capture"
        />

        <QuickAccessTile
          to="#"
          icon="📷"
          title="Scanner"
          subtitle="Order tools"
          onClick={(e) => handleComingSoon(e, 'Scanner')}
        />

        <QuickAccessTile
          to="#"
          icon="🕒"
          title="Lost Punch"
          subtitle="Approve / deny"
          onClick={(e) => handleComingSoon(e, 'Lost Punch')}
        />

        <QuickAccessTile
          to="/closing-duties"
          icon="✅"
          title="Closing Duties"
          subtitle="Checklist"
        />

        <QuickAccessTile
          to="/time-off"
          icon="🗓️"
          title="Time Off"
          subtitle="Calendar"
        />

        <QuickAccessTile
          to="#"
          icon="📈"
          title="Looker"
          subtitle="Dashboards"
          onClick={(e) => handleComingSoon(e, 'Looker')}
        />

        <QuickAccessTile
          to="#"
          icon="📝"
          title="Radio Transcripts"
          subtitle="Recent messages"
          onClick={(e) => handleComingSoon(e, 'Radio Transcripts')}
        />

        {(user?.isAdmin || user?.isManager) && (
          <div style={{ position: 'relative' }}>
            <QuickAccessTile
              to="/admin-users"
              icon="🔐"
              title="Admin"
              subtitle="Users + export"
              className="app-tile--admin"
            />
            {pendingUsers > 0 && (
              <span className="tile-badge">{pendingUsers}</span>
            )}
          </div>
        )}
      </div>

      <section className="section" style={{ marginTop: '14px' }}>
        <div className="section-header">
          <h2>Today</h2>
        </div>
        <div className="metrics-content">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Shift</span>
              <span className="metric-value">{todayData.shift}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Position</span>
              <span className="metric-value">{todayData.position}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Zone</span>
              <span className="metric-value">{todayData.zone}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Lunch</span>
              <span className="metric-value">{todayData.lunch}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Fitting Room</span>
              <span className="metric-value">{todayData.fittingRoom}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section metrics-section" style={{ marginTop: '14px' }}>
        <div className="section-header">
          <h2>Week to Date Store Overview</h2>
        </div>
        <div className="looker-embed">
          <iframe
            src={`https://lookersuitsupply.cloud.looker.com/embed/dashboards/603?Regional+Manager=&Region=&Location=${encodeURIComponent(storeLocation)}&Predefined+Period=Week+to+Date&Select+Currency=USD&Location+Type=Store%2COutlet&Employee+Name=`}
            width="100%"
            height="600"
            frameBorder="0"
            title="Looker Dashboard"
          ></iframe>
        </div>
      </section>
    </main>
  );
};

export default Dashboard;