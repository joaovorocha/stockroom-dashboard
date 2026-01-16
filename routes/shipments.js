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

// Helper function to convert snake_case to camelCase
function snakeToCamel(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = snakeToCamel(value);
  }
  return result;
}

// Note: Auth middleware applied at server.js level for this route

// ============================================================================
// GET /api/shipments - List shipments (with filters)
// ============================================================================
router.get('/', async (req, res) => {
  try {
    // Default retrieval window: last 7 days unless caller requests full dataset
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const filters = {
      status: req.query.status,
      customer_email: req.query.customer_email,
      order_number: req.query.order_number,
      tracking_number: req.query.tracking_number
    };

    // If caller provides `all=true` we return full dataset; if `since` provided, use it.
    if (String(req.query.all).toLowerCase() === 'true') {
      // no created_after filter
    } else if (req.query.since) {
      filters.created_after = new Date(req.query.since);
    } else {
      // default: last 7 days
      filters.created_after = sevenDaysAgo;
    }

    const shipments = await pgDal.getShipments(filters);
    let transformedShipments = shipments.map(snakeToCamel);

    // Enforce UPS '1Z' tracking prefix server-side by default so other clients
    // only receive canonical UPS shipments. To override (dev use only), pass
    // `allow_non_1z=true` as a query parameter.
    if (String(req.query.allow_non_1z).toLowerCase() !== 'true') {
      transformedShipments = transformedShipments.filter(s => {
        const t = String(s.trackingNumber || s.tracking || '').trim().toUpperCase();
        return t.startsWith('1Z');
      });
    }

    res.json({ shipments: transformedShipments });
  } catch (err) {
    console.error('[/api/shipments] Error loading shipments:', err); // DETAILED LOG
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
    res.json({ 
      shipment: snakeToCamel(shipment), 
      items: items.map(snakeToCamel), 
      scans: scans.map(snakeToCamel) 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// GET /api/shipments/:id/tracking - Get real-time tracking from UPS
// ============================================================================
router.get('/:id/tracking', async (req, res) => {
  try {
    const shipment = await pgDal.getShipmentById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (!shipment.tracking_number) {
      return res.status(400).json({ error: 'Shipment does not have a tracking number' });
    }

    // 1. Fetch tracking details from UPS
    const trackingDetails = await upsClient.getTrackingDetails(shipment.tracking_number);
    if (!trackingDetails || !trackingDetails.events) {
      return res.status(502).json({ error: 'Failed to retrieve tracking details from UPS' });
    }

    // 2. Update our database with the latest info (in a transaction)
    await pgDal.updateShipmentTrackingInfo(shipment.id, trackingDetails);
    const trackingEvents = await pgDal.createShipmentTrackingEvents(shipment.id, trackingDetails.events);

    // 3. Return the detailed tracking history
    res.json({
      shipmentId: shipment.id,
      trackingNumber: shipment.tracking_number,
      latestStatus: trackingDetails.latestStatus,
      estimatedDelivery: trackingDetails.estimatedDelivery,
      history: trackingEvents.map(snakeToCamel),
    });
  } catch (err) {
    console.error(`[/api/shipments/:id/tracking] Error getting tracking info for shipment ${req.params.id}:`, err);
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

    // Subscribe to webhook updates for the new tracking number
    if (label.trackingNumber) {
      await upsClient.subscribeToTrackingAlerts([label.trackingNumber]);
      await pgDal.updateShipment(shipment.id, { webhook_subscribed_at: new Date() });
    }

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
    
    // Subscribe to webhook updates for the new tracking number
    if (label.trackingNumber) {
      await upsClient.subscribeToTrackingAlerts([label.trackingNumber]);
      await pgDal.updateShipment(shipment.id, { webhook_subscribed_at: new Date() });
    }

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

// ============================================================================
// POST /api/shipments/refresh-statuses - Manually refresh all active shipments
// ============================================================================
router.post('/refresh-statuses', async (req, res) => {
  try {
    // Fetch all shipments that are not in a final state
    const activeShipments = await pgDal.getShipments({ status: ['REQUESTED', 'PICKING', 'READY_TO_PACK', 'PACKING', 'PACKED', 'LABEL_CREATED', 'In-Transit', 'Unknown', 'Exception'] });
    
    let updatedCount = 0;
    const errors = [];

    console.log(`[Manual Refresh] Found ${activeShipments.length} active shipments to refresh.`);

    // Process sequentially to avoid hitting API rate limits
    for (const shipment of activeShipments) {
      if (!shipment.tracking_number) continue;

      try {
        const trackingDetails = await upsClient.getTrackingDetails(shipment.tracking_number);
        if (trackingDetails && trackingDetails.latestStatus) {
          await pgDal.updateShipmentTrackingInfo(shipment.id, trackingDetails);
          updatedCount++;
        }
      } catch (err) {
        console.error(`[Manual Refresh] Error refreshing shipment ${shipment.id}:`, err.message);
        errors.push({ shipmentId: shipment.id, error: err.message });
      }
    }

    console.log(`[Manual Refresh] Completed. Updated: ${updatedCount}, Errors: ${errors.length}`);
    
    // Broadcast a general update to all clients to trigger a refresh
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('shipments_refreshed', {
        updatedCount,
        message: `Bulk refresh complete. ${updatedCount} shipments updated.`
      });
    }

    res.json({ success: true, updatedCount, errors });

  } catch (err) {
    console.error('[Manual Refresh] Failed to refresh shipment statuses:', err);
    res.status(500).json({ error: 'Failed to refresh statuses' });
  }
});

// ============================================================================
// DELETE /api/shipments/:id - Delete shipment (manager only)
// ============================================================================
router.delete('/:id', async (req, res) => {
  try {
    const user = req.user || {};
    if (!user.isManager && !user.isAdmin) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const deleted = await pgDal.deleteShipment(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Shipment not found' });

    // Log deletion for audit and broadcast to connected clients
    console.info(`[shipments] Shipment deleted id=${deleted.id} by=${user.email || user.name || 'unknown'}`);
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      broadcastUpdate('shipment_deleted', {
        shipmentId: deleted.id,
        deletedBy: user.name || user.email || 'Unknown',
        deletedAt: new Date()
      });
    }

    res.json({ deleted });
  } catch (err) {
    console.error('[/api/shipments DELETE] Error deleting shipment:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

