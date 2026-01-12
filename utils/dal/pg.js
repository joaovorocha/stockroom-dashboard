/**
 * PostgreSQL Data Access Layer
 * 
 * Database client for production pickup tracking system.
 * Provides methods to query employees, pickups, orders, inventory, RFID scans.
 */

const { Pool } = require('pg');

// Singleton pool instance
let pool = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initPool(config) {
  if (pool) {
    return pool;
  }
  
  const poolConfig = config || (process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  } : {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stockroom_dashboard',
    user: process.env.DB_USER || 'stockroom',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  
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
// RFID SCANS
// ============================================================================

/**
 * Record RFID scan
 */
async function recordRFIDScan(scan) {
  const sql = `
    INSERT INTO rfid_scans (
      sgtin, epc, inventory_item_id,
      scan_type, scanner_id, scanner_location,
      zone_id, zone_code, x_coordinate, y_coordinate,
      scanned_by_id, scanned_by_name,
      previous_zone_id, movement_type,
      scanned_at, raw_scan_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `;
  
  const values = [
    scan.sgtin,
    scan.epc || null,
    scan.inventory_item_id || null,
    scan.scan_type || 'handheld',
    scan.scanner_id || null,
    scan.scanner_location || null,
    scan.zone_id || null,
    scan.zone_code || null,
    scan.x_coordinate || null,
    scan.y_coordinate || null,
    scan.scanned_by_id || null,
    scan.scanned_by_name || null,
    scan.previous_zone_id || null,
    scan.movement_type || null,
    scan.scanned_at || new Date(),
    scan.raw_scan_data ? JSON.stringify(scan.raw_scan_data) : null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Get last RFID scan for item
 */
async function getLastRFIDScan(sgtin) {
  const sql = `
    SELECT 
      rs.*,
      z.zone_code,
      z.zone_name
    FROM rfid_scans rs
    LEFT JOIN store_zones z ON rs.zone_id = z.id
    WHERE rs.sgtin = $1
    ORDER BY rs.scanned_at DESC
    LIMIT 1
  `;
  
  const result = await query(sql, [sgtin]);
  return result.rows[0];
}

// ============================================================================
// SHIPMENTS
// ============================================================================

/**
 * Get shipments with filters
 */
async function getShipments(filters = {}) {
  let sql = `
    SELECT s.*
    FROM shipments s
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 0;
  
  if (filters.status) {
    paramCount++;
    sql += ` AND s.status = $${paramCount}`;
    params.push(filters.status);
  }
  
  if (filters.customer_email) {
    paramCount++;
    sql += ` AND s.customer_email = $${paramCount}`;
    params.push(filters.customer_email);
  }
  
  if (filters.order_number) {
    paramCount++;
    sql += ` AND s.order_number = $${paramCount}`;
    params.push(filters.order_number);
  }
  
  if (filters.tracking_number) {
    paramCount++;
    sql += ` AND s.tracking_number = $${paramCount}`;
    params.push(filters.tracking_number);
  }
  
  sql += ` ORDER BY s.created_at DESC`;
  
  if (filters.limit) {
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }
  
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get shipment by ID
 */
async function getShipmentById(id) {
  const sql = `SELECT * FROM shipments WHERE id = $1`;
  const result = await query(sql, [id]);
  return result.rows[0];
}

/**
 * Get shipment items
 */
async function getShipmentItems(shipmentId) {
  const sql = `
    SELECT si.*
    FROM shipment_items si
    WHERE si.shipment_id = $1
    ORDER BY si.created_at ASC
  `;
  const result = await query(sql, [shipmentId]);
  return result.rows;
}

/**
 * Get shipment scan events
 */
async function getShipmentScanEvents(shipmentId) {
  const sql = `
    SELECT sse.*
    FROM shipment_scan_events sse
    WHERE sse.shipment_id = $1
    ORDER BY sse.scanned_at DESC
  `;
  const result = await query(sql, [shipmentId]);
  return result.rows;
}

/**
 * Create shipment
 */
async function createShipment(shipment) {
  const sql = `
    INSERT INTO shipments (
      order_number, tracking_number, carrier, customer_name, customer_email,
      customer_phone, shipping_address, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  
  const values = [
    shipment.order_number || null,
    shipment.tracking_number || null,
    shipment.carrier || 'UPS',
    shipment.customer_name || null,
    shipment.customer_email || null,
    shipment.customer_phone || null,
    shipment.shipping_address ? JSON.stringify(shipment.shipping_address) : null,
    shipment.status || 'pending',
    shipment.notes || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update shipment
 */
async function updateShipment(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 0;
  
  const allowedFields = ['order_number', 'tracking_number', 'carrier', 'customer_name', 
    'customer_email', 'customer_phone', 'shipping_address', 'status', 'notes', 'shipped_at'];
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      paramCount++;
      fields.push(`${field} = $${paramCount}`);
      values.push(field === 'shipping_address' && typeof updates[field] === 'object' 
        ? JSON.stringify(updates[field]) 
        : updates[field]);
    }
  }
  
  if (fields.length === 0) {
    return getShipmentById(id);
  }
  
  fields.push(`updated_at = NOW()`);
  paramCount++;
  values.push(id);
  
  const sql = `UPDATE shipments SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Create shipment item
 */
async function createShipmentItem(item) {
  const sql = `
    INSERT INTO shipment_items (
      shipment_id, sku, description, quantity, sgtin
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  
  const values = [
    item.shipment_id,
    item.sku || null,
    item.description || null,
    item.quantity || 1,
    item.sgtin || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Update shipment item
 */
async function updateShipmentItem(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 0;
  
  const allowedFields = ['sku', 'description', 'quantity', 'sgtin', 'picked_at', 'packed_at'];
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      paramCount++;
      fields.push(`${field} = $${paramCount}`);
      values.push(updates[field]);
    }
  }
  
  if (fields.length === 0) {
    const result = await query('SELECT * FROM shipment_items WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  fields.push(`updated_at = NOW()`);
  paramCount++;
  values.push(id);
  
  const sql = `UPDATE shipment_items SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Record shipment scan event
 */
async function recordShipmentScan(scan) {
  const sql = `
    INSERT INTO shipment_scan_events (
      shipment_id, sgtin, event_type, scanned_by, scanned_at, notes
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  
  const values = [
    scan.shipment_id,
    scan.sgtin || null,
    scan.event_type || 'scan',
    scan.scanned_by || null,
    scan.scanned_at || new Date(),
    scan.notes || null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// SYNC LOG
// ============================================================================

/**
 * Log sync operation
 */
async function logSync(sync) {
  const sql = `
    INSERT INTO sync_log (
      sync_type, sync_status, records_processed, records_created,
      records_updated, records_failed, error_message,
      sync_duration_ms, started_at, completed_at, raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  
  const values = [
    sync.sync_type,
    sync.sync_status,
    sync.records_processed || 0,
    sync.records_created || 0,
    sync.records_updated || 0,
    sync.records_failed || 0,
    sync.error_message || null,
    sync.sync_duration_ms || null,
    sync.started_at || new Date(),
    sync.completed_at || null,
    sync.raw_response ? JSON.stringify(sync.raw_response) : null
  ];
  
  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

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
  getShipmentById,
  getShipmentItems,
  getShipmentScanEvents,
  createShipment,
  updateShipment,
  createShipmentItem,
  updateShipmentItem,
  recordShipmentScan,
  
  // Production Stages
  recordProductionStage,
  
  // RFID
  recordRFIDScan,
  getLastRFIDScan,
  
  // Sync
  logSync
};
