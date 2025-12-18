const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getTrackingStatus } = require('../utils/upsApi');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const SHIPMENTS_FILE = path.join(__dirname, '../data/shipments.json');

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
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveShipments(shipments) {
  fs.writeFileSync(SHIPMENTS_FILE, JSON.stringify(shipments, null, 2));
}

// GET /api/shipments - Get all shipment requests (enriched with UPS status when tracking is available)
router.get('/', async (req, res) => {
  try {
    const shipments = loadShipments();

    // Enrich with latest UPS status if trackingNumber exists
    const enriched = await Promise.all(shipments.map(async (s) => {
      const statusFromUPS = s.trackingNumber ? await getTrackingStatus(s.trackingNumber) : s.statusFromUPS || '';
      return { ...s, statusFromUPS };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching shipments:', error);
    return res.status(500).json({ error: 'Failed to fetch shipments' });
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

    const shipments = loadShipments();
    const newShipment = {
      id: generateId(),
      employeeName: employeeName || '', // requested by
      employeeId: employeeId || '',
      customerName,
      orderNumber: orderNumber || '',
      trackingNumber: trackingNumber || '',
      serviceType: serviceType || 'UPS Ground Service',
      address: {
        line1: addressLine1,
        line2: addressLine2 || '',
        city,
        state,
        zip,
        country,
        phone: phone || ''
      },
      notes: notes || '',
      status: status || 'requested',
      createdAt: createdAt || new Date().toISOString(),
      processedByName: processedByName || '',
      processedById: processedById || ''
    };

    shipments.push(newShipment);
    saveShipments(shipments);

    return res.json(newShipment);
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

    shipments[index] = { ...shipments[index], ...updates };
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
