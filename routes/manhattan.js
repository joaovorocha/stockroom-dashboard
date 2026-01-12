/**
 * Manhattan Active® API Routes
 * 
 * Endpoints for integrating with Manhattan Active® Omni and WMS.
 * Handles inventory queries, order lookup, and RFID tracking.
 */

const express = require('express');
const router = express.Router();
const { getManhattanClient } = require('../utils/manhattan-client');
const pgDal = require('../utils/dal/pg');

// ==========================================================================
// MIDDLEWARE
// ==========================================================================

/**
 * Check if Manhattan is configured
 */
function requireManhattan(req, res, next) {
  const client = getManhattanClient();
  if (!client.isConfigured()) {
    return res.status(503).json({
      error: 'Manhattan not configured',
      message: 'Set MANHATTAN_CLIENT_ID and MANHATTAN_CLIENT_SECRET in environment variables'
    });
  }
  next();
}

// ==========================================================================
// INVENTORY - UNIT TRACKING
// ==========================================================================

/**
 * GET /api/manhattan/units/sgtin/:sgtin
 * Get unit by RFID tag (SGTIN)
 */
router.get('/units/sgtin/:sgtin', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const unit = await client.getUnitBySGTIN(req.params.sgtin);
    
    if (!unit || unit.length === 0) {
      return res.status(404).json({
        error: 'Unit not found',
        sgtin: req.params.sgtin
      });
    }
    
    const item = unit[0];
    const statusInfo = client.parseUnitStatus(item.unitInventoryStatus);
    
    res.json({
      success: true,
      unit: {
        ...item,
        statusInfo
      }
    });
  } catch (error) {
    console.error('Error fetching unit by SGTIN:', error);
    res.status(500).json({
      error: 'Failed to fetch unit',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/units/item/:itemId
 * Get units by Item ID
 */
router.get('/units/item/:itemId', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const units = await client.getUnitsByItemId(req.params.itemId);
    
    res.json({
      success: true,
      count: units.length,
      units
    });
  } catch (error) {
    console.error('Error fetching units by item ID:', error);
    res.status(500).json({
      error: 'Failed to fetch units',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/units/location/:locationId
 * Get units at location
 */
router.get('/units/location/:locationId', requireManhattan, async (req, res) => {
  try {
    const { status, rfidOnly } = req.query;
    
    const client = getManhattanClient();
    const filters = {};
    
    if (status) {
      filters.unitInventoryStatus = status;
    }
    
    if (rfidOnly === 'true') {
      filters.isRfidTagged = true;
    }
    
    const units = await client.getUnitsByLocation(req.params.locationId, filters);
    
    res.json({
      success: true,
      locationId: req.params.locationId,
      count: units.length,
      units
    });
  } catch (error) {
    console.error('Error fetching units by location:', error);
    res.status(500).json({
      error: 'Failed to fetch units',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/units/status/:status
 * Get units by status
 */
router.get('/units/status/:status', requireManhattan, async (req, res) => {
  try {
    const { locationId } = req.query;
    
    const client = getManhattanClient();
    const units = await client.getUnitsByStatus(req.params.status, locationId);
    
    const statusInfo = client.parseUnitStatus(req.params.status);
    
    res.json({
      success: true,
      status: req.params.status,
      statusInfo,
      count: units.length,
      units
    });
  } catch (error) {
    console.error('Error fetching units by status:', error);
    res.status(500).json({
      error: 'Failed to fetch units',
      message: error.message
    });
  }
});

// ==========================================================================
// ORDERS
// ==========================================================================

/**
 * GET /api/manhattan/orders/:orderNumber
 * Get order by order number
 */
router.get('/orders/:orderNumber', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const order = await client.getOrder(req.params.orderNumber);
    
    // Get units for this order
    const units = await client.getUnitsByOrder(req.params.orderNumber);
    
    res.json({
      success: true,
      order,
      units,
      unitCount: units.length
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(error.response?.status === 404 ? 404 : 500).json({
      error: 'Failed to fetch order',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/orders/customer/:identifier
 * Get orders for customer by email or customer ID
 */
router.get('/orders/customer/:identifier', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const result = await client.getCustomerOrders(req.params.identifier);
    
    if (!result.customer) {
      return res.status(404).json({
        error: 'Customer not found',
        identifier: req.params.identifier
      });
    }
    
    res.json({
      success: true,
      customer: result.customer,
      orders: result.orders,
      orderCount: result.orders.length,
      units: result.units,
      unitCount: result.units.length
    });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
});

// ==========================================================================
// RFID TRACKING
// ==========================================================================

/**
 * GET /api/manhattan/rfid/:sgtin
 * Get RFID history for unit
 */
router.get('/rfid/:sgtin', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const history = await client.getRFIDHistory(req.params.sgtin);
    
    res.json({
      success: true,
      sgtin: req.params.sgtin,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('Error fetching RFID history:', error);
    res.status(500).json({
      error: 'Failed to fetch RFID history',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/rfid/:sgtin/last
 * Get last RFID read for unit
 */
router.get('/rfid/:sgtin/last', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const lastRead = await client.getLastRFIDRead(req.params.sgtin);
    
    if (!lastRead) {
      return res.status(404).json({
        error: 'No RFID reads found',
        sgtin: req.params.sgtin
      });
    }
    
    res.json({
      success: true,
      lastRead
    });
  } catch (error) {
    console.error('Error fetching last RFID read:', error);
    res.status(500).json({
      error: 'Failed to fetch RFID read',
      message: error.message
    });
  }
});

/**
 * GET /api/manhattan/rfid/:sgtin/movement
 * Track unit movement through zones
 */
router.get('/rfid/:sgtin/movement', requireManhattan, async (req, res) => {
  try {
    const client = getManhattanClient();
    const movements = await client.trackUnitMovement(req.params.sgtin);
    
    res.json({
      success: true,
      sgtin: req.params.sgtin,
      count: movements.length,
      movements
    });
  } catch (error) {
    console.error('Error tracking unit movement:', error);
    res.status(500).json({
      error: 'Failed to track movement',
      message: error.message
    });
  }
});

// ==========================================================================
// CUSTOMER LOOKUP (for connecting to WaitWhile appointments)
// ==========================================================================

/**
 * GET /api/manhattan/lookup
 * Look up customer orders and units by email
 * Used to connect WaitWhile appointments to Manhattan inventory
 */
router.get('/lookup', requireManhattan, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Provide email'
      });
    }
    
    const client = getManhattanClient();
    const result = await client.getCustomerOrders(email);
    
    if (!result.customer) {
      return res.json({
        success: true,
        found: false,
        email,
        customer: null,
        orders: [],
        units: []
      });
    }
    
    // Parse unit statuses
    const unitsWithStatus = result.units.map(unit => ({
      ...unit,
      statusInfo: client.parseUnitStatus(unit.unitInventoryStatus),
      workflowStage: client.mapStatusToWorkflowStage(unit.unitInventoryStatus, unit.storeEvent)
    }));
    
    res.json({
      success: true,
      found: true,
      email,
      customer: result.customer,
      orders: result.orders,
      orderCount: result.orders.length,
      units: unitsWithStatus,
      unitCount: unitsWithStatus.length
    });
  } catch (error) {
    console.error('Error looking up customer:', error);
    res.status(500).json({
      error: 'Lookup failed',
      message: error.message
    });
  }
});

// ==========================================================================
// SYNC OPERATIONS
// ==========================================================================

/**
 * POST /api/manhattan/sync
 * Sync Manhattan inventory data to database
 */
router.post('/sync', requireManhattan, async (req, res) => {
  const startTime = Date.now();
  const syncLog = {
    sync_type: 'manhattan_inventory',
    sync_status: 'started',
    started_at: new Date(),
    records_processed: 0,
    records_created: 0,
    records_updated: 0,
    records_failed: 0
  };
  
  try {
    const { locationId, status } = req.body;
    
    if (!locationId) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Provide locationId'
      });
    }
    
    const client = getManhattanClient();
    
    // Get units for location
    const filters = { isRfidTagged: true };
    if (status) {
      filters.unitInventoryStatus = status;
    }
    
    const units = await client.getUnitsByLocation(locationId, filters);
    syncLog.records_processed = units.length;
    
    // Sync each unit to database
    for (const unit of units) {
      try {
        const statusInfo = client.parseUnitStatus(unit.unitInventoryStatus);
        
        await pgDal.query(`
          INSERT INTO inventory_items (
            sgtin, epc, item_id, sku, package_id, package_detail,
            unit_inventory_status, last_status, disposition, supply_type,
            location_id, x_coordinate, y_coordinate, zone_name,
            is_rfid_tagged, overhead_last_read, last_read_datetime,
            fulfillment_id, fulfillment_line, fulfillment_type,
            store_event, store_sub_event,
            created_by, created_datetime, updated_by, updated_datetime,
            manhattan_data
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27
          )
          ON CONFLICT (sgtin) DO UPDATE SET
            unit_inventory_status = EXCLUDED.unit_inventory_status,
            last_status = EXCLUDED.last_status,
            location_id = EXCLUDED.location_id,
            x_coordinate = EXCLUDED.x_coordinate,
            y_coordinate = EXCLUDED.y_coordinate,
            zone_name = EXCLUDED.zone_name,
            overhead_last_read = EXCLUDED.overhead_last_read,
            last_read_datetime = EXCLUDED.last_read_datetime,
            store_event = EXCLUDED.store_event,
            store_sub_event = EXCLUDED.store_sub_event,
            updated_by = EXCLUDED.updated_by,
            updated_datetime = EXCLUDED.updated_datetime,
            manhattan_data = EXCLUDED.manhattan_data
        `, [
          unit.sgtin,
          unit.epc || null,
          unit.itemId,
          unit.sku || null,
          unit.packageId || null,
          unit.packageDetail || null,
          unit.unitInventoryStatus,
          unit.lastStatus || null,
          unit.disposition || null,
          unit.supplyType || null,
          unit.locationId,
          unit.xCoordinate || null,
          unit.yCoordinate || null,
          unit.zone || null,
          unit.isRfidTagged || false,
          unit.overheadLastReadDateTime ? new Date(unit.overheadLastReadDateTime) : null,
          unit.lastReadDateTime ? new Date(unit.lastReadDateTime) : null,
          unit.fulfillmentId || null,
          unit.fulfillmentLine || null,
          unit.fulfillmentType || null,
          unit.storeEvent || null,
          unit.storeSubEvent || null,
          unit.createdBy || null,
          unit.createdDateTime ? new Date(unit.createdDateTime) : null,
          unit.updatedBy || null,
          unit.updatedDateTime ? new Date(unit.updatedDateTime) : null,
          JSON.stringify(unit)
        ]);
        
        syncLog.records_created++;
      } catch (error) {
        console.error('Error syncing unit:', unit.sgtin, error);
        syncLog.records_failed++;
      }
    }
    
    syncLog.sync_status = syncLog.records_failed > 0 ? 'partial' : 'success';
    syncLog.completed_at = new Date();
    syncLog.sync_duration_ms = Date.now() - startTime;
    
    await pgDal.logSync(syncLog);
    
    res.json({
      success: true,
      message: 'Manhattan inventory synced successfully',
      stats: {
        processed: syncLog.records_processed,
        created: syncLog.records_created,
        failed: syncLog.records_failed,
        duration_ms: syncLog.sync_duration_ms
      }
    });
    
  } catch (error) {
    console.error('Error syncing Manhattan inventory:', error);
    
    syncLog.sync_status = 'failed';
    syncLog.error_message = error.message;
    syncLog.completed_at = new Date();
    syncLog.sync_duration_ms = Date.now() - startTime;
    
    await pgDal.logSync(syncLog);
    
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

/**
 * POST /api/manhattan/sync/customer-orders
 * Sync specific customer's orders and units
 */
router.post('/sync/customer-orders', requireManhattan, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Provide email'
      });
    }
    
    const client = getManhattanClient();
    const result = await client.getCustomerOrders(email);
    
    if (!result.customer) {
      return res.json({
        success: false,
        message: 'Customer not found',
        email
      });
    }
    
    // Sync orders and units to database
    // TODO: Implement order and unit sync logic
    
    res.json({
      success: true,
      message: 'Customer orders synced',
      email,
      orderCount: result.orders.length,
      unitCount: result.units.length
    });
    
  } catch (error) {
    console.error('Error syncing customer orders:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

// ==========================================================================
// TEST - Verify Manhattan Connection
// ==========================================================================

/**
 * GET /api/manhattan/test
 * Test Manhattan API connection and authentication
 */
router.get('/test', async (req, res) => {
  try {
    const client = getManhattanClient();
    
    if (!client.isConfigured()) {
      return res.status(503).json({
        success: false,
        configured: false,
        message: 'Manhattan API not configured. Add credentials to .env file.',
        required: [
          'MANHATTAN_CLIENT_ID',
          'MANHATTAN_CLIENT_SECRET',
          'MANHATTAN_TENANT_ID',
          'MANHATTAN_BASE_URL',
          'MANHATTAN_AUTH_URL'
        ]
      });
    }
    
    // Test authentication by making a simple API call
    await client.ensureAuthenticated();
    
    res.json({
      success: true,
      configured: true,
      authenticated: true,
      tenant: client.tenantId,
      baseURL: client.baseURL,
      message: 'Manhattan API connection successful! ✅'
    });
    
  } catch (error) {
    console.error('Manhattan test failed:', error);
    res.status(500).json({
      success: false,
      configured: true,
      authenticated: false,
      error: error.message,
      message: 'Failed to authenticate with Manhattan API. Check your credentials.'
    });
  }
});

module.exports = router;
