/**
 * Main System Health Monitoring Service
 * Orchestrates all monitoring modules and coordinates data collection
 */

const { query } = require('../dal/pg');
const logger = require('./logger');
const config = require('./config');

// Import all monitoring modules
const cpuMonitor = require('./cpu-monitor');
const memoryMonitor = require('./memory-monitor');
const diskMonitor = require('./disk-monitor');
const networkMonitor = require('./network-monitor');
const gpuMonitor = require('./gpu-monitor');
const processMonitor = require('./process-monitor');
const systemInfoCollector = require('./system-info-collector');
const userSessionTracker = require('./user-session-tracker');
const alertManager = require('./alert-manager');

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.intervals = {
      realtime: null,
      frequent: null,
      periodic: null,
      hourly: null
    };
    this.startTime = null;
    this.metricsCollected = 0;
  }

  /**
   * Start monitoring service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Monitoring service already running');
      return;
    }

    logger.info('Starting System Health Monitoring Service...');
    this.isRunning = true;
    this.startTime = new Date();

    try {
      // Load alert thresholds from database
      await alertManager.loadThresholds();

      // Collect initial system information
      logger.info('Collecting initial system information...');
      await this.collectSystemInfo();

      // Start real-time monitoring (every 5 seconds)
      this.intervals.realtime = setInterval(
        () => this.collectRealtimeMetrics(),
        config.intervals.realtime
      );

      // Start frequent monitoring (every 30 seconds)
      this.intervals.frequent = setInterval(
        () => this.collectFrequentMetrics(),
        config.intervals.frequent
      );

      // Start periodic monitoring (every 5 minutes)
      this.intervals.periodic = setInterval(
        () => this.collectPeriodicMetrics(),
        config.intervals.periodic
      );

      // Start hourly monitoring
      this.intervals.hourly = setInterval(
        () => this.collectHourlyMetrics(),
        config.intervals.hourly
      );

      // Run session cleanup every 5 minutes
      setInterval(
        () => userSessionTracker.closeInactiveSessions(),
        300000 // 5 minutes
      );

      // Clean up old data daily
      setInterval(
        () => this.performDailyMaintenance(),
        86400000 // 24 hours
      );

      // Collect initial metrics immediately
      await this.collectRealtimeMetrics();
      await this.collectFrequentMetrics();

      logger.info('✅ System Health Monitoring Service started successfully');
      
      // Log to system events
      await this.logSystemEvent({
        eventType: 'startup',
        severity: 'info',
        category: 'system',
        title: 'Monitoring Service Started',
        description: 'System health monitoring service initialized and collecting metrics'
      });

    } catch (error) {
      logger.error('Error starting monitoring service', { error: error.message, stack: error.stack });
      this.stop();
      throw error;
    }
  }

  /**
   * Stop monitoring service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping System Health Monitoring Service...');

    // Clear all intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    this.isRunning = false;
    logger.info('✅ System Health Monitoring Service stopped');
  }

  /**
   * Collect real-time metrics (5 seconds)
   * CPU, Memory, Network, Active Users
   */
  async collectRealtimeMetrics() {
    try {
      const [cpu, memory, network] = await Promise.all([
        cpuMonitor.getCurrentMetrics(),
        memoryMonitor.getCurrentMetrics(),
        networkMonitor.getCurrentMetrics()
      ]);

      // Check thresholds and create alerts
      if (cpu) {
        const sustained = cpuMonitor.checkThreshold(
          config.thresholds.cpu.critical,
          config.thresholds.cpu.sustainedSeconds
        );
        await alertManager.checkCPUThreshold(cpu.usage, sustained);
      }

      if (memory) {
        const sustained = memoryMonitor.checkThreshold(
          config.thresholds.memory.critical,
          config.thresholds.memory.sustainedSeconds
        );
        await alertManager.checkMemoryThreshold(memory.usagePercent, sustained);
      }

      // Get active user count
      const activeUsers = userSessionTracker.getActiveSessionCount();

      // Store metrics in database (batch insert for performance)
      await this.storeMetrics({
        cpu_usage_percent: cpu?.usage,
        cpu_cores: cpu?.cores,
        cpu_temperature: cpu?.temperature,
        cpu_load_1min: cpu?.load1min,
        cpu_load_5min: cpu?.load5min,
        cpu_load_15min: cpu?.load15min,
        memory_total_mb: memory?.totalMB,
        memory_used_mb: memory?.usedMB,
        memory_free_mb: memory?.freeMB,
        memory_usage_percent: memory?.usagePercent,
        swap_total_mb: memory?.swapTotalMB,
        swap_used_mb: memory?.swapUsedMB,
        swap_usage_percent: memory?.swapUsagePercent,
        network_rx_mb_sec: network?.rxMBps,
        network_tx_mb_sec: network?.txMBps,
        network_connections_active: network?.activeConnections,
        active_users: activeUsers
      });

      this.metricsCollected++;

    } catch (error) {
      logger.error('Error collecting realtime metrics', { error: error.message });
    }
  }

  /**
   * Collect frequent metrics (30 seconds)
   * Disk I/O, GPU, Processes
   */
  async collectFrequentMetrics() {
    try {
      const [disk, diskIO, gpu, processes] = await Promise.all([
        diskMonitor.getCurrentMetrics(),
        diskMonitor.getIOMetrics(),
        gpuMonitor.getCurrentMetrics(),
        processMonitor.getCurrentSnapshot()
      ]);

      // Check disk threshold
      if (disk) {
        await alertManager.checkDiskThreshold(disk.usagePercent, disk.mount);
        
        // Check for low disk space warnings
        const warnings = diskMonitor.getLowSpaceWarning();
        if (warnings) {
          for (const warning of warnings) {
            await alertManager.checkDiskThreshold(warning.usage, warning.disk);
          }
        }
      }

      // Check GPU threshold (if available)
      if (gpu && gpu.usage) {
        const sustained = gpuMonitor.checkThreshold(
          config.thresholds.gpu.critical,
          config.thresholds.gpu.sustainedSeconds
        );
        await alertManager.checkGPUThreshold(gpu.usage, sustained);
      }

      // Store process snapshot
      if (processes) {
        await query(
          `INSERT INTO process_snapshots 
          (top_cpu_processes, top_memory_processes, total_processes, zombie_processes, sleeping_processes, running_processes)
          VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            JSON.stringify(processes.topCPU),
            JSON.stringify(processes.topMemory),
            processes.total,
            processes.zombie,
            processes.sleeping,
            processes.running
          ]
        );
      }

      // Update last metrics with disk and GPU data
      await query(
        `UPDATE system_metrics 
        SET disk_total_gb = $1,
            disk_used_gb = $2,
            disk_free_gb = $3,
            disk_usage_percent = $4,
            disk_read_mb_sec = $5,
            disk_write_mb_sec = $6,
            gpu_usage_percent = $7,
            gpu_memory_used_mb = $8,
            gpu_memory_total_mb = $9,
            gpu_temperature = $10,
            active_processes = $11
        WHERE id = (SELECT id FROM system_metrics ORDER BY timestamp DESC LIMIT 1)`,
        [
          disk?.totalGB,
          disk?.usedGB,
          disk?.freeGB,
          disk?.usagePercent,
          diskIO?.readMBps,
          diskIO?.writeMBps,
          gpu?.usage,
          gpu?.memoryUsedMB,
          gpu?.memoryTotalMB,
          gpu?.temperature,
          processes?.total
        ]
      );

      // Check for process alerts
      const processAlerts = processMonitor.getProcessAlerts();
      if (processAlerts && processAlerts.length > 0) {
        for (const alert of processAlerts) {
          await this.logSystemEvent({
            eventType: 'warning',
            severity: alert.severity,
            category: 'system',
            title: alert.message,
            description: JSON.stringify(alert)
          });
        }
      }

    } catch (error) {
      logger.error('Error collecting frequent metrics', { error: error.message });
    }
  }

  /**
   * Collect periodic metrics (5 minutes)
   * System uptime, cleanup tasks
   */
  async collectPeriodicMetrics() {
    try {
      // Update system uptime
      const os = require('os');
      const uptimeHours = Math.round(os.uptime() / 3600 * 100) / 100;

      await query(
        `UPDATE system_metrics 
        SET system_uptime_hours = $1
        WHERE id = (SELECT id FROM system_metrics ORDER BY timestamp DESC LIMIT 1)`,
        [uptimeHours]
      );

      // Close inactive sessions
      await userSessionTracker.closeInactiveSessions();

      logger.metric('Periodic metrics collected', { uptimeHours });

    } catch (error) {
      logger.error('Error collecting periodic metrics', { error: error.message });
    }
  }

  /**
   * Collect hourly metrics
   * System info, USB devices, hardware changes
   */
  async collectHourlyMetrics() {
    try {
      const systemInfo = await systemInfoCollector.collectFullSystemInfo();
      
      if (systemInfo) {
        // Update or insert system hardware info
        await query(
          `INSERT INTO system_hardware_info (
            hostname, os_type, os_platform, os_release, os_arch,
            cpu_manufacturer, cpu_brand, cpu_cores_physical, cpu_cores_logical, cpu_speed_ghz,
            total_memory_gb, storage_devices, network_interfaces, usb_devices, graphics_controllers, full_snapshot
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT ON CONSTRAINT system_hardware_info_pkey DO UPDATE
          SET last_updated = CURRENT_TIMESTAMP,
              usb_devices = $14,
              full_snapshot = $16`,
          [
            systemInfo.hostname,
            systemInfo.osType,
            systemInfo.osPlatform,
            systemInfo.osRelease,
            systemInfo.osArch,
            systemInfo.cpu.manufacturer,
            systemInfo.cpu.brand,
            systemInfo.cpu.physicalCores,
            systemInfo.cpu.cores,
            systemInfo.cpu.speed,
            systemInfo.memory.total,
            JSON.stringify(systemInfo.storage),
            JSON.stringify(systemInfo.networkInterfaces),
            JSON.stringify(systemInfo.usbDevices),
            JSON.stringify(systemInfo.graphics),
            JSON.stringify(systemInfo)
          ]
        );

        logger.metric('Hourly system info collected', { 
          usbDeviceCount: systemInfo.usbDevices.length 
        });
      }

    } catch (error) {
      logger.error('Error collecting hourly metrics', { error: error.message });
    }
  }

  /**
   * Collect system information on startup
   */
  async collectSystemInfo() {
    try {
      const summary = await systemInfoCollector.getSystemSummary();
      if (summary) {
        logger.info('System Information:', summary);
      }
    } catch (error) {
      logger.error('Error collecting system info', { error: error.message });
    }
  }

  /**
   * Store metrics in database
   */
  async storeMetrics(metrics) {
    try {
      const columns = Object.keys(metrics).join(', ');
      const placeholders = Object.keys(metrics).map((_, i) => `$${i + 1}`).join(', ');
      const values = Object.values(metrics);

      await query(
        `INSERT INTO system_metrics (${columns}) VALUES (${placeholders})`,
        values
      );

    } catch (error) {
      logger.error('Error storing metrics', { error: error.message });
    }
  }

  /**
   * Log system event
   */
  async logSystemEvent({ eventType, severity, category, title, description, userId = null, metadata = null }) {
    try {
      await query(
        `INSERT INTO system_events_log 
        (event_type, severity, category, title, description, source, user_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [eventType, severity, category, title, description, 'monitoring-service', userId, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      logger.error('Error logging system event', { error: error.message });
    }
  }

  /**
   * Perform daily maintenance tasks
   */
  async performDailyMaintenance() {
    try {
      logger.info('Performing daily maintenance...');

      // Clean up old metrics
      await query(`SELECT cleanup_old_metrics()`);

      // Clean up old alerts
      await alertManager.cleanupOldAlerts();

      // Auto-resolve old alerts
      await query(`SELECT auto_resolve_old_alerts()`);

      logger.info('✅ Daily maintenance completed');

    } catch (error) {
      logger.error('Error during daily maintenance', { error: error.message });
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.startTime ? Math.round((Date.now() - this.startTime.getTime()) / 1000) : 0,
      metricsCollected: this.metricsCollected,
      activeUsers: userSessionTracker.getActiveSessionCount(),
      intervals: {
        realtime: config.intervals.realtime,
        frequent: config.intervals.frequent,
        periodic: config.intervals.periodic,
        hourly: config.intervals.hourly
      }
    };
  }

  /**
   * Get current metrics snapshot
   */
  async getCurrentSnapshot() {
    try {
      const [cpu, memory, disk, network, gpu, processes] = await Promise.all([
        cpuMonitor.getCurrentMetrics(),
        memoryMonitor.getCurrentMetrics(),
        diskMonitor.getCurrentMetrics(),
        networkMonitor.getCurrentMetrics(),
        gpuMonitor.getCurrentMetrics(),
        processMonitor.getCurrentSnapshot()
      ]);

      return {
        cpu: cpu ? {
          usage: cpu.usage,
          cores: cpu.cores,
          temperature: cpu.temperature,
          load: {
            one: cpu.load1min,
            five: cpu.load5min,
            fifteen: cpu.load15min
          }
        } : null,
        memory: memory ? {
          totalMB: memory.totalMB,
          usedMB: memory.usedMB,
          freeMB: memory.freeMB,
          usagePercent: memory.usagePercent,
          swap: {
            totalMB: memory.swapTotalMB,
            usedMB: memory.swapUsedMB,
            usagePercent: memory.swapUsagePercent
          }
        } : null,
        disk: disk ? {
          totalGB: disk.totalGB,
          usedGB: disk.usedGB,
          freeGB: disk.freeGB,
          usagePercent: disk.usagePercent,
          mount: disk.mount
        } : null,
        network: network ? {
          rxMBps: network.rxMBps,
          txMBps: network.txMBps,
          activeConnections: network.activeConnections
        } : null,
        gpu: gpu && gpu.available ? {
          usage: gpu.usage,
          memoryUsedMB: gpu.memoryUsedMB,
          memoryTotalMB: gpu.memoryTotalMB,
          temperature: gpu.temperature
        } : null,
        processes: processes ? {
          total: processes.total,
          running: processes.running,
          zombie: processes.zombie,
          topCPU: processes.topCPU.slice(0, 5),
          topMemory: processes.topMemory.slice(0, 5)
        } : null,
        activeUsers: userSessionTracker.getActiveSessionCount(),
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Error getting current snapshot', { error: error.message });
      return null;
    }
  }
}

// Export singleton instance
module.exports = new MonitoringService();
