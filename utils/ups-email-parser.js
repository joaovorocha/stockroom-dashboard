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

  const cityLineIdx = rest.findIndex(l => /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?/.test(l) || /,\s*[A-Z]{2}\s+\d{9}/.test(l));
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

function mapStatusTextToInternal(statusText) {
  const s = (statusText || '').toString().toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('out for delivery')) return 'in-transit';
  if (s.includes('in transit') || s.includes('on the way') || s.includes('departed') || s.includes('arrived')) return 'in-transit';
  if (s.includes('label created') || s.includes('shipment ready') || s.includes('ready for ups')) return 'label-created';
  if (s.includes('exception') || s.includes('delay') || s.includes('failed')) return 'unknown';
  return 'unknown';
}

function statusRank(status) {
  const order = { unknown: 0, requested: 1, pending: 1, 'label-created': 2, 'in-transit': 3, delivered: 4 };
  return order[(status || '').toString().toLowerCase()] || 0;
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

  // Search for UPS emails
  searchUPSEmails(daysBack = 7) {
    return new Promise((resolve, reject) => {
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

    // Extract estimated delivery
    const deliveryMatch = combinedText.match(/(?:Scheduled Delivery|Delivery Date|Expected Delivery|Est\. Delivery)[:\s]+([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (deliveryMatch) {
      try {
        details.estimatedDelivery = new Date(deliveryMatch[1]);
      } catch (e) {}
    }

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
    const combinedText = `${subject}\n${text}\n${(html || '').replace(/<[^>]*>/g, ' ')}`.toLowerCase();

    // Common UPS notification phrases
    if (combinedText.includes('delivered')) return { statusText: 'Delivered', internalStatus: 'delivered' };
    if (combinedText.includes('out for delivery')) return { statusText: 'Out For Delivery', internalStatus: 'in-transit' };
    if (combinedText.includes('in transit') || combinedText.includes('on the way')) return { statusText: 'In Transit', internalStatus: 'in-transit' };
    if (combinedText.includes('label created') || combinedText.includes('shipment ready') || combinedText.includes('ready for ups')) {
      return { statusText: 'Label Created', internalStatus: 'label-created' };
    }
    if (combinedText.includes('exception') || combinedText.includes('delay') || combinedText.includes('failed attempt')) {
      return { statusText: 'Exception', internalStatus: 'unknown' };
    }

    return null;
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
  createShipmentRecord(details, existingShipments, statusUpdate) {
    const newShipments = [];
    let updated = 0;

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
    const processedById = processedByUser?.employeeId || '';

    for (const tracking of details.trackingNumbers) {
      const createdAt = details.date instanceof Date ? details.date.toISOString() : new Date().toISOString();

      const incomingStatus = statusUpdate?.internalStatus
        ? statusUpdate.internalStatus
        : (tracking ? 'label-created' : 'requested');

      const shipmentBase = {
        id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tracking: tracking,
        trackingNumber: tracking,
        trackingLink: `https://www.ups.com/track?tracknum=${tracking}`,
        carrier: 'UPS',
        status: incomingStatus,
        statusFromUPS: statusUpdate?.statusText || '',
        statusUpdatedAt: statusUpdate ? new Date().toISOString() : undefined,
        statusUpdatedSource: statusUpdate ? 'email' : undefined,
        source: 'email-import',
        importedAt: new Date().toISOString(),
        createdAt,
        shippedAt: createdAt,
        customerName: details.customerName || details.destination || details.shipper || 'UPS Shipment',
        address: details.address || null,
        orderNumber: details.orderNumber || '',
        serviceType: details.serviceType || details.service || '',
        packageCount: Number.isFinite(details.packages) ? details.packages : null,
        packageWeightLbs: Number.isFinite(details.weight) ? details.weight : null,
        referenceNumber1: reference1 || '',
        referenceNumber2: cleanReferenceValue(details.reference2) || '',
        processedById: processedById,
        processedByName: processedByUser?.name || '',
        processedByImageUrl: processedByUser?.imageUrl || '',
        shipper: details.shipper || '',
        origin: details.origin || '',
        destination: details.destination || '',
        estimatedDelivery: details.estimatedDelivery?.toISOString() || null,
        notes: details.notes || 'Captured from UPS email'
      };

      const idx = existingShipments.findIndex(s =>
        (s.trackingNumber || s.tracking || '').toString().trim().toUpperCase() === tracking
      );

      if (idx === -1) {
        newShipments.push(shipmentBase);
        console.log(`Created shipment for tracking: ${tracking}`);
        continue;
      }

      // Update existing with any missing fields + upgrade status if needed.
      const existing = existingShipments[idx] || {};
      const next = { ...existing };

      const setIfEmpty = (key, value) => {
        if (value === undefined || value === null) return;
        const existingVal = next[key];
        const isEmpty = existingVal === undefined || existingVal === null || String(existingVal).trim() === '';
        if (isEmpty && String(value).trim()) next[key] = value;
      };

      setIfEmpty('customerName', shipmentBase.customerName);
      if (!next.address && shipmentBase.address) next.address = shipmentBase.address;
      setIfEmpty('orderNumber', shipmentBase.orderNumber);
      setIfEmpty('serviceType', shipmentBase.serviceType);
      if (next.packageCount === undefined && shipmentBase.packageCount !== null) next.packageCount = shipmentBase.packageCount;
      if (next.packageWeightLbs === undefined && shipmentBase.packageWeightLbs !== null) next.packageWeightLbs = shipmentBase.packageWeightLbs;
      setIfEmpty('referenceNumber1', shipmentBase.referenceNumber1);
      setIfEmpty('referenceNumber2', shipmentBase.referenceNumber2);
      setIfEmpty('processedById', shipmentBase.processedById);
      setIfEmpty('processedByName', shipmentBase.processedByName);
      setIfEmpty('processedByImageUrl', shipmentBase.processedByImageUrl);

      if (statusUpdate?.statusText) {
        next.statusFromUPS = statusUpdate.statusText;
        next.statusUpdatedAt = new Date().toISOString();
        next.statusUpdatedSource = 'email';
      }

      // Upgrade internal status (never downgrade).
      const existingInternal = (next.status || '').toString().toLowerCase();
      if (statusRank(incomingStatus) > statusRank(existingInternal)) next.status = incomingStatus;

      next.updatedAt = new Date().toISOString();
      existingShipments[idx] = next;
      updated += 1;
    }

    return { createdShipments: newShipments, updated };
  }

  // Update existing shipment statuses from notification emails.
  // Only upgrades status (never downgrades).
  updateExistingShipmentsStatus(existingShipments, trackingNumbers, statusUpdate, emailDate) {
    if (!statusUpdate || !trackingNumbers?.length) return { updated: 0 };
    const now = new Date().toISOString();
    const emailIso = emailDate instanceof Date ? emailDate.toISOString() : now;

    let updated = 0;
    for (const tracking of trackingNumbers) {
      const idx = existingShipments.findIndex(
        s => (s.trackingNumber || s.tracking || '').toString().trim().toUpperCase() === tracking
      );
      if (idx === -1) continue;

      const shipment = existingShipments[idx];
      const existingInternal = mapStatusTextToInternal(shipment.statusFromUPS || '');
      const incomingInternal = statusUpdate.internalStatus || mapStatusTextToInternal(statusUpdate.statusText);
      if (statusRank(incomingInternal) < statusRank(existingInternal)) continue;

      shipment.statusFromUPS = statusUpdate.statusText || shipment.statusFromUPS || '';
      shipment.statusUpdatedAt = now;
      shipment.statusUpdatedSource = 'email';
      shipment.statusEmailDate = emailIso;

      // Optionally store internal status for quick filtering (effective status is still computed server-side)
      if (incomingInternal && incomingInternal !== 'unknown') {
        shipment.status = incomingInternal;
        if (incomingInternal === 'delivered' && !shipment.deliveredAt) shipment.deliveredAt = emailIso;
      }

      shipment.updatedAt = now;
      existingShipments[idx] = shipment;
      updated++;
    }

    return { updated };
  }

  // Main function to fetch and process UPS emails
  async fetchAndImportShipments(daysBack = 7, deleteAfterImport = true) {
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
      await this.connectWithRetry();
      const existingShipments = this.loadShipments();
      const newShipments = [];
      let updatedCount = 0;

      const mailboxesToTry = [
        'INBOX',
        '[Gmail]/All Mail',
        '[Google Mail]/All Mail',
        '[Gmail]/Trash',
        '[Google Mail]/Trash'
      ];
      for (const mailbox of mailboxesToTry) {
        try {
          await this.openMailbox(mailbox);
        } catch (_) {
          continue;
        }

        const messageIds = await this.searchUPSEmails(daysBack);
        console.log(`Mailbox "${mailbox}": Found ${messageIds.length} potential UPS emails`);

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
            const statusUpdate = this.parseStatusUpdate(email);

            if (details.trackingNumbers.length > 0) {
              results.trackingNumbers.push(...details.trackingNumbers);
              const createdResult = this.createShipmentRecord(details, existingShipments, statusUpdate);
              newShipments.push(...(createdResult.createdShipments || []));
              updatedCount += createdResult.updated || 0;

              // Update existing shipments from status notification emails
              const updateResult = this.updateExistingShipmentsStatus(existingShipments, details.trackingNumbers, statusUpdate, details.date);
              updatedCount += updateResult.updated || 0;

              processedMessageIds.push(msgId);
            }
          } catch (err) {
            console.error(`Error processing email ${msgId}:`, err.message);
            results.errors.push(err.message);
          }
        }

        // Delete processed emails if enabled (per mailbox)
        if (deleteAfterImport && processedMessageIds.length > 0) {
          console.log(`Deleting ${processedMessageIds.length} processed UPS emails from "${mailbox}"...`);
          const deleteResults = await this.deleteEmails(processedMessageIds);
          results.emailsDeleted += deleteResults.deleted;
          if (deleteResults.errors.length > 0) {
            results.errors.push(...deleteResults.errors.map(e => `Delete error: ${e.error}`));
          }
        }
      }

      // Save new shipments
      if (newShipments.length > 0 || updatedCount > 0) {
        const allShipments = [...existingShipments, ...newShipments];
        this.saveShipments(allShipments);
        results.shipmentsCreated = newShipments.length;
        results.createdShipments = newShipments;
        results.shipmentsUpdated = updatedCount;
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
