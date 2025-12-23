const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getTrackingStatus } = require('../utils/upsApi');
const dal = require('../utils/dal');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const SHIPMENTS_FILE = dal.paths.shipmentsFile;
const SHIPMENTS_BACKUP_DIR = dal.paths.shipmentsBackupDir;

// Ensure data directory exists
dal.ensureDir(path.dirname(SHIPMENTS_FILE));

// Initialize shipments file if it doesn't exist
if (!fs.existsSync(SHIPMENTS_FILE)) {
  dal.writeJsonAtomic(SHIPMENTS_FILE, [], { pretty: true });
}

function loadShipments() {
  const parsed = dal.readJson(SHIPMENTS_FILE, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveShipments(shipments) {
  dal.writeJsonWithBackups(SHIPMENTS_FILE, shipments, {
    backupDir: SHIPMENTS_BACKUP_DIR,
    backupsToKeep: 20,
    pretty: true
  });
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
  merged.processedByImageUrl = merged.processedByImageUrl || incoming.processedByImageUrl || '';

  // UPS email-derived fields (optional)
  if (merged.packageCount === undefined && incoming.packageCount !== undefined) merged.packageCount = incoming.packageCount;
  if (merged.packageWeightLbs === undefined && incoming.packageWeightLbs !== undefined) merged.packageWeightLbs = incoming.packageWeightLbs;
  merged.referenceNumber1 = merged.referenceNumber1 || incoming.referenceNumber1 || '';
  merged.referenceNumber2 = merged.referenceNumber2 || incoming.referenceNumber2 || '';

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

function canManageShipments(user) {
  const role = (user?.role || '').toString().toUpperCase();
  return !!(user?.isAdmin || user?.isManager || role === 'MANAGEMENT' || role === 'BOH');
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
    if (!canManageShipments(req.user)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

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
    if (!canManageShipments(req.user)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

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
    if (!canManageShipments(req.user)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

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
    if (!canManageShipments(req.user)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

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
    // Safer default: never delete emails unless explicitly requested.
    const deleteAfterImport = req.body.deleteAfterImport === true;
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
    if (!canManageShipments(req.user)) {
      return res.status(403).json({ error: 'Manager access required' });
    }

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
