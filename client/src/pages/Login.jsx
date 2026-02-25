import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Where to redirect after login
  const from = location.state?.from?.pathname || '/home'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const result = await login(employeeId, password, remember)

    if (result.success) {
      // Check if user needs to complete profile
      if (result.user?.mustChangePassword || result.user?.needsProfileCompletion) {
        navigate('/complete-profile', { replace: true })
      } else {
        navigate(from, { replace: true })
      }
    } else {
      setError(result.error)
    }

    setIsSubmitting(false)
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)'
    }}>
      <div className="login-container" style={{
        display: 'flex',
        width: '100%',
        maxWidth: '1200px',
        margin: 'auto',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {/* Left Brand Section */}
        <div style={{
          flex: 1,
          background: '#000',
          color: '#fff',
          padding: '60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <img 
            src="/icons/icon-180.png" 
            alt="Daily Operations" 
            style={{ width: '180px', marginBottom: '40px' }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <h1 style={{
            fontSize: '36px',
            fontWeight: 300,
            marginBottom: '16px',
            letterSpacing: '-0.5px'
          }}>
            Daily <span style={{ display: 'block', fontWeight: 600 }}>Operations</span>
          </h1>
          <p style={{
            fontSize: '16px',
            color: 'rgba(255, 255, 255, 0.7)',
            lineHeight: 1.6
          }}>
            Your daily operations dashboard for managing team assignments, store metrics, and performance tracking.
          </p>
          <div style={{
            marginTop: '40px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.5)'
          }}>
            San Francisco Store
          </div>
        </div>

        {/* Right Form Section */}
        <div style={{
          flex: 1,
          padding: '60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <form onSubmit={handleSubmit}>
            <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Welcome back</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Sign in to access your dashboard
            </p>

            {error && (
              <div style={{
                background: '#f8d7da',
                color: '#721c24',
                padding: '12px 16px',
                borderRadius: '4px',
                marginBottom: '20px'
              }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="employeeId">Employee ID</label>
              <input
                type="text"
                id="employeeId"
                className="form-control"
                placeholder="Enter your employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                autoComplete="username"
                style={{ padding: '14px 16px', fontSize: '15px' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ padding: '14px 16px', fontSize: '15px' }}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label 
                htmlFor="remember" 
                style={{ 
                  margin: 0, 
                  textTransform: 'none', 
                  fontSize: '14px', 
                  color: 'var(--text-secondary)' 
                }}
              >
                Remember me for 30 days
              </label>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ 
                width: '100%', 
                padding: '14px', 
                fontSize: '15px', 
                marginTop: '8px' 
              }}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>

            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <a 
                href="/forgot-password" 
                style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}
              >
                Forgot password?
              </a>
            </div>
          </form>

          <div style={{
            marginTop: '40px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '12px'
          }}>
            <p>Developed by Victor Rocha | 831-998-3808</p>
            <p style={{ marginTop: '8px' }}>Need help? Contact your manager on duty.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
