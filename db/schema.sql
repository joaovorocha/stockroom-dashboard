-- ============================================================================
-- STOCKROOM DASHBOARD - PRODUCTION DATABASE SCHEMA
-- ============================================================================
-- Real-time pickup tracking system integrated with:
-- - WaitWhile (appointments & customer visits)
-- - Manhattan Active® (inventory & order management)
-- - Zebra RFID (location tracking)
-- ============================================================================

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS rfid_scans CASCADE;
DROP TABLE IF EXISTS production_stages CASCADE;
DROP TABLE IF EXISTS pickup_items CASCADE;
DROP TABLE IF EXISTS pickups CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS waitwhile_appointments CASCADE;
DROP TABLE IF EXISTS waitwhile_customers CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS store_zones CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;

-- ============================================================================
-- EMPLOYEES - From existing admin system (users.json)
-- ============================================================================
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE NOT NULL,  -- ID from users.json (e.g. "user-001")
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,  -- 'SA', 'Tailor', 'BOH', 'Manager', 'Admin'
  department VARCHAR(100),  -- 'Style Advisor', 'Alterations', 'Back of House'
  specialty VARCHAR(255),  -- For tailors: 'Suits & Jackets', 'Alterations', 'Custom'
  active BOOLEAN DEFAULT true,
  hire_date DATE,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (role IN ('SA', 'Tailor', 'BOH', 'Manager', 'Admin'))
);

CREATE INDEX idx_employees_role ON employees(role);
CREATE INDEX idx_employees_active ON employees(active);
CREATE INDEX idx_employees_email ON employees(email);

-- ============================================================================
-- STORE ZONES - Track locations within store
-- ============================================================================
CREATE TABLE store_zones (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(50) UNIQUE NOT NULL,  -- 'COG', 'BOH', 'RACK', 'FITTING', 'SALES_FLOOR'
  zone_name VARCHAR(255) NOT NULL,
  zone_type VARCHAR(50) NOT NULL,  -- 'storage', 'production', 'pickup', 'sales'
  description TEXT,
  coordinates JSONB,  -- {x: 11.45, y: 0.9, zone: 'BOH'}
  rack_positions TEXT[],  -- ['A-1', 'A-2', ..., 'Z-99'] for pickup racks
  capacity INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (zone_type IN ('storage', 'production', 'pickup', 'sales', 'other'))
);

INSERT INTO store_zones (zone_code, zone_name, zone_type, description, rack_positions) VALUES
  ('COG', 'Center of Gravity (Warehouse)', 'storage', 'Main warehouse storage area', NULL),
  ('BOH', 'Back of House', 'production', 'Alterations and production area', NULL),
  ('RACK', 'Pickup Rack', 'pickup', 'Customer pickup staging area', 
   ARRAY(SELECT chr(65 + (i / 20)) || '-' || (i % 20 + 1) FROM generate_series(0, 99) AS i)),
  ('FITTING', 'Fitting Rooms', 'sales', 'Customer fitting area', NULL),
  ('FLOOR', 'Sales Floor', 'sales', 'Main showroom', NULL);

