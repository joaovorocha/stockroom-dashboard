/**
 * RFID Tracking Routes
 * 
 * Endpoints for Zebra RFID scanner integration.
 * Handles RFID scan events, location tracking, and item movement.
 */

const express = require('express');
const router = express.Router();
const pgDal = require('../utils/dal/pg');

// ==========================================================================
// RFID SCAN EVENT PROCESSING
// ==========================================================================

/**
 * POST /api/rfid/scan
 * Record RFID scan event
 * 
 * Called by Zebra scanners or scanner middleware when an RFID tag is read.
 * Tracks item location and movement through store zones.
 */
router.post('/scan', async (req, res) => {
  try {
    const {
      sgtin,  // RFID tag (required)
      epc,    // EPC code (optional)
      scanType = 'handheld',  // 'overhead', 'handheld', 'portal', 'inventory'
      scannerId,  // Scanner device ID
      scannerLocation,  // Physical scanner location
      zoneCode,  // Zone code: 'COG', 'BOH', 'RACK', 'FITTING', 'FLOOR'
      xCoordinate,
      yCoordinate,
      scannedBy,  // Employee email or ID
      movementType,  // 'received', 'moved', 'picked', 'returned', 'staged'
      notes
    } = req.body;
    
    if (!sgtin) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'sgtin (RFID tag) is required'
      });
    }
    
    // Find zone by code
    let zoneId = null;
    if (zoneCode) {
      const zoneResult = await pgDal.query(
        'SELECT id FROM store_zones WHERE zone_code = $1',
        [zoneCode]
      );
      if (zoneResult.rows.length > 0) {
        zoneId = zoneResult.rows[0].id;
      }
    }
    
    // Find employee by email
    let scannedById = null;
    let scannedByName = null;
    if (scannedBy) {
      const employee = await pgDal.getEmployeeByEmail(scannedBy);
      if (employee) {
        scannedById = employee.id;
        scannedByName = employee.name;
      }
    }
    
    // Get previous location for this tag
    const previousScan = await pgDal.getLastRFIDScan(sgtin);
    const previousZoneId = previousScan ? previousScan.zone_id : null;
    
    // Record scan
    const scan = await pgDal.recordRFIDScan({
      sgtin,
      epc,
      scan_type: scanType,
      scanner_id: scannerId,
      scanner_location: scannerLocation,
      zone_id: zoneId,
      zone_code: zoneCode,
      x_coordinate: xCoordinate,
      y_coordinate: yCoordinate,
      scanned_by_id: scannedById,
      scanned_by_name: scannedByName,
      previous_zone_id: previousZoneId,
      movement_type: movementType,
      scanned_at: new Date(),
      raw_scan_data: req.body
    });
    
    // Update inventory item location
    await pgDal.query(`
      UPDATE inventory_items
      SET 
        last_scanned_zone_id = $2,
        last_scanned_at = $3,
        zone_id = $2
      WHERE sgtin = $1
    `, [sgtin, zoneId, new Date()]);
    
    // Update pickup item location if this item belongs to a pickup
    await pgDal.query(`
      UPDATE pickup_items
      SET 
        current_zone_id = $2,
        last_scanned_at = $3,
        last_scanned_by_id = $4
      WHERE rfid_tag = $1
    `, [sgtin, zoneId, new Date(), scannedById]);
    
    // Update pickup status if item moved to rack
    if (zoneCode === 'RACK') {
      await pgDal.query(`
        UPDATE pickups p
        SET 
          in_rack = true,
          current_zone_id = $2,
          state = 'in_rack'
        FROM pickup_items pi
        WHERE pi.pickup_id = p.id
          AND pi.rfid_tag = $1
      `, [sgtin, zoneId]);
    }
    
    res.json({
      success: true,
      message: 'RFID scan recorded',
      scan: {
        id: scan.id,
        sgtin: scan.sgtin,
        zone_code: zoneCode,
        scanned_at: scan.scanned_at,
        movement: previousZoneId !== zoneId ? 'moved' : 'same_location',
        previous_zone_id: previousZoneId,
        current_zone_id: zoneId
      }
    });
    
  } catch (error) {
    console.error('Error recording RFID scan:', error);
    res.status(500).json({
      error: 'Failed to record scan',
      message: error.message
    });
  }
});

/**
 * POST /api/rfid/scan/batch
 * Record multiple RFID scans at once
 * 
 * Used for overhead readers or batch inventory scans.
 */
