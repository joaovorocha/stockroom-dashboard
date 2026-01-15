-- ============================================================================
-- SHIPMENTS SYSTEM - Complete schema for Suit Supply shipment tracking
-- ============================================================================
-- Developer: Victor Rocha, Stockroom Manager @ Suit Supply
-- Purpose: Track shipments from request → pick → pack → ship → deliver
-- Integrations: PredictSpring (orders), Manhattan (inventory), UPS (labels)
-- ============================================================================

-- ============================================================================
-- SHIPMENTS - Main shipment tracking table
-- ============================================================================
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
  shipment_number VARCHAR(100) UNIQUE NOT NULL,  -- Auto-generated: SHIP-20260110-001
  
  -- Customer Information
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  
  -- Order Information (from PredictSpring)
  order_number VARCHAR(100),  -- PredictSpring order number
  ps_order_id VARCHAR(100),  -- PredictSpring internal ID
  ps_fulfillment_id VARCHAR(100),  -- Fulfillment ID
  ps_tenant_id VARCHAR(100),  -- Multi-tenant support
  
  -- Shipment Type & Priority
  shipment_type VARCHAR(50) DEFAULT 'STANDARD',  -- STANDARD, NEXT_DAY, OVERNIGHT, LOCAL_DELIVERY
  requested_by VARCHAR(50) DEFAULT 'PS_API',  -- PS_API, MAO_OVERRIDE, SA_REQUEST
  priority INTEGER DEFAULT 0,  -- 0=normal, 1=urgent, 2=rush
  
  -- Address (for UPS validation)
  customer_address JSONB,
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(50),
  address_zip VARCHAR(20),
  address_country VARCHAR(50) DEFAULT 'US',
  address_validated BOOLEAN DEFAULT false,
  address_validation_date TIMESTAMP,
  
  -- UPS Shipping
  tracking_number VARCHAR(100),
  carrier VARCHAR(50) DEFAULT 'UPS',
  service_type VARCHAR(100),
  status_from_ups VARCHAR(255),
  status_updated_at TIMESTAMP,
  status_updated_source VARCHAR(50),
  source VARCHAR(50),
  imported_at TIMESTAMP,
  package_count INTEGER,
  package_weight_lbs NUMERIC(10, 2),
  reference_1 VARCHAR(255),
  reference_2 VARCHAR(255),
  processed_by_id VARCHAR(100),
  processed_by_name VARCHAR(255),
  origin_location VARCHAR(255),
  destination_location VARCHAR(255),
  estimated_delivery_at TIMESTAMP,
  label_generated BOOLEAN DEFAULT false,
  label_file_path VARCHAR(500),
  label_generated_at TIMESTAMP,
  label_generated_by_id INTEGER REFERENCES employees(id),
  
  -- Internal Status & Workflow
  status VARCHAR(50) DEFAULT 'REQUESTED',
  -- REQUESTED → PICKING → READY_TO_PACK → PACKING → PACKED → LABEL_CREATED → IN_TRANSIT → DELIVERED
  -- Or: CANCELLED, ON_HOLD, EXCEPTION
  status_history JSONB DEFAULT '[]',  -- Track all status changes with timestamps
  
  -- Employee Tracking
  requested_by_id INTEGER REFERENCES employees(id),  -- SA who requested or PS auto-request
  assigned_picker_id INTEGER REFERENCES employees(id),  -- BOH assigned to pick items
  picked_by_id INTEGER REFERENCES employees(id),  -- BOH who picked items
  packed_by_id INTEGER REFERENCES employees(id),  -- BOH who packed items
  
  -- Timing
  requested_at TIMESTAMP DEFAULT NOW(),
  picking_started_at TIMESTAMP,
  all_items_picked_at TIMESTAMP,
  packing_started_at TIMESTAMP,
  packed_at TIMESTAMP,
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  estimated_delivery_date DATE,
  
  -- RFID Scan Validation
  requires_rfid_scan BOOLEAN DEFAULT true,
  all_items_scanned BOOLEAN DEFAULT false,
  rfid_scan_count INTEGER DEFAULT 0,
  
  -- Notes & Alerts
  notes TEXT,
  alert_message TEXT,  -- For warnings: "Missing item", "Address invalid", etc.
  tags VARCHAR(255)[],  -- ['urgent', 'fragile', 'signature_required']
  
  -- Integration Data
  ps_raw_data JSONB,  -- Raw PredictSpring order data
  ups_raw_response JSONB,  -- Raw UPS API response
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CHECK (status IN ('REQUESTED', 'PICKING', 'READY_TO_PACK', 'PACKING', 'PACKED', 
                     'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'ON_HOLD', 'EXCEPTION'))
);

-- Indexes for fast queries
CREATE INDEX idx_shipments_status ON shipments(status) WHERE status NOT IN ('DELIVERED', 'CANCELLED');
CREATE INDEX idx_shipments_customer_email ON shipments(customer_email);
CREATE INDEX idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX idx_shipments_order_number ON shipments(order_number);
CREATE INDEX idx_shipments_requested_at ON shipments(requested_at DESC);
CREATE INDEX idx_shipments_assigned_picker ON shipments(assigned_picker_id) WHERE status IN ('REQUESTED', 'PICKING');
CREATE INDEX idx_shipments_packed_by ON shipments(packed_by_id);
CREATE INDEX idx_shipments_priority ON shipments(priority DESC, requested_at ASC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Auto-update status history
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.status_history = COALESCE(NEW.status_history, '[]'::jsonb) || 
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'changed_at', NOW(),
        'changed_by_id', NEW.packed_by_id  -- or other employee ID based on status
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shipments_updated_at
BEFORE UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION update_shipments_updated_at();

-- ============================================================================
-- SHIPMENT_ITEMS - Individual items in each shipment
-- ============================================================================
CREATE TABLE IF NOT EXISTS shipment_items (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  
  -- Item Identification
  item_number VARCHAR(100),  -- SKU or item code
  description TEXT,
  sgtin VARCHAR(100),  -- RFID tag (if RFID-tagged)
  barcode VARCHAR(100),
  
  -- Manhattan Integration
  manhattan_unit_id VARCHAR(100),
  manhattan_item_id VARCHAR(100),
  unit_status VARCHAR(100),  -- From Manhattan: Available, Reserved, etc.
  
  -- Item Details
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10,2),
  category VARCHAR(100),  -- 'Suit', 'Shirt', 'Shoes', 'Accessories'
  
  -- Location & Picking
  current_zone_id INTEGER REFERENCES store_zones(id),
  rack_position VARCHAR(20),  -- A-1, B-12, etc.
  picked BOOLEAN DEFAULT false,
  picked_at TIMESTAMP,
  picked_by_id INTEGER REFERENCES employees(id),
  
  -- RFID Scan
  rfid_scanned BOOLEAN DEFAULT false,
  rfid_scanned_at TIMESTAMP,
  rfid_scanned_by_id INTEGER REFERENCES employees(id),
  last_rfid_scan_id INTEGER REFERENCES rfid_scans(id),
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shipment_items_shipment_id ON shipment_items(shipment_id);
CREATE INDEX idx_shipment_items_sgtin ON shipment_items(sgtin);
CREATE INDEX idx_shipment_items_picked ON shipment_items(picked);
CREATE INDEX idx_shipment_items_zone ON shipment_items(current_zone_id);

-- Auto-update trigger
CREATE TRIGGER trigger_update_shipment_items_updated_at
BEFORE UPDATE ON shipment_items
FOR EACH ROW
EXECUTE FUNCTION update_generic_updated_at();

-- ============================================================================
-- SHIPMENT_SCAN_EVENTS - Track all RFID scans during shipment process
-- ============================================================================
CREATE TABLE IF NOT EXISTS shipment_scan_events (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  shipment_item_id INTEGER REFERENCES shipment_items(id),
  
  sgtin VARCHAR(100) NOT NULL,
  scan_type VARCHAR(50) DEFAULT 'PICK',  -- PICK, VERIFY, PACK, FINAL_CHECK
  
  zone_id INTEGER REFERENCES store_zones(id),
  scanned_by_id INTEGER NOT NULL REFERENCES employees(id),
  scanned_at TIMESTAMP DEFAULT NOW(),
  
  -- Validation
  item_found BOOLEAN DEFAULT true,
  error_message TEXT,
  
  -- Raw scan data
  raw_scan_data JSONB
);

CREATE INDEX idx_shipment_scan_events_shipment_id ON shipment_scan_events(shipment_id);
CREATE INDEX idx_shipment_scan_events_sgtin ON shipment_scan_events(sgtin);
CREATE INDEX idx_shipment_scan_events_scanned_at ON shipment_scan_events(scanned_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Shipments (not delivered or cancelled)
CREATE OR REPLACE VIEW v_active_shipments AS
SELECT 
  s.*,
  req.name AS requested_by_name,
  req.email AS requested_by_email,
  picker.name AS assigned_picker_name,
  picked.name AS picked_by_name,
  packed.name AS packed_by_name,
  label_gen.name AS label_generated_by_name,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id) AS total_items,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id AND picked = true) AS items_picked,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id AND rfid_scanned = true) AS items_scanned
