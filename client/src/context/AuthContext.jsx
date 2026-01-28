import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStore, setActiveStore] = useState(null);
  const [accessibleStores, setAccessibleStores] = useState([]);

  // Check authentication status on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('/api/auth/session', { withCredentials: true });
        if (response.data.authenticated) {
          setUser(response.data.user);
          setActiveStore(response.data.activeStore);
          setAccessibleStores(response.data.stores || []);
        } else {
          setUser(null);
          setActiveStore(null);
          setAccessibleStores([]);
        }
      } catch (error) {
        setUser(null);
        setActiveStore(null);
        setAccessibleStores([]);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Login function with store selection
  const login = async (employeeId, password, storeId = null) => {
    try {
      const response = await axios.post('/api/auth/login', {
        employeeId,
        password,
        storeId
      }, { withCredentials: true });

      if (response.data.success) {
        setUser(response.data.user);
        setActiveStore(response.data.activeStore);
        setAccessibleStores(response.data.stores || []);
        return { 
          success: true,
          requiresStoreSelection: response.data.user?.requiresStoreSelection,
          stores: response.data.stores
        };
      }
      return { success: false, error: 'Login failed' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  // Switch store function
  const switchStore = async (storeId) => {
    try {
      const response = await axios.post('/api/auth/switch-store', {
        storeId
      }, { withCredentials: true });

      if (response.data.success) {
        setActiveStore(response.data.activeStore);
        return { success: true, store: response.data.activeStore };
      }
      return { success: false, error: 'Failed to switch store' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to switch store'
      };
    }
  };

  // Fetch accessible stores
  const fetchAccessibleStores = async () => {
    try {
      const response = await axios.get('/api/auth/accessible-stores', { withCredentials: true });
      if (response.data.success) {
        setAccessibleStores(response.data.stores || []);
        return response.data.stores;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch accessible stores:', error);
      return [];
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setActiveStore(null);
      setAccessibleStores([]);
    }
  };

  const isAuthenticated = !!user;
  const canSwitchStores = user?.canSwitchStores || user?.isSuperAdmin || accessibleStores.length > 1;

  const value = {
    user,
    loading,
    isAuthenticated,
    activeStore,
    accessibleStores,
    canSwitchStores,
    login,
    logout,
    switchStore,
    fetchAccessibleStores
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};