/**
 * Mock API Routes
 * 
 * Demonstration endpoints using mock PredictSpring and Manhattan clients.
 * These routes help test the system before real API credentials are available.
 * 
 * Enable/disable via .env:
 * MOCK_PREDICTSPRING=true
 * MOCK_MANHATTAN=true
 */

const express = require('express');
const router = express.Router();
const { mockClient: psMock, MOCK_ENABLED: PS_MOCK } = require('../utils/mock-predictspring-client');
const { mockClient: mhMock, MOCK_ENABLED: MH_MOCK } = require('../utils/mock-manhattan-client');

// ============================================================================
// STATUS & HEALTH
// ============================================================================

/**
 * GET /api/mock/status
 * Check which mocks are enabled
 */
router.get('/status', async (req, res) => {
  try {
    const psHealth = PS_MOCK ? await psMock.healthCheck() : { status: 'disabled', mock: false };
    const mhHealth = MH_MOCK ? await mhMock.healthCheck() : { status: 'disabled', mock: false };
    
    res.json({
      predictSpring: psHealth,
      manhattan: mhHealth,
      environment: {
        MOCK_PREDICTSPRING: process.env.MOCK_PREDICTSPRING || 'not set',
        MOCK_MANHATTAN: process.env.MOCK_MANHATTAN || 'not set',
        PREDICTSPRING_API_KEY: process.env.PREDICTSPRING_API_KEY ? 'configured' : 'not set',
        MANHATTAN_API_KEY: process.env.MANHATTAN_API_KEY ? 'configured' : 'not set'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PREDICTSPRING MOCK ENDPOINTS
// ============================================================================

/**
 * GET /api/mock/orders/:identifier
 * Get order by PSU or order number
 */
router.get('/orders/:identifier', async (req, res) => {
  if (!PS_MOCK) {
    return res.status(503).json({ error: 'PredictSpring mock is disabled' });
  }
  
  try {
    const order = await psMock.getOrder(req.params.identifier);
    res.json(order);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/mock/orders
 * Get all orders with filters
 */
router.get('/orders', async (req, res) => {
  if (!PS_MOCK) {
    return res.status(503).json({ error: 'PredictSpring mock is disabled' });
  }
  
  try {
    const orders = await psMock.getOrders(req.query);
    res.json({ orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mock/orders/:identifier/status
 * Update order status
 */
router.post('/orders/:identifier/status', async (req, res) => {
  if (!PS_MOCK) {
    return res.status(503).json({ error: 'PredictSpring mock is disabled' });
  }
  
  try {
    const { status } = req.body;
    const order = await psMock.updateOrderStatus(req.params.identifier, status);
    res.json(order);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/mock/orders
 * Add custom mock order (for testing)
 */
router.post('/orders', async (req, res) => {
  if (!PS_MOCK) {
    return res.status(503).json({ error: 'PredictSpring mock is disabled' });
  }
  
  try {
    const order = psMock.addMockOrder(req.body);
    res.json({ success: true, order });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// MANHATTAN MOCK ENDPOINTS
// ============================================================================

/**
 * GET /api/mock/inventory/:unitId
 * Get unit inventory by Unit ID
 */
router.get('/inventory/:unitId', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const unit = await mhMock.getUnitInventory(req.params.unitId);
    res.json(unit);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/mock/inventory
 * Get all inventory with filters
 */
router.get('/inventory', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const inventory = await mhMock.getAllInventory(req.query);
    res.json({ inventory, count: inventory.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mock/inventory/sku/:sku
 * Get inventory by SKU
 */
router.get('/inventory/sku/:sku', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const items = await mhMock.getInventoryBySKU(req.params.sku);
    res.json({ items, count: items.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mock/locations/:code
 * Get location details
 */
router.get('/locations/:code', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const location = await mhMock.getLocation(req.params.code);
    res.json(location);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/mock/inventory/:unitId
 * Update inventory quantity
 */
router.post('/inventory/:unitId', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const { quantity } = req.body;
    const unit = await mhMock.updateInventory(req.params.unitId, quantity);
    res.json(unit);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/mock/inventory
 * Add custom mock inventory (for testing)
 */
router.post('/inventory', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const item = mhMock.addMockInventory(req.body);
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// DEMO WORKFLOWS
// ============================================================================

/**
 * GET /api/mock/demo/receipt/:psuNumber
 * Demo: Print receipt using mock order data
 */
router.get('/demo/receipt/:psuNumber', async (req, res) => {
  if (!PS_MOCK) {
    return res.status(503).json({ error: 'PredictSpring mock is disabled' });
  }
  
  try {
    const order = await psMock.getOrder(req.params.psuNumber);
    
    const receiptData = {
      orderNumber: order.orderNumber,
      psuNumber: order.psuNumber,
      customerName: order.customerName,
      items: order.items,
      total: order.totalAmount.toFixed(2)
    };
    
    res.json({
      message: 'Receipt data ready for printing',
      receiptData,
      printEndpoint: 'POST /api/printers/print/receipt-data'
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/mock/demo/location-label/:code
 * Demo: Generate shelf label using mock location data
 */
router.get('/demo/location-label/:code', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const location = await mhMock.getLocation(req.params.code);
    
    const labelData = {
      location: location.code,
      zone: location.zone,
      capacity: location.capacity.toString()
    };
    
    res.json({
      message: 'Shelf label data ready for printing',
      labelData,
      printEndpoint: 'POST /api/printers/print/shelf-label'
    });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/mock/demo/product-label/:sku
 * Demo: Generate product label using mock inventory data
 */
router.get('/demo/product-label/:sku', async (req, res) => {
  if (!MH_MOCK) {
    return res.status(503).json({ error: 'Manhattan mock is disabled' });
  }
  
  try {
    const items = await mhMock.getInventoryBySKU(req.params.sku);
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'SKU not found' });
    }
    
    const item = items[0];
    
    const labelData = {
      sku: item.sku,
      description: item.description,
      price: '599.00', // Mock price
      barcode: item.sku // Use SKU as barcode
    };
    
    res.json({
      message: 'Product label data ready for printing',
      labelData,
      printEndpoint: 'POST /api/printers/print/product-label'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
