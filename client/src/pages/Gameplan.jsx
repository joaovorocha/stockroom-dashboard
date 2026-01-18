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
      <div key={employee.employeeId} style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        margin: '8px',
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          {employee.imageUrl && (
            <img
              src={employee.imageUrl}
              alt={employee.name}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                marginRight: '12px',
                objectFit: 'cover'
              }}
            />
          )}
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{employee.name}</h3>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              ID: {employee.employeeId} • {role}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Zone */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Zone
            </label>
            {canEdit ? (
              <select
                value={employee.zone || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { zone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">Not Assigned</option>
                <option value="A">Zone A</option>
                <option value="B">Zone B</option>
                <option value="C">Zone C</option>
                <option value="D">Zone D</option>
                <option value="Fitting">Fitting Room</option>
              </select>
            ) : (
              <div style={{ padding: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '14px' }}>
                {employee.zone || 'Not Assigned'}
              </div>
            )}
          </div>

          {/* Shift */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Shift
            </label>
            {canEdit ? (
              <select
                value={employee.shift || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { shift: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">Not Set</option>
                <option value="9-5">9 AM - 5 PM</option>
                <option value="10-6">10 AM - 6 PM</option>
                <option value="11-7">11 AM - 7 PM</option>
                <option value="12-8">12 PM - 8 PM</option>
              </select>
            ) : (
              <div style={{ padding: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '14px' }}>
                {employee.shift || 'Not Set'}
              </div>
            )}
          </div>

          {/* Lunch */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Lunch
            </label>
            {canEdit ? (
              <select
                value={employee.lunch || ''}
                onChange={(e) => handleEmployeeUpdate(employee.employeeId, { lunch: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">Not Set</option>
                <option value="11-12">11 AM - 12 PM</option>
                <option value="12-1">12 PM - 1 PM</option>
                <option value="1-2">1 PM - 2 PM</option>
                <option value="2-3">2 PM - 3 PM</option>
              </select>
            ) : (
              <div style={{ padding: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '14px' }}>
                {employee.lunch || 'Not Set'}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Status
            </label>
            <div style={{
              padding: '6px',
              backgroundColor: employee.isOff ? '#fff3cd' : '#d4edda',
              borderRadius: '4px',
              fontSize: '14px',
              color: employee.isOff ? '#856404' : '#155724'
            }}>
              {employee.isOff ? 'Off Today' : 'Working'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading employees...</div>;
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>{error}</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Daily Gameplan</h1>
        {isManagement && (
          <button
            onClick={handleSync}
            disabled={syncLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: syncLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {syncLoading ? 'Syncing...' : 'Sync from Database'}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search employees by name, ID, or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />
      </div>

      {/* Employee Grid */}
      {Object.entries(filteredEmployees).map(([role, employeeList]) => (
        employeeList.length > 0 && (
          <div key={role} style={{ marginBottom: '40px' }}>
            <h2 style={{
              borderBottom: '2px solid #007bff',
              paddingBottom: '8px',
              color: '#333'
            }}>
              {role} ({employeeList.length})
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '16px'
            }}>
              {employeeList.map(employee => renderEmployeeCard(employee, role))}
            </div>
          </div>
        )
      ))}

      {Object.values(filteredEmployees).every(list => list.length === 0) && searchTerm && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No employees found matching "{searchTerm}"
        </div>
      )}
    </div>
  );
};

export default Gameplan;