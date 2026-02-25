/**
 * Universal Printer Client
 * 
 * Supports multiple printer types:
 * - Zebra ZPL (barcode labels, shipping labels)
 * - Epson ESC/POS (receipts)
 * - Auto-discovery on local network
 * 
 * Developer: Victor Rocha, Stockroom Manager @ Suit Supply
 */

const net = require('net');
const dgram = require('dgram');
const axios = require('axios');

class PrinterClient {
  constructor() {
    // Printer registry (auto-discovered or manually configured)
    this.printers = new Map();
    
    // Default ports
    this.ZEBRA_PORT = 9100;  // ZPL raw TCP
    this.EPSON_PORT = 9100;   // ESC/POS raw TCP
    this.USB_PRINT_SERVER_PORT = 9100; // USB print server port
    
    // Printer types
    this.PRINTER_TYPES = {
      ZEBRA_ZPL: 'zebra_zpl',
      ZEBRA_USB: 'zebra_usb',  // USB via print server (ZP450, etc.)
      EPSON_ESCPOS: 'epson_escpos'
    };
    
    // USB printer configurations (via StarTech PM1115U2 or similar print servers)
    this.usbPrinterServers = new Map();
  }

  // ============================================================================
  // PRINTER DISCOVERY
  // ============================================================================

