import React, { useState, useEffect } from 'react';
import { createUser, updateUser, loadUsers } from 'path-to-your-actions';
import { useDispatch, useSelector } from 'react-redux';

const UserManagement = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'associate',
    isManager: false,
    status: 'active',
  });
  const [editingUser, setEditingUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const dispatch = useDispatch();
  const users = useSelector((state) => state.users);

  useEffect(() => {
    dispatch(loadUsers());
  }, [dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();

    try {
      if (editingUser) {
        // Update existing user
        dispatch(updateUser(editingUser.id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          isManager: formData.isManager,
          status: formData.status,
          ...(formData.password && { password: formData.password }),
        }));
      } else {
        // Create new user - ensure all fields are properly set
        dispatch(createUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          isManager: formData.isManager,
          status: formData.status || 'active', // Default to active
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&background=6366f1&color=fff`,
        }));
      }

      dispatch(loadUsers());
      setShowModal(false);
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'associate',
      isManager: false,
      status: 'active', // Ensure default status
    });
    setEditingUser(null);
  };

  return (
    <div>
      {/* Your component JSX here */}
      <form onSubmit={handleSubmit}>
        {/* Form fields for name, email, password, role, isManager, status */}
        <button type="submit">{editingUser ? 'Update User' : 'Create User'}</button>
      </form>
    </div>
  );
};

export default UserManagement;