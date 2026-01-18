const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { getTrackingStatus } = require('../utils/upsApi');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const SHIPMENTS_FILE = path.join(__dirname, '../data/shipments.json');
const SHIPMENTS_BACKUP_DIR = path.join(__dirname, '../data/shipments-backups');

// Ensure data directory exists
const dataDir = path.dirname(SHIPMENTS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize shipments file if it doesn't exist
if (!fs.existsSync(SHIPMENTS_FILE)) {
  fs.writeFileSync(SHIPMENTS_FILE, JSON.stringify([], null, 2));
}

function loadShipments() {
  try {
    const data = fs.readFileSync(SHIPMENTS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveShipments(shipments) {
  try {
    if (!fs.existsSync(SHIPMENTS_BACKUP_DIR)) fs.mkdirSync(SHIPMENTS_BACKUP_DIR, { recursive: true });
    if (fs.existsSync(SHIPMENTS_FILE)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(SHIPMENTS_BACKUP_DIR, `shipments.${stamp}.json`);
      fs.copyFileSync(SHIPMENTS_FILE, backupPath);
      // Keep last 20 backups
      const backups = fs
        .readdirSync(SHIPMENTS_BACKUP_DIR)
        .filter(f => f.startsWith('shipments.') && f.endsWith('.json'))
        .sort()
        .reverse();
      for (const old of backups.slice(20)) {
        try { fs.unlinkSync(path.join(SHIPMENTS_BACKUP_DIR, old)); } catch (_) {}
      }
    }
  } catch (_) {
    // Never block writes due to backup issues
  }
  fs.writeFileSync(SHIPMENTS_FILE, JSON.stringify(shipments, null, 2));
}

function normalizeString(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getTrackingNumber(shipment) {
  return (shipment?.trackingNumber || shipment?.tracking || '').toString().trim();
}

function getOrderNumber(shipment) {
  return (shipment?.orderNumber || '').toString().trim();
}

function getCustomerName(shipment) {
  return (shipment?.customerName || shipment?.recipient || '').toString().trim();
}

function getAddressObject(shipment) {
  if (shipment?.address && typeof shipment.address === 'object' && !Array.isArray(shipment.address)) {
    return shipment.address;
  }
  return null;
}

function getZip(shipment) {
  const addr = getAddressObject(shipment);
  return (addr?.zip || shipment?.zip || '').toString().trim();
}

function getAddressLine1(shipment) {
  const addr = getAddressObject(shipment);
  return (addr?.line1 || shipment?.addressLine1 || '').toString().trim();
}

function getMatchIndex(existingShipments, incoming) {
  const incomingTracking = getTrackingNumber(incoming);
  if (incomingTracking) {
    const match = existingShipments.findIndex(s => getTrackingNumber(s) === incomingTracking);
    if (match !== -1) return match;
  }

  const incomingOrder = getOrderNumber(incoming);
  if (incomingOrder) {
    const match = existingShipments.findIndex(s => getOrderNumber(s) === incomingOrder);
    if (match !== -1) return match;
  }

  // Conservative heuristic: same customer + zip + address line1 (case-insensitive)
  const name = normalizeString(getCustomerName(incoming));
  const zip = normalizeString(getZip(incoming));
  const line1 = normalizeString(getAddressLine1(incoming));
  if (name && zip && line1) {
    const match = existingShipments.findIndex(s =>
      normalizeString(getCustomerName(s)) === name &&
      normalizeString(getZip(s)) === zip &&
      normalizeString(getAddressLine1(s)) === line1
    );
    if (match !== -1) return match;
  }

  return -1;
}

function statusRank(status) {
  const s = (status || '').toString().toLowerCase();
  // New canonical statuses:
  // requested -> label-created -> in-transit -> delivered
  // unknown never "wins" over a known status.
  const order = { unknown: 0, requested: 1, pending: 1, 'label-created': 2, shipped: 2, 'in-transit': 3, delivered: 4 };
  return order[s] || 0;
}

function normalizeStoredStatus(status) {
  const s = (status || '').toString().trim().toLowerCase();
  if (!s) return 'requested';
  if (s === 'pending') return 'requested';
  if (s === 'shipped') return 'label-created'; // legacy status
  return s;
}

function mapUPSStatusToInternal(statusFromUPS) {
  const s = (statusFromUPS || '').toString().toLowerCase();
  if (!s) return '';
  if (s.includes('status unavailable') || s.includes('unknown')) return 'unknown';
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('out for delivery')) return 'in-transit';
  if (s.includes('in transit')) return 'in-transit';
  if (s.includes('on the way') || s.includes('on the road')) return 'in-transit';
  if (s.includes('departed') || s.includes('arrived')) return 'in-transit';
  if (s.includes('exception') || s.includes('delay')) return 'unknown';
  if (s.includes('processing') || s.includes('facility')) return 'in-transit';
  if (s.includes('label created')) return 'label-created';
  if (s.includes('shipment ready') || s.includes('ready for ups')) return 'label-created';
  return 'unknown';
}

function computeEffectiveStatus(shipment, statusFromUPS) {
  const hasTracking = !!getTrackingNumber(shipment);
  const stored = normalizeStoredStatus(shipment?.status);

  if (!hasTracking) return stored || 'requested';

  const mapped = mapUPSStatusToInternal(statusFromUPS);
  if (mapped && mapped !== 'unknown') return mapped;
  if (!statusFromUPS) {
    // If UPS hasn't provided a status string, treat having a tracking number as "label-created"
    // unless we already have a more advanced status stored.
    if (stored === 'delivered' || stored === 'in-transit' || stored === 'label-created') return stored;
    return 'label-created';
  }
  // Unknown / unavailable
  if (stored === 'delivered' || stored === 'in-transit') return stored;
  if (stored === 'label-created') return stored;
  return mapped || 'unknown';
}

function mergeShipment(existing, incoming, source) {
  const merged = { ...existing };

  // Preserve id; ensure it exists
  merged.id = existing.id || incoming.id || generateId();

  const incomingAddress = getAddressObject(incoming) || {};
  const existingAddress = getAddressObject(existing) || {};
  const existingAddressText = typeof existing?.address === 'string' ? existing.address : '';
  const incomingAddressText = typeof incoming?.address === 'string' ? incoming.address : '';
  const incomingHasStructuredAddress =
    !!getAddressObject(incoming) ||
    !!incoming.addressLine1 ||
    !!incoming.city ||
    !!incoming.state ||
    !!incoming.zip ||
    !!incoming.country;
  const existingHasStructuredAddress = !!getAddressObject(existing);

  merged.customerName = merged.customerName || incoming.customerName || incoming.recipient || '';
  merged.orderNumber = merged.orderNumber || incoming.orderNumber || '';
  merged.trackingNumber = getTrackingNumber(merged) || getTrackingNumber(incoming) || '';
  merged.carrier = merged.carrier || incoming.carrier || 'UPS';
  merged.serviceType = merged.serviceType || incoming.serviceType || '';

  if (existingHasStructuredAddress || incomingHasStructuredAddress) {
    merged.address = {
      line1: existingAddress.line1 || incomingAddress.line1 || incoming.addressLine1 || '',
      line2: existingAddress.line2 || incomingAddress.line2 || incoming.addressLine2 || '',
      city: existingAddress.city || incomingAddress.city || incoming.city || '',
      state: existingAddress.state || incomingAddress.state || incoming.state || '',
      zip: existingAddress.zip || incomingAddress.zip || incoming.zip || '',
      country: existingAddress.country || incomingAddress.country || incoming.country || '',
      phone: existingAddress.phone || incomingAddress.phone || incoming.phone || ''
    };
  } else {
    merged.address = existingAddressText || incomingAddressText || '';
  }

  merged.phone = merged.phone || incoming.phone || '';
  merged.email = merged.email || incoming.email || '';

  merged.employeeName = merged.employeeName || incoming.employeeName || incoming.requestedBy?.employeeName || '';
  merged.employeeId = merged.employeeId || incoming.employeeId || incoming.requestedBy?.employeeId || '';

  merged.processedByName = merged.processedByName || incoming.processedByName || '';
  merged.processedById = merged.processedById || incoming.processedById || '';

  merged.notes = merged.notes || incoming.notes || '';

  const existingStatus = merged.status || 'requested';
  const incomingStatus = incoming.status || '';
  merged.status = statusRank(incomingStatus) > statusRank(existingStatus) ? incomingStatus : existingStatus;

  const now = new Date().toISOString();
  merged.createdAt = merged.createdAt || incoming.createdAt || now;
  merged.updatedAt = now;

  // Track sources (best-effort; keep it lightweight)
  const src = (source || incoming.source || '').toString().trim();
  if (src) {
    const sources = Array.isArray(merged.sources) ? merged.sources : [];
    sources.push({ source: src, at: now });
    merged.sources = sources.slice(-25);
  }

  return merged;
}

function upsertShipment(incoming, source) {
  const shipments = loadShipments();
  const index = getMatchIndex(shipments, incoming);

  if (index === -1) {
    const now = new Date().toISOString();
    const fresh = mergeShipment({}, { ...incoming, createdAt: incoming.createdAt || now }, source);
    shipments.push(fresh);
    saveShipments(shipments);
    return { shipment: fresh, created: true };
  }

  const updated = mergeShipment(shipments[index], incoming, source);
  shipments[index] = updated;
  saveShipments(shipments);
  return { shipment: updated, created: false };
}

function dedupeShipmentsInPlace(source = 'dedupe') {
  const shipments = loadShipments();
  const deduped = [];

  for (const s of shipments) {
    const idx = getMatchIndex(deduped, s);
    if (idx === -1) {
      // Ensure id exists
      const now = new Date().toISOString();
      const normalized = mergeShipment({}, { ...s, id: s.id || generateId(), createdAt: s.createdAt || now }, source);
      deduped.push(normalized);
      continue;
    }
    deduped[idx] = mergeShipment(deduped[idx], s, source);
  }

  saveShipments(deduped);
  return deduped.length;
}

function normalizeHeaderKey(key) {
  return (key || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function pickValue(row, candidates) {
  if (!row || typeof row !== 'object') return '';
  const normalizedMap = new Map();
  for (const k of Object.keys(row)) normalizedMap.set(normalizeHeaderKey(k), k);
  for (const c of candidates) {
    const originalKey = normalizedMap.get(normalizeHeaderKey(c));
    if (!originalKey) continue;
    const v = row[originalKey];
    if (v === undefined || v === null) continue;
    const s = v.toString().trim();
    if (s) return s;
  }
  return '';
}

function extractTrackingFromAnyCell(row) {
  if (!row || typeof row !== 'object') return '';
  const text = Object.values(row)
    .map(v => (v === undefined || v === null ? '' : String(v)))
    .join(' ');
  const patterns = [
    /1Z[A-Z0-9]{16}/i,
    /\b\d{18,22}\b/,
    /\b[A-Z]{2}\d{9}US\b/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[0]) return m[0].toUpperCase();
  }
  return '';
}

function extractTrackingNumberFromText(text) {
  const t = (text || '').toString();
  const patterns = [
    /1Z[A-Z0-9]{16}/i,
    /\b\d{18,22}\b/,
    /\b[A-Z]{2}\d{9}US\b/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[0]) return m[0].toUpperCase();
  }
  return '';
}

function parseCampusShipCsvBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return { rows: [], headerRow: [] };
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) return { rows: [], headerRow: [] };
  const [headerRow, ...rows] = matrix;
  return { rows, headerRow: Array.isArray(headerRow) ? headerRow : [] };
}

const upload = multer({ storage: multer.memoryStorage() });

function colIndexFromLetters(letters) {
  const s = (letters || '').toString().trim().toUpperCase();
  if (!s) return -1;
  // Excel-style: A=0, B=1, ..., Z=25, AA=26...
  let idx = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 65 || code > 90) return -1;
    idx = idx * 26 + (code - 64);
  }
  return idx - 1;
}

