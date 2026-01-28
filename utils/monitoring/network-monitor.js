/**
 * Network Monitoring Module
 * Tracks network bandwidth, connections, and interface statistics
 */

const si = require('systeminformation');
const logger = require('./logger');

class NetworkMonitor {
  constructor() {
    this.lastCheck = null;
    this.lastStats = null;
    this.history = [];
    this.maxHistory = 60;
  }

  /**
   * Get current network metrics
   */
  async getCurrentMetrics() {
    try {
      const [networkStats, connections, interfaces] = await Promise.all([
        si.networkStats(),
        si.networkConnections(),
        si.networkInterfaces()
      ]);

      // Get primary interface stats (usually the first active one)
      const primaryInterface = networkStats[0] || {};

      // Calculate bandwidth if we have previous reading
      let rxMBps = 0;
      let txMBps = 0;

      if (this.lastStats) {
        const timeDiff = (Date.now() - this.lastStats.timestamp) / 1000; // seconds
        const rxDiff = primaryInterface.rx_bytes - this.lastStats.rx_bytes;
        const txDiff = primaryInterface.tx_bytes - this.lastStats.tx_bytes;

        rxMBps = Math.round((rxDiff / timeDiff) / 1024 / 1024 * 100) / 100;
        txMBps = Math.round((txDiff / timeDiff) / 1024 / 1024 * 100) / 100;
      }

      // Count active connections
      const activeConnections = connections.filter(c => c.state === 'ESTABLISHED').length;
      const listeningConnections = connections.filter(c => c.state === 'LISTEN').length;

      const metrics = {
        rxMBps,
        txMBps,
        activeConnections,
        listeningConnections,
        totalConnections: connections.length,
        interface: primaryInterface.iface,
        operstate: primaryInterface.operstate,
        interfaces: interfaces.map(iface => ({
          name: iface.iface,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          type: iface.type,
          speed: iface.speed,
          operstate: iface.operstate,
          dhcp: iface.dhcp
        })),
        connectionsByState: this.groupConnectionsByState(connections),
        timestamp: new Date()
      };

      // Store for next calculation
      this.lastStats = {
        rx_bytes: primaryInterface.rx_bytes || 0,
        tx_bytes: primaryInterface.tx_bytes || 0,
        timestamp: Date.now()
      };

      // Add to history
      this.history.push(metrics);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.lastCheck = metrics;
      return metrics;

    } catch (error) {
      logger.error('Error getting network metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Get detailed network interface information
   */
  async getNetworkInterfaces() {
    try {
      const interfaces = await si.networkInterfaces();
      return interfaces.map(iface => ({
        name: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        internal: iface.internal,
        virtual: iface.virtual,
        operstate: iface.operstate,
        type: iface.type,
        duplex: iface.duplex,
        mtu: iface.mtu,
        speed: iface.speed,
        dhcp: iface.dhcp,
        dnsSuffix: iface.dnsSuffix,
        ieee8021xAuth: iface.ieee8021xAuth,
        ieee8021xState: iface.ieee8021xState,
        carrierChanges: iface.carrierChanges
      }));
    } catch (error) {
      logger.error('Error getting network interfaces', { error: error.message });
      return [];
    }
  }

  /**
   * Get network connections by protocol
   */
  async getConnectionsByProtocol() {
    try {
      const connections = await si.networkConnections();
      const byProtocol = {
        tcp: connections.filter(c => c.protocol === 'tcp').length,
        udp: connections.filter(c => c.protocol === 'udp').length,
        tcp6: connections.filter(c => c.protocol === 'tcp6').length,
        udp6: connections.filter(c => c.protocol === 'udp6').length
      };
      return byProtocol;
    } catch (error) {
      logger.error('Error getting connections by protocol', { error: error.message });
      return null;
    }
  }

  /**
   * Group connections by state
   */
  groupConnectionsByState(connections) {
    const states = {};
    connections.forEach(conn => {
      const state = conn.state || 'UNKNOWN';
      states[state] = (states[state] || 0) + 1;
    });
    return states;
  }

  /**
   * Check if bandwidth exceeds threshold
   */
  checkBandwidthThreshold(thresholdMbps) {
    if (!this.lastCheck) return false;
    
    // Convert MB/s to Mbps (multiply by 8)
    const rxMbps = this.lastCheck.rxMBps * 8;
    const txMbps = this.lastCheck.txMBps * 8;
    const totalMbps = rxMbps + txMbps;

    return totalMbps >= thresholdMbps;
  }

  /**
   * Get network statistics summary
   */
  getStatistics() {
    if (this.history.length === 0) return null;

    const rxSpeeds = this.history.map(h => h.rxMBps);
    const txSpeeds = this.history.map(h => h.txMBps);
    const connections = this.history.map(h => h.activeConnections);

    const sumRx = rxSpeeds.reduce((a, b) => a + b, 0);
    const sumTx = txSpeeds.reduce((a, b) => a + b, 0);
    const sumConn = connections.reduce((a, b) => a + b, 0);

    return {
      currentRxMBps: this.lastCheck?.rxMBps || 0,
      currentTxMBps: this.lastCheck?.txMBps || 0,
      averageRxMBps: sumRx / rxSpeeds.length,
      averageTxMBps: sumTx / txSpeeds.length,
      maxRxMBps: Math.max(...rxSpeeds),
      maxTxMBps: Math.max(...txSpeeds),
      averageConnections: sumConn / connections.length,
      currentConnections: this.lastCheck?.activeConnections || 0,
      samples: this.history.length
    };
  }

  /**
   * Detect unusual network activity
   */
  detectUnusualActivity() {
    if (this.history.length < 20) return null;

    const stats = this.getStatistics();
    const current = this.lastCheck;

    const alerts = [];

    // Check for bandwidth spikes (3x average)
    if (current.rxMBps > stats.averageRxMBps * 3) {
      alerts.push({
        type: 'bandwidth_spike_rx',
        current: current.rxMBps,
        average: stats.averageRxMBps
      });
    }

    if (current.txMBps > stats.averageTxMBps * 3) {
      alerts.push({
        type: 'bandwidth_spike_tx',
        current: current.txMBps,
        average: stats.averageTxMBps
      });
    }

    // Check for connection spikes (2x average)
    if (current.activeConnections > stats.averageConnections * 2) {
      alerts.push({
        type: 'connection_spike',
        current: current.activeConnections,
        average: stats.averageConnections
      });
    }

    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Reset history
   */
  reset() {
    this.history = [];
    this.lastCheck = null;
    this.lastStats = null;
  }
}

module.exports = new NetworkMonitor();
