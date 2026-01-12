/**
 * RFID Scanner Client
 * 
 * Supports Zebra RFD40+ and other RFID readers
 * Handles tag scanning, SGTIN parsing, and real-time events
 * 
 * Developer: Victor Rocha
 */

const EventEmitter = require('events');
const dgram = require('dgram');
const axios = require('axios');

class RFIDClient extends EventEmitter {
  constructor() {
    super();
    
    // RFID reader connections
    this.readers = new Map();
    
    // Active scanning sessions
    this.scanningSessions = new Map();
    
    // UDP server for RFID events (if using network mode)
    this.udpPort = process.env.RFID_UDP_PORT || 3040;
    this.udpServer = null;
    
    // Tag history (deduplication)
    this.tagHistory = new Map();
    this.tagTimeout = 5000; // ms to consider tag "new" again
  }

  // ============================================================================
  // READER MANAGEMENT
  // ============================================================================

  /**
   * Register RFID reader
   */
  registerReader(readerId, config = {}) {
    this.readers.set(readerId, {
      id: readerId,
      type: config.type || 'RFD40+',
      ipAddress: config.ipAddress,
      connected: false,
      lastSeen: null,
      power: config.power || 27, // dBm
      sessionFlag: config.sessionFlag || 1,
      ...config
    });
    
    console.log(`[RFID] Registered reader: ${readerId}`);
  }

  /**
   * Get all registered readers
   */
  getReaders() {
    return Array.from(this.readers.values());
  }

  /**
   * Connect to RFID reader
   */
  async connectReader(readerId) {
    const reader = this.readers.get(readerId);
    if (!reader) {
      throw new Error('Reader not found');
    }
    
    // For Zebra RFD40+, connection is via SDK or REST API
    // Placeholder for actual SDK integration
    reader.connected = true;
    reader.lastSeen = new Date();
    
    console.log(`[RFID] Connected to reader: ${readerId}`);
    this.emit('reader_connected', { readerId });
    
    return reader;
  }

  /**
   * Disconnect RFID reader
   */
  async disconnectReader(readerId) {
    const reader = this.readers.get(readerId);
    if (reader) {
      reader.connected = false;
      console.log(`[RFID] Disconnected reader: ${readerId}`);
      this.emit('reader_disconnected', { readerId });
    }
  }

  // ============================================================================
  // SCANNING
  // ============================================================================

  /**
   * Start continuous scanning
   */
  async startScanning(readerId, options = {}) {
    const reader = this.readers.get(readerId);
    if (!reader) {
      throw new Error('Reader not found');
    }
    
    if (!reader.connected) {
      await this.connectReader(readerId);
    }
    
    const sessionId = `${readerId}_${Date.now()}`;
    const session = {
      id: sessionId,
      readerId,
      startTime: new Date(),
      tagsScanned: 0,
      active: true,
      mode: options.mode || 'continuous',
      filter: options.filter || null
    };
    
    this.scanningSessions.set(sessionId, session);
    
    console.log(`[RFID] Started scanning session: ${sessionId}`);
    this.emit('scan_started', { sessionId, readerId });
    
    // Start UDP listener for RFID events
    if (!this.udpServer) {
      this.startUDPListener();
    }
    
    return sessionId;
  }

  /**
   * Stop scanning
   */
  async stopScanning(sessionId) {
    const session = this.scanningSessions.get(sessionId);
    if (!session) {
      throw new Error('Scanning session not found');
    }
    
    session.active = false;
    session.endTime = new Date();
    
    console.log(`[RFID] Stopped scanning session: ${sessionId} (${session.tagsScanned} tags)`);
    this.emit('scan_stopped', { 
      sessionId, 
      tagsScanned: session.tagsScanned,
      duration: session.endTime - session.startTime
    });
    
    return session;
  }

