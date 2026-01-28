/**
 * Alert Manager
 * Handles alert generation, tracking, and delivery
 */

const { query } = require('../dal/pg');
const logger = require('./logger');
const config = require('./config');

class AlertManager {
  constructor() {
    this.activeAlerts = new Map(); // Track active alerts in memory
    this.alertCooldowns = new Map(); // Prevent alert spam
    this.thresholds = config.thresholds;
    this.websocketClients = new Set();
  }

  /**
   * Load thresholds from database
   */
  async loadThresholds() {
    try {
      const result = await query(
        `SELECT config_key, config_value FROM monitoring_config 
        WHERE config_key LIKE '%_thresholds'`
      );

      result.rows.forEach(row => {
        const key = row.config_key.replace('_thresholds', '');
        this.thresholds[key] = row.config_value;
      });

      logger.info('Loaded alert thresholds from database');
    } catch (error) {
      logger.error('Error loading thresholds', { error: error.message });
    }
  }

  /**
   * Check CPU threshold and create alert if needed
   */
  async checkCPUThreshold(currentValue, sustained = false) {
    const { warning, critical, sustainedSeconds } = this.thresholds.cpu;

    if (currentValue >= critical) {
      return await this.createAlert({
        alertType: 'cpu_critical',
        severity: 'critical',
        title: 'Critical CPU Usage',
        message: `CPU usage at ${currentValue.toFixed(2)}% (threshold: ${critical}%)`,
        thresholdValue: critical,
        currentValue,
        sustained
      });
    } else if (currentValue >= warning) {
      return await this.createAlert({
        alertType: 'cpu_warning',
        severity: 'warning',
        title: 'High CPU Usage',
        message: `CPU usage at ${currentValue.toFixed(2)}% (threshold: ${warning}%)`,
        thresholdValue: warning,
        currentValue,
        sustained
      });
    }

    // Auto-resolve if below thresholds
    await this.autoResolveAlert('cpu_critical');
    await this.autoResolveAlert('cpu_warning');
    return null;
  }

  /**
   * Check memory threshold
   */
  async checkMemoryThreshold(currentValue, sustained = false) {
    const { warning, critical } = this.thresholds.memory;

    if (currentValue >= critical) {
      return await this.createAlert({
        alertType: 'memory_critical',
        severity: 'critical',
        title: 'Critical Memory Usage',
        message: `Memory usage at ${currentValue.toFixed(2)}% (threshold: ${critical}%)`,
        thresholdValue: critical,
        currentValue,
        sustained
      });
    } else if (currentValue >= warning) {
      return await this.createAlert({
        alertType: 'memory_warning',
        severity: 'warning',
        title: 'High Memory Usage',
        message: `Memory usage at ${currentValue.toFixed(2)}% (threshold: ${warning}%)`,
        thresholdValue: warning,
        currentValue,
        sustained
      });
    }

    await this.autoResolveAlert('memory_critical');
    await this.autoResolveAlert('memory_warning');
    return null;
  }

  /**
   * Check disk threshold
   */
  async checkDiskThreshold(currentValue, diskName = '/') {
    const { warning, critical } = this.thresholds.disk;

    if (currentValue >= critical) {
      return await this.createAlert({
        alertType: 'disk_critical',
        severity: 'critical',
        title: 'Critical Disk Space',
        message: `Disk ${diskName} at ${currentValue.toFixed(2)}% full (threshold: ${critical}%)`,
        thresholdValue: critical,
        currentValue,
        metadata: { disk: diskName }
      });
    } else if (currentValue >= warning) {
      return await this.createAlert({
        alertType: 'disk_warning',
        severity: 'warning',
        title: 'Low Disk Space',
        message: `Disk ${diskName} at ${currentValue.toFixed(2)}% full (threshold: ${warning}%)`,
        thresholdValue: warning,
        currentValue,
        metadata: { disk: diskName }
      });
    }

    await this.autoResolveAlert('disk_critical');
    await this.autoResolveAlert('disk_warning');
    return null;
  }

  /**
   * Check GPU threshold
   */
  async checkGPUThreshold(currentValue, sustained = false) {
    const { warning, critical } = this.thresholds.gpu;

    if (currentValue >= critical) {
      return await this.createAlert({
        alertType: 'gpu_critical',
        severity: 'critical',
        title: 'Critical GPU Usage',
        message: `GPU usage at ${currentValue.toFixed(2)}% (threshold: ${critical}%)`,
        thresholdValue: critical,
        currentValue,
        sustained
      });
    } else if (currentValue >= warning) {
      return await this.createAlert({
        alertType: 'gpu_warning',
        severity: 'warning',
        title: 'High GPU Usage',
        message: `GPU usage at ${currentValue.toFixed(2)}% (threshold: ${warning}%)`,
        thresholdValue: warning,
        currentValue,
        sustained
      });
    }

    await this.autoResolveAlert('gpu_critical');
    await this.autoResolveAlert('gpu_warning');
    return null;
  }