function getCell(row, colLetters) {
  if (!Array.isArray(row)) return '';
  const idx = colIndexFromLetters(colLetters);
  if (idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  if (v === undefined || v === null) return '';
  return v.toString().trim();
}

function loadUsersForLookup() {
  try {
    const usersPath = path.join(__dirname, '../data/users.json');
    if (!fs.existsSync(usersPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    return Array.isArray(parsed?.users) ? parsed.users : [];
  } catch (_) {
    return [];
  }
}

function findUserNameByEmployeeId(users, employeeId) {
  const target = (employeeId || '').toString().trim();
  if (!target) return '';
  const match = (users || []).find(u => (u?.employeeId || '').toString().trim() === target);
  return match?.name || '';
}

// GET /api/shipments - Get all shipment requests (enriched with UPS status when tracking is available)
router.get('/', async (req, res) => {
  try {
    const shipments = loadShipments();

    // Enrich with latest UPS status if trackingNumber exists
    const enriched = await Promise.all(shipments.map(async (s) => {
      const apiStatus = s.trackingNumber ? await getTrackingStatus(s.trackingNumber) : '';
      const statusFromUPS = apiStatus || s.statusFromUPS || '';
      const effectiveStatus = computeEffectiveStatus(s, statusFromUPS);
      return { ...s, rawStatus: s.status, status: effectiveStatus, statusFromUPS };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching shipments:', error);
    return res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

// POST /api/shipments/import-campusship-csv - Import shipments from a CampusShip export CSV
router.post('/import-campusship-csv', upload.single('file'), async (req, res) => {
  try {
    const user = req.user || {};
    const role = (user.role || '').toString().toUpperCase();
    const canImport = user.isAdmin || user.isManager || role === 'MANAGEMENT' || role === 'BOH';
    if (!canImport) return res.status(403).json({ error: 'Manager access required' });

    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ error: 'CSV file is required (field name: file)' });

    const { rows, headerRow } = parseCampusShipCsvBuffer(file.buffer);
    if (!rows.length) return res.status(400).json({ error: 'No rows found in CSV' });

    let created = 0;
    let updated = 0;
    const warnings = [];
    const users = loadUsersForLookup();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // CampusShip export mapping (by Excel column letters):
      // B  = service type
      // AL = customer/recipient name
      // AM = address line 1
      // AN = address line 2
      // AP = city
      // AQ = state
      // AR = zip
      // CB = processed by employee id
      // CD = order number
      // CZ = phone
      // DA = email
      // DC = return indicator
      const serviceType = getCell(row, 'B');
      const customerName = getCell(row, 'AL');
      const line1 = getCell(row, 'AM');
      const line2 = getCell(row, 'AN');
      const city = getCell(row, 'AP');
      const state = getCell(row, 'AQ');
      const zip = getCell(row, 'AR');
      const processedById = getCell(row, 'CB');
      const orderNumber = getCell(row, 'CD');
      const phone = getCell(row, 'CZ');
      const email = getCell(row, 'DA');
      const returnIndicator = getCell(row, 'DC');

      const trackingNumber = extractTrackingNumberFromText([customerName, orderNumber, line1, line2, city, state, zip, phone, email, returnIndicator].join(' '));
      const processedByName = findUserNameByEmployeeId(users, processedById);

      const country = 'US';
      const isReturn = !!returnIndicator && returnIndicator !== '0' && returnIndicator.toLowerCase() !== 'false';

      const incoming = {
        customerName: customerName || '',
        orderNumber: orderNumber || '',
        trackingNumber: trackingNumber || '',
        carrier: 'UPS',
        serviceType: serviceType || '',
        email: email || '',
        phone: phone || '',
        processedById: processedById || '',
        processedByName: processedByName || '',
        address: {
          line1: line1 || '',
          line2: line2 || '',
          city: city || '',
          state: state || '',
          zip: zip || '',
          country: country || '',
          phone: phone || ''
        },
        status: trackingNumber ? 'label-created' : 'requested',
        source: 'campusship-csv',
        isReturn: isReturn ? true : false,
        notes: isReturn ? 'RETURN TO STORE (CampusShip)' : ''
      };

      if (!incoming.customerName && !incoming.trackingNumber && !incoming.orderNumber) {
        warnings.push({ row: i + 2, warning: 'Skipped row (missing name/tracking/order)' });
        continue;
      }

      const result = upsertShipment(incoming, 'campusship-csv');
      if (result.created) created += 1;
      else updated += 1;
    }

    // Ensure the file doesn't introduce duplicates
    dedupeShipmentsInPlace('campusship-csv');

    return res.json({ success: true, rows: rows.length, created, updated, warnings: warnings.slice(0, 100), headerSample: headerRow.slice(0, 30) });
  } catch (error) {
    console.error('Error importing CampusShip CSV:', error);
    return res.status(500).json({ error: 'Failed to import CampusShip CSV', details: error.message });
  }
});

// POST /api/shipments/add - Legacy endpoint used by older UI + Chrome extension
router.post('/add', async (req, res) => {
  try {
    const body = req.body || {};

    // Try to parse details (extension sends JSON string)
    let details = {};
    try {
      details = typeof body.details === 'string' ? JSON.parse(body.details) : (body.details || {});
    } catch (_) {
      details = {};
    }

    const address = details.address || {};

    const incoming = {
      employeeName: details.senderName || details.requestedBy?.employeeName || body.requestedBy?.employeeName || '',
      employeeId: details.requestedBy?.employeeId || body.requestedBy?.employeeId || '',
      customerName: body.recipient || details.recipientName || details.customerName || 'UPS Shipment',
      orderNumber: details.orderNumber || '',
      trackingNumber: body.trackingNumber || details.trackingNumber || '',
      serviceType: details.serviceType || '',
      address: {
        line1: address.line1 || '',
        line2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        zip: address.zip || '',
        country: address.country || 'United States',
        phone: details.phone || ''
      },
      phone: details.phone || '',
      notes: details.notes || 'Imported from extension',
      status: 'requested',
      createdAt: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
      source: 'chrome-extension'
    };

    const { shipment, created } = upsertShipment(incoming, 'chrome-extension');
    return res.json({ success: true, created, shipment });
  } catch (error) {
    console.error('Error in /api/shipments/add:', error);
    return res.status(500).json({ success: false, error: 'Failed to add shipment' });
  }
});

// POST /api/shipments - Create a new shipment request
router.post('/', async (req, res) => {
  try {
    const {
      employeeName,
      employeeId,
      customerName,
      orderNumber,
      trackingNumber,
      serviceType,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      country,
      phone,
      notes,
      status,
      createdAt,
      processedByName,
      processedById
    } = req.body;

    if (!customerName || !addressLine1 || !city || !state || !zip || !country) {
      return res.status(400).json({ error: 'Customer and full address are required' });
    }

    const incoming = {
      employeeName: employeeName || '', // requested by
      employeeId: employeeId || '',
      customerName,
      orderNumber: orderNumber || '',
      trackingNumber: trackingNumber || '',
      serviceType: serviceType || 'UPS Ground Service',
      email: email || '',
      address: {
        line1: addressLine1,
        line2: addressLine2 || '',
        city,
        state,
        zip,
        country,
        phone: phone || ''
      },
      phone: phone || '',
      notes: notes || '',
      status: status || 'requested',
      createdAt: createdAt || new Date().toISOString(),
      processedByName: processedByName || '',
      processedById: processedById || '',
      source: 'employee-request'
    };

    const { shipment } = upsertShipment(incoming, 'employee-request');
    return res.json(shipment);
  } catch (error) {
    console.error('Error creating shipment:', error);
    return res.status(500).json({ error: 'Failed to create shipment' });
  }
});

// PUT /api/shipments/:id - Update a shipment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const shipments = loadShipments();
    const index = shipments.findIndex(s => s.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const existing = shipments[index];
    const next = { ...existing, ...updates };

    // Normalize phone updates into address.phone as well (only when address is structured)
    if (updates.phone !== undefined && getAddressObject(next)) {
      next.address = { ...next.address, phone: updates.phone || '' };
    }

    next.updatedAt = new Date().toISOString();
    shipments[index] = next;
    saveShipments(shipments);

    return res.json(shipments[index]);
  } catch (error) {
    console.error('Error updating shipment:', error);
    return res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// DELETE /api/shipments/:id - Delete a shipment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shipments = loadShipments();
    const index = shipments.findIndex(s => s.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    shipments.splice(index, 1);
    saveShipments(shipments);

    return res.json({ success: true, message: 'Shipment deleted' });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    return res.status(500).json({ error: 'Failed to delete shipment' });
  }
});

// POST /api/shipments/import-email - Import shipments from UPS emails
router.post('/import-email', async (req, res) => {
  try {
    const { UPSEmailParser } = require('../utils/ups-email-parser');
    const parser = new UPSEmailParser();

    // Check if Gmail credentials are configured
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(400).json({
        error: 'Gmail not configured',
        message: 'Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables'
      });
    }

    const daysBack = parseInt(req.body.daysBack) || 7;
    const deleteAfterImport = req.body.deleteAfterImport !== false;
    const result = await parser.fetchAndImportShipments(daysBack, deleteAfterImport);
    // Email importer writes directly to shipments.json; run a merge pass so it combines with existing requests.
    dedupeShipmentsInPlace('email-import');

    return res.json({
      success: result.success,
      message: `Processed ${result.emailsProcessed} emails, created ${result.shipmentsCreated} shipments${result.emailsDeleted ? `, deleted ${result.emailsDeleted} emails` : ''}`,
      ...result
    });
  } catch (error) {
    console.error('Error importing UPS emails:', error);
    return res.status(500).json({ error: 'Failed to import UPS emails', details: error.message });
  }
});

// POST /api/shipments/import-tracking - Manually import a tracking number
router.post('/import-tracking', async (req, res) => {
  try {
    const { tracking, carrier, notes, shipper, destination } = req.body;

    if (!tracking) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    const { UPSEmailParser } = require('../utils/ups-email-parser');
    const parser = new UPSEmailParser();

    const result = parser.importTrackingNumber(tracking, {
      carrier: carrier || 'UPS',
      notes: notes || '',
      shipper: shipper || '',
      destination: destination || ''
    });

    if (result.success) {
      // Imported records also write directly to shipments.json; run a merge pass.
      dedupeShipmentsInPlace('manual-import');
      return res.json({ success: true, shipment: result.shipment });
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error importing tracking:', error);
    return res.status(500).json({ error: 'Failed to import tracking number' });
  }
});

module.exports = router;
