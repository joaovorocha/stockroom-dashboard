import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const Gameplan = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState({ SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] });
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  const isManagement = user?.role?.toLowerCase() === 'management' || user?.isAdmin;

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/gameplan/employees', { withCredentials: true });
      setEmployees(response.data.employees || { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] });
    } catch (err) {
      setError('Failed to load employees');
      console.error('Error loading employees:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncLoading(true);
      const response = await axios.post('/api/gameplan/sync', {}, { withCredentials: true });
      if (response.data.success) {
        alert('Sync completed successfully!');
        loadEmployees(); // Reload employees after sync
      }
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleEmployeeUpdate = async (employeeId, updates) => {
    try {
      await axios.post('/api/gameplan/employees', {
        id: employeeId,
        ...updates
      }, { withCredentials: true });
      loadEmployees(); // Reload to show changes
    } catch (err) {
      alert('Failed to update employee: ' + (err.response?.data?.error || err.message));
    }
  };

  // Filter employees based on search term
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;

    const filtered = {};
    Object.keys(employees).forEach(role => {
      filtered[role] = employees[role].filter(emp =>
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeId?.toString().includes(searchTerm) ||
        role.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
    return filtered;
  }, [employees, searchTerm]);

  const renderEmployeeCard = (employee, role) => {
    const canEdit = isManagement;

    return (
      <div key={employee.employeeId} className="employee-card">
        <div className="employee-header">
          {employee.imageUrl && (
            <img
              src={employee.imageUrl}
              alt={employee.name}
              className="employee-avatar"
            />
          )}
          <div className="employee-info">
            <h3 className="employee-name">{employee.name}</h3>
            <p className="employee-details">
              ID: {employee.employeeId} • {role}
            </p>
          </div>
        </div>

        <div className="employee-fields">
          {/* Zone */}
          <div className="field-group">
            <label className="field-label">Zone</label>
            {canEdit ? (
              <select
                value={employee.zone || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { zone: e.target.value })}
                className="form-select"
              >
                <option value="">Not Assigned</option>
                <option value="A">Zone A</option>
                <option value="B">Zone B</option>
                <option value="C">Zone C</option>
                <option value="D">Zone D</option>
                <option value="Fitting">Fitting Room</option>
              </select>
            ) : (
              <div className="field-value">
                {employee.zone || 'Not Assigned'}
              </div>
            )}
          </div>

          {/* Shift */}
          <div className="field-group">
            <label className="field-label">Shift</label>
            {canEdit ? (
              <select
                value={employee.shift || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { shift: e.target.value })}
                className="form-select"
              >
                <option value="">Not Set</option>
                <option value="9-5">9 AM - 5 PM</option>
                <option value="10-6">10 AM - 6 PM</option>
                <option value="11-7">11 AM - 7 PM</option>
                <option value="12-8">12 PM - 8 PM</option>
              </select>
            ) : (
              <div className="field-value">
                {employee.shift || 'Not Set'}
              </div>
            )}
          </div>

          {/* Lunch */}
          <div className="field-group">
            <label className="field-label">Lunch</label>
            {canEdit ? (
              <select
                value={employee.lunch || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { lunch: e.target.value })}
                className="form-select"
              >
                <option value="">Not Set</option>
                <option value="11-12">11 AM - 12 PM</option>
                <option value="12-1">12 PM - 1 PM</option>
                <option value="1-2">1 PM - 2 PM</option>
                <option value="2-3">2 PM - 3 PM</option>
              </select>
            ) : (
              <div className="field-value">
                {employee.lunch || 'Not Set'}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="field-group">
            <label className="field-label">Status</label>
            <div className={`status-badge ${employee.isOff ? 'status-off' : 'status-working'}`}>
              {employee.isOff ? 'Off Today' : 'Working'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading employees...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="container-fluid">
      <div className="page-header">
        <div className="page-header-content">
          <h1>Daily Gameplan</h1>
          {isManagement && (
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="btn btn-primary"
            >
              {syncLoading ? 'Syncing...' : 'Sync from Database'}
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Search employees by name, ID, or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="form-control search-input"
        />
      </div>

      {/* Employee Grid */}
      {Object.entries(filteredEmployees).map(([role, employeeList]) => (
        employeeList.length > 0 && (
          <div key={role} className="employee-section">
            <h2 className="section-title">
              {role} ({employeeList.length})
            </h2>
            <div className="employee-grid">
              {employeeList.map(employee => renderEmployeeCard(employee, role))}
            </div>
          </div>
        )
      ))}

      {Object.values(filteredEmployees).every(list => list.length === 0) && searchTerm && (
        <div className="no-results">
          No employees found matching "{searchTerm}"
        </div>
      )}
    </div>
  );
};

export default Gameplan;