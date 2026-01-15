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

// Ensure environment variables are loaded for standalone script execution
// This will be a no-op if dotenv is already configured by the main app
require('dotenv').config();

const { getDataDir } = require('./paths');
const pgDal = require('./dal/pg');

const DATA_DIR = getDataDir();

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

function extractPSUSNumber(input) {
  if (!input) return null;
  const cleaned = input.toString().toUpperCase().replace(/\s/g, '');
  const match = cleaned.match(/PSUS(\d{8})/);
  if (match) return `PSUS${match[1]}`;
  const match04 = cleaned.match(/(04\d{6})/);
  if (match04) return `PSUS${match04[1]}`;
  return null;
}

function normalizeLine(line) {
  return (line || '').toString().replace(/\s+/g, ' ').trim();
}

function cleanReferenceValue(raw) {
  const line = normalizeLine(raw);
  if (!line) return '';
  // Keep only basic reference characters; HTML stripping can concatenate tokens.
  let cleaned = line.replace(/[^A-Za-z0-9-]/g, '');
  cleaned = cleaned.replace(/reference$/i, '');
  return cleaned;
}

function normalizeEmployeeId(raw) {
  // Employee IDs in the system are typically short alnum strings (e.g. 6543, jayuy).
  const ref = cleanReferenceValue(raw);
  if (!ref) return '';
  return ref.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPlausibleServiceType(raw) {
  const s = normalizeLine(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.includes('trademark') || lower.includes('brandmark') || lower.includes('united parcel service')) return false;
  if (lower.includes('the color brown') || lower.includes('of america') || lower.includes('inc.')) return false;
  if (s.length > 60) return false;
  return /(ground|air|next\s*day|second\s*day|3\s*day|saver|worldwide|surepost|express|expedited|standard)/i.test(s);
}

function parseShipToBlock(combinedText) {
  const text = (combinedText || '').toString();
  const m = text.match(/(?:^|\n)\s*Ship To:\s*([\s\S]*?)(?=\n\s*(?:UPS Service|Service|Number of Packages|Package Weight|Reference Number|Tracking Number|$))/i);
  if (!m || !m[1]) return null;

  const rawLines = m[1]
    .replace(/<[^>]*>/g, ' ')
    .split(/\r?\n/)
    .map(l => normalizeLine(l))
    .filter(Boolean);

  if (!rawLines.length) return null;

  const name = rawLines[0] || '';
  const rest = rawLines.slice(1);

  // Try to locate city/state/zip line
  let city = '';
  let state = '';
  let zip = '';
  let country = '';
  let line1 = '';
  let line2 = '';

  const cityLineIdx = rest.findIndex(l => /,\s*[A-Z]{2}\s+(\d{5}(-\d{4})?|\d{9})/.test(l));
  if (cityLineIdx !== -1) {
    const cityLine = rest[cityLineIdx];
    const cm = cityLine.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?|\d{9})/);
    if (cm) {
      city = normalizeLine(cm[1]);
      state = cm[2];
      zip = cm[3];
    }

    // Country is usually last line (after city line)
    const after = rest.slice(cityLineIdx + 1).filter(Boolean);
    if (after.length) country = after[after.length - 1];

    const addrLines = rest.slice(0, cityLineIdx).filter(Boolean);
    line1 = addrLines[0] || '';
    line2 = addrLines.slice(1).join(' ') || '';
  } else {
    // Fallback: last line is country, previous line maybe city/state/zip
    if (rest.length) country = rest[rest.length - 1];
    if (rest.length >= 2) {
      const maybeCity = rest[rest.length - 2];
      const cm = maybeCity.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?|\d{9})/);
      if (cm) {
        city = normalizeLine(cm[1]);
        state = cm[2];
        zip = cm[3];
      }
    }
    const addrLines = rest.slice(0, Math.max(0, rest.length - (country ? 1 : 0) - (city ? 1 : 0)));
    line1 = addrLines[0] || '';
    line2 = addrLines.slice(1).join(' ') || '';
  }

  return {
    customerName: name,
    address: {
      line1,
      line2,
      city,
      state,
      zip,
      country: country || 'US'
    }
  };
}

