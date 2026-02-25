import axios from 'axios'

// Create axios instance with base URL
const client = axios.create({
  baseURL: '/api',
  withCredentials: true  // Always send cookies for session auth
})

// Request interceptor: attach Authorization header from localStorage
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Ensure credentials are always included
    config.withCredentials = true
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401 Unauthorized globally
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('authToken')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
