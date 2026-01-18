import React from 'react';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="container-fluid">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>
      <p>Welcome to the Stockroom Dashboard!</p>
      {user && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">User Information</h3>
          </div>
          <div className="card-body">
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Role:</strong> {user.role}</p>
            <p><strong>Employee ID:</strong> {user.employeeId}</p>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quick Actions</h3>
        </div>
        <div className="card-body">
          <ul className="list-group">
            <li className="list-group-item"><a href="/shipments">View Shipments</a></li>
            <li className="list-group-item"><a href="/gameplan">Check Gameplan</a></li>
            {user?.role?.toLowerCase() === 'mgmt' && (
              <li className="list-group-item"><a href="/admin-users">Admin Panel</a></li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;