function tryParseDateFromString(raw) {
  if (!raw) return null;
  const s = raw.toString().replace(/\u00A0/g, ' ').trim();

  // Try native parse first
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Common textual formats: "January 5, 2026 3:00 PM", "Jan 5 2026 15:00"
  const textFmt = s.match(/([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)?)/);
  if (textFmt) {
    d = new Date(textFmt[1].replace(/\s+at\s+/i, ' '));
    if (!isNaN(d.getTime())) return d;
  }

  // Numeric formats: MM/DD/YYYY or M/D/YY (with optional time)
  const numFmt = s.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)?)/);
  if (numFmt) {
    d = new Date(numFmt[1]);
    if (!isNaN(d.getTime())) return d;
    // Try swapping day/month if ambiguous (treat as MM/DD first, then DD/MM)
    const parts = numFmt[1].split(' ')[0].split('/').map(p => parseInt(p, 10));
    if (parts.length >= 3) {
      const mm = parts[0], dd = parts[1], yy = parts[2];
      const iso = `${yy.toString().length===2 ? '20'+yy : yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // RFC style or ISO timestamp
  const iso = s.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  if (iso) {
    d = new Date(iso[1]);
    if (!isNaN(d.getTime())) return d;
  }

  // As a last resort try to extract words like "Fri, Jan 5, 2026 3:00 PM"
  const asOf = s.match(/(?:as of|updated[:\s])*([A-Za-z0-9,:\s]+(?:AM|PM|am|pm))/i);
  if (asOf) {
    d = new Date(asOf[1]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function mapStatusTextToInternal(statusText) {
  const s = (statusText || '').toString().toUpperCase();
  if (!s) return 'UNKNOWN';
  if (s.includes('DELIVERED')) return 'DELIVERED';
  if (s.includes('OUT FOR DELIVERY')) return 'IN_TRANSIT';
  if (s.includes('IN TRANSIT') || s.includes('ON THE WAY') || s.includes('DEPARTED') || s.includes('ARRIVED')) return 'IN_TRANSIT';
  if (s.includes('LABEL CREATED') || s.includes('SHIPMENT READY') || s.includes('READY FOR UPS')) return 'LABEL_CREATED';
  if (s.includes('EXCEPTION') || s.includes('DELAY') || s.includes('FAILED')) return 'EXCEPTION';
  return 'UNKNOWN';
}

function statusRank(status) {
  const order = { UNKNOWN: 0, REQUESTED: 1, PENDING: 1, LABEL_CREATED: 2, IN_TRANSIT: 3, DELIVERED: 4, EXCEPTION: 5 };
  return order[(status || '').toString().toUpperCase()] || 0;
}

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

  // Get all mailboxes
  getMailboxes() {
    return new Promise((resolve, reject) => {
      this.imap.getBoxes((err, boxes) => {
        if (err) reject(err);
        else resolve(boxes);
      });
    });
  }

  // Search for UPS emails
  searchUPSEmails(daysBack = 7) {
    return new Promise((resolve, reject) => {
      // If daysBack is null or 0, search ALL
      if (daysBack === null || daysBack === 0) {
        this.imap.search(['ALL'], (err, results) => {
          if (err) return reject(err);
          return resolve(results || []);
        });
        return;
      }

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);

      // Search criteria: from UPS or subject contains UPS/tracking
      const searchCriteria = [
        ['OR',
          ['FROM', 'ups.com'],
          ['OR',
            ['SUBJECT', 'UPS'],
            ['OR',
              ['SUBJECT', 'shipment'],
              ['OR',
                ['SUBJECT', 'delivered'],
                ['SUBJECT', 'out for delivery']
              ]
            ]
          ]
        ],
        // node-imap expects a Date (or a properly formatted IMAP date string).
        ['SINCE', sinceDate]
      ];

      this.imap.search(searchCriteria, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
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
      date: email.date ? new Date(email.date) : new Date(),
      trackingNumbers: [],
      customerName: '',
      address: null,
      estimatedDelivery: null,
      shipper: '',
      origin: '',
      destination: '',
      service: '',
      serviceType: '',
      packages: null,
      weight: null,
      reference1: '',
      reference2: '',
      orderNumber: '',
      statusText: '',
      notes: ''
    };

    // Get plain text and HTML content
    const text = email.text || '';
    const html = email.html || '';
    const combinedText = text + ' ' + html.replace(/<[^>]*>/g, ' ');

    // Capture a raw payload snapshot for later re-parsing or debugging
    try {
      details.raw = {
        subject: email.subject || '',
        date: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
        from: email.from?.value?.[0]?.address || '',
        to: email.to?.value || [],
        headers: email.headers && typeof email.headers === 'object' ? Object.fromEntries(email.headers) : null,
        text: text || '',
        html: html || ''
      };
    } catch (e) {
      details.raw = { subject: email.subject || '', date: new Date().toISOString(), text: text || '', html: html || '' };
    }

    // Extract tracking numbers
    details.trackingNumbers = this.extractTrackingNumbers(combinedText);

    // Also check attachment bodies/filenames for tracking numbers
    const attachmentTrackings = this.extractTrackingFromAttachments(email.attachments || []);
    if (attachmentTrackings.length) {
      details.trackingNumbers = [...new Set([...details.trackingNumbers, ...attachmentTrackings])];
    }

    // Extract shipper/sender from body ("From: ...")
    const shipperMatch = combinedText.match(/(?:^|\n)\s*From:\s*([^\n<]+)/i);
    if (shipperMatch) details.shipper = shipperMatch[1].trim().substring(0, 80);

    // Try multiple patterns for estimated delivery (textual and numeric)
    let deliveryDate = null;
    const deliveryPatterns = [
      /(?:Scheduled Delivery|Delivery Date|Expected Delivery|Est\.? Delivery|Estimated Delivery)[:\s]+([^\n<\r]+)/i,
      /(?:Scheduled Delivery|Delivery Date|Expected Delivery|Est\.? Delivery|Estimated Delivery)\s*-\s*([^\n<\r]+)/i,
      /Estimated Delivery[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4}(?:[^\n<]*)?)/i,
      /Scheduled Delivery[:\s]+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}(?:[^\n<]*)?)/i
    ];

    for (const p of deliveryPatterns) {
      const m = combinedText.match(p);
      if (m && m[1]) {
        const tryDate = tryParseDateFromString(m[1]);
        if (tryDate) {
          deliveryDate = tryDate;
          break;
        }
      }
    }
    if (deliveryDate) details.estimatedDelivery = deliveryDate;

    // Extract number of packages
    const pkgMatch = combinedText.match(/(?:Number of Packages)[:\s]+(\d+)/i);
    if (pkgMatch) details.packages = parseInt(pkgMatch[1], 10);

    // Extract weight ("Package Weight: 2.5 LBS")
    const weightMatch = combinedText.match(/(?:Package Weight|Weight)[:\s]+(\d+\.?\d*)\s*(?:lbs?|pounds?|kg)/i);
    if (weightMatch) {
      details.weight = parseFloat(weightMatch[1]);
    }

    // Extract service type (avoid matching the legal footer that contains the word "Shipping")
    const serviceLine =
      combinedText.match(/(?:^|\n)\s*UPS Service\s*[:\-]\s*([^\n<]+)/i) ||
      combinedText.match(/(?:^|\n)\s*Service\s*[:\-]\s*([^\n<]+)/i) ||
      combinedText.match(/(?:^|\n)\s*Ship Method\s*[:\-]\s*([^\n<]+)/i);
    if (serviceLine) {
      const candidate = normalizeLine(serviceLine[1]).substring(0, 80);
      if (isPlausibleServiceType(candidate)) details.serviceType = candidate;
    }

    // Extract origin (store/location)
    const originMatch = combinedText.match(/(?:Origin|Ship From)[:\s]+([A-Za-z0-9\s,.-]+?)(?:\n|<|$)/i);
    if (originMatch) {
      details.origin = originMatch[1].trim().substring(0, 100);
    }

    // Extract ship-to block (preferred)
    const shipTo = parseShipToBlock(`${text}\n${(html || '').replace(/<[^>]*>/g, ' ')}`);
    if (shipTo) {
      details.customerName = shipTo.customerName || '';
      details.address = shipTo.address || null;
      details.destination = shipTo.customerName || '';
    }

    // Reference numbers
    const ref1 = combinedText.match(/Reference Number 1:\s*([^\n<]+)/i);
    if (ref1) details.reference1 = cleanReferenceValue(ref1[1]);
    const ref2 = combinedText.match(/Reference Number 2:\s*([^\n<]+)/i);
    if (ref2) details.reference2 = cleanReferenceValue(ref2[1]);

    // Order number: prefer PSUS parsing, but keep a plain reference as fallback (for numeric orders)
    details.orderNumber = extractPSUSNumber(details.reference2) || extractPSUSNumber(combinedText) || details.reference2 || '';

    // Fallbacks for customer and address
    if (!details.customerName && details.destination) details.customerName = details.destination.split(/[\n<]/)[0].trim();
    if (!details.address && details.destination) details.address = null;

    details.notes = 'Captured from UPS email';

    return details;
  }

  // Extract a human-readable status from a UPS notification email (best-effort).
  // Returns { statusText, internalStatus } or null if no meaningful status found.
  parseStatusUpdate(email) {
    const subject = (email.subject || '').toString();
    const text = email.text || '';
    const html = email.html || '';
    const combinedText = `${subject}\n${text}\n${(html || '').replace(/<[^>]*>/g, ' ')}`;

    // Attempt to capture a timestamp related to the status (e.g., "Updated: Jan 5, 2026 3:00 PM")
    let statusTime = null;
    const timePatterns = [/(?:Updated[:\s]|Status Updated[:\s]|As of[:\s]|As of)\s*([^\n<]+)/i, /(?:Delivery Scheduled[:\s]|Scheduled Delivery[:\s])\s*([^\n<]+)/i];
    for (const p of timePatterns) {
      const m = combinedText.match(p);
      if (m && m[1]) {
        const parsed = tryParseDateFromString(m[1]);
        if (parsed) { statusTime = parsed; break; }
      }
    }

    const lower = combinedText.toLowerCase();

    // Common UPS notification phrases
    if (lower.includes('delivered')) return { statusText: 'Delivered', internalStatus: 'DELIVERED', statusUpdatedAt: statusTime };
    if (lower.includes('out for delivery')) return { statusText: 'Out For Delivery', internalStatus: 'IN_TRANSIT', statusUpdatedAt: statusTime };
    if (lower.includes('in transit') || lower.includes('on the way')) return { statusText: 'In Transit', internalStatus: 'IN_TRANSIT', statusUpdatedAt: statusTime };
    if (lower.includes('label created') || lower.includes('shipment ready') || lower.includes('ready for ups')) {
      return { statusText: 'Label Created', internalStatus: 'LABEL_CREATED', statusUpdatedAt: statusTime };
    }
    if (lower.includes('exception') || lower.includes('delay') || lower.includes('failed attempt')) {
      return { statusText: 'Exception', internalStatus: 'EXCEPTION', statusUpdatedAt: statusTime };
    }

    // Detect returns (check specific phrases to avoid false positives)
    if (/\b(return to sender|returned to sender|returned|return)\b/i.test(combinedText)) {
      return { statusText: 'Returned', internalStatus: 'RETURNED', statusUpdatedAt: statusTime };
    }

    return null;
  }

  // Create shipment record from parsed email
  async createShipmentRecord(details, statusUpdate) {
    let createdCount = 0;
    let updatedCount = 0;
    const createdShipments = [];

    // Load users/employees for processed-by mapping (Reference Number 1)
    let users = [];
    try {
      const usersPath = path.join(DATA_DIR, 'users.json');
      if (fs.existsSync(usersPath)) {
        const parsed = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        users = Array.isArray(parsed?.users) ? parsed.users : [];
      }
    } catch (_) {}

    let employees = [];
    try {
      const employeesPath = path.join(DATA_DIR, 'employees-v2.json');
      if (fs.existsSync(employeesPath)) {
        const parsed = JSON.parse(fs.readFileSync(employeesPath, 'utf8'));
        const groups = parsed?.employees && typeof parsed.employees === 'object' ? parsed.employees : {};
        employees = Object.keys(groups)
          .flatMap(k => (Array.isArray(groups[k]) ? groups[k] : []))
          .filter(Boolean);
      }
    } catch (_) {}

    const employeeIndex = new Map();
    for (const u of users) {
      const key = normalizeEmployeeId(u?.employeeId);
      if (key) employeeIndex.set(key, { employeeId: (u?.employeeId || '').toString().trim(), name: u?.name || '', imageUrl: u?.imageUrl || '' });
    }
    for (const e of employees) {
      const key = normalizeEmployeeId(e?.employeeId);
      if (key && !employeeIndex.has(key)) employeeIndex.set(key, { employeeId: (e?.employeeId || '').toString().trim(), name: e?.name || '', imageUrl: e?.imageUrl || '' });
    }

    const reference1 = cleanReferenceValue(details.reference1);
    const processedKey = normalizeEmployeeId(reference1);
    const processedByUser = processedKey ? (employeeIndex.get(processedKey) || null) : null;

    for (const tracking of details.trackingNumbers) {
      const createdAt = details.date instanceof Date ? details.date.toISOString() : new Date().toISOString();
      const incomingStatus = statusUpdate?.internalStatus ? statusUpdate.internalStatus : 'LABEL_CREATED';

        const shipmentData = {
        tracking_number: tracking,
        carrier: 'UPS',
        status: incomingStatus,
        status_from_ups: statusUpdate?.statusText || '',
          status_updated_at: statusUpdate?.statusUpdatedAt ? statusUpdate.statusUpdatedAt.toISOString() : (statusUpdate ? new Date().toISOString() : null),
        status_updated_source: statusUpdate ? 'email' : null,
        source: 'email-import',
        imported_at: new Date().toISOString(),
        shipped_at: createdAt,
        customer_name: details.customerName || details.destination || details.shipper || 'UPS Shipment',
        customer_address: details.address || null,
        order_number: details.orderNumber || '',
        service_type: details.serviceType || details.service || '',
        package_count: Number.isFinite(details.packages) ? details.packages : null,
        package_weight_lbs: Number.isFinite(details.weight) ? details.weight : null,
        reference_1: reference1 || '',
        reference_2: cleanReferenceValue(details.reference2) || '',
        processed_by_id: processedByUser?.employeeId || null,
        processed_by_name: processedByUser?.name || '',
        shipper: details.shipper || '',
        origin_location: details.origin || '',
        destination_location: details.destination || '',
          estimated_delivery_at: details.estimatedDelivery ? (details.estimatedDelivery instanceof Date ? details.estimatedDelivery.toISOString() : null) : null,
        notes: details.notes || 'Captured from UPS email'
      };
      // include raw payload and returned flag if present
      if (details.raw) {
        shipmentData.ups_raw_response = details.raw;
      }
      shipmentData.returned = !!(statusUpdate && statusUpdate.internalStatus === 'RETURNED');

      try {
        // Find any existing shipments with this tracking and prefer the most recently updated
        let existing = null;
        try {
          const res = await pgDal.query('SELECT * FROM shipments WHERE tracking_number = $1 ORDER BY COALESCE(status_updated_at, imported_at) DESC', [tracking]);
          if (res && res.rows && res.rows.length) {
            existing = res.rows[0];
            if (res.rows.length > 1) {
              console.warn(`[UPSEmailParser] Multiple shipments found for ${tracking} (${res.rows.length}). Using most recent id=${existing.id}.`);
            }
          }
        } catch (qErr) {
          console.warn('[UPSEmailParser] Error querying existing shipments:', qErr.message);
          existing = await pgDal.getShipmentByTracking(tracking);
        }

        if (!existing) {
          const newShipment = await pgDal.createShipment(shipmentData);
          createdShipments.push(newShipment);
          createdCount++;
          console.log(`Created shipment for tracking: ${tracking}`);
        } else {
          // Update existing with any missing fields + upgrade status if needed.
          const updates = {};
          const setIfEmpty = (key, value) => {
            if (value === undefined || value === null || String(value).trim() === '') return;
            const existingVal = existing[key];
            const isEmpty = existingVal === undefined || existingVal === null || String(existingVal).trim() === '';
            if (isEmpty) updates[key] = value;
          };

          setIfEmpty('customer_name', shipmentData.customer_name);
          if (!existing.customer_address && shipmentData.customer_address) updates.customer_address = shipmentData.customer_address;
          setIfEmpty('order_number', shipmentData.order_number);
          setIfEmpty('service_type', shipmentData.service_type);
          if (existing.package_count === null && shipmentData.package_count !== null) updates.package_count = shipmentData.package_count;
          if (existing.package_weight_lbs === null && shipmentData.package_weight_lbs !== null) updates.package_weight_lbs = shipmentData.package_weight_lbs;
          setIfEmpty('reference_1', shipmentData.reference_1);
          setIfEmpty('reference_2', shipmentData.reference_2);
          setIfEmpty('processed_by_id', shipmentData.processed_by_id);
          setIfEmpty('processed_by_name', shipmentData.processed_by_name);

          // Persist raw payload and returned flag on updates
          if (details.raw) updates.ups_raw_response = JSON.stringify(details.raw);
          updates.returned = shipmentData.returned === true;

          // Status update logic:
          // - If the incoming status has a parsed timestamp and it's newer than the
          //   DB's status_updated_at, accept the incoming status (replace even if
          //   the rank is lower) because it's newer information.
          // - If incoming has no timestamp, only upgrade status by rank (never downgrade).
          if (statusUpdate?.statusText) {
            const incomingTime = statusUpdate?.statusUpdatedAt ? new Date(statusUpdate.statusUpdatedAt) : null;
            const existingTime = existing.status_updated_at ? new Date(existing.status_updated_at) : null;

            if (incomingTime && (!existingTime || incomingTime > existingTime)) {
              updates.status_from_ups = statusUpdate.statusText;
              updates.status_updated_at = incomingTime.toISOString();
              updates.status_updated_source = 'email';
              updates.status = incomingStatus;
            } else if (!incomingTime) {
              // No timestamp on incoming update: only upgrade by rank
              updates.status_from_ups = statusUpdate.statusText;
              updates.status_updated_at = new Date().toISOString();
              updates.status_updated_source = 'email';
              if (statusRank(incomingStatus) > statusRank(existing.status)) {
                updates.status = incomingStatus;
              }
            } else {
              // Incoming timestamp is older or equal: do not overwrite status, but update status_from_ups if DB lacks it
              if (!existing.status_from_ups || String(existing.status_from_ups).trim() === '') {
                updates.status_from_ups = statusUpdate.statusText;
              }
            }
          } else {
            // No status info in incoming email; keep existing status but still allow other field updates
          }

          if (Object.keys(updates).length > 0) {
            console.log(`[UPSEmailParser] Updating existing shipment for ${tracking} with:`, JSON.stringify(updates, null, 2));
            await pgDal.updateShipment(existing.id, updates);
            updatedCount++;
          } else {
            console.log(`[UPSEmailParser] No updates needed for existing shipment ${tracking}`);
          }
        }
      } catch (dbErr) {
        console.error(`[UPSEmailParser] Database error for tracking ${tracking}:`, dbErr);
      }
    }

    return { createdShipments, updated: updatedCount, created: createdCount };
  }

  // Main function to fetch and process UPS emails
  // By default do NOT delete emails after importing. To enable deletion,
  // set environment variable `UPS_DELETE_EMAILS=true` or pass `true` explicitly.
  async fetchAndImportShipments(daysBack = 30, deleteAfterImport = process.env.UPS_DELETE_EMAILS === 'true') {
    console.log(`[UPSEmailParser] Starting fetchAndImportShipments (daysBack=${daysBack}, deleteAfterImport=${deleteAfterImport})`);
    const results = {
      success: false,
      emailsProcessed: 0,
      shipmentsCreated: 0,
      trackingNumbers: [],
      createdShipments: [],
      shipmentsUpdated: 0,
      emailsDeleted: 0,
      errors: []
    };

    try {
      if (deleteAfterImport !== true) {
        // Ensure deletion is opt-in and explicitly enabled via env var.
        if (process.env.UPS_DELETE_EMAILS === 'true') {
          deleteAfterImport = true;
        } else {
          deleteAfterImport = false;
        }
      }
      if (deleteAfterImport) console.warn('Warning: Email deletion is enabled. Set UPS_DELETE_EMAILS=false to disable.');
      await this.connectWithRetry();
      // If UPS_FETCH_ALL is set, we'll fetch ALL messages once (no SINCE)
      const fetchAll = process.env.UPS_FETCH_ALL === 'true';
      const effectiveDays = fetchAll ? null : daysBack;
      let updatedCount = 0;
      let createdCount = 0;
      const createdShipments = [];

      // Build list of mailboxes to search. If fetching ALL, enumerate available boxes.
      let mailboxesToTry = [
        'INBOX',
        '[Gmail]/All Mail',
        '[Google Mail]/All Mail',
        '[Gmail]/Trash',
        '[Google Mail]/Trash'
      ];

      if (fetchAll) {
        try {
          const boxes = await this.getMailboxes();
          // Flatten nested mailbox structure into paths
          const flatten = (obj, prefix = '') => {
            const out = [];
            for (const k of Object.keys(obj || {})) {
              const name = prefix ? `${prefix}/${k}` : k;
              out.push(name);
              if (obj[k].children) {
                out.push(...flatten(obj[k].children, name));
              }
            }
            return out;
          };
          const discovered = flatten(boxes).map(n => n.replace(/"/g, ''));
          // Merge and deduplicate
          mailboxesToTry = Array.from(new Set([...discovered, ...mailboxesToTry]));
        } catch (e) {
          console.warn('Could not enumerate mailboxes, falling back to defaults');
        }
      }

      for (const mailbox of mailboxesToTry) {
        try {
          await this.openMailbox(mailbox);
        } catch (_) {
          continue;
        }

        const messageIds = await this.searchUPSEmails(effectiveDays);
        console.log(`Mailbox "${mailbox}": Found ${messageIds.length} potential UPS emails`);

        const processedMessageIds = [];

        for (const msgId of messageIds) {
          try {
            const email = await this.fetchEmail(msgId);

            const fromAddr = email.from?.value?.[0]?.address || '';
            const isFromUPS = UPS_SENDERS.some(s =>
              fromAddr.toLowerCase().includes(s.replace('@ups.com', '').toLowerCase())
            ) || fromAddr.toLowerCase().includes('ups.com');

            if (!isFromUPS && !email.subject?.toLowerCase().includes('ups')) {
              console.log(`[UPSEmailParser] Skipping email (not from UPS or subject): ${email.subject}`);
              continue;
            }

            console.log(`[UPSEmailParser] Processing UPS email: ${email.subject}`);
            results.emailsProcessed++;

            const details = this.parseShipmentDetails(email);
            const statusUpdate = this.parseStatusUpdate(email);
            console.log(`[UPSEmailParser] Parsed details for ${email.subject}:`, JSON.stringify({ trackingNumbers: details.trackingNumbers, statusUpdate }, null, 2));

            if (details.trackingNumbers.length > 0) {
              results.trackingNumbers.push(...details.trackingNumbers);
              const { created, updated, createdShipments: newShipments } = await this.createShipmentRecord(details, statusUpdate);
              createdShipments.push(...newShipments);
              createdCount += created;
              updatedCount += updated;
              processedMessageIds.push(msgId);
            } else {
              console.log(`[UPSEmailParser] No tracking numbers found in email: ${email.subject}`);
            }
          } catch (err) {
            console.error(`Error processing email ${msgId}:`, err.message);
            results.errors.push(err.message);
          }
        }

        if (deleteAfterImport && processedMessageIds.length > 0) {
          console.log(`Deleting ${processedMessageIds.length} processed UPS emails from "${mailbox}"...`);
          const deleteResults = await this.deleteEmails(processedMessageIds);
          results.emailsDeleted += deleteResults.deleted;
          if (deleteResults.errors.length > 0) {
            results.errors.push(...deleteResults.errors.map(e => `Delete error: ${e.error}`));
          }
        }
      }

      results.shipmentsCreated = createdCount;
      results.createdShipments = createdShipments;
      results.shipmentsUpdated = updatedCount;
      results.success = true;
      results.trackingNumbers = [...new Set(results.trackingNumbers)];

    } catch (err) {
      const isTimeout = err.source === 'timeout-auth' || err.message?.includes('timeout');
      if (isTimeout) {
        console.warn('Warning: IMAP connection timed out after retries, will try again next scheduled run');
      } else {
        console.error('Error fetching UPS emails:', err);
      }
      results.errors.push(err.message);
      results.success = false;
    } finally {
      this.disconnect();
    }

    return results;
  }

  // Manual tracking number import (without email)
  async importTrackingNumber(tracking, details = {}) {
    const existing = await pgDal.getShipmentByTracking(tracking);
    if (existing) {
      return { success: false, error: 'Tracking number already exists' };
    }

    const shipmentData = {
      tracking_number: tracking,
      carrier: details.carrier || 'UPS',
      status: 'pending',
      source: 'manual-import',
      imported_at: new Date().toISOString(),
      notes: details.notes || '',
      ...details
    };

    try {
      const shipment = await pgDal.createShipment(shipmentData);
      return { success: true, shipment };
    } catch (err) {
      console.error('Manual import DB error:', err);
      return { success: false, error: 'Database error on manual import' };
    }
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
    // Run test in dry-run mode (do not delete emails) to avoid data loss while
    // we validate DB schema and permissions. Use UPS_FETCH_DAYS env var (default 30).
    const days = parseInt(process.env.UPS_FETCH_DAYS || '30', 10);
    const result = await parser.fetchAndImportShipments(days, false);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Test failed:', err);
  }
}

module.exports = { UPSEmailParser, testUPSEmailFetch };
