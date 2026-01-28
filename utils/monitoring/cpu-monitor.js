/**
 * CPU Monitoring Module
 * Tracks CPU usage, load averages, temperature, and per-core statistics
 */

const si = require('systeminformation');
const os = require('os');
const logger = require('./logger');

class CPUMonitor {
  constructor() {
    this.lastCheck = null;
    this.history = [];
    this.maxHistory = 60; // Keep last 60 readings
  }

  /**
   * Get current CPU metrics
   */
  async getCurrentMetrics() {
    try {
      const [cpuLoad, currentLoad, temperature] = await Promise.all([
        si.currentLoad(),
        this.getCPUUsage(),
        this.getCPUTemperature()
      ]);

      const loadAvg = os.loadavg();
      const cpus = os.cpus();

      const metrics = {
        usage: currentLoad,
        cores: cpus.length,
        temperature: temperature,
        load1min: loadAvg[0],
        load5min: loadAvg[1],
        load15min: loadAvg[2],
        perCore: cpuLoad.cpus ? cpuLoad.cpus.map(cpu => ({
          load: cpu.load,
          loadUser: cpu.loadUser,
          loadSystem: cpu.loadSystem,
          loadIdle: cpu.loadIdle
        })) : [],
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
      logger.error('Error getting CPU metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get CPU usage percentage
   */
  async getCPUUsage() {
    try {
      const load = await si.currentLoad();
      return Math.round(load.currentLoad * 100) / 100;
    } catch (error) {
      logger.error('Error getting CPU usage', { error: error.message });
      return 0;
    }
  }

  /**
   * Get CPU temperature (if available)
   */
  async getCPUTemperature() {
    try {
      const temp = await si.cpuTemperature();
      return temp.main || temp.max || null;
    } catch (error) {
      // Temperature not available on all systems
      return null;
    }
  }

  /**
   * Get CPU information (static, rarely changes)
   */
  async getCPUInfo() {
    try {
      const cpu = await si.cpu();
      return {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        speed: cpu.speed,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        processors: cpu.processors,
        socket: cpu.socket,
        vendor: cpu.vendor,
        family: cpu.family,
        model: cpu.model,
        cache: cpu.cache
      };
    } catch (error) {
      logger.error('Error getting CPU info', { error: error.message });
      return null;
    }
  }

  /**
   * Check if CPU usage exceeds threshold
   */
  checkThreshold(threshold, sustainedSeconds = 0) {
    if (!this.lastCheck) return false;

    if (sustainedSeconds === 0) {
      return this.lastCheck.usage >= threshold;
    }

    // Check if usage has been above threshold for sustained period
    const requiredReadings = Math.ceil(sustainedSeconds / 5); // Assuming 5 sec intervals
    const recentHistory = this.history.slice(-requiredReadings);

    if (recentHistory.length < requiredReadings) return false;

    return recentHistory.every(reading => reading.usage >= threshold);
  }

  /**
   * Get CPU statistics summary
   */
  getStatistics() {
    if (this.history.length === 0) return null;

    const usages = this.history.map(h => h.usage);
    const sum = usages.reduce((a, b) => a + b, 0);

    return {
      current: this.lastCheck?.usage || 0,
      average: sum / usages.length,
      min: Math.min(...usages),
      max: Math.max(...usages),
      samples: usages.length
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

module.exports = new CPUMonitor();
