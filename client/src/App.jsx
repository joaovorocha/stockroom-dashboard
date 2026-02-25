import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Gameplan from './pages/gameplan'
import Awards from './pages/Awards'
import DailyScan from './pages/DailyScan'
import Expenses from './pages/Expenses'
import Shipments from './pages/Shipments'
import LostPunch from './pages/LostPunch'
import ClosingDuties from './pages/ClosingDuties'
import TimeOff from './pages/TimeOff'
import OpsDashboard from './pages/OpsDashboard'
import StoreCountAnalysis from './pages/StoreCountAnalysis'
import Admin from './pages/Admin'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/app" element={<Home />} />
            <Route path="/dashboard" element={<Gameplan />} />
            <Route path="/gameplan" element={<Gameplan />} />
            <Route path="/store-count-analysis" element={<StoreCountAnalysis />} />
            <Route path="/awards" element={<Awards />} />
            <Route path="/daily-scan-performance" element={<DailyScan />} />
            <Route path="/employee-discount" element={<Expenses />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/boh-shipments" element={<Shipments />} />
            <Route path="/lost-punch" element={<LostPunch />} />
            <Route path="/closing-duties" element={<ClosingDuties />} />
            <Route path="/time-off" element={<TimeOff />} />
            <Route path="/ops-dashboard" element={<OpsDashboard />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