  /**
   * Single tag read
   */
  async readSingleTag(readerId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener('tag_read', handler);
        reject(new Error('Tag read timeout'));
      }, timeout);
      
      const handler = (data) => {
        if (data.readerId === readerId) {
          clearTimeout(timer);
          this.removeListener('tag_read', handler);
          resolve(data.tag);
        }
      };
      
      this.on('tag_read', handler);
    });
  }

  // ============================================================================
  // TAG PROCESSING
  // ============================================================================

  /**
   * Process scanned RFID tag
   */
  processTag(readerId, rawData) {
    const tag = this.parseEPC(rawData);
    
    if (!tag) {
      console.warn('[RFID] Invalid tag data:', rawData);
      return;
    }
    
    // Deduplication check
    const tagKey = `${readerId}_${tag.epc}`;
    const lastSeen = this.tagHistory.get(tagKey);
    const now = Date.now();
    
    if (lastSeen && (now - lastSeen) < this.tagTimeout) {
      return; // Duplicate within timeout window
    }
    
    this.tagHistory.set(tagKey, now);
    
    // Update session stats
    const sessions = Array.from(this.scanningSessions.values())
      .filter(s => s.readerId === readerId && s.active);
    
    sessions.forEach(session => {
      session.tagsScanned++;
    });
    
    // Emit tag event
    const tagData = {
      readerId,
      tag,
      timestamp: new Date(),
      rssi: rawData.rssi || null,
      antennaId: rawData.antennaId || null
    };
    
    this.emit('tag_read', tagData);
    
    console.log(`[RFID] Tag read: ${tag.epc} (${tag.sku || 'unknown'})`);
    
    return tagData;
  }

  /**
   * Parse EPC (Electronic Product Code) to SGTIN
   */
  parseEPC(data) {
    const epc = data.epc || data.tagId || data;
    
    if (typeof epc !== 'string') {
      return null;
    }
    
    // Basic EPC parsing (SGTIN-96)
    // Format: urn:epc:tag:sgtin-96:1.0037000.065432.1234567890
    
    if (epc.startsWith('urn:epc')) {
      const parts = epc.split(':');
      const [filter, company, itemRef, serial] = parts.slice(-4);
      
      return {
        epc,
        format: 'sgtin-96',
        companyPrefix: company,
        itemReference: itemRef,
        serialNumber: serial,
        sku: `${company}${itemRef}`, // Simplified
        raw: epc
      };
    }
    
    // Hex format (24 chars for SGTIN-96)
    if (/^[0-9A-Fa-f]{24}$/.test(epc)) {
      return {
        epc,
        format: 'hex',
        raw: epc,
        sku: null // Parse from hex if needed
      };
    }
    
    // Fallback: treat as raw tag ID
    return {
      epc,
      format: 'raw',
      raw: epc,
      sku: null
    };
  }

  /**
   * Lookup SKU from tag
   */
  async lookupSKU(tag) {
    // Query database for SKU mapping
    // Placeholder - implement with your inventory system
    return null;
  }

  // ============================================================================
  // UDP LISTENER (for network RFID readers)
  // ============================================================================

  /**
   * Start UDP listener for RFID events
   */
  startUDPListener() {
    if (this.udpServer) {
      return;
    }
    
    this.udpServer = dgram.createSocket('udp4');
    
    this.udpServer.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        
        if (data.type === 'rfid_tag') {
          this.processTag(data.readerId || 'default', data);
        }
      } catch (error) {
        console.error('[RFID] UDP message parse error:', error);
      }
    });
    
    this.udpServer.on('error', (err) => {
      console.error('[RFID] UDP server error:', err);
    });
    
    this.udpServer.bind(this.udpPort, () => {
      console.log(`[RFID] UDP listener started on port ${this.udpPort}`);
    });
  }

  /**
   * Stop UDP listener
   */
  stopUDPListener() {
    if (this.udpServer) {
      this.udpServer.close();
      this.udpServer = null;
      console.log('[RFID] UDP listener stopped');
    }
  }

  // ============================================================================
  // INVENTORY OPERATIONS
  // ============================================================================

  /**
   * Perform inventory scan (bulk read)
   */
  async performInventoryScan(readerId, options = {}) {
    const sessionId = await this.startScanning(readerId, {
      mode: 'inventory',
      ...options
    });
    
    const tags = [];
    const duration = options.duration || 10000; // 10 seconds default
    
    const handler = (data) => {
      if (data.readerId === readerId) {
        tags.push(data.tag);
      }
    };
    
    this.on('tag_read', handler);
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    this.removeListener('tag_read', handler);
    await this.stopScanning(sessionId);
    
    return {
      sessionId,
      tags,
      count: tags.length,
      duration
    };
  }

  /**
   * Verify item presence (quick check)
   */
  async verifyItem(readerId, expectedSKU, timeout = 3000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.removeListener('tag_read', handler);
        resolve({ found: false, sku: expectedSKU });
      }, timeout);
      
      const handler = (data) => {
        if (data.readerId === readerId && data.tag.sku === expectedSKU) {
          clearTimeout(timer);
          this.removeListener('tag_read', handler);
          resolve({ found: true, tag: data.tag });
        }
      };
      
      this.on('tag_read', handler);
    });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Clear tag history (reset deduplication)
   */
  clearTagHistory() {
    this.tagHistory.clear();
    console.log('[RFID] Tag history cleared');
  }

  /**
   * Get scanning statistics
   */
  getStats() {
    const sessions = Array.from(this.scanningSessions.values());
    const activeSessions = sessions.filter(s => s.active);
    
    return {
      readers: this.readers.size,
      connectedReaders: Array.from(this.readers.values()).filter(r => r.connected).length,
      activeSessions: activeSessions.length,
      totalSessions: sessions.length,
      totalTagsScanned: sessions.reduce((sum, s) => sum + s.tagsScanned, 0),
      tagHistorySize: this.tagHistory.size
    };
  }
}

// Singleton instance
const rfidClient = new RFIDClient();

module.exports = rfidClient;
