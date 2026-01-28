/**
 * System Health Monitoring API Routes
 * Provides REST API endpoints for all monitoring data
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/dal/pg');
const monitoringService = require('../utils/monitoring');
const cpuMonitor = require('../utils/monitoring/cpu-monitor');
const memoryMonitor = require('../utils/monitoring/memory-monitor');
const diskMonitor = require('../utils/monitoring/disk-monitor');
const networkMonitor = require('../utils/monitoring/network-monitor');
const gpuMonitor = require('../utils/monitoring/gpu-monitor');
const processMonitor = require('../utils/monitoring/process-monitor');
const systemInfoCollector = require('../utils/monitoring/system-info-collector');
const userSessionTracker = require('../utils/monitoring/user-session-tracker');
const alertManager = require('../utils/monitoring/alert-manager');
const logger = require('../utils/monitoring/logger');

// ============================================================================
// Service Status
// ============================================================================

/**
 * GET /api/system-health/status
 * Get monitoring service status
 */
router.get('/status', (req, res) => {
  try {
    const status = monitoringService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error getting service status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Current Metrics
// ============================================================================

/**
 * GET /api/system-health/metrics/current
 * Get current system metrics snapshot
 */
router.get('/metrics/current', async (req, res) => {
  try {
    const snapshot = await monitoringService.getCurrentSnapshot();
    res.json({ success: true, data: snapshot });
  } catch (error) {
    logger.error('Error getting current metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/metrics/latest
 * Get latest metrics from database
 */
router.get('/metrics/latest', async (req, res) => {
  try {
    const result = await query('SELECT * FROM v_latest_system_metrics');
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    logger.error('Error getting latest metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Historical Metrics
// ============================================================================

/**
 * GET /api/system-health/metrics/history
 * Get historical metrics
 * Query params: start, end, interval (optional)
 */
router.get('/metrics/history', async (req, res) => {
  try {
    const { start, end, interval = '5m', limit = 1000 } = req.query;

    let sql = 'SELECT * FROM system_metrics WHERE 1=1';
    const params = [];

    if (start) {
      params.push(start);
      sql += ` AND timestamp >= $${params.length}`;
    }

    if (end) {
      params.push(end);
      sql += ` AND timestamp <= $${params.length}`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting metrics history', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/metrics/range/:range
 * Get metrics for predefined time range (1h, 6h, 24h, 7d, 30d)
 */
router.get('/metrics/range/:range', async (req, res) => {
  try {
    const { range } = req.params;
    const intervals = {
      '1h': '1 hour',
      '6h': '6 hours',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    if (!intervals[range]) {
      return res.status(400).json({ success: false, error: 'Invalid range' });
    }

    const result = await query(
      `SELECT * FROM system_metrics 
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '${intervals[range]}'
      ORDER BY timestamp ASC`,
    );

    res.json({ success: true, data: result.rows, range });
  } catch (error) {
    logger.error('Error getting metrics range', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// CPU Metrics
// ============================================================================

/**
 * GET /api/system-health/cpu/current
 * Get current CPU metrics
 */
router.get('/cpu/current', async (req, res) => {
  try {
    const metrics = await cpuMonitor.getCurrentMetrics();
    const stats = cpuMonitor.getStatistics();
    res.json({ success: true, data: { current: metrics, statistics: stats } });
  } catch (error) {
    logger.error('Error getting CPU metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/cpu/info
 * Get CPU information
 */
router.get('/cpu/info', async (req, res) => {
  try {
    const info = await cpuMonitor.getCPUInfo();
    res.json({ success: true, data: info });
  } catch (error) {
    logger.error('Error getting CPU info', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Memory Metrics
// ============================================================================

/**
 * GET /api/system-health/memory/current
 * Get current memory metrics
 */
router.get('/memory/current', async (req, res) => {
  try {
    const metrics = await memoryMonitor.getCurrentMetrics();
    const stats = memoryMonitor.getStatistics();
    res.json({ success: true, data: { current: metrics, statistics: stats } });
  } catch (error) {
    logger.error('Error getting memory metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/memory/layout
 * Get memory module information
 */
router.get('/memory/layout', async (req, res) => {
  try {
    const layout = await memoryMonitor.getMemoryLayout();
    res.json({ success: true, data: layout });
  } catch (error) {
    logger.error('Error getting memory layout', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Disk Metrics
// ============================================================================

/**
 * GET /api/system-health/disk/current
 * Get current disk metrics
 */
router.get('/disk/current', async (req, res) => {
  try {
    const metrics = await diskMonitor.getCurrentMetrics();
    const stats = diskMonitor.getStatistics();
    const warnings = diskMonitor.getLowSpaceWarning();
    res.json({ success: true, data: { current: metrics, statistics: stats, warnings } });
  } catch (error) {
    logger.error('Error getting disk metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/disk/info
 * Get disk layout information
 */
router.get('/disk/info', async (req, res) => {
  try {
    const info = await diskMonitor.getDiskInfo();
    res.json({ success: true, data: info });
  } catch (error) {
    logger.error('Error getting disk info', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/disk/io
 * Get disk I/O metrics
 */
router.get('/disk/io', async (req, res) => {
  try {
    const metrics = await diskMonitor.getIOMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error('Error getting disk I/O metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Network Metrics
// ============================================================================

/**
 * GET /api/system-health/network/current
 * Get current network metrics
 */
router.get('/network/current', async (req, res) => {
  try {
    const metrics = await networkMonitor.getCurrentMetrics();
    const stats = networkMonitor.getStatistics();
    res.json({ success: true, data: { current: metrics, statistics: stats } });
  } catch (error) {
    logger.error('Error getting network metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/network/interfaces
 * Get network interface information
 */
router.get('/network/interfaces', async (req, res) => {
  try {
    const interfaces = await networkMonitor.getNetworkInterfaces();
    res.json({ success: true, data: interfaces });
  } catch (error) {
    logger.error('Error getting network interfaces', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GPU Metrics
// ============================================================================

/**
 * GET /api/system-health/gpu/current
 * Get current GPU metrics
 */
router.get('/gpu/current', async (req, res) => {
  try {
    const metrics = await gpuMonitor.getCurrentMetrics();
    const stats = gpuMonitor.getStatistics();
    const info = await gpuMonitor.getGPUInfo();
    res.json({ success: true, data: { current: metrics, statistics: stats, info } });
  } catch (error) {
    logger.error('Error getting GPU metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Process Metrics
// ============================================================================

/**
 * GET /api/system-health/processes/current
 * Get current process snapshot
 */
router.get('/processes/current', async (req, res) => {
  try {
    const snapshot = await processMonitor.getCurrentSnapshot();
    const summary = processMonitor.getSummary();
    const alerts = processMonitor.getProcessAlerts();
    res.json({ success: true, data: { snapshot, summary, alerts } });
  } catch (error) {
    logger.error('Error getting process metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/processes/top
 * Get top processes
 */
router.get('/processes/top', async (req, res) => {
  try {
    const snapshot = await processMonitor.getCurrentSnapshot();
    res.json({ 
      success: true, 
      data: {
        topCPU: snapshot?.topCPU || [],
        topMemory: snapshot?.topMemory || []
      }
    });
  } catch (error) {
    logger.error('Error getting top processes', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/processes/zombies
 * Get zombie processes
 */
router.get('/processes/zombies', async (req, res) => {
  try {
    const zombies = await processMonitor.getZombieProcesses();
    res.json({ success: true, data: zombies });
  } catch (error) {
    logger.error('Error getting zombie processes', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/processes/node
 * Get Node.js process metrics
 */
router.get('/processes/node', async (req, res) => {
  try {
    const metrics = await processMonitor.getNodeProcessMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error('Error getting Node process metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// System Information
// ============================================================================

/**
 * GET /api/system-health/info/hardware
 * Get hardware information
 */
router.get('/info/hardware', async (req, res) => {
  try {
    const info = await systemInfoCollector.getSystemInfo();
    res.json({ success: true, data: info });
  } catch (error) {
    logger.error('Error getting hardware info', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/info/summary
 * Get system summary
 */
router.get('/info/summary', async (req, res) => {
  try {
    const summary = await systemInfoCollector.getSystemSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Error getting system summary', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/info/usb
 * Get USB devices
 */
router.get('/info/usb', async (req, res) => {
  try {
    const devices = await systemInfoCollector.getUSBDevices();
    res.json({ success: true, data: devices });
  } catch (error) {
    logger.error('Error getting USB devices', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// User Sessions
// ============================================================================

/**
 * GET /api/system-health/users/active
 * Get active user sessions
 */
router.get('/users/active', async (req, res) => {
  try {
    const sessions = await userSessionTracker.getActiveSessionsFromDB();
    const count = userSessionTracker.getActiveSessionCount();
    res.json({ success: true, data: { sessions, count } });
  } catch (error) {
    logger.error('Error getting active users', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/users/sessions/:userId
 * Get session history for user
 */
router.get('/users/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;
    const sessions = await userSessionTracker.getUserSessionHistory(parseInt(userId), parseInt(limit));
    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error('Error getting user sessions', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/users/statistics
 * Get session statistics
 */
router.get('/users/statistics', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const stats = await userSessionTracker.getSessionStatistics(parseInt(days));
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Error getting session statistics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Alerts
// ============================================================================

/**
 * GET /api/system-health/alerts/active
 * Get active alerts
 */
router.get('/alerts/active', async (req, res) => {
  try {
    const alerts = await alertManager.getActiveAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Error getting active alerts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/alerts/history
 * Get alert history
 */
router.get('/alerts/history', async (req, res) => {
  try {
    const { days = 7, severity } = req.query;
    const alerts = await alertManager.getAlertHistory(parseInt(days), severity);
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Error getting alert history', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/system-health/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await alertManager.acknowledgeAlert(parseInt(id), userId);
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    logger.error('Error acknowledging alert', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/system-health/alerts/:id/resolve
 * Resolve an alert
 */
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await alertManager.resolveAlert(parseInt(id), userId);
    res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    logger.error('Error resolving alert', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Events
// ============================================================================

/**
 * GET /api/system-health/events
 * Get system events
 */
router.get('/events', async (req, res) => {
  try {
    const { type, severity, limit = 100 } = req.query;

    let sql = 'SELECT * FROM system_events_log WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND event_type = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting events', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system-health/events/recent
 * Get recent events (last 24 hours)
 */
router.get('/events/recent', async (req, res) => {
  try {
    const result = await query('SELECT * FROM v_recent_system_events LIMIT 100');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting recent events', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Export Data
// ============================================================================

/**
 * GET /api/system-health/export/metrics
 * Export metrics to CSV/JSON
 */
router.get('/export/metrics', async (req, res) => {
  try {
    const { format = 'json', start, end } = req.query;

    let sql = 'SELECT * FROM system_metrics WHERE 1=1';
    const params = [];

    if (start) {
      params.push(start);
      sql += ` AND timestamp >= $${params.length}`;
    }

    if (end) {
      params.push(end);
      sql += ` AND timestamp <= $${params.length}`;
    }

    sql += ' ORDER BY timestamp DESC';

    const result = await query(sql, params);

    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(result.rows[0] || {}).join(',');
      const rows = result.rows.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=metrics.csv');
      res.send(csv);
    } else {
      res.json({ success: true, data: result.rows });
    }
  } catch (error) {
    logger.error('Error exporting metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