  /**
   * Auto-discover Zebra printers on local network
   * Uses SNMP and ZPL status queries
   */
  async discoverZebraPrinters() {
    console.log('🔍 Discovering Zebra printers...');
    const discovered = [];
    
    // Scan common IP ranges (customize for your network)
    const baseIP = process.env.NETWORK_BASE_IP || '10.201.40'; // From your CSV
    const startRange = parseInt(process.env.PRINTER_IP_START || '1');
    const endRange = parseInt(process.env.PRINTER_IP_END || '254');
    
    const promises = [];
    for (let i = startRange; i <= endRange; i++) {
      const ip = `${baseIP}.${i}`;
      promises.push(this.testZebraPrinter(ip));
    }
    
    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const ip = `${baseIP}.${startRange + index}`;
        discovered.push({
          ip,
          type: this.PRINTER_TYPES.ZEBRA_ZPL,
          model: result.value.model || 'Zebra Printer',
          status: 'online'
        });
        this.registerPrinter(ip, this.PRINTER_TYPES.ZEBRA_ZPL, result.value.model);
      }
    });
    
    console.log(`✅ Found ${discovered.length} Zebra printer(s)`);
    return discovered;
  }

  /**
   * Test if IP has a Zebra printer
   */
  async testZebraPrinter(ip, timeout = 1000) {
    return new Promise((resolve) => {
      const client = new net.Socket();
      const timer = setTimeout(() => {
        client.destroy();
        resolve(null);
      }, timeout);
      
      client.connect(this.ZEBRA_PORT, ip, () => {
        clearTimeout(timer);
        // Send ZPL status query
        client.write('~HQES\r\n'); // Host Query Extended Status
        
        let response = '';
        client.on('data', (data) => {
          response += data.toString();
          client.end();
        });
        
        client.on('close', () => {
          if (response.length > 0) {
            resolve({ model: this.parseZebraModel(response) });
          } else {
            resolve(null);
          }
        });
      });
      
      client.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  /**
   * Parse Zebra model from status response
   */
  parseZebraModel(response) {
    if (response.includes('ZQ520')) return 'Zebra ZQ520';
    if (response.includes('ZT410')) return 'Zebra ZT410';
    if (response.includes('ZD420')) return 'Zebra ZD420';
    return 'Zebra Printer';
  }

  /**
   * Register printer manually
   */
  registerPrinter(ip, type, model = 'Unknown', options = {}) {
    this.printers.set(ip, {
      ip,
      type,
      model,
      lastUsed: null,
      status: 'online',
      usbPrintServer: options.usbPrintServer || false, // StarTech PM1115U2 or similar
      usbPort: options.usbPort || null, // USB port on print server (e.g., 'usb1')
      ...options
    });
    console.log(`📝 Registered printer: ${model} at ${ip}${options.usbPrintServer ? ' (via USB print server)' : ''}`);
  }
  
  /**
   * Register USB printer via print server
   * 
   * For USB printers (like Zebra ZP450) connected via StarTech PM1115U2
   * or similar USB-to-network print server
   * 
   * @param {string} printServerIp - IP address of print server (e.g., '10.201.40.50')
   * @param {string} usbPort - USB port name (e.g., 'USB1', 'LPT1')
   * @param {string} model - Printer model (e.g., 'Zebra ZP450')
   */
  registerUSBPrinter(printServerIp, usbPort = 'USB1', model = 'USB Printer') {
    const printerId = `${printServerIp}:${usbPort}`;
    this.registerPrinter(printServerIp, this.PRINTER_TYPES.ZEBRA_USB, model, {
      usbPrintServer: true,
      usbPort,
      printServerId: printerId
    });
    console.log(`🔌 Registered USB printer: ${model} on ${printServerIp} port ${usbPort}`);
  }

  /**
   * Get all registered printers
   */
  getPrinters() {
    return Array.from(this.printers.values());
  }

  /**
   * Get default printer (last used or first available)
   */
  getDefaultPrinter(type = null) {
    const printers = this.getPrinters();
    if (type) {
      return printers.find(p => p.type === type) || null;
    }
    return printers.sort((a, b) => {
      if (!a.lastUsed) return 1;
      if (!b.lastUsed) return -1;
      return new Date(b.lastUsed) - new Date(a.lastUsed);
    })[0] || null;
  }

  // ============================================================================
  // ZEBRA ZPL PRINTING
  // ============================================================================

  /**
   * Print ZPL label to Zebra printer
   */
  async printZPL(zplContent, printerIp = null, printerPort = null) {
    const printer = printerIp 
      ? this.printers.get(printerIp) || { ip: printerIp, type: this.PRINTER_TYPES.ZEBRA_ZPL }
      : this.getDefaultPrinter(this.PRINTER_TYPES.ZEBRA_ZPL);
    
    if (!printer) {
      throw new Error('No Zebra printer available. Run discovery or register manually.');
    }
    
    const ip = printer.ip;
    const port = printerPort || this.ZEBRA_PORT;
    
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      
      client.connect(port, ip, () => {
        console.log(`[Zebra] Connected to ${ip}:${port}`);
        client.write(zplContent);
        client.end();
      });
      
      client.on('close', () => {
        console.log('[Zebra] Label sent successfully');
        if (this.printers.has(ip)) {
          this.printers.get(ip).lastUsed = new Date();
        }
        resolve({ success: true, printer: ip });
      });
      
      client.on('error', (err) => {
        console.error('[Zebra] Print error:', err.message);
        reject(new Error(`Failed to print to ${ip}: ${err.message}`));
      });
    });
  }

  /**
   * Generate product barcode label (ZPL)
   */
  generateProductLabel(sku, description, price, barcode) {
    // 2" x 1" label (203 DPI) - adjust for your label size
    return `^XA
^FO50,20^A0N,30,30^FD${description}^FS
^FO50,60^BY2^BCN,60,N,N,N^FD${barcode}^FS
^FO50,130^A0N,25,25^FDSKU: ${sku}^FS
^FO200,130^A0N,25,25^FD$${price}^FS
^XZ`;
  }

  /**
   * Generate shelf location label (ZPL)
   */
  generateShelfLabel(location, zone, capacity) {
    return `^XA
^FO50,20^A0N,40,40^FD${location}^FS
^FO50,70^A0N,30,30^FDZone: ${zone}^FS
^FO50,110^BY3^BCN,80,N,N,N^FD${location}^FS
^FO50,200^A0N,25,25^FDCapacity: ${capacity}^FS
^XZ`;
  }

  /**
   * Generate RFID tag label (ZPL with RFID encoding)
   */
  generateRFIDLabel(sgtin, sku, description) {
    return `^XA
^RF${sgtin}^FS
^FO50,20^A0N,30,30^FD${description}^FS
^FO50,60^A0N,25,25^FDSKU: ${sku}^FS
^FO50,90^BY2^BCN,60,N,N,N^FD${sgtin}^FS
^XZ`;
  }

  // ============================================================================
  // EPSON ESC/POS PRINTING (Receipts)
  // ============================================================================

  /**
   * Print receipt to Epson printer
   */
  async printReceipt(receiptData, printerIp = null) {
    const printer = printerIp
      ? { ip: printerIp, type: this.PRINTER_TYPES.EPSON_ESCPOS }
      : this.getDefaultPrinter(this.PRINTER_TYPES.EPSON_ESCPOS);
    
    if (!printer) {
      throw new Error('No Epson printer configured');
    }
    
    const escposCommands = this.generateReceiptESCPOS(receiptData);
    
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      
      client.connect(this.EPSON_PORT, printer.ip, () => {
        console.log(`[Epson] Connected to ${printer.ip}`);
        client.write(escposCommands);
        client.end();
      });
      
      client.on('close', () => {
        console.log('[Epson] Receipt printed successfully');
        resolve({ success: true, printer: printer.ip });
      });
      
      client.on('error', (err) => {
        console.error('[Epson] Print error:', err.message);
        reject(new Error(`Failed to print receipt: ${err.message}`));
      });
    });
  }

  /**
   * Print freezer label receipt to Epson printer
   */
  async printFreezerLabel(labelData, printerIp = null) {
    const printer = printerIp
      ? { ip: printerIp, type: this.PRINTER_TYPES.EPSON_ESCPOS }
      : this.getDefaultPrinter(this.PRINTER_TYPES.EPSON_ESCPOS);

    if (!printer) {
      throw new Error('No Epson printer configured');
    }

    const escposCommands = this.generateFreezerLabelESCPOS(labelData);

    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(this.EPSON_PORT, printer.ip, () => {
        console.log(`[Epson] Connected to ${printer.ip}`);
        client.write(escposCommands);
        client.end();
      });

      client.on('close', () => {
        console.log('[Epson] Freezer label printed successfully');
        resolve({ success: true, printer: printer.ip });
      });

      client.on('error', (err) => {
        console.error('[Epson] Print error:', err.message);
        reject(new Error(`Failed to print receipt: ${err.message}`));
      });
    });
  }

  /**
   * Generate ESC/POS commands for order receipt
   */
  generateReceiptESCPOS(data) {
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let receipt = '';
    
    // Initialize printer
    receipt += ESC + '@';
    
    // Center align, bold
    receipt += ESC + 'a' + '\x01';
    receipt += ESC + 'E' + '\x01';
    
    // Store header
    receipt += '\n';
    receipt += 'SUIT SUPPLY\n';
    receipt += 'San Francisco\n';
    receipt += '150 Maiden Lane\n';
    receipt += '\n';
    
    // Reset formatting
    receipt += ESC + 'E' + '\x00';
    receipt += ESC + 'a' + '\x00';
    
    // Order info
    receipt += '--------------------------------\n';
    receipt += `Order: ${data.orderNumber || data.psuNumber}\n`;
    receipt += `Date: ${new Date().toLocaleString()}\n`;
    receipt += `Customer: ${data.customerName || '—'}\n`;
    receipt += '--------------------------------\n';
    receipt += '\n';
    
    // Items
    receipt += 'ITEMS:\n';
    (data.items || []).forEach(item => {
      receipt += `${item.description}\n`;
      receipt += `  SKU: ${item.sku}  $${item.price}\n`;
    });
    
    receipt += '\n';
    receipt += '--------------------------------\n';
    
    // Total
    receipt += ESC + 'E' + '\x01'; // Bold
    receipt += `TOTAL: $${data.total || '0.00'}\n`;
    receipt += ESC + 'E' + '\x00'; // Normal
    
    receipt += '--------------------------------\n';
    receipt += '\n';
    
    // Footer
    receipt += ESC + 'a' + '\x01'; // Center
    receipt += 'Thank you!\n';
    receipt += 'BOH Reprint\n';
    receipt += '\n\n\n';
    
    // Cut paper
    receipt += GS + 'V' + '\x41' + '\x03';
    
    return Buffer.from(receipt, 'utf8');
  }

  /**
   * Generate ESC/POS commands for freezer label
   */
  generateFreezerLabelESCPOS(data = {}) {
    const ESC = '\x1B';
    const GS = '\x1D';

    const safe = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

    let receipt = '';
    receipt += ESC + '@';

    // Title centered + bold
    receipt += ESC + 'a' + '\x01';
    receipt += ESC + 'E' + '\x01';
    receipt += 'FREEZER LABEL\n';
    receipt += ESC + 'E' + '\x00';
    receipt += ESC + 'a' + '\x00';

    receipt += '------------------------------\n';
    receipt += `Food: ${safe(data.foodItem)}\n`;
    receipt += `Name: ${safe(data.fullName)}\n`;
    receipt += `Email: ${safe(data.email)}\n`;
    receipt += `Created by: ${safe(data.createdBy)}\n`;
    receipt += `Created: ${safe(data.createdAt)}\n`;
    receipt += `Expires (${safe(data.expirationDays)} days): ${safe(data.expiresAt)}\n`;
    receipt += '------------------------------\n';
    receipt += `Notes: ${safe(data.notes)}\n`;
    receipt += `${safe(data.warning || 'All food after the valid date will be thrown away.')}\n`;
    receipt += '\n';

    receipt += ESC + 'a' + '\x01';
    receipt += 'Please keep label on item\n';
    receipt += ESC + 'a' + '\x00';
    receipt += '\n\n\n';

    // Cut paper
    receipt += GS + 'V' + '\x41' + '\x03';

    return Buffer.from(receipt, 'utf8');
  }

  // ============================================================================
  // NETWORK CONFIGURATION
  // ============================================================================

  /**
   * Test printer connectivity
   */
  async testPrinter(ip, port = null) {
    const testPort = port || this.ZEBRA_PORT;
    
    return new Promise((resolve) => {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ online: false, error: 'Connection timeout' });
      }, 3000);
      
      client.connect(testPort, ip, () => {
        clearTimeout(timeout);
        client.end();
        resolve({ online: true });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ online: false, error: err.message });
      });
    });
  }

  /**
   * Get printer status
   */
  async getPrinterStatus(ip) {
    const printer = this.printers.get(ip);
    if (!printer) {
      return { status: 'unknown', message: 'Printer not registered' };
    }
    
    const test = await this.testPrinter(ip);
    return {
      ...printer,
      online: test.online,
      status: test.online ? 'ready' : 'offline',
      error: test.error
    };
  }
}

// Singleton instance
const printerClient = new PrinterClient();

module.exports = printerClient;
