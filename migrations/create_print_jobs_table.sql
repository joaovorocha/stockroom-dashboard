-- Print Jobs Table
-- Tracks all printing operations (labels, receipts, shipping labels)

CREATE TABLE IF NOT EXISTS print_jobs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'product_label', 'shelf_label', 'rfid_label', 'shipping_label', 'receipt'
  data JSONB NOT NULL, -- Label/receipt data
  printer_ip VARCHAR(50),
  printer_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'failed', 'pending'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) -- Employee email
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_type ON print_jobs(type);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON print_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer_ip ON print_jobs(printer_ip);

-- RFID Inventory Scans Table
-- Stores bulk RFID scan results

CREATE TABLE IF NOT EXISTS rfid_inventory_scans (
  id SERIAL PRIMARY KEY,
  reader_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(200) NOT NULL,
  tag_count INTEGER DEFAULT 0,
  tags JSONB NOT NULL, -- Array of tag data
  scan_duration INTEGER, -- milliseconds
  zone_code VARCHAR(20),
  scanned_by VARCHAR(100), -- Employee email
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfid_scans_reader ON rfid_inventory_scans(reader_id);
CREATE INDEX IF NOT EXISTS idx_rfid_scans_session ON rfid_inventory_scans(session_id);
CREATE INDEX IF NOT EXISTS idx_rfid_scans_created_at ON rfid_inventory_scans(created_at DESC);

-- Orders Table (for receipt reprinting)
-- Add columns if they don't exist

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(100) UNIQUE,
      psu_number VARCHAR(100) UNIQUE,
      customer_name VARCHAR(200),
      customer_email VARCHAR(200),
      total_amount DECIMAL(10, 2),
      status VARCHAR(50),
      order_data JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  END IF;

  -- Add missing columns if table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='psu_number') THEN
    ALTER TABLE orders ADD COLUMN psu_number VARCHAR(100) UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='order_data') THEN
    ALTER TABLE orders ADD COLUMN order_data JSONB;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_psu_number ON orders(psu_number);

-- Order Items Table

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  sku VARCHAR(100),
  description TEXT,
  price DECIMAL(10, 2),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);

COMMENT ON TABLE print_jobs IS 'Tracks all printer operations for audit and analytics';
COMMENT ON TABLE rfid_inventory_scans IS 'Stores bulk RFID inventory scan results';
COMMENT ON TABLE orders IS 'Orders for receipt reprinting and BOH fulfillment';
COMMENT ON TABLE order_items IS 'Line items for orders';
