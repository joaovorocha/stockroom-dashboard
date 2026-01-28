import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const Login = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Store selection state
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const [availableStores, setAvailableStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [credentialsVerified, setCredentialsVerified] = useState(false);
  
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Step 1: Verify credentials and check stores
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // First, try to login without store selection
      const result = await login(employeeId, password);

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Check if user has multiple stores and needs to select
      if (result.stores && result.stores.length > 1 && result.requiresStoreSelection) {
        setAvailableStores(result.stores);
        setShowStoreSelector(true);
        setCredentialsVerified(true);
      } else {
        // Single store or already selected - proceed to dashboard
        navigate('/');
      }
    } catch (err) {
      setError('An error occurred during login');
    }

    setLoading(false);
  };

  // Step 2: Complete login with store selection
  const handleStoreSelect = async (e) => {
    e.preventDefault();
    if (!selectedStoreId) {
      setError('Please select a store');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Switch to selected store
      const response = await axios.post('/api/auth/switch-store', {
        storeId: parseInt(selectedStoreId)
      }, { withCredentials: true });

      if (response.data.success) {
        navigate('/');
      } else {
        setError('Failed to select store');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to select store');
    }

    setLoading(false);
  };

  // Render store selector if needed
  if (showStoreSelector) {
    return (
      <div className="login-container">
        <div className="login-form">
          <h2 className="login-title">Select Your Store</h2>
          <p style={{ textAlign: 'center', marginBottom: '20px', color: '#666' }}>
            Welcome! Please select the store you want to work in.
          </p>
          <form onSubmit={handleStoreSelect}>
            <div className="form-group">
              <label className="form-label">🏪 Store:</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                required
                className="form-control"
                style={{ padding: '12px', fontSize: '16px' }}
              >
                <option value="">-- Select a Store --</option>
                {availableStores.map((store) => (
                  <option key={store.store_id} value={store.store_id}>
                    {store.store_name} ({store.store_code})
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="alert alert-danger">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !selectedStoreId}
              className="btn btn-primary btn-block"
            >
              {loading ? 'Selecting...' : 'Continue to Dashboard'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowStoreSelector(false);
                setCredentialsVerified(false);
                setAvailableStores([]);
              }}
              className="btn btn-secondary btn-block"
              style={{ marginTop: '10px' }}
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Regular login form
  return (
    <div className="login-container">
      <div className="login-form">
        <h2 className="login-title">Stockroom Dashboard Login</h2>
        <form onSubmit={handleCredentialsSubmit}>
          <div className="form-group">
            <label className="form-label">Employee ID:</label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              className="form-control"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-control"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;