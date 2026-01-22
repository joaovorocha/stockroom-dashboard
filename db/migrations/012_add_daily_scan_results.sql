-- Migration: Add Daily Scan Results Tables
-- Description: Store imported StoreCount CSV data and track import history

-- Daily scan results table (stores imported CSV data)
CREATE TABLE IF NOT EXISTS daily_scan_results (
  id SERIAL PRIMARY KEY,
  count_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL,
  store_load VARCHAR(100),
  location_id VARCHAR(100),
  organization_id VARCHAR(100),
  date DATE NOT NULL,
  counted_by VARCHAR(255) NOT NULL,
  expected_units INTEGER NOT NULL DEFAULT 0,
  counted_units INTEGER NOT NULL DEFAULT 0,
  missed_available INTEGER DEFAULT 0,
  missed_reserved INTEGER DEFAULT 0,
  new_units INTEGER DEFAULT 0,
  found_previously_missed INTEGER DEFAULT 0,
  undecodable_units INTEGER DEFAULT 0,
  unmapped_item_units INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Import history table
CREATE TABLE IF NOT EXISTS daily_scan_imports (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  records_count INTEGER NOT NULL,
  imported_by VARCHAR(255) NOT NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'SUCCESS'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_scan_results_date ON daily_scan_results(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_scan_results_counted_by ON daily_scan_results(counted_by);
CREATE INDEX IF NOT EXISTS idx_daily_scan_results_status ON daily_scan_results(status);
CREATE INDEX IF NOT EXISTS idx_daily_scan_imports_date ON daily_scan_imports(imported_at DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_daily_scan_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_daily_scan_results_updated_at
BEFORE UPDATE ON daily_scan_results
FOR EACH ROW
EXECUTE FUNCTION update_daily_scan_results_updated_at();

COMMENT ON TABLE daily_scan_results IS 'Stores daily RFID scan performance data imported from StoreCount CSV files';
COMMENT ON TABLE daily_scan_imports IS 'Tracks CSV import history for daily scan data';
