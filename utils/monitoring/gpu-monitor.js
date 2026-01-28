/**
 * GPU Monitoring Module
 * Tracks GPU/NPU utilization, memory, and temperature
 * Supports NVIDIA, AMD, and Intel graphics
 */

const si = require('systeminformation');
const logger = require('./logger');

class GPUMonitor {
  constructor() {
    this.lastCheck = null;
    this.history = [];
    this.maxHistory = 60;
    this.gpuAvailable = null; // null = not checked, true/false = checked
  }

  /**
   * Get current GPU metrics
   */
  async getCurrentMetrics() {
    try {
      const graphics = await si.graphics();
      
      // Check if GPU is available
      if (!graphics.controllers || graphics.controllers.length === 0) {
        this.gpuAvailable = false;
        return null;
      }

      this.gpuAvailable = true;

      const controllers = graphics.controllers.map(gpu => ({
        vendor: gpu.vendor,
        model: gpu.model,
        vram: gpu.vram,
        vramDynamic: gpu.vramDynamic
      }));

      // Try to get GPU usage and temperature
      // Note: This requires specific drivers and may not work on all systems
      let usage = null;
      let temperature = null;
      let memoryUsed = null;
      let memoryTotal = null;

      // For NVIDIA GPUs, we could use nvidia-smi, but that requires nvidia-ml-py3
      // For now, we'll get what systeminformation provides
      if (graphics.controllers[0]) {
        const gpu = graphics.controllers[0];
        memoryUsed = gpu.memoryUsed || null;
        memoryTotal = gpu.vram || null;
        temperature = gpu.temperatureGpu || null;
        
        // Calculate usage if memory stats available
        if (memoryUsed && memoryTotal) {
          usage = Math.round((memoryUsed / memoryTotal) * 100 * 100) / 100;
        }
      }

      const metrics = {
        available: true,
        controllers,
        usage,
        temperature,
        memoryUsedMB: memoryUsed,
        memoryTotalMB: memoryTotal,
        memoryUsagePercent: usage,
        displayCount: graphics.displays ? graphics.displays.length : 0,
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
      logger.error('Error getting GPU metrics', { error: error.message });
      this.gpuAvailable = false;
      return null;
    }
  }

  /**
   * Get detailed GPU information
   */
  async getGPUInfo() {
    try {
      const graphics = await si.graphics();
      
      if (!graphics.controllers || graphics.controllers.length === 0) {
        return { available: false };
      }

      return {
        available: true,
        controllers: graphics.controllers.map(gpu => ({
          vendor: gpu.vendor,
          model: gpu.model,
          bus: gpu.bus,
          vram: gpu.vram,
          vramDynamic: gpu.vramDynamic,
          subDeviceId: gpu.subDeviceId,
          driverVersion: gpu.driverVersion,
          name: gpu.name,
          pciBus: gpu.pciBus,
          fanSpeed: gpu.fanSpeed,
          memoryTotal: gpu.memoryTotal,
          memoryUsed: gpu.memoryUsed,
          memoryFree: gpu.memoryFree,
          utilizationGpu: gpu.utilizationGpu,
          utilizationMemory: gpu.utilizationMemory,
          temperatureGpu: gpu.temperatureGpu,
          temperatureMemory: gpu.temperatureMemory,
          powerDraw: gpu.powerDraw,
          powerLimit: gpu.powerLimit,
          clockCore: gpu.clockCore,
          clockMemory: gpu.clockMemory
        })),
        displays: graphics.displays ? graphics.displays.map(display => ({
          vendor: display.vendor,
          model: display.model,
          main: display.main,
          builtin: display.builtin,
          connection: display.connection,
          resolutionx: display.resolutionx,
          resolutiony: display.resolutiony,
          sizex: display.sizex,
          sizey: display.sizey,
          pixeldepth: display.pixeldepth,
          currentResX: display.currentResX,
          currentResY: display.currentResY,
          currentRefreshRate: display.currentRefreshRate
        })) : []
      };
    } catch (error) {
      logger.error('Error getting GPU info', { error: error.message });
      return { available: false };
    }
  }

  /**
   * Check if GPU is available
   */
  isAvailable() {
    return this.gpuAvailable === true;
  }

  /**
   * Check if GPU usage exceeds threshold
   */
  checkThreshold(threshold, sustainedSeconds = 0) {
    if (!this.lastCheck || !this.lastCheck.usage) return false;

    if (sustainedSeconds === 0) {
      return this.lastCheck.usage >= threshold;
    }

    // Check sustained usage
    const requiredReadings = Math.ceil(sustainedSeconds / 5);
    const recentHistory = this.history.slice(-requiredReadings);

    if (recentHistory.length < requiredReadings) return false;

    return recentHistory.every(reading => 
      reading.usage !== null && reading.usage >= threshold
    );
  }

  /**
   * Get GPU statistics summary
   */
  getStatistics() {
    if (this.history.length === 0) return null;

    const validReadings = this.history.filter(h => h.usage !== null);
    if (validReadings.length === 0) return null;

    const usages = validReadings.map(h => h.usage);
    const sum = usages.reduce((a, b) => a + b, 0);

    return {
      current: this.lastCheck?.usage || 0,
      average: sum / usages.length,
      min: Math.min(...usages),
      max: Math.max(...usages),
      samples: validReadings.length,
      memoryTotal: this.lastCheck?.memoryTotalMB || 0,
      memoryUsed: this.lastCheck?.memoryUsedMB || 0
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

module.exports = new GPUMonitor();
