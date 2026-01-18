import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
      fetchStoreLocation();
    }
  }, [user]);

  return (
    <main className="app-home">
      <div className="app-home-title">
        <h2>Quick Access</h2>
        <p className="muted">Tap a tile to open a section. Tap the logo anytime to return here.</p>
      </div>

      <div className="app-tiles" id="appTiles">
        <Link className="app-tile" to="/gameplan">
          <div className="app-tile-icon">📋</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Game Plan</div>
            <div className="app-tile-subtitle">Daily assignments</div>
          </div>
        </Link>

        <a className="app-tile" href="/operations-metrics">
          <div className="app-tile-icon">🛠️</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Operations</div>
            <div className="app-tile-subtitle">Metrics</div>
          </div>
        </a>

        <a className="app-tile" href="/awards">
          <div className="app-tile-icon">🏆</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Awards</div>
            <div className="app-tile-subtitle">Celebrate wins</div>
          </div>
        </a>

        <a className="app-tile" href="/employee-discount">
          <div className="app-tile-icon">💳</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Employee Discount</div>
            <div className="app-tile-subtitle">Orders</div>
          </div>
        </a>

        <Link className="app-tile" to="/shipments">
          <div className="app-tile-icon">📦</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Shipments</div>
            <div className="app-tile-subtitle">UPS capture</div>
          </div>
        </Link>

        <a className="app-tile" href="/scanner">
          <div className="app-tile-icon">📷</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Scanner</div>
            <div className="app-tile-subtitle">Order tools</div>
          </div>
        </a>

        <a className="app-tile" href="/lost-punch">
          <div className="app-tile-icon">🕒</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Lost Punch</div>
            <div className="app-tile-subtitle">Approve / deny</div>
          </div>
        </a>

        <Link className="app-tile" to="/closing-duties">
          <div className="app-tile-icon">✅</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Closing Duties</div>
            <div className="app-tile-subtitle">Checklist</div>
          </div>
        </Link>

        <Link className="app-tile" to="/time-off">
          <div className="app-tile-icon">🗓️</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Time Off</div>
            <div className="app-tile-subtitle">Calendar</div>
          </div>
        </Link>

        <a className="app-tile" href="/ops-dashboard" id="appLookerTile">
          <div className="app-tile-icon">📈</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Looker</div>
            <div className="app-tile-subtitle">Dashboards</div>
          </div>
        </a>

        <a className="app-tile" href="/radio-transcripts">
          <div className="app-tile-icon">📝</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Radio Transcripts</div>
            <div className="app-tile-subtitle">Recent messages</div>
          </div>
        </a>

        <Link
          className="app-tile app-tile--admin"
          to="/admin-users"
          id="appAdminTile"
          style={{ display: (user?.isAdmin || user?.role === 'MGMT') ? 'flex' : 'none' }}
        >
          <div className="app-tile-icon">🔐</div>
          <div className="app-tile-text">
            <div className="app-tile-title">Admin</div>
            <div className="app-tile-subtitle">Users + export</div>
          </div>
        </Link>
      </div>

      <section className="section" id="homeTodaySection" style={{ marginTop: '14px' }}>
        <div className="section-header">
          <h2>Today</h2>
        </div>
        <div className="metrics-content">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Shift</span>
              <span className="metric-value" id="homeShift">{todayData.shift}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Position</span>
              <span className="metric-value" id="homePosition">{todayData.position}</span>
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