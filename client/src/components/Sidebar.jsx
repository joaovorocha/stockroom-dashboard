import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();

  const isManagement = user?.role === 'MGMT';

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <h2>Stockroom Dashboard</h2>
        {user && (
          <div className="sidebar-user">
            Welcome, {user.name}
            <br />
            <small>{user.role}</small>
          </div>
        )}
      </div>

      <nav>
        <ul className="sidebar-nav">
          <li>
            <NavLink
              to="/"
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              📊 Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/shipments"
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              📦 Shipments
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/gameplan"
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              📅 Gameplan
            </NavLink>
          </li>
          {isManagement && (
            <li>
              <NavLink
                to="/admin-users"
                className={({ isActive }) => isActive ? 'active' : ''}
              >
                👥 Admin Users
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button
          onClick={logout}
          className="btn btn-danger w-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;