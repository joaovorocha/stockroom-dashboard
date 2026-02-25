import React, { useEffect, useState } from 'react'
import client from '../../api/client'
import './Users.css'

const emptyForm = {
  id: null,
  name: '',
  employeeId: '',
  email: '',
  role: 'SA',
  imageUrl: '',
  isManager: false,
  isAdmin: false,
  canEditGameplan: false,
  canManageLostPunch: false,
  password: '',
  resetPassword: false,
  photoMode: 'url',
  photoFile: null
}

const Users = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await client.get('/auth/users')
      setUsers(response.data?.users || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => {
    setForm({ ...emptyForm })
    setNotice('')
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setForm({
      id: user.id,
      name: user.name || '',
      employeeId: user.employeeId || '',
      email: user.email || '',
      role: user.role || 'SA',
      imageUrl: user.imageUrl || '',
      isManager: !!user.isManager,
      isAdmin: !!user.isAdmin,
      canEditGameplan: !!user.canEditGameplan,
      canManageLostPunch: !!user.canManageLostPunch,
      password: '',
      resetPassword: false,
      photoMode: 'url',
      photoFile: null
    })
    setNotice('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
  }

  const handleSave = async () => {
    setNotice('')
    try {
      if (!form.name || !form.employeeId) {
        setNotice('Name and Employee ID are required.')
        return
      }

      const payload = {
        employeeId: form.employeeId,
        name: form.name,
        role: form.role,
        email: form.email,
        imageUrl: form.photoMode === 'url' ? form.imageUrl : '',
        isManager: form.isManager,
        isAdmin: form.isAdmin,
        canEditGameplan: form.canEditGameplan,
        canManageLostPunch: form.canManageLostPunch
      }

      let userId = form.id
      if (!form.id) {
        payload.password = form.password || '1234'
        payload.mustChangePassword = true
        const response = await client.post('/auth/users', payload)
        userId = response.data?.user?.id
      } else {
        if (form.resetPassword) {
          payload.password = form.password || '1234'
          payload.mustChangePassword = true
        }
        await client.put(`/auth/users/${form.id}`, payload)
      }

      if (form.photoMode === 'upload' && form.photoFile && userId) {
        const data = new FormData()
        data.append('photo', form.photoFile)
        await client.post(`/auth/users/${userId}/photo`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      setNotice('User saved')
      await loadUsers()
      setModalOpen(false)
    } catch (err) {
      setNotice(err?.response?.data?.error || 'Failed to save user')
    }
  }

  const handleDelete = async (user) => {
    if (!confirm(`Delete user "${user.name}"?`)) return
    try {
      await client.delete(`/auth/users/${user.id}`)
      await loadUsers()
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete user')
    }
  }

  const initials = (name) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  }

  return (
    <div className="users-page">
      <div className="users-header">
        <h2>Users</h2>
        <button className="btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      {loading && <div className="notice">Loading users...</div>}
      {!loading && error && <div className="notice error">{error}</div>}

      {!loading && !error && (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Manager</th>
                <th>Gameplan</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    {user.imageUrl ? (
                      <img className="user-avatar" src={user.imageUrl} alt={user.name} />
                    ) : (
                      <div className="user-avatar">{initials(user.name)}</div>
                    )}
                  </td>
                  <td>{user.name}</td>
                  <td>{user.employeeId}</td>
                  <td>{user.role}</td>
                  <td>{user.isManager || user.isAdmin ? 'Yes' : 'No'}</td>
                  <td>{user.canEditGameplan || user.isManager || user.isAdmin ? 'Yes' : 'No'}</td>
                  <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
                  <td>
                    <div className="users-actions">
                      <button className="btn-secondary" onClick={() => openEdit(user)}>Edit</button>
                      <button className="btn-danger" onClick={() => handleDelete(user)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan="8" className="notice">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="user-modal-overlay" onClick={closeModal}>
          <div className="user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3>{form.id ? 'Edit User' : 'Add User'}</h3>
              <button className="btn-secondary" onClick={closeModal}>Close</button>
            </div>

            {notice && <div className="notice">{notice}</div>}

            <div className="user-form-grid">
              <div>
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label>Employee ID</label>
                <input value={form.employeeId} onChange={(e) => setForm(prev => ({ ...prev, employeeId: e.target.value }))} />
              </div>
              <div>
                <label>Email</label>
                <input value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div>
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}>
                  <option value="SA">Sales Associate (SA)</option>
                  <option value="BOH">Back of House (BOH)</option>
                  <option value="MANAGEMENT">Management</option>
                  <option value="TAILOR">Tailor</option>
                </select>
              </div>
              {!form.id && (
                <div>
                  <label>Password (default 1234)</label>
                  <input type="password" value={form.password} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))} />
                </div>
              )}
              {form.id && (
                <div>
                  <label>Reset Password</label>
                  <div className="users-actions">
                    <button className="btn-secondary" onClick={() => setForm(prev => ({ ...prev, resetPassword: true, password: '1234' }))}>
                      Reset to 1234
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label>Photo Mode</label>
                <select value={form.photoMode} onChange={(e) => setForm(prev => ({ ...prev, photoMode: e.target.value }))}>
                  <option value="url">URL</option>
                  <option value="upload">Upload</option>
                </select>
              </div>
              {form.photoMode === 'url' && (
                <div>
                  <label>Photo URL</label>
                  <input value={form.imageUrl} onChange={(e) => setForm(prev => ({ ...prev, imageUrl: e.target.value }))} />
                </div>
              )}
              {form.photoMode === 'upload' && (
                <div>
                  <label>Upload Photo</label>
                  <input type="file" accept="image/*" onChange={(e) => setForm(prev => ({ ...prev, photoFile: e.target.files?.[0] || null }))} />
                </div>
              )}
            </div>

            <div className="user-checkboxes">
              <label>
                <input type="checkbox" checked={form.isManager} onChange={(e) => setForm(prev => ({ ...prev, isManager: e.target.checked }))} />
                Is Manager
              </label>
              <label>
                <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm(prev => ({ ...prev, isAdmin: e.target.checked }))} />
                Is Admin
              </label>
              <label>
                <input type="checkbox" checked={form.canEditGameplan} onChange={(e) => setForm(prev => ({ ...prev, canEditGameplan: e.target.checked }))} />
                Can Edit Gameplan
              </label>
              <label>
                <input type="checkbox" checked={form.canManageLostPunch} onChange={(e) => setForm(prev => ({ ...prev, canManageLostPunch: e.target.checked }))} />
                Can Manage Lost Punch
              </label>
            </div>

            <div className="user-modal-footer">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>Save User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
