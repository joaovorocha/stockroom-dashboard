/**
 * Printer Management Routes
 * 
 * Handles printer discovery, registration, testing, and printing
 * Supports: Zebra ZPL, Epson ESC/POS
 */

const express = require('express');
const router = express.Router();
const printerClient = require('../utils/printer-client');
const { query: pgQuery } = require('../utils/dal/pg');

// ============================================================================
// PRINTER DISCOVERY & MANAGEMENT
// ============================================================================

/**
 * GET /api/printers
 * Get all registered printers
 */
router.get('/', (req, res) => {
  const printers = printerClient.getPrinters();
  res.json({ printers });
});

/**
 * POST /api/printers/discover
 * Auto-discover printers on network
 */
router.post('/discover', async (req, res) => {
  try {
    const discovered = await printerClient.discoverZebraPrinters();
    res.json({ 
      success: true, 
      discovered,
      message: `Found ${discovered.length} printer(s)`
    });
  } catch (error) {
    console.error('[Printers] Discovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/register
 * Manually register a printer
 */
router.post('/register', (req, res) => {
  const { ip, type, model } = req.body;
  
  if (!ip || !type) {
    return res.status(400).json({ error: 'IP and type required' });
  }
  
  printerClient.registerPrinter(ip, type, model);
  res.json({ success: true, message: 'Printer registered' });
});

/**
 * GET /api/printers/:ip/status
 * Get printer status
 */
router.get('/:ip/status', async (req, res) => {
  try {
    const status = await printerClient.getPrinterStatus(req.params.ip);
    res.json(status);
  } catch (error) {
    console.error('[Printers] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/:ip/test
 * Test printer connectivity
 */
router.post('/:ip/test', async (req, res) => {
  try {
    const result = await printerClient.testPrinter(req.params.ip);
    res.json(result);
  } catch (error) {
    console.error('[Printers] Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// LABEL PRINTING (Zebra ZPL)
// ============================================================================

/**
 * POST /api/printers/print/product-label
 * Print product barcode label
 */
router.post('/print/product-label', async (req, res) => {
  try {
    const { sku, description, price, barcode, printerIp } = req.body;
    
    if (!sku || !barcode) {
      return res.status(400).json({ error: 'SKU and barcode required' });
    }
    
    const zpl = printerClient.generateProductLabel(
      sku, 
      description || 'Product', 
      price || '0.00', 
      barcode
    );
    
    const result = await printerClient.printZPL(zpl, printerIp);
    
    // Log to database
    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['product_label', { sku, barcode }, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log product label print job:', logError.message);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Product label error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/shelf-label
 * Print shelf location label
 */
router.post('/print/shelf-label', async (req, res) => {
  try {
    const { location, zone, capacity, printerIp } = req.body;
    
    if (!location) {
      return res.status(400).json({ error: 'Location required' });
    }
    
    const zpl = printerClient.generateShelfLabel(
      location,
      zone || 'A',
      capacity || '100'
    );
    
    const result = await printerClient.printZPL(zpl, printerIp);
    
    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['shelf_label', { location, zone }, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log shelf label print job:', logError.message);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Shelf label error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/rfid-label
 * Print RFID tag label
 */
router.post('/print/rfid-label', async (req, res) => {
  try {
    const { sgtin, sku, description, printerIp } = req.body;
    
    if (!sgtin || !sku) {
      return res.status(400).json({ error: 'SGTIN and SKU required' });
    }
    
    const zpl = printerClient.generateRFIDLabel(sgtin, sku, description);
    const result = await printerClient.printZPL(zpl, printerIp);
    
    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['rfid_label', { sgtin, sku }, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log RFID label print job:', logError.message);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] RFID label error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/shipping-label
 * Print shipping label (from shipment data)
 */
router.post('/print/shipping-label', async (req, res) => {
  try {
    const { shipmentId, printerIp } = req.body;
    
    if (!shipmentId) {
      return res.status(400).json({ error: 'Shipment ID required' });
    }
    
    // Fetch shipment data
    const shipmentResult = await pgQuery(
      'SELECT * FROM shipments WHERE id = $1',
      [shipmentId]
    );
    
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const shipment = shipmentResult.rows[0];
    
    // Generate ZPL from shipment data
    const zpl = generateShippingLabelZPL(shipment);
    const result = await printerClient.printZPL(zpl, printerIp);
    
    // Update shipment status
    await pgQuery(
      `UPDATE shipments 
       SET status = 'LABEL_PRINTED', label_printed_at = NOW()
       WHERE id = $1`,
      [shipmentId]
    );

    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['shipping_label', { shipment_id: shipmentId }, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log shipping label print job:', logError.message);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Shipping label error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/zpl
 * Print raw ZPL (advanced)
 */
router.post('/print/zpl', async (req, res) => {
  try {
    const { zpl, printerIp } = req.body;
    
    if (!zpl) {
      return res.status(400).json({ error: 'ZPL content required' });
    }
    
    const result = await printerClient.printZPL(zpl, printerIp);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] ZPL print error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RECEIPT PRINTING (Epson ESC/POS)
// ============================================================================

/**
 * POST /api/printers/print/receipt
 * Print order receipt by PSU number
 */
router.post('/print/receipt', async (req, res) => {
  try {
    const { psuNumber, orderNumber, printerIp } = req.body;
    
    if (!psuNumber && !orderNumber) {
      return res.status(400).json({ error: 'PSU number or order number required' });
    }
    
    // Fetch order from PredictSpring or local database
    const orderData = await fetchOrderData(psuNumber || orderNumber);
    
    if (!orderData) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const result = await printerClient.printReceipt(orderData, printerIp);
    
    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['receipt', { psu_number: psuNumber }, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log receipt print job:', logError.message);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Receipt print error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/receipt-data
 * Print receipt from provided data (no lookup)
 */
router.post('/print/receipt-data', async (req, res) => {
  try {
    const { receiptData, printerIp } = req.body;
    
    if (!receiptData) {
      return res.status(400).json({ error: 'Receipt data required' });
    }
    
    const result = await printerClient.printReceipt(receiptData, printerIp);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Receipt print error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/printers/print/freezer-label
 * Print freezer label receipt data (Epson ESC/POS)
 */
router.post('/print/freezer-label', async (req, res) => {
  try {
    const { labelData, printerIp } = req.body;

    if (!labelData) {
      return res.status(400).json({ error: 'Label data required' });
    }

    const requiredFields = ['foodItem', 'fullName', 'email', 'createdBy', 'createdAt', 'expiresAt', 'expirationDays'];
    for (const field of requiredFields) {
      if (!labelData[field]) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    const result = await printerClient.printFreezerLabel(labelData, printerIp);

    try {
      await pgQuery(
        `INSERT INTO print_jobs (type, data, printer_ip, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['freezer_label', labelData, result.printer, 'completed']
      );
    } catch (logError) {
      console.warn('[Printers] Failed to log freezer label print job:', logError.message);
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Printers] Freezer label print error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PRINT HISTORY
// ============================================================================

/**
 * GET /api/printers/print-jobs
 * Get recent print jobs
 */
router.get('/print-jobs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await pgQuery(
      `SELECT * FROM print_jobs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('[Printers] Print jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/printers/print/freezer-history
 * Get recent freezer label print jobs
 */
router.get('/print/freezer-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await pgQuery(
      `SELECT * FROM print_jobs
       WHERE type = 'freezer_label'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('[Printers] Freezer history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate shipping label ZPL from shipment data
 */
function generateShippingLabelZPL(shipment) {
  const {
    tracking_number,
    destination_address,
    carrier,
    service_level
  } = shipment;
  
  // 4" x 6" shipping label
  return `^XA
^FO50,50^A0N,40,40^FD${carrier || 'UPS'}^FS
^FO50,100^A0N,30,30^FD${service_level || 'Ground'}^FS
^FO50,150^BY3^BCN,100,N,N,N^FD${tracking_number}^FS
^FO50,270^A0N,25,25^FDTracking: ${tracking_number}^FS
^FO50,310^A0N,30,30^FDTO:^FS
^FO50,350^A0N,25,25^FD${destination_address?.name || ''}^FS
^FO50,380^A0N,25,25^FD${destination_address?.street1 || ''}^FS
^FO50,410^A0N,25,25^FD${destination_address?.city || ''}, ${destination_address?.state || ''} ${destination_address?.zip || ''}^FS
^XZ`;
}

/**
 * Fetch order data from PredictSpring (or mock)
 * Automatically uses mock if real API not configured
 */
async function fetchOrderData(identifier) {
  try {
    // Try PredictSpring mock client first
    const { mockClient, MOCK_ENABLED } = require('../utils/mock-predictspring-client');
    
    if (MOCK_ENABLED) {
      console.log('[Printers] Using mock PredictSpring client');
      try {
        const order = await mockClient.getOrder(identifier);
        return {
          orderNumber: order.orderNumber,
          psuNumber: order.psuNumber,
          customerName: order.customerName,
          items: order.items.map(item => ({
            sku: item.sku,
            description: item.description,
            price: item.price.toFixed(2),
            quantity: item.quantity
          })),
          total: order.totalAmount.toFixed(2)
        };
      } catch (mockError) {
        console.warn('[Printers] Mock order not found, trying database...');
      }
    }
    
    // Fallback to local database
    const result = await pgQuery(
      `SELECT * FROM orders WHERE psu_number = $1 OR order_number = $1 LIMIT 1`,
      [identifier]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const order = result.rows[0];
    
    // Fetch items
    const itemsResult = await pgQuery(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );
    
    return {
      orderNumber: order.order_number,
      psuNumber: order.psu_number,
      customerName: order.customer_name,
      items: itemsResult.rows,
      total: order.total_amount
    };
  } catch (error) {
    console.error('[Printers] Order fetch error:', error);
    return null;
  }
}

module.exports = router;
