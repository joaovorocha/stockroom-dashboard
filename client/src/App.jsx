import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shipments from './pages/Shipments';
import Gameplan from './pages/Gameplan';
import AdminUsers from './pages/AdminUsers';
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
                <div className="wrapper">
                  <Sidebar />
                  <div className="main-content">
                    <Dashboard />
                  </div>
                </div>
              </ProtectedRoute>
            } />
            <Route path="/shipments" element={
              <ProtectedRoute>
                <div className="wrapper">
                  <Sidebar />
                  <div className="main-content">
                    <Shipments />
                  </div>
                </div>
              </ProtectedRoute>
            } />
            <Route path="/gameplan" element={
              <ProtectedRoute>
                <div className="wrapper">
                  <Sidebar />
                  <div className="main-content">
                    <Gameplan />
                  </div>
                </div>
              </ProtectedRoute>
            } />
            <Route path="/admin-users" element={
              <ProtectedRoute>
                <div className="wrapper">
                  <Sidebar />
                  <div className="main-content">
                    <AdminUsers />
                  </div>
                </div>
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
