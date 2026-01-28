import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shipments from './pages/Shipments';
import Gameplan from './pages/Gameplan';
import AdminUsers from './pages/AdminUsers';
import TimeOff from './pages/TimeOff';
import ClosingDuties from './pages/ClosingDuties';
// Super Admin Panel
import AdminLayout from './components/admin/AdminLayout';
import { 
  AdminDashboard, 
  StoreManagement, 
  GlobalSettings, 
  UserManagement, 
  SupportTickets 
} from './pages/admin';
// Store Admin Panel
import StoreAdminLayout from './components/store/StoreAdminLayout';
import {
  StoreDashboard,
  StoreSettings,
  TeamManagement,
  StoreReports
} from './pages/store';
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
                <>
                  <Header />
                  <Dashboard />
                </>
              </ProtectedRoute>
            } />
            <Route path="/shipments" element={
              <ProtectedRoute>
                <>
                  <Header />
                  <Shipments />
                </>
              </ProtectedRoute>
            } />
            <Route path="/gameplan" element={
              <ProtectedRoute>
                <>
                  <Header />
                  <Gameplan />
                </>
              </ProtectedRoute>
            } />
            <Route path="/admin-users" element={
              <ProtectedRoute>
                <>
                  <Header />
                  <AdminUsers />
                </>
              </ProtectedRoute>
            } />
            <Route path="/time-off" element={
              <ProtectedRoute>
                <>
                  <Header />
                  <TimeOff />
                </>
              </ProtectedRoute>
            } />
            <Route path="/closing-duties" element={
              <ProtectedRoute>
                <>
                  <Header />
                  <ClosingDuties />
                </>
              </ProtectedRoute>
            } />
            
            {/* Super Admin Panel Routes */}
            <Route path="/admin" element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="stores" element={<StoreManagement />} />
              <Route path="stores/:storeId" element={<StoreManagement />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="settings" element={<GlobalSettings />} />
              <Route path="tickets" element={<SupportTickets />} />
            </Route>
            
            {/* Store Admin Panel Routes */}
            <Route path="/store" element={
              <ProtectedRoute>
                <StoreAdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<StoreDashboard />} />
              <Route path="settings" element={<StoreSettings />} />
              <Route path="team" element={<TeamManagement />} />
              <Route path="reports" element={<StoreReports />} />
            </Route>
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
