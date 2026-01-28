/**
 * Process Monitoring Module
 * Tracks running processes, top CPU/memory consumers
 */

const si = require('systeminformation');
const pidusage = require('pidusage');
const logger = require('./logger');

class ProcessMonitor {
  constructor() {
    this.lastSnapshot = null;
    this.topCount = 20;
  }

  /**
   * Get current process snapshot
   */
  async getCurrentSnapshot() {
    try {
      const processes = await si.processes();

      const topCPU = processes.list
        .filter(p => p.cpu > 0)
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, this.topCount)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: Math.round(p.cpu * 100) / 100,
          memory: Math.round(p.mem * 100) / 100,
          memMB: Math.round(p.memRss / 1024 / 1024),
          command: p.command,
          user: p.user,
          state: p.state,
          started: p.started,
          path: p.path
        }));

      const topMemory = processes.list
        .filter(p => p.mem > 0)
        .sort((a, b) => b.mem - a.mem)
        .slice(0, this.topCount)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: Math.round(p.cpu * 100) / 100,
          memory: Math.round(p.mem * 100) / 100,
          memMB: Math.round(p.memRss / 1024 / 1024),
          command: p.command,
          user: p.user,
          state: p.state,
          started: p.started,
          path: p.path
        }));

      const snapshot = {
        total: processes.all,
        running: processes.running,
        blocked: processes.blocked,
        sleeping: processes.sleeping,
        unknown: processes.unknown,
        zombie: processes.list.filter(p => p.state === 'Z').length,
        topCPU,
        topMemory,
        timestamp: new Date()
      };

      this.lastSnapshot = snapshot;
      return snapshot;

    } catch (error) {
      logger.error('Error getting process snapshot', { error: error.message });
      return null;
    }
  }

  /**
   * Get detailed information for specific process
   */
  async getProcessInfo(pid) {
    try {
      const [processInfo, usage] = await Promise.all([
        si.processLoad(pid),
        pidusage(pid)
      ]);

      return {
        pid,
        cpu: usage.cpu,
        memory: usage.memory,
        ppid: usage.ppid,
        ctime: usage.ctime,
        elapsed: usage.elapsed,
        timestamp: usage.timestamp,
        ...processInfo
      };
    } catch (error) {
      logger.error('Error getting process info', { pid, error: error.message });
      return null;
    }
  }

  /**
   * Get processes for specific user
   */
  async getProcessesByUser(username) {
    try {
      const processes = await si.processes();
      return processes.list
        .filter(p => p.user === username)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          memory: p.mem,
          command: p.command,
          state: p.state
        }));
    } catch (error) {
      logger.error('Error getting processes by user', { username, error: error.message });
      return [];
    }
  }

  /**
   * Find processes by name
   */
  async findProcessesByName(name) {
    try {
      const processes = await si.processes();
      return processes.list
        .filter(p => p.name.toLowerCase().includes(name.toLowerCase()))
        .map(p => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          memory: p.mem,
          command: p.command,
          state: p.state,
          user: p.user
        }));
    } catch (error) {
      logger.error('Error finding processes', { name, error: error.message });
      return [];
    }
  }

  /**
   * Detect zombie processes
   */
  async getZombieProcesses() {
    try {
      const processes = await si.processes();
      return processes.list
        .filter(p => p.state === 'Z')
        .map(p => ({
          pid: p.pid,
          name: p.name,
          ppid: p.ppid,
          user: p.user,
          started: p.started
        }));
    } catch (error) {
      logger.error('Error getting zombie processes', { error: error.message });
      return [];
    }
  }

  /**
   * Get Node.js process metrics
   */
  async getNodeProcessMetrics() {
    try {
      const usage = await pidusage(process.pid);
      const memUsage = process.memoryUsage();

      return {
        pid: process.pid,
        cpu: Math.round(usage.cpu * 100) / 100,
        memory: Math.round(usage.memory * 100) / 100,
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      };
    } catch (error) {
      logger.error('Error getting Node.js metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    if (!this.lastSnapshot) return null;

    return {
      total: this.lastSnapshot.total,
      running: this.lastSnapshot.running,
      sleeping: this.lastSnapshot.sleeping,
      zombie: this.lastSnapshot.zombie,
      topCPUProcess: this.lastSnapshot.topCPU[0] || null,
      topMemoryProcess: this.lastSnapshot.topMemory[0] || null
    };
  }

  /**
   * Check for concerning process states
   */
  getProcessAlerts() {
    if (!this.lastSnapshot) return [];

    const alerts = [];

    // Check for zombie processes
    if (this.lastSnapshot.zombie > 0) {
      alerts.push({
        type: 'zombie_processes',
        severity: 'warning',
        count: this.lastSnapshot.zombie,
        message: `${this.lastSnapshot.zombie} zombie process(es) detected`
      });
    }

    // Check for excessive processes
    if (this.lastSnapshot.total > 500) {
      alerts.push({
        type: 'high_process_count',
        severity: 'info',
        count: this.lastSnapshot.total,
        message: `High number of processes: ${this.lastSnapshot.total}`
      });
    }

    // Check for single process using too much CPU
    if (this.lastSnapshot.topCPU[0] && this.lastSnapshot.topCPU[0].cpu > 80) {
      alerts.push({
        type: 'high_cpu_process',
        severity: 'warning',
        process: this.lastSnapshot.topCPU[0].name,
        cpu: this.lastSnapshot.topCPU[0].cpu,
        message: `Process '${this.lastSnapshot.topCPU[0].name}' using ${this.lastSnapshot.topCPU[0].cpu}% CPU`
      });
    }

    return alerts;
  }
}

module.exports = new ProcessMonitor();
