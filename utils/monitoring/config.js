/**
 * System Health Monitoring Configuration
 * Centralized configuration for all monitoring modules
 */

module.exports = {
  // Data collection intervals (in milliseconds)
  intervals: {
    realtime: 5000,      // 5 seconds - CPU, Memory, Network
    frequent: 30000,     // 30 seconds - Disk I/O, GPU, Processes
    periodic: 300000,    // 5 minutes - Disk space, System info
    hourly: 3600000,     // 1 hour - Hardware scan, USB devices
  },

  // Alert thresholds (will be overridden by database config)
  thresholds: {
    cpu: {
      warning: 75,        // %
      critical: 90,       // %
      sustainedSeconds: 60
    },
    memory: {
      warning: 80,        // %
      critical: 95,       // %
      sustainedSeconds: 120
    },
    disk: {
      warning: 85,        // %
      critical: 95        // %
    },
    network: {
      warningMbps: 800,
      criticalMbps: 950
    },
    gpu: {
      warning: 90,        // %
      critical: 99,       // %
      sustainedSeconds: 60
    }
  },

  // Data retention (in days)
  retention: {
    realtimeHours: 24,    // Full resolution data
    aggregatedDays: 90,   // Aggregated metrics
    archivedDays: 365,    // Compressed archives
    sessionLogDays: 365,
    eventLogDays: 730,    // 2 years for security events
    alertHistoryDays: 180
  },

  // Alert settings
  alerts: {
    emailEnabled: false,
    emailRecipients: [],
    websocketEnabled: true,
    deduplicationMinutes: 15,  // Prevent duplicate alerts
    autoResolveHours: 24
  },

  // Process monitoring
  processes: {
    topCount: 20,          // Number of top processes to track
    snapshotInterval: 30000  // 30 seconds
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: './logs/system-health',
    maxFiles: '30d',       // Keep logs for 30 days
    maxSize: '20m',        // Max file size before rotation
    datePattern: 'YYYY-MM-DD'
  },

  // WebSocket configuration
  websocket: {
    enabled: true,
    port: process.env.WS_PORT || null,  // Use same port as HTTP server
    path: '/ws/system-health',
    pingInterval: 30000    // 30 seconds
  },

  // System info collection
  systemInfo: {
    collectOnStartup: true,
    collectInterval: 3600000,  // 1 hour
    trackUSBDevices: true,
    trackNetworkInterfaces: true,
    trackDiskDevices: true
  },

  // Performance optimization
  performance: {
    batchInsertSize: 10,    // Batch database inserts
    maxConcurrentQueries: 5,
    enableCaching: true,
    cacheTTL: 5000          // 5 seconds
  },

  // Feature flags
  features: {
    gpuMonitoring: true,
    networkMonitoring: true,
    processMonitoring: true,
    userSessionTracking: true,
    hardwareInventory: true,
    predictiveAnalytics: false  // Future feature
  }
};