  /**
   * Create or update alert
   */
  async createAlert({ alertType, severity, title, message, thresholdValue, currentValue, sustained = false, metadata = {} }) {
    try {
      // Check if alert already exists and is in cooldown
      if (this.isInCooldown(alertType)) {
        return null;
      }

      // Check if alert already exists and is active
      const existing = await query(
        `SELECT id FROM system_alerts 
        WHERE alert_type = $1 AND is_active = true AND resolved = false
        LIMIT 1`,
        [alertType]
      );

      let alertId;

      if (existing.rows.length > 0) {
        // Update existing alert
        alertId = existing.rows[0].id;
        await query(
          `UPDATE system_alerts 
          SET current_value = $1, 
              message = $2, 
              metadata = $3,
              timestamp = CURRENT_TIMESTAMP
          WHERE id = $4`,
          [currentValue, message, JSON.stringify({ ...metadata, sustained }), alertId]
        );
      } else {
        // Create new alert
        const result = await query(
          `INSERT INTO system_alerts 
          (alert_type, severity, title, message, threshold_value, current_value, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [alertType, severity, title, message, thresholdValue, currentValue, JSON.stringify({ ...metadata, sustained })]
        );
        alertId = result.rows[0].id;

        // Add to active alerts
        this.activeAlerts.set(alertType, alertId);

        // Log the alert
        logger.alert(message, {
          alertId,
          alertType,
          severity,
          threshold: thresholdValue,
          current: currentValue
        });

        // Send alert via WebSocket
        this.broadcastAlert({
          id: alertId,
          type: alertType,
          severity,
          title,
          message,
          timestamp: new Date()
        });

        // Set cooldown
        this.setCooldown(alertType);
      }

      return alertId;

    } catch (error) {
      logger.error('Error creating alert', { error: error.message, alertType });
      return null;
    }
  }

  /**
   * Auto-resolve alert
   */
  async autoResolveAlert(alertType) {
    try {
      if (this.activeAlerts.has(alertType)) {
        const result = await query(
          `UPDATE system_alerts 
          SET is_active = false, 
              resolved = true, 
              resolved_at = CURRENT_TIMESTAMP,
              auto_resolved = true
          WHERE alert_type = $1 AND is_active = true AND resolved = false
          RETURNING id`,
          [alertType]
        );

        if (result.rows.length > 0) {
          this.activeAlerts.delete(alertType);
          logger.info(`Auto-resolved alert: ${alertType}`);
          
          // Broadcast resolution
          this.broadcastAlert({
            id: result.rows[0].id,
            type: alertType,
            action: 'resolved',
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error('Error auto-resolving alert', { error: error.message, alertType });
    }
  }

  /**
   * Manually acknowledge alert
   */
  async acknowledgeAlert(alertId, userId) {
    try {
      await query(
        `UPDATE system_alerts 
        SET acknowledged = true,
            acknowledged_by = $2,
            acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [alertId, userId]
      );

      logger.info(`Alert acknowledged`, { alertId, userId });
    } catch (error) {
      logger.error('Error acknowledging alert', { error: error.message, alertId });
    }
  }

  /**
   * Manually resolve alert
   */
  async resolveAlert(alertId, userId) {
    try {
      const result = await query(
        `UPDATE system_alerts 
        SET is_active = false,
            resolved = true,
            resolved_at = CURRENT_TIMESTAMP,
            auto_resolved = false
        WHERE id = $1
        RETURNING alert_type`,
        [alertId]
      );

      if (result.rows.length > 0) {
        const alertType = result.rows[0].alert_type;
        this.activeAlerts.delete(alertType);
        logger.info(`Alert manually resolved`, { alertId, alertType, userId });
      }
    } catch (error) {
      logger.error('Error resolving alert', { error: error.message, alertId });
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      const result = await query(`SELECT * FROM v_active_alerts`);
      return result.rows;
    } catch (error) {
      logger.error('Error getting active alerts', { error: error.message });
      return [];
    }
  }

  /**
   * Get alert history
   */
  async getAlertHistory(days = 7, severity = null) {
    try {
      let sql = `
        SELECT * FROM system_alerts 
        WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      `;
      
      if (severity) {
        sql += ` AND severity = '${severity}'`;
      }
      
      sql += ` ORDER BY timestamp DESC LIMIT 100`;

      const result = await query(sql);
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert history', { error: error.message });
      return [];
    }
  }

  /**
   * Check if alert is in cooldown period
   */
  isInCooldown(alertType) {
    const lastAlert = this.alertCooldowns.get(alertType);
    if (!lastAlert) return false;

    const cooldownMs = config.alerts.deduplicationMinutes * 60 * 1000;
    return (Date.now() - lastAlert) < cooldownMs;
  }

  /**
   * Set cooldown for alert type
   */
  setCooldown(alertType) {
    this.alertCooldowns.set(alertType, Date.now());
  }

  /**
   * Register WebSocket client for alerts
   */
  addWebSocketClient(ws) {
    this.websocketClients.add(ws);
  }

  /**
   * Remove WebSocket client
   */
  removeWebSocketClient(ws) {
    this.websocketClients.delete(ws);
  }

  /**
   * Broadcast alert to all WebSocket clients
   */
  broadcastAlert(alert) {
    const message = JSON.stringify({
      type: 'alert',
      data: alert
    });

    this.websocketClients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(message);
        } catch (error) {
          logger.error('Error broadcasting alert to client', { error: error.message });
        }
      }
    });
  }

  /**
   * Clean up old resolved alerts
   */
  async cleanupOldAlerts() {
    try {
      const result = await query(
        `DELETE FROM system_alerts 
        WHERE resolved = true 
        AND resolved_at < CURRENT_TIMESTAMP - INTERVAL '${config.retention.alertHistoryDays} days'
        RETURNING id`
      );

      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} old alerts`);
      }
    } catch (error) {
      logger.error('Error cleaning up old alerts', { error: error.message });
    }
  }
}

module.exports = new AlertManager();