FROM shipments s
LEFT JOIN employees req ON s.requested_by_id = req.id
LEFT JOIN employees picker ON s.assigned_picker_id = picker.id
LEFT JOIN employees picked ON s.picked_by_id = picked.id
LEFT JOIN employees packed ON s.packed_by_id = packed.id
LEFT JOIN employees label_gen ON s.label_generated_by_id = label_gen.id
WHERE s.status NOT IN ('DELIVERED', 'CANCELLED');

-- BOH Dashboard View - shipments needing attention
CREATE OR REPLACE VIEW v_boh_shipments_pending AS
SELECT 
  s.*,
  req.name AS requested_by_name,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id) AS total_items,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id AND picked = true) AS items_picked,
  (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id AND rfid_scanned = true) AS items_scanned,
  CASE 
    WHEN s.status = 'REQUESTED' THEN EXTRACT(EPOCH FROM (NOW() - s.requested_at))/3600
    WHEN s.status = 'PICKING' THEN EXTRACT(EPOCH FROM (NOW() - s.picking_started_at))/3600
    WHEN s.status = 'READY_TO_PACK' THEN EXTRACT(EPOCH FROM (NOW() - s.all_items_picked_at))/3600
    ELSE 0
  END AS hours_pending
FROM shipments s
LEFT JOIN employees req ON s.requested_by_id = req.id
WHERE s.status IN ('REQUESTED', 'PICKING', 'READY_TO_PACK', 'PACKING')
ORDER BY s.priority DESC, s.requested_at ASC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate shipment number: SHIP-20260110-001
CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS VARCHAR AS $$
DECLARE
  today_str VARCHAR := TO_CHAR(NOW(), 'YYYYMMDD');
  next_num INTEGER;
  new_number VARCHAR;
BEGIN
  -- Get next sequence number for today
  SELECT COALESCE(MAX(
    CASE 
      WHEN shipment_number LIKE 'SHIP-' || today_str || '-%' 
      THEN CAST(SUBSTRING(shipment_number FROM LENGTH('SHIP-' || today_str || '-') + 1) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM shipments;
  
  new_number := 'SHIP-' || today_str || '-' || LPAD(next_num::TEXT, 3, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE shipments IS 'Main shipment tracking table - from request to delivery';
COMMENT ON TABLE shipment_items IS 'Individual items in each shipment with RFID tracking';
COMMENT ON TABLE shipment_scan_events IS 'All RFID scan events during shipment process';
COMMENT ON VIEW v_active_shipments IS 'All active shipments with employee names and item counts';
COMMENT ON VIEW v_boh_shipments_pending IS 'Shipments needing BOH attention with time pending';

