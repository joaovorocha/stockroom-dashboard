/**
 * Disk Monitoring Module
 * Tracks disk space, I/O operations, and disk health
 */

const si = require('systeminformation');
const checkDiskSpace = require('check-disk-space').default;
const logger = require('./logger');

class DiskMonitor {
  constructor() {
    this.lastCheck = null;
    this.lastIO = null;
    this.history = [];
    this.maxHistory = 60;
  }

  /**
   * Get current disk space metrics
   */
  async getCurrentMetrics() {
    try {
      const fsSize = await si.fsSize();
      
      // Get primary disk (usually /)
      const primaryDisk = fsSize.find(fs => fs.mount === '/' || fs.mount === 'C:\\') || fsSize[0];
      
      if (!primaryDisk) {
        logger.warn('No primary disk found');
        return null;
      }

      const totalGB = Math.round(primaryDisk.size / 1024 / 1024 / 1024 * 100) / 100;
      const usedGB = Math.round(primaryDisk.used / 1024 / 1024 / 1024 * 100) / 100;
      const freeGB = Math.round((primaryDisk.size - primaryDisk.used) / 1024 / 1024 / 1024 * 100) / 100;
      const usagePercent = Math.round(primaryDisk.use * 100) / 100;

      const metrics = {
        totalGB,
        usedGB,
        freeGB,
        usagePercent,
        mount: primaryDisk.mount,
        fs: primaryDisk.fs,
        type: primaryDisk.type,
        allDisks: fsSize.map(disk => ({
          mount: disk.mount,
          totalGB: Math.round(disk.size / 1024 / 1024 / 1024 * 100) / 100,
          usedGB: Math.round(disk.used / 1024 / 1024 / 1024 * 100) / 100,
          freeGB: Math.round((disk.size - disk.used) / 1024 / 1024 / 1024 * 100) / 100,
          usagePercent: Math.round(disk.use * 100) / 100,
          fs: disk.fs,
          type: disk.type
        })),
        timestamp: new Date()
      };

      // Add to history
      this.history.push(metrics);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.lastCheck = metrics;
      return metrics;

    } catch (error) {
      logger.error('Error getting disk metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get disk I/O statistics
   */
  async getIOMetrics() {
    try {
      const diskIO = await si.disksIO();
      
      // Calculate speeds if we have previous reading
      let readMBps = 0;
      let writeMBps = 0;

      if (this.lastIO) {
        const timeDiff = (Date.now() - this.lastIO.timestamp) / 1000; // seconds
        const readDiff = diskIO.rIO - this.lastIO.rIO;
        const writeDiff = diskIO.wIO - this.lastIO.wIO;

        readMBps = Math.round((readDiff / timeDiff) / 1024 / 1024 * 100) / 100;
        writeMBps = Math.round((writeDiff / timeDiff) / 1024 / 1024 * 100) / 100;
      }

      const ioMetrics = {
        readMBps,
        writeMBps,
        readOperations: diskIO.rIO,
        writeOperations: diskIO.wIO,
        timestamp: Date.now()
      };

      this.lastIO = {
        rIO: diskIO.rIO,
        wIO: diskIO.wIO,
        timestamp: Date.now()
      };

      return ioMetrics;

    } catch (error) {
      logger.error('Error getting disk I/O metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get disk layout and information
   */
  async getDiskInfo() {
    try {
      const diskLayout = await si.diskLayout();
      return diskLayout.map(disk => ({
        device: disk.device,
        type: disk.type,
        name: disk.name,
        vendor: disk.vendor,
        size: Math.round(disk.size / 1024 / 1024 / 1024), // GB
        interfaceType: disk.interfaceType,
        serialNum: disk.serialNum,
        firmwareRevision: disk.firmwareRevision,
        smartStatus: disk.smartStatus
      }));
    } catch (error) {
      logger.error('Error getting disk info', { error: error.message });
      return [];
    }
  }

  /**
   * Check if disk usage exceeds threshold
   */
  checkThreshold(threshold) {
    if (!this.lastCheck) return false;
    return this.lastCheck.usagePercent >= threshold;
  }

  /**
   * Check any disk exceeds threshold
   */
  checkAnyDiskThreshold(threshold) {
    if (!this.lastCheck || !this.lastCheck.allDisks) return false;
    return this.lastCheck.allDisks.some(disk => disk.usagePercent >= threshold);
  }

  /**
   * Get disk statistics summary
   */
  getStatistics() {
    if (this.history.length === 0) return null;

    const usages = this.history.map(h => h.usagePercent);
    const sum = usages.reduce((a, b) => a + b, 0);

    return {
      current: this.lastCheck?.usagePercent || 0,
      average: sum / usages.length,
      min: Math.min(...usages),
      max: Math.max(...usages),
      samples: usages.length,
      totalGB: this.lastCheck?.totalGB || 0,
      freeGB: this.lastCheck?.freeGB || 0
    };
  }

  /**
   * Get low disk space warning
   */
  getLowSpaceWarning() {
    if (!this.lastCheck) return null;

    const warnings = [];

    if (this.lastCheck.usagePercent >= 95) {
      warnings.push({
        severity: 'critical',
        disk: this.lastCheck.mount,
        usage: this.lastCheck.usagePercent,
        free: this.lastCheck.freeGB
      });
    } else if (this.lastCheck.usagePercent >= 85) {
      warnings.push({
        severity: 'warning',
        disk: this.lastCheck.mount,
        usage: this.lastCheck.usagePercent,
        free: this.lastCheck.freeGB
      });
    }

    // Check all disks
    if (this.lastCheck.allDisks) {
      this.lastCheck.allDisks.forEach(disk => {
        if (disk.mount !== this.lastCheck.mount) {
          if (disk.usagePercent >= 95) {
            warnings.push({
              severity: 'critical',
              disk: disk.mount,
              usage: disk.usagePercent,
              free: disk.freeGB
            });
          } else if (disk.usagePercent >= 85) {
            warnings.push({
              severity: 'warning',
              disk: disk.mount,
              usage: disk.usagePercent,
              free: disk.freeGB
            });
          }
        }
      });
    }

    return warnings.length > 0 ? warnings : null;
  }

  /**
   * Reset history
   */
  reset() {
    this.history = [];
    this.lastCheck = null;
    this.lastIO = null;
  }
}

module.exports = new DiskMonitor();
