/**
 * UPS Email Parser
 * 
 * Parses UPS shipping notification emails to extract tracking numbers,
 * shipment details, and automatically create shipment records.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');

// Gmail configuration (reuse from gmail-fetcher)
const GMAIL_CONFIG = {
  user: process.env.GMAIL_USER || '',
  password: process.env.GMAIL_APP_PASSWORD || '',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  authTimeout: 30000,  // 30 seconds for auth (default is too short)
  connTimeout: 30000   // 30 seconds for connection
};

// UPS tracking number patterns
const UPS_TRACKING_PATTERNS = [
  /1Z[A-Z0-9]{16}/gi,           // Standard UPS (1Z + 16 alphanumeric)
  /\b[A-Z]{2}\d{9}US\b/gi,      // USPS via UPS Mail Innovations
  /\d{18,22}/g                   // Numeric tracking (some UPS services)
];

// Common UPS sender patterns
const UPS_SENDERS = [
  'ups@ups.com',
  'pkginfo@ups.com',
  'auto-notify@ups.com',
  'mcinfo@ups.com',
  'no-reply@ups.com',
  'upsemail@ups.com'
];

class UPSEmailParser {
  constructor(config = GMAIL_CONFIG) {
    this.config = config;
    this.imap = null;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds between retries
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap(this.config);

      this.imap.once('ready', () => {
        console.log('Connected to Gmail for UPS emails');
        resolve();
      });

      this.imap.once('error', (err) => {
        console.error('IMAP error:', err);
        reject(err);
      });

      this.imap.once('end', () => {
        console.log('IMAP connection ended');
      });

      this.imap.connect();
    });
  }

  // Connect with retry logic for transient failures
  async connectWithRetry() {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.connect();
        return; // Success
      } catch (err) {
        lastError = err;
        const isTimeout = err.source === 'timeout-auth' || err.message?.includes('timeout');

        if (isTimeout && attempt < this.maxRetries) {
          console.log(`IMAP connection attempt ${attempt}/${this.maxRetries} failed (timeout), retrying in ${this.retryDelay/1000}s...`);
          await this.sleep(this.retryDelay);
        } else if (!isTimeout) {
          // Non-timeout error, don't retry
          throw err;
        }
      }
    }
    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    if (this.imap) {
      this.imap.end();
    }
  }

  openMailbox(mailbox = 'INBOX') {
    return new Promise((resolve, reject) => {
      this.imap.openBox(mailbox, false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  // Search for UPS emails
  searchUPSEmails(daysBack = 7) {
    return new Promise((resolve, reject) => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);
      const dateStr = sinceDate.toISOString().split('T')[0];

      // Search criteria: from UPS or subject contains UPS/tracking
      const searchCriteria = [
        ['OR',
          ['FROM', 'ups.com'],
          ['OR',
            ['SUBJECT', 'UPS'],
            ['SUBJECT', 'shipment']
          ]
        ],
        ['SINCE', dateStr]
      ];

      this.imap.search(searchCriteria, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  // Fetch email content
  fetchEmail(messageId) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(messageId, { bodies: '' });

      fetch.on('message', (msg) => {
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        });
      });

      fetch.once('error', reject);
    });
  }

  // Delete email by moving to trash
  deleteEmail(messageId) {
    return new Promise((resolve, reject) => {
      this.imap.addFlags(messageId, ['\\Deleted'], (err) => {
        if (err) {
          reject(err);
        } else {
          this.imap.expunge((expErr) => {
            if (expErr) reject(expErr);
            else resolve();
          });
        }
      });
    });
  }

  // Delete multiple emails
  async deleteEmails(messageIds) {
    const results = { deleted: 0, errors: [] };
    for (const msgId of messageIds) {
      try {
        await this.deleteEmail(msgId);
        results.deleted++;
      } catch (err) {
        results.errors.push({ msgId, error: err.message });
      }
    }
    return results;
  }

  // Extract tracking numbers from email
  extractTrackingNumbers(text) {
    const trackingNumbers = new Set();

    for (const pattern of UPS_TRACKING_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Clean and validate
          const clean = match.trim().toUpperCase();
          if (this.isValidTrackingNumber(clean)) {
            trackingNumbers.add(clean);
          }
        });
      }
    }

    return Array.from(trackingNumbers);
  }

  // Extract tracking numbers from attachments (text/csv filenames or bodies)
  extractTrackingFromAttachments(attachments = []) {
    const trackingNumbers = new Set();

    attachments.forEach((attachment) => {
      if (attachment?.filename) {
        this.extractTrackingNumbers(attachment.filename).forEach(t => trackingNumbers.add(t));
      }

      if (attachment?.content && attachment.contentType && /text|csv|html|plain/i.test(attachment.contentType)) {
        try {
          const contentText = attachment.content.toString('utf8');
          this.extractTrackingNumbers(contentText).forEach(t => trackingNumbers.add(t));
        } catch (e) {
          console.error('Error reading attachment content:', e.message);
        }
      }
    });

    return Array.from(trackingNumbers);
  }

  // Validate tracking number format
  isValidTrackingNumber(tracking) {
    // UPS 1Z format
    if (/^1Z[A-Z0-9]{16}$/.test(tracking)) return true;
    // Numeric format (18-22 digits)
    if (/^\d{18,22}$/.test(tracking)) return true;
    // USPS format
    if (/^[A-Z]{2}\d{9}US$/.test(tracking)) return true;
    return false;
  }

  // Parse shipment details from email
  parseShipmentDetails(email) {
    const details = {
      from: '',
      subject: email.subject || '',
      date: email.date ? new Date(email.date) : new Date(),
      trackingNumbers: [],
      customerName: '',
      address: '',
      estimatedDelivery: null,
      shipper: '',
      origin: '',
      destination: '',
      service: '',
      weight: null,
      notes: ''
    };

    // Get plain text and HTML content
    const text = email.text || '';
    const html = email.html || '';
    const combinedText = text + ' ' + html.replace(/<[^>]*>/g, ' ');

    // Extract tracking numbers
    details.trackingNumbers = this.extractTrackingNumbers(combinedText);

    // Also check attachment bodies/filenames for tracking numbers
    const attachmentTrackings = this.extractTrackingFromAttachments(email.attachments || []);
    if (attachmentTrackings.length) {
      details.trackingNumbers = [...new Set([...details.trackingNumbers, ...attachmentTrackings])];
    }

    // Extract shipper/sender
    const shipperMatch = combinedText.match(/(?:From|Shipper|Sender)[:\s]+([A-Za-z0-9\s&,.-]+?)(?:\n|<|$)/i);
    if (shipperMatch) {
      details.shipper = shipperMatch[1].trim().substring(0, 50);
    }

    // Extract estimated delivery
    const deliveryMatch = combinedText.match(/(?:Scheduled Delivery|Delivery Date|Expected Delivery|Est\. Delivery)[:\s]+([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (deliveryMatch) {
      try {
        details.estimatedDelivery = new Date(deliveryMatch[1]);
      } catch (e) {}
    }

    // Extract weight
    const weightMatch = combinedText.match(/(?:Weight)[:\s]+(\d+\.?\d*)\s*(?:lbs?|pounds?|kg)/i);
    if (weightMatch) {
      details.weight = parseFloat(weightMatch[1]);
    }

    // Extract service type
    const serviceMatch = combinedText.match(/(?:Service|Ship Method|Shipping)[:\s]+((?:UPS\s)?(?:Ground|Next Day Air|2nd Day Air|3 Day Select|Express|Standard|SurePost|Mail Innovations))/i);
    if (serviceMatch) {
      details.service = serviceMatch[1].trim();
    }

    // Extract origin (store/location)
    const originMatch = combinedText.match(/(?:Origin|Ship From)[:\s]+([A-Za-z0-9\s,.-]+?)(?:\n|<|$)/i);
    if (originMatch) {
      details.origin = originMatch[1].trim().substring(0, 100);
    }

    // Extract destination
    const destMatch = combinedText.match(/(?:Destination|Ship To|Deliver To)[:\s]+([A-Za-z0-9\s,.-]+?)(?:\n|<|$)/i);
    if (destMatch) {
      details.destination = destMatch[1].trim().substring(0, 100);
    }

    // Fallbacks for customer and address
    if (!details.customerName && details.destination) {
      details.customerName = details.destination.split(/[\n<]/)[0].trim();
    }

    if (!details.address && details.destination) {
      details.address = details.destination;
    }

    details.notes = `Auto-imported from UPS email${email.subject ? `: ${email.subject}` : ''}`;

    return details;
  }

  // Load existing shipments
  loadShipments() {
    try {
      if (fs.existsSync(SHIPMENTS_FILE)) {
        return JSON.parse(fs.readFileSync(SHIPMENTS_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading shipments:', err);
    }
    return [];
  }

  // Save shipments
  saveShipments(shipments) {
    const dir = path.dirname(SHIPMENTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SHIPMENTS_FILE, JSON.stringify(shipments, null, 2));
  }

  // Create shipment record from parsed email
  createShipmentRecord(details, existingShipments) {
    const newShipments = [];

    for (const tracking of details.trackingNumbers) {
      // Check if tracking already exists
      const exists = existingShipments.some(s => 
        s.tracking === tracking || 
        s.trackingNumber === tracking
      );

      if (!exists) {
        const createdAt = details.date instanceof Date ? details.date.toISOString() : new Date().toISOString();
        const customerName = details.customerName || details.destination || details.shipper || 'UPS Shipment';
        const address = details.address || details.destination || details.origin || '';

        const shipment = {
          id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tracking: tracking,
          trackingNumber: tracking,
          trackingLink: `https://www.ups.com/track?tracknum=${tracking}`,
          carrier: 'UPS',
          status: 'in-transit',
          source: 'email-import',
          importedAt: new Date().toISOString(),
          createdAt,
          shippedAt: createdAt,
          customerName,
          address,
          employeeName: 'AutoFill\\SF-Email',
          notes: details.notes || `Auto-imported from email: ${details.subject}`,
          emailSubject: details.subject,
          emailDate: createdAt,
          estimatedDelivery: details.estimatedDelivery?.toISOString() || null,
          shipper: details.shipper,
          service: details.service,
          weight: details.weight,
          origin: details.origin,
          destination: details.destination
        };

        newShipments.push(shipment);
        console.log(`Created shipment for tracking: ${tracking}`);
      } else {
        console.log(`Tracking ${tracking} already exists, skipping`);
      }
    }

    return newShipments;
  }

  // Main function to fetch and process UPS emails
  async fetchAndImportShipments(daysBack = 7, deleteAfterImport = true) {
    const results = {
      success: false,
      emailsProcessed: 0,
      shipmentsCreated: 0,
      trackingNumbers: [],
      createdShipments: [],
      emailsDeleted: 0,
      errors: []
    };

    try {
      await this.connectWithRetry();
      await this.openMailbox('INBOX');

      const messageIds = await this.searchUPSEmails(daysBack);
      console.log(`Found ${messageIds.length} potential UPS emails`);

      const existingShipments = this.loadShipments();
      const newShipments = [];
      const processedMessageIds = [];

      for (const msgId of messageIds) {
        try {
          const email = await this.fetchEmail(msgId);
          
          // Skip if not from UPS
          const fromAddr = email.from?.value?.[0]?.address || '';
          const isFromUPS = UPS_SENDERS.some(s => 
            fromAddr.toLowerCase().includes(s.replace('@ups.com', '').toLowerCase())
          ) || fromAddr.toLowerCase().includes('ups.com');

          if (!isFromUPS && !email.subject?.toLowerCase().includes('ups')) {
            continue;
          }

          console.log(`Processing UPS email: ${email.subject}`);
          results.emailsProcessed++;

          const details = this.parseShipmentDetails(email);
          
          if (details.trackingNumbers.length > 0) {
            results.trackingNumbers.push(...details.trackingNumbers);
            const created = this.createShipmentRecord(details, [...existingShipments, ...newShipments]);
            newShipments.push(...created);
            processedMessageIds.push(msgId);
          }
        } catch (err) {
          console.error(`Error processing email ${msgId}:`, err.message);
          results.errors.push(err.message);
        }
      }

      // Save new shipments
      if (newShipments.length > 0) {
        const allShipments = [...existingShipments, ...newShipments];
        this.saveShipments(allShipments);
        results.shipmentsCreated = newShipments.length;
        results.createdShipments = newShipments;
      }

      // Delete processed emails if enabled
      if (deleteAfterImport && processedMessageIds.length > 0) {
        console.log(`Deleting ${processedMessageIds.length} processed UPS emails...`);
        const deleteResults = await this.deleteEmails(processedMessageIds);
        results.emailsDeleted = deleteResults.deleted;
        if (deleteResults.errors.length > 0) {
          results.errors.push(...deleteResults.errors.map(e => `Delete error: ${e.error}`));
        }
      }

      results.success = true;
      results.trackingNumbers = [...new Set(results.trackingNumbers)];

    } catch (err) {
      // Graceful error handling - log but don't crash
      const isTimeout = err.source === 'timeout-auth' || err.message?.includes('timeout');
      if (isTimeout) {
        console.warn('Warning: IMAP connection timed out after retries, will try again next scheduled run');
      } else {
        console.error('Error fetching UPS emails:', err);
      }
      results.errors.push(err.message);
      results.success = false; // Explicitly mark as failed but don't throw
    } finally {
      this.disconnect();
    }

    return results;
  }

  // Manual tracking number import (without email)
  importTrackingNumber(tracking, details = {}) {
    const shipments = this.loadShipments();
    
    // Check if exists
    const exists = shipments.some(s => 
      s.tracking === tracking || 
      s.trackingNumber === tracking
    );

    if (exists) {
      return { success: false, error: 'Tracking number already exists' };
    }

    const shipment = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tracking: tracking,
      trackingNumber: tracking,
      carrier: details.carrier || 'UPS',
      status: 'pending',
      source: 'manual-import',
      importedAt: new Date().toISOString(),
      notes: details.notes || '',
      ...details
    };

    shipments.push(shipment);
    this.saveShipments(shipments);

    return { success: true, shipment };
  }
}

// Utility function for manual testing
async function testUPSEmailFetch() {
  const parser = new UPSEmailParser();

  console.log('Testing UPS email fetch...');
  console.log('Gmail user:', GMAIL_CONFIG.user || 'NOT SET');

  if (!GMAIL_CONFIG.user || !GMAIL_CONFIG.password) {
    console.log('\nPlease set environment variables:');
    console.log('  export GMAIL_USER="your-email@gmail.com"');
    console.log('  export GMAIL_APP_PASSWORD="your-app-password"');
    return;
  }

  try {
    const result = await parser.fetchAndImportShipments(7);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Test failed:', err);
  }
}

module.exports = { UPSEmailParser, testUPSEmailFetch };
