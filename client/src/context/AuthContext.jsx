import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Check if user is already logged in on mount
  const checkAuth = useCallback(async () => {
    try {
      const response = await client.get('/auth/me', { withCredentials: true })
      if (response.data?.user) {
        setUser(response.data.user)
      }
    } catch (err) {
      // Not logged in - that's okay
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Login function
  const login = async (employeeId, password, remember = false) => {
    setError(null)
    try {
      const response = await client.post('/auth/login', {
        employeeId,
        password,
        remember
      }, { withCredentials: true })

      if (response.data?.success) {
        setUser(response.data.user)
        return { success: true, user: response.data.user }
      } else {
        const errorMsg = response.data?.error || 'Login failed'
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Connection error. Please try again.'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  // Logout function
  const logout = async () => {
    try {
      await client.post('/auth/logout', {}, { withCredentials: true })
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      window.location.href = '/login'
    }
  }

  // Role checks
  const isAdmin = user?.role === 'MGMT' || user?.isAdmin
  const isManager = user?.role === 'MGMT' || user?.isAdmin
  const isSuperAdmin = user?.isSuperAdmin

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuth,
    isAuthenticated: !!user,
    isAdmin,
    isManager,
    isSuperAdmin
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
