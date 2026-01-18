import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const AdminUsers = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ employee_id: '', name: '', role: 'SA', is_active: true });
  const [photoFile, setPhotoFile] = useState(null);

  useEffect(() => {
    if (user && user.role !== 'MGMT') {
      // Redirect or show error if not management
      alert('Access denied. Management role required.');
      return;
    }
    fetchUsers();
    fetchActivities();
  }, [user]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/auth/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await api.get('/api/auth/activity');
      setActivities(response.data);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const handleEdit = (user) => {
    setEditingUser({ ...user });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      await api.put(`/api/auth/users/${editingUser.id}`, {
        role: editingUser.role,
        is_active: editingUser.is_active
      });
      setShowModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.delete(`/api/auth/users/${id}`);
        fetchUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleCreateUser = async () => {
    try {
      await api.post('/api/auth/users', newUser);
      setNewUser({ employee_id: '', name: '', role: 'SA', is_active: true });
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const handlePhotoUpload = async (userId) => {
    if (!photoFile) return;
    const formData = new FormData();
    formData.append('photo', photoFile);
    try {
      await api.post(`/api/auth/users/${userId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchUsers();
      setPhotoFile(null);
    } catch (error) {
      console.error('Error uploading photo:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container-fluid">
      <div className="page-header">
        <h1>Admin User Management</h1>
      </div>

      {/* New User Creation */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Create New User</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Employee ID"
                value={newUser.employee_id}
                onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div className="col-md-2">
              <select
                className="form-select"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="SA">SA</option>
                <option value="BOH">BOH</option>
                <option value="MGMT">MGMT</option>
                <option value="Tailor">Tailor</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn btn-primary" onClick={handleCreateUser}>Create User</button>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Users</h3>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Photo</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.employee_id}</td>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td>{u.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      {u.photo_url && <img src={u.photo_url} alt="Profile" width="50" className="me-2" />}
                      <input
                        type="file"
                        accept="image/*"
                        className="form-control form-control-sm d-inline-block w-auto me-2"
                        onChange={(e) => setPhotoFile(e.target.files[0])}
                      />
                      <button className="btn btn-sm btn-secondary" onClick={() => handlePhotoUpload(u.id)}>Upload</button>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary me-2" onClick={() => handleEdit(u)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit User</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Role</label>
                  <select
                    className="form-select"
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    <option value="SA">SA</option>
                    <option value="BOH">BOH</option>
                    <option value="MGMT">MGMT</option>
                    <option value="Tailor">Tailor</option>
                  </select>
                </div>
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="isActive"
                    checked={editingUser.is_active}
                    onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="isActive">Active</label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showModal && <div className="modal-backdrop fade show"></div>}

      {/* Activity Logs */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Activity Logs</h3>
        </div>
        <div className="card-body">
          <div className="list-group">
            {activities.map((activity, index) => (
              <div key={index} className="list-group-item">
                <small className="text-muted">{activity.timestamp}</small>
                <div>{activity.user} - {activity.action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;