-- ============================================================================
-- WAITWHILE CUSTOMERS - Synced from WaitWhile API
-- ============================================================================
CREATE TABLE waitwhile_customers (
  id SERIAL PRIMARY KEY,
  waitwhile_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  full_name VARCHAR(255),
  customer_data JSONB,  -- Full customer object from WaitWhile
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_waitwhile_customers_email ON waitwhile_customers(email);
CREATE INDEX idx_waitwhile_customers_phone ON waitwhile_customers(phone);
CREATE INDEX idx_waitwhile_customers_waitwhile_id ON waitwhile_customers(waitwhile_id);

-- ============================================================================
-- WAITWHILE APPOINTMENTS - Synced from WaitWhile API
-- ============================================================================
CREATE TABLE waitwhile_appointments (
  id SERIAL PRIMARY KEY,
  waitwhile_id VARCHAR(255) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES waitwhile_customers(id),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_name VARCHAR(255),
  appointment_date TIMESTAMP NOT NULL,
  appointment_duration INTEGER,  -- minutes
  status VARCHAR(50),  -- 'scheduled', 'serving', 'completed', 'cancelled'
  service_type VARCHAR(100),  -- 'Pick-Up', 'Consultation', 'Custom Made', 'Suits'
  assigned_sa_id INTEGER REFERENCES employees(id),
  assigned_sa_name VARCHAR(255),
  tags TEXT[],
  notes TEXT,
  waitwhile_url TEXT,
  raw_data JSONB,  -- Full appointment object from WaitWhile
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (status IN ('scheduled', 'serving', 'completed', 'cancelled', 'no-show'))
);

CREATE INDEX idx_appointments_customer_id ON waitwhile_appointments(customer_id);
CREATE INDEX idx_appointments_date ON waitwhile_appointments(appointment_date);
CREATE INDEX idx_appointments_status ON waitwhile_appointments(status);
CREATE INDEX idx_appointments_email ON waitwhile_appointments(customer_email);
CREATE INDEX idx_appointments_waitwhile_id ON waitwhile_appointments(waitwhile_id);

-- ============================================================================
-- ORDERS - Customer orders from Manhattan Active®
-- ============================================================================
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(255) UNIQUE NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_name VARCHAR(255),
  order_type VARCHAR(100),  -- 'PullbackTransfer', 'CustomOrder', 'StorePickup'
  order_status VARCHAR(100),  -- 'Pending', 'InProduction', 'Ready', 'Delivered'
  fulfillment_id VARCHAR(255),
  fulfillment_type VARCHAR(100),
  location_id VARCHAR(255),  -- 'SR-US-SanFrancisco-Maiden'
  package_id VARCHAR(255),
  store_event VARCHAR(255),
  store_sub_event VARCHAR(255),
  manhattan_data JSONB,  -- Full order data from Manhattan
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(order_status);

-- ============================================================================
-- INVENTORY ITEMS - Individual items/units from Manhattan Active®
-- ============================================================================
CREATE TABLE inventory_items (
  id SERIAL PRIMARY KEY,
  sgtin VARCHAR(255) UNIQUE,  -- RFID tag: 010872073119063521536873870
  epc VARCHAR(255),
  item_id VARCHAR(255) NOT NULL,  -- SW186706
  sku VARCHAR(255),
  order_id INTEGER REFERENCES orders(id),
  package_id VARCHAR(255),
  package_detail INTEGER,
  
  -- Status tracking (from UnitInventoryStatus.csv)
  unit_inventory_status VARCHAR(50) NOT NULL,  -- Available, InBound, Reserved, etc.
  last_status VARCHAR(50),
  disposition VARCHAR(100),
  supply_type VARCHAR(100),
  
  -- Location tracking
  location_id VARCHAR(255),  -- SR-US-SanFrancisco-Maiden
  zone_id INTEGER REFERENCES store_zones(id),
  x_coordinate DECIMAL(10, 2),
  y_coordinate DECIMAL(10, 2),
  zone_name VARCHAR(255),
  
  -- RFID tracking
  is_rfid_tagged BOOLEAN DEFAULT false,
  overhead_last_read TIMESTAMP,
  last_read_datetime TIMESTAMP,
  last_scanned_zone_id INTEGER REFERENCES store_zones(id),
  last_scanned_at TIMESTAMP,
  
  -- Manhattan metadata
  fulfillment_id VARCHAR(255),
  fulfillment_line INTEGER,
  fulfillment_type VARCHAR(100),
  store_event VARCHAR(255),
  store_sub_event VARCHAR(255),
  
  -- Audit trail
  created_by VARCHAR(255),
  created_datetime TIMESTAMP,
  updated_by VARCHAR(255),
  updated_datetime TIMESTAMP,
  
  manhattan_data JSONB,  -- Full unit data from Manhattan
  synced_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (unit_inventory_status IN (
    'Available', 'InBound', 'Reserved', 'Departed', 'Received',
    'Missing', 'Unexpected', 'Removed', 'PendingReceipt', 'TemporaryUnavailable'
  ))
);

CREATE INDEX idx_inventory_sgtin ON inventory_items(sgtin);
CREATE INDEX idx_inventory_item_id ON inventory_items(item_id);
CREATE INDEX idx_inventory_status ON inventory_items(unit_inventory_status);
CREATE INDEX idx_inventory_location ON inventory_items(location_id);
CREATE INDEX idx_inventory_zone ON inventory_items(zone_id);
CREATE INDEX idx_inventory_order ON inventory_items(order_id);
CREATE INDEX idx_inventory_rfid_tagged ON inventory_items(is_rfid_tagged);

-- ============================================================================
-- PICKUPS - Customer pickup tracking (combines WaitWhile + Manhattan + RFID)
-- ============================================================================
CREATE TABLE pickups (
  id SERIAL PRIMARY KEY,
  
  -- Customer info
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  
  -- WaitWhile integration
  waitwhile_appointment_id INTEGER REFERENCES waitwhile_appointments(id),
  waitwhile_customer_id INTEGER REFERENCES waitwhile_customers(id),
  waitwhile_id VARCHAR(255),
  waitwhile_url TEXT,
  
  -- Order integration
  order_id INTEGER REFERENCES orders(id),
  order_number VARCHAR(255),
  
  -- Employee assignments
  style_advisor_id INTEGER REFERENCES employees(id),
  style_advisor_name VARCHAR(255),
  tailor_id INTEGER REFERENCES employees(id),
  tailor_name VARCHAR(255),
  boh_contact_id INTEGER REFERENCES employees(id),
  boh_contact_name VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(50) NOT NULL,  -- 'ready', 'in_production', 'measuring', 'overdue', 'completed'
  state VARCHAR(50),  -- 'in_rack', 'in_boh', 'assigned', 'picked_up'
  priority VARCHAR(20) DEFAULT 'normal',  -- 'normal', 'urgent', 'overdue'
  
  -- Pickup location
  current_zone_id INTEGER REFERENCES store_zones(id),
  in_rack BOOLEAN DEFAULT false,
  rack_position VARCHAR(20),  -- 'A-12'
  assigned_for_pickup BOOLEAN DEFAULT false,
  
  -- Workflow tracking
  alteration_stage VARCHAR(50),  -- 'received', 'measuring', 'production', 'qc', 'ready'
  needs_measurement BOOLEAN DEFAULT false,
  received_from VARCHAR(100),  -- 'warehouse', 'vendor', 'transfer'
  completed_stages TEXT[],
  current_step TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  expected_ready_date DATE,
  actual_ready_date TIMESTAMP,
  picked_up_at TIMESTAMP,
  days_waiting INTEGER,
  is_overdue BOOLEAN DEFAULT false,
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  alert_message TEXT,
  alert_type VARCHAR(50),  -- 'overdue', 'orphaned', 'measurement_needed'
  
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (status IN ('ready', 'in_production', 'measuring', 'overdue', 'completed', 'picked_up')),
  CHECK (state IN ('in_rack', 'in_boh', 'in_cog', 'assigned', 'picked_up')),
  CHECK (alteration_stage IN ('received', 'measuring', 'production', 'qc', 'ready', NULL)),
  CHECK (priority IN ('normal', 'urgent', 'overdue'))
);

CREATE INDEX idx_pickups_customer_email ON pickups(customer_email);
CREATE INDEX idx_pickups_customer_phone ON pickups(customer_phone);
CREATE INDEX idx_pickups_status ON pickups(status);
CREATE INDEX idx_pickups_state ON pickups(state);
CREATE INDEX idx_pickups_waitwhile_id ON pickups(waitwhile_id);
CREATE INDEX idx_pickups_order_id ON pickups(order_id);
CREATE INDEX idx_pickups_sa ON pickups(style_advisor_id);
CREATE INDEX idx_pickups_tailor ON pickups(tailor_id);
CREATE INDEX idx_pickups_zone ON pickups(current_zone_id);
CREATE INDEX idx_pickups_overdue ON pickups(is_overdue);

-- ============================================================================
-- PICKUP ITEMS - Individual items in a pickup
-- ============================================================================
CREATE TABLE pickup_items (
  id SERIAL PRIMARY KEY,
  pickup_id INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  
  -- Item details
  item_id VARCHAR(255),
  sku VARCHAR(255),
  rfid_tag VARCHAR(255),  -- SGTIN
  description TEXT,
  service_type VARCHAR(255),  -- 'Sleeve Adjustment', 'Hem Pants', 'Custom Suit'
  
  -- Item status
  item_status VARCHAR(50),  -- 'ready', 'in_production', 'measuring'
  alteration_stage VARCHAR(50),
  
  -- Tracking
  current_zone_id INTEGER REFERENCES store_zones(id),
  last_scanned_at TIMESTAMP,
  last_scanned_by_id INTEGER REFERENCES employees(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pickup_items_pickup ON pickup_items(pickup_id);
CREATE INDEX idx_pickup_items_inventory ON pickup_items(inventory_item_id);
CREATE INDEX idx_pickup_items_rfid ON pickup_items(rfid_tag);
CREATE INDEX idx_pickup_items_status ON pickup_items(item_status);

-- ============================================================================
-- PRODUCTION STAGES - Track alteration workflow stages with timestamps
-- ============================================================================
CREATE TABLE production_stages (
  id SERIAL PRIMARY KEY,
  pickup_id INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  pickup_item_id INTEGER REFERENCES pickup_items(id),
  
  -- Stage details
  stage VARCHAR(50) NOT NULL,  -- 'received', 'measuring', 'production', 'qc', 'ready'
  stage_status VARCHAR(20) NOT NULL,  -- 'started', 'in_progress', 'completed', 'skipped'
  
  -- Employee who performed this stage
  employee_id INTEGER REFERENCES employees(id),
  employee_name VARCHAR(255),
  employee_role VARCHAR(50),
  
  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_minutes INTEGER,
  
  -- Stage notes
  notes TEXT,
  issues TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (stage IN ('received', 'measuring', 'production', 'qc', 'ready')),
  CHECK (stage_status IN ('started', 'in_progress', 'completed', 'skipped'))
);

CREATE INDEX idx_production_pickup ON production_stages(pickup_id);
CREATE INDEX idx_production_item ON production_stages(pickup_item_id);
CREATE INDEX idx_production_stage ON production_stages(stage);
CREATE INDEX idx_production_employee ON production_stages(employee_id);
CREATE INDEX idx_production_status ON production_stages(stage_status);

-- ============================================================================
-- RFID SCANS - Track all RFID scan events
-- ============================================================================
CREATE TABLE rfid_scans (
  id SERIAL PRIMARY KEY,
  
  -- RFID tag info
  sgtin VARCHAR(255) NOT NULL,
  epc VARCHAR(255),
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  
  -- Scan details
  scan_type VARCHAR(50) NOT NULL,  -- 'overhead', 'handheld', 'portal', 'inventory'
  scanner_id VARCHAR(255),  -- Device ID
  scanner_location VARCHAR(255),  -- Physical scanner location
  
  -- Location
  zone_id INTEGER REFERENCES store_zones(id),
  zone_code VARCHAR(50),
  x_coordinate DECIMAL(10, 2),
  y_coordinate DECIMAL(10, 2),
  
  -- Employee who performed scan
  scanned_by_id INTEGER REFERENCES employees(id),
  scanned_by_name VARCHAR(255),
  
  -- Movement tracking
  previous_zone_id INTEGER REFERENCES store_zones(id),
  movement_type VARCHAR(50),  -- 'received', 'moved', 'picked', 'returned'
  
  -- Timestamp
  scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Raw data from scanner
  raw_scan_data JSONB,
  
  CHECK (scan_type IN ('overhead', 'handheld', 'portal', 'inventory', 'manual')),
  CHECK (movement_type IN ('received', 'moved', 'picked', 'returned', 'staged', NULL))
);

CREATE INDEX idx_rfid_scans_sgtin ON rfid_scans(sgtin);
CREATE INDEX idx_rfid_scans_inventory ON rfid_scans(inventory_item_id);
CREATE INDEX idx_rfid_scans_zone ON rfid_scans(zone_id);
CREATE INDEX idx_rfid_scans_timestamp ON rfid_scans(scanned_at);
CREATE INDEX idx_rfid_scans_employee ON rfid_scans(scanned_by_id);

-- ============================================================================
-- SYNC LOG - Track API sync operations
-- ============================================================================
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(100) NOT NULL,  -- 'waitwhile_appointments', 'manhattan_inventory', 'rfid_scans'
  sync_status VARCHAR(50) NOT NULL,  -- 'started', 'success', 'partial', 'failed'
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  sync_duration_ms INTEGER,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  raw_response JSONB,
  
  CHECK (sync_status IN ('started', 'success', 'partial', 'failed'))
);

CREATE INDEX idx_sync_log_type ON sync_log(sync_type);
CREATE INDEX idx_sync_log_status ON sync_log(sync_status);
CREATE INDEX idx_sync_log_started ON sync_log(started_at);

-- ============================================================================
-- VIEWS - Convenience views for common queries
-- ============================================================================

-- Active pickups with full details
CREATE OR REPLACE VIEW v_active_pickups AS
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
  COUNT(DISTINCT pi.id) as item_count,
  COUNT(DISTINCT ps.id) FILTER (WHERE ps.stage_status = 'completed') as completed_stages_count
FROM pickups p
LEFT JOIN store_zones z ON p.current_zone_id = z.id
LEFT JOIN employees sa ON p.style_advisor_id = sa.id
LEFT JOIN employees t ON p.tailor_id = t.id
LEFT JOIN employees boh ON p.boh_contact_id = boh.id
LEFT JOIN pickup_items pi ON p.id = pi.pickup_id
LEFT JOIN production_stages ps ON p.id = ps.pickup_id
WHERE p.status != 'picked_up' AND p.status != 'completed'
GROUP BY p.id, z.id, sa.id, t.id, boh.id;

-- RFID location tracking
CREATE OR REPLACE VIEW v_rfid_current_locations AS
SELECT DISTINCT ON (sgtin)
  sgtin,
  inventory_item_id,
  zone_id,
  zone_code,
  scanned_at as last_scan,
  scanned_by_name,
  x_coordinate,
  y_coordinate
FROM rfid_scans
ORDER BY sgtin, scanned_at DESC;

-- ============================================================================
-- TRIGGERS - Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pickups_updated_at BEFORE UPDATE ON pickups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pickup_items_updated_at BEFORE UPDATE ON pickup_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waitwhile_customers_updated_at BEFORE UPDATE ON waitwhile_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waitwhile_appointments_updated_at BEFORE UPDATE ON waitwhile_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS - Documentation
-- ============================================================================

COMMENT ON TABLE employees IS 'Employee data synced from users.json (admin system)';
COMMENT ON TABLE store_zones IS 'Physical zones within store: COG, BOH, Rack, Fitting, Floor';
COMMENT ON TABLE waitwhile_customers IS 'Customer data from WaitWhile API';
COMMENT ON TABLE waitwhile_appointments IS 'Appointment bookings from WaitWhile API';
COMMENT ON TABLE orders IS 'Customer orders from Manhattan Active®';
COMMENT ON TABLE inventory_items IS 'Individual inventory units from Manhattan with RFID tracking';
COMMENT ON TABLE pickups IS 'Customer pickups combining WaitWhile appointments + Manhattan orders + RFID location';
COMMENT ON TABLE pickup_items IS 'Individual items within a pickup';
COMMENT ON TABLE production_stages IS 'Alteration workflow stages with employee tracking and timestamps';
COMMENT ON TABLE rfid_scans IS 'RFID scan events from Zebra scanners tracking item movement';
COMMENT ON TABLE sync_log IS 'API sync operation logs for WaitWhile and Manhattan';

-- ============================================================================
-- INITIAL DATA - Test/Demo data can be added here
-- ============================================================================

-- This will be populated by:
-- 1. Employee sync from users.json (run on startup)
-- 2. WaitWhile sync job (hourly)
-- 3. Manhattan sync job (every 15 minutes)
-- 4. RFID scan events (real-time)
