import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shipments from './pages/Shipments';
import Gameplan from './pages/Gameplan';
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
                <div style={{ display: 'flex' }}>
                  <Sidebar />
                  <div style={{ marginLeft: '250px', width: '100%', padding: '20px' }}>
                    <Dashboard />
                  </div>
                </div>
              </ProtectedRoute>
            } />
            <Route path="/shipments" element={
              <ProtectedRoute>
                <div style={{ display: 'flex' }}>
                  <Sidebar />
                  <div style={{ marginLeft: '250px', width: '100%', padding: '20px' }}>
                    <Shipments />
                  </div>
                </div>
              </ProtectedRoute>
            } />
            <Route path="/gameplan" element={
              <ProtectedRoute>
                <div style={{ display: 'flex' }}>
                  <Sidebar />
                  <div style={{ marginLeft: '250px', width: '100%', padding: '20px' }}>
                    <Gameplan />
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
