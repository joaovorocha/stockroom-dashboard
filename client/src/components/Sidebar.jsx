import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();

  const isManagement = user?.role?.toLowerCase() === 'management' || user?.isAdmin;

  return (
    <div style={{
      width: '250px',
      height: '100vh',
      backgroundColor: '#f8f9fa',
      borderRight: '1px solid #dee2e6',
      padding: '20px 0',
      position: 'fixed',
      left: 0,
      top: 0,
      overflowY: 'auto'
    }}>
      <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #dee2e6', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Stockroom Dashboard</h2>
        {user && (
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            Welcome, {user.name}
            <br />
            <small>{user.role}</small>
          </div>
        )}
      </div>

      <nav>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ marginBottom: '5px' }}>
            <NavLink
              to="/"
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 20px',
                textDecoration: 'none',
                color: isActive ? '#007bff' : '#333',
                backgroundColor: isActive ? '#e9ecef' : 'transparent',
                borderRadius: '4px',
                margin: '0 10px'
              })}
            >
              📊 Dashboard
            </NavLink>
          </li>
          <li style={{ marginBottom: '5px' }}>
            <NavLink
              to="/shipments"
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 20px',
                textDecoration: 'none',
                color: isActive ? '#007bff' : '#333',
                backgroundColor: isActive ? '#e9ecef' : 'transparent',
                borderRadius: '4px',
                margin: '0 10px'
              })}
            >
              📦 Shipments
            </NavLink>
          </li>
          <li style={{ marginBottom: '5px' }}>
            <NavLink
              to="/gameplan"
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 20px',
                textDecoration: 'none',
                color: isActive ? '#007bff' : '#333',
                backgroundColor: isActive ? '#e9ecef' : 'transparent',
                borderRadius: '4px',
                margin: '0 10px'
              })}
            >
              📅 Gameplan
            </NavLink>
          </li>
          {isManagement && (
            <li style={{ marginBottom: '5px' }}>
              <NavLink
                to="/admin"
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '10px 20px',
                  textDecoration: 'none',
                  color: isActive ? '#007bff' : '#333',
                  backgroundColor: isActive ? '#e9ecef' : 'transparent',
                  borderRadius: '4px',
                  margin: '0 10px'
                })}
              >
                ⚙️ Admin
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px' }}>
        <button
          onClick={logout}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;