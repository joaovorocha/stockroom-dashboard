import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('/api/auth/check', { withCredentials: true });
        setUser(response.data.user);
      } catch (err) {
        // Redirect to login if not authenticated
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Welcome to Stockroom Dashboard</h1>
      {user && (
        <div>
          <p>Hello, {user.name}!</p>
          <p>Role: {user.role}</p>
        </div>
      )}
      <nav>
        <a href="/shipments">Shipments</a> | 
        <a href="/gameplan">Gameplan</a> | 
        <a href="/admin">Admin</a>
      </nav>
    </div>
  );
};

export default Dashboard;