router.post('/scan/batch', async (req, res) => {
  try {
    const { scans } = req.body;
    
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'scans array is required'
      });
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const scanData of scans) {
      try {
        // Process each scan using the single scan endpoint logic
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/rfid/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scanData)
        });
        
        if (response.ok) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            sgtin: scanData.sgtin,
            error: await response.text()
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          sgtin: scanData.sgtin,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${scans.length} scans`,
      results
    });
    
  } catch (error) {
    console.error('Error processing batch scans:', error);
    res.status(500).json({
      error: 'Batch scan failed',
      message: error.message
    });
  }
});

// ==========================================================================
// RFID LOCATION QUERIES
// ==========================================================================

/**
 * GET /api/rfid/location/:sgtin
 * Get current location of RFID tag
 */
router.get('/location/:sgtin', async (req, res) => {
  try {
    const lastScan = await pgDal.getLastRFIDScan(req.params.sgtin);
    
    if (!lastScan) {
      return res.status(404).json({
        error: 'No scans found',
        sgtin: req.params.sgtin
      });
    }
    
    res.json({
      success: true,
      sgtin: req.params.sgtin,
      location: {
        zone_code: lastScan.zone_code,
        zone_name: lastScan.zone_name,
        x_coordinate: lastScan.x_coordinate,
        y_coordinate: lastScan.y_coordinate,
        last_scanned: lastScan.scanned_at,
        scanned_by: lastScan.scanned_by_name
      }
    });
  } catch (error) {
    console.error('Error fetching RFID location:', error);
    res.status(500).json({
      error: 'Failed to fetch location',
      message: error.message
    });
  }
});

/**
 * GET /api/rfid/history/:sgtin
 * Get RFID scan history for tag
 */
router.get('/history/:sgtin', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await pgDal.query(`
      SELECT 
        rs.*,
        z.zone_code,
        z.zone_name,
        e.name as scanned_by_name
      FROM rfid_scans rs
      LEFT JOIN store_zones z ON rs.zone_id = z.id
      LEFT JOIN employees e ON rs.scanned_by_id = e.id
      WHERE rs.sgtin = $1
      ORDER BY rs.scanned_at DESC
      LIMIT $2
    `, [req.params.sgtin, parseInt(limit)]);
    
    res.json({
      success: true,
      sgtin: req.params.sgtin,
      count: result.rows.length,
      history: result.rows
    });
  } catch (error) {
    console.error('Error fetching RFID history:', error);
    res.status(500).json({
      error: 'Failed to fetch history',
      message: error.message
    });
  }
});

/**
 * GET /api/rfid/movement/:sgtin
 * Track item movement through zones
 */
router.get('/movement/:sgtin', async (req, res) => {
  try {
    const result = await pgDal.query(`
      SELECT 
        rs.scanned_at,
        rs.zone_code,
        z.zone_name,
        rs.movement_type,
        rs.x_coordinate,
        rs.y_coordinate,
        e.name as scanned_by
      FROM rfid_scans rs
      LEFT JOIN store_zones z ON rs.zone_id = z.id
      LEFT JOIN employees e ON rs.scanned_by_id = e.id
      WHERE rs.sgtin = $1
        AND rs.zone_id IS NOT NULL
      ORDER BY rs.scanned_at ASC
    `, [req.params.sgtin]);
    
    // Group movements by zone to show flow
    const movements = result.rows;
    const flow = [];
    let currentZone = null;
    let enteredAt = null;
    
    for (const move of movements) {
      if (move.zone_code !== currentZone) {
        if (currentZone !== null) {
          flow.push({
            zone: currentZone,
            entered: enteredAt,
            exited: move.scanned_at,
            duration_minutes: Math.floor((new Date(move.scanned_at) - new Date(enteredAt)) / 60000)
          });
        }
        currentZone = move.zone_code;
        enteredAt = move.scanned_at;
      }
    }
    
    // Add current zone
    if (currentZone !== null) {
      flow.push({
        zone: currentZone,
        entered: enteredAt,
        exited: null,
        duration_minutes: Math.floor((new Date() - new Date(enteredAt)) / 60000),
        current: true
      });
    }
    
    res.json({
      success: true,
      sgtin: req.params.sgtin,
      movements: movements,
      flow: flow
    });
  } catch (error) {
    console.error('Error tracking movement:', error);
    res.status(500).json({
      error: 'Failed to track movement',
      message: error.message
    });
  }
});

// ==========================================================================
// ZONE QUERIES
// ==========================================================================

/**
 * GET /api/rfid/zone/:zoneCode
 * Get all items in a zone
 */
router.get('/zone/:zoneCode', async (req, res) => {
  try {
    const result = await pgDal.query(`
      SELECT DISTINCT ON (rs.sgtin)
        rs.sgtin,
        ii.item_id,
        ii.sku,
        rs.scanned_at as last_scan,
        rs.x_coordinate,
        rs.y_coordinate
      FROM rfid_scans rs
      LEFT JOIN inventory_items ii ON rs.sgtin = ii.sgtin
      WHERE rs.zone_code = $1
      ORDER BY rs.sgtin, rs.scanned_at DESC
    `, [req.params.zoneCode]);
    
    res.json({
      success: true,
      zone_code: req.params.zoneCode,
      count: result.rows.length,
      items: result.rows
    });
  } catch (error) {
    console.error('Error fetching zone items:', error);
    res.status(500).json({
      error: 'Failed to fetch items',
      message: error.message
    });
  }
});

/**
 * GET /api/rfid/zones
 * Get item counts by zone
 */
router.get('/zones', async (req, res) => {
  try {
    const result = await pgDal.query(`
      SELECT 
        z.zone_code,
        z.zone_name,
        z.zone_type,
        COUNT(DISTINCT rs.sgtin) as item_count
      FROM store_zones z
      LEFT JOIN LATERAL (
        SELECT DISTINCT ON (sgtin) sgtin, zone_id
        FROM rfid_scans
        WHERE zone_id = z.id
        ORDER BY sgtin, scanned_at DESC
      ) rs ON rs.zone_id = z.id
      WHERE z.active = true
      GROUP BY z.id, z.zone_code, z.zone_name, z.zone_type
      ORDER BY z.zone_code
    `);
    
    res.json({
      success: true,
      zones: result.rows
    });
  } catch (error) {
    console.error('Error fetching zone counts:', error);
    res.status(500).json({
      error: 'Failed to fetch zones',
      message: error.message
    });
  }
});

// ==========================================================================
// PICKUP INTEGRATION
// ==========================================================================

/**
 * POST /api/rfid/pickup/:pickupId/scan
 * Scan item for a specific pickup
 * 
 * Used when SA scans items to assign them to pickup rack.
 */
router.post('/pickup/:pickupId/scan', async (req, res) => {
  try {
    const { sgtin, rackPosition, scannedBy } = req.body;
    
    if (!sgtin) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'sgtin is required'
      });
    }
    
    const pickupId = parseInt(req.params.pickupId);
    
    // Find rack zone
    const rackZone = await pgDal.query(
      'SELECT id FROM store_zones WHERE zone_code = $1',
      ['RACK']
    );
    
    if (rackZone.rows.length === 0) {
      return res.status(500).json({
        error: 'Rack zone not configured'
      });
    }
    
    const rackZoneId = rackZone.rows[0].id;
    
    // Find employee
    let scannedById = null;
    if (scannedBy) {
      const employee = await pgDal.getEmployeeByEmail(scannedBy);
      if (employee) {
        scannedById = employee.id;
      }
    }
    
    // Record scan
    await pgDal.recordRFIDScan({
      sgtin,
      scan_type: 'handheld',
      zone_id: rackZoneId,
      zone_code: 'RACK',
      scanned_by_id: scannedById,
      movement_type: 'staged',
      scanned_at: new Date()
    });
    
    // Update pickup
    await pgDal.updatePickup(pickupId, {
      in_rack: true,
      rack_position: rackPosition,
      assigned_for_pickup: true,
      current_zone_id: rackZoneId,
      state: 'in_rack',
      status: 'ready'
    });
    
    // Update pickup item
    await pgDal.query(`
      UPDATE pickup_items
      SET 
        current_zone_id = $2,
        last_scanned_at = NOW(),
        last_scanned_by_id = $3,
        item_status = 'ready'
      WHERE pickup_id = $1 AND rfid_tag = $4
    `, [pickupId, rackZoneId, scannedById, sgtin]);
    
    res.json({
      success: true,
      message: 'Item scanned and assigned to pickup',
      pickup_id: pickupId,
      rack_position: rackPosition
    });
    
  } catch (error) {
    console.error('Error scanning pickup item:', error);
    res.status(500).json({
      error: 'Scan failed',
      message: error.message
    });
  }
});

module.exports = router;
