const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getGamePlanForDate } = require('../utils/excelReader');
const { LookerDataProcessor } = require('../utils/looker-data-processor');

// Initialize Looker data processor
const lookerProcessor = new LookerDataProcessor();

// GET /api/gameplan?date=YYYY-MM-DD
router.get('/gameplan', (req, res) => {
  try {
    // Get date from query parameter, default to today
    let date;
    if (req.query.date) {
      date = new Date(req.query.date);
    } else {
      date = new Date();
    }

    // Validate date
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Get game plan data
    const gamePlan = getGamePlanForDate(date);

    if (!gamePlan) {
      return res.status(404).json({ error: 'No game plan found for this date' });
    }

    return res.json({
      success: true,
      date: date.toISOString().split('T')[0],
      data: gamePlan
    });
  } catch (error) {
    console.error('Error fetching game plan:', error);
    return res.status(500).json({ error: 'Failed to fetch game plan' });
  }
});

// GET /api/employees - Get all employees
router.get('/employees', (req, res) => {
  try {
    const employeesPath = path.join(__dirname, '../data/employees.json');
    const employeesData = fs.readFileSync(employeesPath, 'utf8');
    const employees = JSON.parse(employeesData);

    return res.json({
      success: true,
      employees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/colleagues - Get colleagues for current user
router.get('/employees/colleagues', (req, res) => {
  try {
    const currentUser = req.user; // From auth middleware

    const employeesPath = path.join(__dirname, '../data/employees.json');
    const employeesData = fs.readFileSync(employeesPath, 'utf8');
    const employees = JSON.parse(employeesData);

    // Get colleagues in same room
    const sameRoom = employees.filter(emp =>
      emp.room === currentUser.room && emp.id !== currentUser.userId
    );

    // Get colleagues in other rooms
    const otherRooms = employees.filter(emp =>
      emp.room !== currentUser.room
    );

    return res.json({
      success: true,
      currentUser: {
        name: currentUser.name,
        room: currentUser.room
      },
      sameRoom,
      otherRooms,
      total: employees.length
    });
  } catch (error) {
    console.error('Error fetching colleagues:', error);
    return res.status(500).json({ error: 'Failed to fetch colleagues' });
  }
});

// ============================================================
// METRICS API ENDPOINTS - Looker Data Integration
// ============================================================

// GET /api/metrics/latest - Get all latest store metrics
router.get('/metrics/latest', (req, res) => {
  try {
    const metrics = lookerProcessor.processStoreMetrics();
    const appointments = lookerProcessor.processAppointments();
    const operations = lookerProcessor.processOperationsHealth();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        storeMetrics: metrics,
        appointments,
        operations
      }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/metrics/store - Get store performance metrics
router.get('/metrics/store', (req, res) => {
  try {
    const metrics = lookerProcessor.processStoreMetrics();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching store metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch store metrics' });
  }
});

// GET /api/metrics/customer-orders - Get customer reserved orders data
router.get('/metrics/customer-orders', (req, res) => {
  try {
    const orders = lookerProcessor.processCustomerReservedOrders();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: orders
    });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    return res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// GET /api/metrics/best-sellers - Get best sellers data
router.get('/metrics/best-sellers', (req, res) => {
  try {
    const bestSellers = lookerProcessor.processBestSellers();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: bestSellers
    });
  } catch (error) {
    console.error('Error fetching best sellers:', error);
    return res.status(500).json({ error: 'Failed to fetch best sellers' });
  }
});

// GET /api/metrics/appointments - Get appointments/Waitwhile data
router.get('/metrics/appointments', (req, res) => {
  try {
    const appointments = lookerProcessor.processAppointments();
    const waitwhile = lookerProcessor.processWaitwhileData();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        summary: appointments,
        waitwhile
      }
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/metrics/operations - Get operations health data
router.get('/metrics/operations', (req, res) => {
  try {
    const operations = lookerProcessor.processOperationsHealth();
    const tailor = lookerProcessor.processTailorProductivityTrend();
    const counts = lookerProcessor.processEmployeeCountPerformance();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        health: operations,
        tailorTrend: tailor,
        countPerformance: counts
      }
    });
  } catch (error) {
    console.error('Error fetching operations data:', error);
    return res.status(500).json({ error: 'Failed to fetch operations data' });
  }
});

// GET /api/metrics/tailor - Get tailor productivity data
router.get('/metrics/tailor', (req, res) => {
  try {
    const tailor = lookerProcessor.processTailorProductivityTrend();
    const operations = lookerProcessor.processOperationsHealth();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        trend: tailor,
        currentHealth: operations
      }
    });
  } catch (error) {
    console.error('Error fetching tailor data:', error);
    return res.status(500).json({ error: 'Failed to fetch tailor data' });
  }
});

// GET /api/metrics/counts - Get employee count performance
router.get('/metrics/counts', (req, res) => {
  try {
    const counts = lookerProcessor.processEmployeeCountPerformance();
    
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: counts
    });
  } catch (error) {
    console.error('Error fetching count data:', error);
    return res.status(500).json({ error: 'Failed to fetch count data' });
  }
});

module.exports = router;
