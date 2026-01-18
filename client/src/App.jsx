import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import SharedHeader from './components/SharedHeader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shipments from './pages/Shipments';
import Gameplan from './pages/Gameplan';
import AdminUsers from './pages/AdminUsers';
import TimeOff from './pages/TimeOff';
import ClosingDuties from './pages/ClosingDuties';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <SharedHeader />
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/shipments" element={
              <ProtectedRoute>
                <SharedHeader />
                <Shipments />
              </ProtectedRoute>
            } />
            <Route path="/gameplan" element={
              <ProtectedRoute>
                <SharedHeader />
                <Gameplan />
              </ProtectedRoute>
            } />
            <Route path="/admin-users" element={
              <ProtectedRoute>
                <SharedHeader />
                <AdminUsers />
              </ProtectedRoute>
            } />
            <Route path="/time-off" element={
              <ProtectedRoute>
                <SharedHeader />
                <TimeOff />
              </ProtectedRoute>
            } />
            <Route path="/closing-duties" element={
              <ProtectedRoute>
                <SharedHeader />
                <ClosingDuties />
              </ProtectedRoute>
            } />
            {/* Add more protected routes as needed */}
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
