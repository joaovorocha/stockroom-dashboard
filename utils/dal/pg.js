/**
 * PostgreSQL Data Access Layer
 * 
 * Database client for production pickup tracking system.
 * Provides methods to query employees, pickups, orders, inventory, RFID scans.
 */

const { Pool } = require('pg');
const crypto = require('crypto');

// Singleton pool instance
let pool = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initPool(config) {
  if (pool) {
    return pool;
  }
  
  let poolConfig;
  
  if (config) {
    poolConfig = config;
  } else if (process.env.DATABASE_URL) {
    // Use connection string - let pg handle authentication
    poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  } else {
    // Use individual parameters
    // NOTE: Omitting 'host' will use Unix socket with peer authentication
    poolConfig = {
      database: process.env.DB_NAME || 'stockroom_dashboard',
      user: process.env.DB_USER || 'suit',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
    
    // Only add host/port if explicitly specified (otherwise uses Unix socket)
    if (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') {
      poolConfig.host = process.env.DB_HOST;
      poolConfig.port = parseInt(process.env.DB_PORT || '5432');
      
      // Only add password for remote connections
      if (process.env.DB_PASSWORD) {
        poolConfig.password = process.env.DB_PASSWORD;
      }
    }
  }
  
  pool = new Pool(poolConfig);
  
  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
  
  return pool;
}

/**
 * Get pool instance (initialize if needed)
 */
function getPool() {
  if (!pool) {
    pool = initPool();
  }
  return pool;
}

/**
 * Execute a query
 */
async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

/**
 * Get a client from the pool (for transactions)
 */
async function getClient() {
  const pool = getPool();
  return pool.connect();
}

// ============================================================================
// EMPLOYEES
// ============================================================================

/**
 * Get all active employees
 */
async function getEmployees(filters = {}) {
  let sql = 'SELECT * FROM employees WHERE active = true';
  const params = [];
  let paramCount = 0;
  
  if (filters.role) {
    paramCount++;
    sql += ` AND role = $${paramCount}`;
    params.push(filters.role);
  }
  
  if (filters.department) {
    paramCount++;
    sql += ` AND department = $${paramCount}`;
    params.push(filters.department);
  }
  
  sql += ' ORDER BY name';
  
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get employee by ID
 */
async function getEmployeeById(id) {
  const result = await query('SELECT * FROM employees WHERE id = $1', [id]);
  return result.rows[0];
}

/**
 * Get employee by email
 */
async function getEmployeeByEmail(email) {
  const result = await query('SELECT * FROM employees WHERE email = $1', [email]);
  return result.rows[0];
}

/**
 * Get employee by user_id (from users.json)
 */
async function getEmployeeByUserId(userId) {
  const result = await query('SELECT * FROM employees WHERE user_id = $1', [userId]);
  return result.rows[0];
}

/**
 * Create or update employee
 */
async function upsertEmployee(employee) {
  const sql = `
    INSERT INTO employees (user_id, email, name, role, department, specialty, active, hire_date, phone)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      specialty = EXCLUDED.specialty,
      active = EXCLUDED.active,
      hire_date = EXCLUDED.hire_date,
      phone = EXCLUDED.phone,
      updated_at = NOW()
    RETURNING *
  `;
  
  const values = [
    employee.user_id,
    employee.email,
    employee.name,
    employee.role,
    employee.department || null,
    employee.specialty || null,
    employee.active !== false,
    employee.hire_date || null,
    employee.phone || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// PICKUPS
// ============================================================================

/**
 * Get all pickups with full details
 */
async function getPickups(filters = {}) {
  let sql = `
    SELECT 
      p.*,
      z.zone_code as current_zone_code,
      z.zone_name as current_zone_name,
      sa.name as sa_name,
      sa.email as sa_email,
      t.name as tailor_full_name,
      t.specialty as tailor_specialty,
      boh.name as boh_name,
      boh.email as boh_email,
      COUNT(DISTINCT pi.id) as item_count
    FROM pickups p
    LEFT JOIN store_zones z ON p.current_zone_id = z.id
    LEFT JOIN employees sa ON p.style_advisor_id = sa.id
    LEFT JOIN employees t ON p.tailor_id = t.id
    LEFT JOIN employees boh ON p.boh_contact_id = boh.id
    LEFT JOIN pickup_items pi ON p.id = pi.pickup_id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 0;
  
  if (filters.status) {
    paramCount++;
    sql += ` AND p.status = $${paramCount}`;
    params.push(filters.status);
  }
  
  if (filters.state) {
    paramCount++;
    sql += ` AND p.state = $${paramCount}`;
    params.push(filters.state);
  }
  
  if (filters.style_advisor_id) {
    paramCount++;
    sql += ` AND p.style_advisor_id = $${paramCount}`;
    params.push(filters.style_advisor_id);
  }
  
  if (filters.tailor_id) {
    paramCount++;
    sql += ` AND p.tailor_id = $${paramCount}`;
    params.push(filters.tailor_id);
  }
  
  if (filters.overdue) {
    sql += ` AND p.is_overdue = true`;
  }
  
  if (filters.search) {
    paramCount++;
    sql += ` AND (
      p.customer_name ILIKE $${paramCount} OR
      p.customer_email ILIKE $${paramCount} OR
      p.customer_phone ILIKE $${paramCount} OR
      p.notes ILIKE $${paramCount}
    )`;
    params.push(`%${filters.search}%`);
  }
  
  sql += ` GROUP BY p.id, z.id, sa.id, t.id, boh.id`;
  sql += ` ORDER BY p.created_at DESC`;
  
  if (filters.limit) {
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }
  
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get pickup by ID with items
 */
async function getPickupById(id) {
  const pickupSql = `
    SELECT 
      p.*,
      z.zone_code as current_zone_code,
      z.zone_name as current_zone_name,
      sa.name as sa_name,
      sa.email as sa_email,
      t.name as tailor_full_name,
      t.specialty as tailor_specialty,
      boh.name as boh_name,
      boh.email as boh_email
    FROM pickups p
    LEFT JOIN store_zones z ON p.current_zone_id = z.id
    LEFT JOIN employees sa ON p.style_advisor_id = sa.id
    LEFT JOIN employees t ON p.tailor_id = t.id
    LEFT JOIN employees boh ON p.boh_contact_id = boh.id
    WHERE p.id = $1
  `;
  
  const itemsSql = `
    SELECT 
      pi.*,
      ii.sgtin,
      ii.unit_inventory_status,
      z.zone_code,
      z.zone_name
    FROM pickup_items pi
    LEFT JOIN inventory_items ii ON pi.inventory_item_id = ii.id
    LEFT JOIN store_zones z ON pi.current_zone_id = z.id
    WHERE pi.pickup_id = $1
    ORDER BY pi.id
  `;
  
  const stagesSql = `
    SELECT *
    FROM production_stages
    WHERE pickup_id = $1
    ORDER BY started_at
  `;
  
  const [pickupResult, itemsResult, stagesResult] = await Promise.all([
    query(pickupSql, [id]),
    query(itemsSql, [id]),
    query(stagesSql, [id])
  ]);
  
  if (pickupResult.rows.length === 0) {
    return null;
  }
  
  const pickup = pickupResult.rows[0];
  pickup.items = itemsResult.rows;
  pickup.production_stages = stagesResult.rows;
  
  return pickup;
}

/**
 * Get pickup statistics
 */
async function getPickupStats() {
  const sql = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'ready') as ready,
      COUNT(*) FILTER (WHERE status = 'in_production') as in_production,
      COUNT(*) FILTER (WHERE status = 'measuring') as measuring,
      COUNT(*) FILTER (WHERE is_overdue = true) as overdue,
      COUNT(*) FILTER (WHERE in_rack = true) as in_rack,
      COUNT(*) FILTER (WHERE assigned_for_pickup = true) as assigned_for_pickup,
      COUNT(*) FILTER (WHERE needs_measurement = true) as needs_measurement,
      COUNT(*) FILTER (WHERE alert_type = 'orphaned') as orphaned
    FROM pickups
    WHERE status NOT IN ('completed', 'picked_up')
  `;
  
  const result = await query(sql);
  return result.rows[0];
}

/**
 * Create pickup
 */
async function createPickup(pickup) {
  const sql = `
    INSERT INTO pickups (
      customer_name, customer_email, customer_phone,
      waitwhile_id, waitwhile_url, order_number,
      style_advisor_id, style_advisor_name,
      tailor_id, tailor_name,
      boh_contact_id, boh_contact_name,
      status, state, priority,
      current_zone_id, in_rack, rack_position, assigned_for_pickup,
      alteration_stage, needs_measurement, received_from,
      expected_ready_date, days_waiting, is_overdue,
      tags, notes, alert_message, alert_type
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
    )
    RETURNING *
  `;
  
  const values = [
    pickup.customer_name,
    pickup.customer_email || null,
    pickup.customer_phone || null,
    pickup.waitwhile_id || null,
    pickup.waitwhile_url || null,
    pickup.order_number || null,
    pickup.style_advisor_id || null,
    pickup.style_advisor_name || null,
    pickup.tailor_id || null,
    pickup.tailor_name || null,
    pickup.boh_contact_id || null,
    pickup.boh_contact_name || null,
    pickup.status || 'in_production',
    pickup.state || 'in_boh',
    pickup.priority || 'normal',
    pickup.current_zone_id || null,
    pickup.in_rack || false,
    pickup.rack_position || null,
    pickup.assigned_for_pickup || false,
    pickup.alteration_stage || 'received',
    pickup.needs_measurement || false,
    pickup.received_from || 'warehouse',
    pickup.expected_ready_date || null,
    pickup.days_waiting || 0,
    pickup.is_overdue || false,
    pickup.tags || null,
    pickup.notes || null,
    pickup.alert_message || null,
    pickup.alert_type || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update pickup
 */
async function updatePickup(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 0;
  
  const allowedFields = [
    'status', 'state', 'priority',
    'current_zone_id', 'in_rack', 'rack_position', 'assigned_for_pickup',
    'alteration_stage', 'needs_measurement', 'current_step',
    'completed_stages', 'expected_ready_date', 'actual_ready_date',
    'days_waiting', 'is_overdue', 'tags', 'notes',
    'alert_message', 'alert_type', 'picked_up_at'
  ];
  
  for (const field of allowedFields) {
    if (updates.hasOwnProperty(field)) {
      paramCount++;
      fields.push(`${field} = $${paramCount}`);
      values.push(updates[field]);
    }
  }
  
  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  paramCount++;
  values.push(id);
  
  const sql = `
    UPDATE pickups
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// PICKUP ITEMS
// ============================================================================

/**
 * Create pickup item
 */
async function createPickupItem(item) {
  const sql = `
    INSERT INTO pickup_items (
      pickup_id, inventory_item_id, item_id, sku, rfid_tag,
      description, service_type, item_status, alteration_stage,
      current_zone_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  
  const values = [
    item.pickup_id,
    item.inventory_item_id || null,
    item.item_id || null,
    item.sku || null,
    item.rfid_tag || null,
    item.description,
    item.service_type || null,
    item.item_status || 'in_production',
    item.alteration_stage || 'received',
    item.current_zone_id || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// PRODUCTION STAGES
// ============================================================================

/**
 * Record production stage
 */
async function recordProductionStage(stage) {
  const sql = `
    INSERT INTO production_stages (
      pickup_id, pickup_item_id, stage, stage_status,
      employee_id, employee_name, employee_role,
      started_at, completed_at, duration_minutes,
      notes, issues
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;
  
  const values = [
    stage.pickup_id,
    stage.pickup_item_id || null,
    stage.stage,
    stage.stage_status,
    stage.employee_id || null,
    stage.employee_name || null,
    stage.employee_role || null,
    stage.started_at || new Date(),
    stage.completed_at || null,
    stage.duration_minutes || null,
    stage.notes || null,
    stage.issues || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// SHIPMENTS
// ============================================================================

/**
 * Get shipments with optional filters
 */
async function getShipments(filters = {}) {
  let sql = 'SELECT * FROM shipments WHERE 1=1';
  const params = [];
  let paramCount = 0;

  Object.keys(filters).forEach(key => {
    const val = filters[key];
    if (val === undefined || val === null || (typeof val === 'string' && val === '') || (Array.isArray(val) && val.length === 0)) return;

    if (key === 'created_after') {
      paramCount++;
      sql += ` AND created_at >= $${paramCount}`;
      params.push(val);
      return;
    }

    if (Array.isArray(val)) {
      // Handle IN clauses for arrays
      const placeholders = val.map(() => {
        paramCount++;
        return `$${paramCount}`;
      });
      sql += ` AND ${key} IN (${placeholders.join(',')})`;
      params.push(...val);
    } else {
      // Handle exact matches for other values
      paramCount++;
      sql += ` AND ${key} = $${paramCount}`;
      params.push(val);
    }
  });

  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get shipment by tracking number
 */
async function getShipmentByTracking(trackingNumber) {
  const result = await query('SELECT * FROM shipments WHERE tracking_number = $1', [trackingNumber]);
  return result.rows[0];
}

/**
 * Update shipment with latest UPS tracking info
 */
async function updateShipmentTrackingInfo(shipmentId, trackingInfo) {
  const updates = {
    last_ups_status: trackingInfo.latestStatus,
    last_ups_status_updated_at: trackingInfo.latestStatusTimestamp,
    estimated_delivery_at: trackingInfo.estimatedDelivery,
    status: trackingInfo.latestStatus, // Persist the new status
  };
  return updateShipment(shipmentId, updates);
}

/**
 * Create multiple shipment tracking events
 */
async function createShipmentTrackingEvents(shipmentId, events) {
  if (!events || events.length === 0) {
    return [];
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // To prevent duplicates, we can delete previous events for this shipment
    // or use a more sophisticated ON CONFLICT clause if events have a unique identifier.
    // For simplicity here, we'll clear and re-insert.
    await client.query('DELETE FROM shipment_tracking_events WHERE shipment_id = $1', [shipmentId]);

    const sql = `
      INSERT INTO shipment_tracking_events (
        shipment_id, event_timestamp, status, details,
        location_city, location_state, location_zip, location_country,
        ups_event_raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    for (const event of events) {
      const values = [
        shipmentId,
        event.event_timestamp,
        event.status,
        event.details,
        event.location?.city,
        event.location?.state,
        event.location?.zip,
        event.location?.country,
        event, // Store the raw event object
      ];
      await client.query(sql, values);
    }

    await client.query('COMMIT');

    // Return the newly created events for the shipment
    const result = await query(
      'SELECT * FROM shipment_tracking_events WHERE shipment_id = $1 ORDER BY event_timestamp DESC',
      [shipmentId]
    );
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[pgDal] Error in createShipmentTrackingEvents transaction:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generate a unique shipment number
 */
function generateShipmentNumber() {
  const d = new Date();
  const datePart = d.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SHIP-${datePart}-${randomPart}`;
}

/**
 * Create a new shipment
 */
async function createShipment(shipment) {
  // Ensure shipment_number is present
  if (!shipment.shipment_number) {
    shipment.shipment_number = generateShipmentNumber();
  }

  const sql = `
    INSERT INTO shipments (
      tracking_number, carrier, status, status_from_ups, status_updated_at,
      status_updated_source, source, imported_at, shipped_at,
      customer_name, customer_address, order_number, service_type,
      package_count, package_weight_lbs, reference_1, reference_2,
      processed_by_id, processed_by_name, shipper, origin_location,
      destination_location, estimated_delivery_at, notes, shipment_number,
      ups_raw_response, returned
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
    )
    RETURNING *
  `;
  const values = [
    shipment.tracking_number, shipment.carrier, shipment.status,
    shipment.status_from_ups, shipment.status_updated_at,
    shipment.status_updated_source, shipment.source, shipment.imported_at,
    shipment.shipped_at, shipment.customer_name, shipment.customer_address,
    shipment.order_number, shipment.service_type, shipment.package_count,
    shipment.package_weight_lbs, shipment.reference_1, shipment.reference_2,
    shipment.processed_by_id, shipment.processed_by_name, shipment.shipper,
    shipment.origin_location, shipment.destination_location,
    shipment.estimated_delivery_at, shipment.notes,
    shipment.shipment_number,
    shipment.ups_raw_response ? JSON.stringify(shipment.ups_raw_response) : null,
    shipment.returned === true
  ];
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update an existing shipment
 */
async function updateShipment(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 0;

  Object.keys(updates).forEach(key => {
    paramCount++;
    fields.push(`${key} = $${paramCount}`);
    values.push(updates[key]);
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  paramCount++;
  values.push(id);
  const sql = `UPDATE shipments SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Get shipment by ID
 */
async function getShipmentById(id) {
  const result = await query('SELECT * FROM shipments WHERE id = $1', [id]);
  return result.rows[0];
}

/**
 * Get items for a shipment
 */
async function getShipmentItems(shipmentId) {
  const result = await query('SELECT * FROM shipment_items WHERE shipment_id = $1 ORDER BY id', [shipmentId]);
  return result.rows;
}

/**
 * Get scan events for a shipment
 */
async function getShipmentScanEvents(shipmentId) {
  const result = await query('SELECT * FROM shipment_scan_events WHERE shipment_id = $1 ORDER BY scanned_at DESC', [shipmentId]);
  return result.rows;
}

/**
 * Create a shipment item
 */
async function createShipmentItem(item) {
  const sql = `
    INSERT INTO shipment_items (
      shipment_id, item_number, description, sgtin, barcode,
      manhattan_unit_id, manhattan_item_id, unit_status,
      quantity, price, category, current_zone_id, rack_position,
      picked, picked_at, picked_by_id, rfid_scanned, rfid_scanned_at,
      rfid_scanned_by_id, last_rfid_scan_id, notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    ) RETURNING *
  `;
  const values = [
    item.shipment_id,
    item.item_number || null,
    item.description || null,
    item.sgtin || null,
    item.barcode || null,
    item.manhattan_unit_id || null,
    item.manhattan_item_id || null,
    item.unit_status || null,
    item.quantity || 1,
    item.price || null,
    item.category || null,
    item.current_zone_id || null,
    item.rack_position || null,
    item.picked || false,
    item.picked_at || null,
    item.picked_by_id || null,
    item.rfid_scanned || false,
    item.rfid_scanned_at || null,
    item.rfid_scanned_by_id || null,
    item.last_rfid_scan_id || null,
    item.notes || null
  ];
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update a shipment item
 */
async function updateShipmentItem(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 0;

  Object.keys(updates).forEach(key => {
    paramCount++;
    fields.push(`${key} = $${paramCount}`);
    values.push(updates[key]);
  });

  if (fields.length === 0) throw new Error('No fields to update');

  paramCount++;
  values.push(id);
  const sql = `UPDATE shipment_items SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Record a shipment scan event
 */
async function recordShipmentScanEvent(event) {
  const sql = `
    INSERT INTO shipment_scan_events (
      shipment_id, shipment_item_id, sgtin, scan_type, zone_id,
      scanned_by_id, scanned_at, item_found, error_message, raw_scan_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  `;
  const values = [
    event.shipment_id,
    event.shipment_item_id || null,
    event.sgtin,
    event.scan_type || 'PICK',
    event.zone_id || null,
    event.scanned_by_id || null,
    event.scanned_at || new Date(),
    event.item_found === undefined ? true : event.item_found,
    event.error_message || null,
    event.raw_scan_data || null
  ];
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Delete a shipment and its related items and scan events (transactional)
 */
async function deleteShipment(id) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM shipment_scan_events WHERE shipment_id = $1', [id]);
    await client.query('DELETE FROM shipment_items WHERE shipment_id = $1', [id]);
    const res = await client.query('DELETE FROM shipments WHERE id = $1 RETURNING *', [id]);
    await client.query('COMMIT');
    return res.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// RFID & SYNC (Placeholders)
// ============================================================================

async function recordRFIDScan(scan) { /* placeholder */ }
async function getLastRFIDScan() { /* placeholder */ return null; }
async function logSync(log) { /* placeholder */ }


module.exports = {
  // Connection
  initPool,
  getPool,
  query,
  getClient,
  
  // Employees
  getEmployees,
  getEmployeeById,
  getEmployeeByEmail,
  getEmployeeByUserId,
  upsertEmployee,
  
  // Pickups
  getPickups,
  getPickupById,
  getPickupStats,
  createPickup,
  updatePickup,
  
  // Pickup Items
  createPickupItem,
  
  // Shipments
  getShipments,
  getShipmentByTracking,
  getShipmentById,
  getShipmentItems,
  getShipmentScanEvents,
  createShipment,
  createShipmentItem,
  updateShipmentItem,
  recordShipmentScanEvent,
  updateShipment,
  updateShipmentTrackingInfo,
  createShipmentTrackingEvents,
  deleteShipment,
  
  // Production Stages
  recordProductionStage,
  
  // RFID
  recordRFIDScan,
  getLastRFIDScan,
  
  // Sync
  logSync,
  
  // Pool management
  getPool,
  initPool
};
