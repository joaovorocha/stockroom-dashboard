/**
 * Memory Monitoring Module
 * Tracks RAM and swap usage
 */

const si = require('systeminformation');
const os = require('os');
const logger = require('./logger');

class MemoryMonitor {
  constructor() {
    this.lastCheck = null;
    this.history = [];
    this.maxHistory = 60;
  }

  /**
   * Get current memory metrics
   */
  async getCurrentMetrics() {
    try {
      const mem = await si.mem();
      
      const totalMB = Math.round(mem.total / 1024 / 1024);
      const usedMB = Math.round(mem.used / 1024 / 1024);
      const freeMB = Math.round(mem.free / 1024 / 1024);
      const availableMB = Math.round(mem.available / 1024 / 1024);
      const usagePercent = Math.round((mem.used / mem.total) * 100 * 100) / 100;

      const swapTotalMB = Math.round(mem.swaptotal / 1024 / 1024);
      const swapUsedMB = Math.round(mem.swapused / 1024 / 1024);
      const swapUsagePercent = swapTotalMB > 0 
        ? Math.round((mem.swapused / mem.swaptotal) * 100 * 100) / 100 
        : 0;

      const metrics = {
        totalMB,
        usedMB,
        freeMB,
        availableMB,
        usagePercent,
        swapTotalMB,
        swapUsedMB,
        swapFreeMB: swapTotalMB - swapUsedMB,
        swapUsagePercent,
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
      logger.error('Error getting memory metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get memory layout information
   */
  async getMemoryLayout() {
    try {
      const layout = await si.memLayout();
      return layout.map(mem => ({
        size: Math.round(mem.size / 1024 / 1024 / 1024), // GB
        type: mem.type,
        clockSpeed: mem.clockSpeed,
        formFactor: mem.formFactor,
        manufacturer: mem.manufacturer,
        partNum: mem.partNum,
        bank: mem.bank
      }));
    } catch (error) {
      logger.error('Error getting memory layout', { error: error.message });
      return [];
    }
  }

  /**
   * Check if memory usage exceeds threshold
   */
  checkThreshold(threshold, sustainedSeconds = 0) {
    if (!this.lastCheck) return false;

    if (sustainedSeconds === 0) {
      return this.lastCheck.usagePercent >= threshold;
    }

    // Check sustained usage
    const requiredReadings = Math.ceil(sustainedSeconds / 5);
    const recentHistory = this.history.slice(-requiredReadings);

    if (recentHistory.length < requiredReadings) return false;

    return recentHistory.every(reading => reading.usagePercent >= threshold);
  }

  /**
   * Check for potential memory leak
   * Detects continuous memory growth over time
   */
  detectMemoryLeak(thresholdGrowthMB = 100) {
    if (this.history.length < 12) return false; // Need at least 1 minute of data

    const recent = this.history.slice(-12);
    const first = recent[0].usedMB;
    const last = recent[recent.length - 1].usedMB;
    const growth = last - first;

    // Check if memory is continuously growing
    let continuousGrowth = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].usedMB < recent[i - 1].usedMB) {
        continuousGrowth = false;
        break;
      }
    }

    return continuousGrowth && growth >= thresholdGrowthMB;
  }

  /**
   * Get memory statistics summary
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
      totalMB: this.lastCheck?.totalMB || 0,
      availableMB: this.lastCheck?.availableMB || 0
    };
  }

  /**
   * Reset history
   */
  reset() {
    this.history = [];
    this.lastCheck = null;
  }
}

module.exports = new MemoryMonitor();
