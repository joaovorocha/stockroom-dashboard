/**
 * Shipments API Routes
 *
 * Endpoints for shipment workflow: request → pick → pack → ship → deliver
 * Integrates with PredictSpring, UPS, RFID, and PostgreSQL
 *
 * Developer: Victor Rocha, Stockroom Manager @ Suit Supply
 */

const express = require('express');
const router = express.Router();
const pgDal = require('../utils/dal/pg');
const predictSpring = require('../utils/predictspring-client');
const upsClient = require('../utils/ups-client');

// Middleware: Require authentication (reuse existing auth)
const authMiddleware = require('../middleware/auth');
router.use(authMiddleware);

// ============================================================================
// GET /api/shipments - List shipments (with filters)
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      customer_email: req.query.customer_email,
      order_number: req.query.order_number,
      tracking_number: req.query.tracking_number
    };
    const shipments = await pgDal.getShipments(filters);
    res.json({ shipments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// GET /api/shipments/:id - Get shipment by ID (with items & scans)
// ============================================================================
router.get('/:id', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    const items = await pgDal.getShipmentItems(shipment.id);
    const scans = await pgDal.getShipmentScanEvents(shipment.id);
    res.json({ shipment, items, scans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments - Create shipment (manual or from PredictSpring)
// ============================================================================
router.post('/', async (req, res) => {
  try {
    let shipmentData = req.body;
    // If PredictSpring fulfillment provided, transform
    if (shipmentData.ps_fulfillment) {
      shipmentData = predictSpring.transformFulfillmentToShipment(shipmentData.ps_fulfillment);
    }
    const shipment = await pgDal.createShipment(shipmentData);
    // Optionally create items
    if (shipmentData.items && Array.isArray(shipmentData.items)) {
      for (const item of shipmentData.items) {
        await pgDal.createShipmentItem({ ...item, shipment_id: shipment.id });
      }
    }
    res.status(201).json({ shipment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PATCH /api/shipments/:id - Update shipment (status, address, etc)
// ============================================================================
router.patch('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const shipment = await pgDal.updateShipment(req.params.id, updates);
    res.json({ shipment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/items - Add item to shipment
// ============================================================================
router.post('/:id/items', async (req, res) => {
  try {
    const item = await pgDal.createShipmentItem({ ...req.body, shipment_id: req.params.id });
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PATCH /api/shipments/items/:itemId - Update shipment item
// ============================================================================
router.patch('/items/:itemId', async (req, res) => {
  try {
    const item = await pgDal.updateShipmentItem(req.params.itemId, req.body);
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/scan - Record RFID scan event for shipment
// ============================================================================
router.post('/:id/scan', async (req, res) => {
  try {
    const event = await pgDal.recordShipmentScanEvent({ ...req.body, shipment_id: req.params.id });
    res.status(201).json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/validate-address - Validate shipping address (UPS)
// ============================================================================
router.post('/:id/validate-address', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    const address = {
      addressLine1: shipment.address_line1,
      addressLine2: shipment.address_line2,
      city: shipment.address_city,
      state: shipment.address_state,
      zip: shipment.address_zip,
      country: shipment.address_country
    };
    const result = await upsClient.validateAddress(address);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/label - Generate UPS shipping label (ZPL)
// ============================================================================
router.post('/:id/label', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    const label = await upsClient.createShippingLabel(shipment);
    // Save label info to shipment
    await pgDal.updateShipment(shipment.id, {
      tracking_number: label.trackingNumber,
      label_generated: true,
      label_file_path: label.labelPath,
      label_generated_at: new Date(),
      ups_raw_response: label.rawResponse
    });
    res.json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/print-label - Print ZPL label to Zebra printer
// ============================================================================
router.post('/:id/print-label', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment || !shipment.label_file_path) return res.status(404).json({ error: 'Label not found' });
    const zplContent = require('fs').readFileSync(`.${shipment.label_file_path}`, 'utf-8');
    const { printerIp, printerPort } = req.body;
    await upsClient.printLabel(zplContent, printerIp, printerPort || 9100);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PATCH /api/shipments/:id/status - Update shipment status (BOH workflow)
// ============================================================================
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, employeeId, notes } = req.body;
    const updates = { status };
    if (notes) updates.notes = notes;
    
    // Set employee tracking fields based on status transition
    if (status === 'PICKING' && !updates.picking_started_at) {
      updates.picking_started_at = new Date();
      updates.assigned_picker_id = employeeId;
    } else if (status === 'READY_TO_PACK' && !updates.all_items_picked_at) {
      updates.all_items_picked_at = new Date();
      updates.picked_by_id = employeeId;
    } else if (status === 'PACKING' && !updates.packing_started_at) {
      updates.packing_started_at = new Date();
    } else if (status === 'PACKED' && !updates.packed_at) {
      updates.packed_at = new Date();
      updates.packed_by_id = employeeId;
    } else if (status === 'IN_TRANSIT' && !updates.shipped_at) {
      updates.shipped_at = new Date();
    }
    
    const shipment = await pgDal.updateShipment(req.params.id, updates);
    
    // Broadcast real-time update to all connected clients
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('shipment_updated', {
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipment_number,
        status: shipment.status,
        updatedBy: req.user?.name || 'Unknown'
      });
    }
    
    res.json({ shipment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PATCH /api/shipments/:id/assign-picker - Assign BOH picker to shipment
// ============================================================================
router.patch('/:id/assign-picker', async (req, res) => {
  try {
    const { assignedPickerId } = req.body;
    const shipment = await pgDal.updateShipment(req.params.id, {
      assigned_picker_id: assignedPickerId,
      status: 'PICKING',
      picking_started_at: new Date()
    });
    
    // Broadcast real-time update
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('shipment_updated', {
        shipmentId: shipment.id,
        shipmentNumber: shipment.shipment_number,
        status: 'PICKING',
        updatedBy: req.user?.name || 'Unknown'
      });
    }
    
    res.json({ shipment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/items/:itemId/pick - Mark item as picked
// ============================================================================
router.post('/:id/items/:itemId/pick', async (req, res) => {
  try {
    const { pickedById } = req.body;
    const item = await pgDal.updateShipmentItem(req.params.itemId, {
      picked: true,
      picked_at: new Date(),
      picked_by_id: pickedById
    });
    
    // Check if all items are picked, auto-transition to READY_TO_PACK
    const allItems = await pgDal.getShipmentItems(req.params.id);
    const allPicked = allItems.every(i => i.picked);
    if (allPicked) {
      const shipment = await pgDal.updateShipment(req.params.id, {
        status: 'READY_TO_PACK',
        all_items_picked_at: new Date(),
        picked_by_id: pickedById
      });
      
      // Broadcast auto-transition
      const broadcastUpdate = req.app.get('broadcastUpdate');
      if (broadcastUpdate) {
        broadcastUpdate('shipment_updated', {
          shipmentId: shipment.id,
          shipmentNumber: shipment.shipment_number,
          status: 'READY_TO_PACK',
          updatedBy: req.user?.name || 'Unknown',
          message: 'All items picked - ready to pack'
        });
      }
    } else {
      // Broadcast item picked progress
      const broadcastUpdate = req.app.get('broadcastUpdate');
      if (broadcastUpdate) {
        const shipment = await pgDal.getShipmentById(req.params.id);
        broadcastUpdate('shipment_item_picked', {
          shipmentId: req.params.id,
          shipmentNumber: shipment?.shipment_number,
          itemId: item.id,
          pickedCount: allItems.filter(i => i.picked).length,
          totalItems: allItems.length,
          updatedBy: req.user?.name || 'Unknown'
        });
      }
    }
    
    res.json({ item, allPicked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/shipments/:id/generate-label - Alias for /label endpoint
// ============================================================================
router.post('/:id/generate-label', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    const label = await upsClient.createShippingLabel(shipment);
    // Save label info to shipment
    const updatedShipment = await pgDal.updateShipment(shipment.id, {
      tracking_number: label.trackingNumber,
      label_generated: true,
      label_file_path: label.labelPath,
      label_generated_at: new Date(),
      status: 'LABEL_CREATED',
      ups_raw_response: label.rawResponse
    });
    
    // Broadcast label generation
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('shipment_updated', {
        shipmentId: updatedShipment.id,
        shipmentNumber: updatedShipment.shipment_number,
        status: 'LABEL_CREATED',
        trackingNumber: label.trackingNumber,
        updatedBy: req.user?.name || 'Unknown',
        message: 'Shipping label generated'
      });
    }
    
    res.json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
