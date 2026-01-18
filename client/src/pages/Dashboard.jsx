import React from 'react';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome to the Stockroom Dashboard!</p>
      {user && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h3>User Information</h3>
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Role:</strong> {user.role}</p>
          <p><strong>Employee ID:</strong> {user.employeeId}</p>
        </div>
      )}
      <div style={{ marginTop: '30px' }}>
        <h3>Quick Actions</h3>
        <ul>
          <li><a href="/shipments">View Shipments</a></li>
          <li><a href="/gameplan">Check Gameplan</a></li>
          {user?.role?.toLowerCase() === 'management' && (
            <li><a href="/admin">Admin Panel</a></li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;