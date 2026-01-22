-- Migration: 011_add_scan_performance_tracking.sql
-- Adds table for RFID scan performance metrics with caching support

-- Create scan performance metrics table
CREATE TABLE IF NOT EXISTS scan_performance_metrics (
  id SERIAL PRIMARY KEY,
  scan_date DATE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  employee_id VARCHAR(100),
  employee_name VARCHAR(255),
  location VARCHAR(100) DEFAULT 'San Francisco',
  
  -- Performance metrics
  accuracy DECIMAL(5,2), -- 99.7%
  missed_reserved INTEGER DEFAULT 0,
  counts_done INTEGER DEFAULT 0,
  
  -- Rankings
  rank_accuracy INTEGER,
  rank_counts INTEGER,
  rank_missing INTEGER,
  
  -- Metadata
  source VARCHAR(50) DEFAULT 'unified-processor',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(scan_date, user_id)
);

CREATE INDEX idx_scan_performance_date ON scan_performance_metrics(scan_date);
CREATE INDEX idx_scan_performance_user ON scan_performance_metrics(user_id);
CREATE INDEX idx_scan_performance_date_user ON scan_performance_metrics(scan_date, user_id);
CREATE INDEX idx_scan_performance_accuracy ON scan_performance_metrics(accuracy DESC);

-- Create daily summary table
CREATE TABLE IF NOT EXISTS scan_performance_daily_summary (
  scan_date DATE PRIMARY KEY,
  avg_accuracy DECIMAL(5,2),
  total_counts INTEGER,
  total_employees INTEGER,
  source VARCHAR(50),
  saved_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create view for leaderboard
CREATE OR REPLACE VIEW scan_performance_leaderboard AS
SELECT 
  spm.*,
  u.email,
  u.role,
  u.image_url,
  ROW_NUMBER() OVER (PARTITION BY spm.scan_date ORDER BY spm.accuracy DESC, spm.counts_done DESC) as overall_rank
FROM scan_performance_metrics spm
LEFT JOIN users u ON spm.user_id = u.id
ORDER BY spm.scan_date DESC, overall_rank;

-- Create cache metadata table
CREATE TABLE IF NOT EXISTS cache_metadata (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  cache_type VARCHAR(100) NOT NULL, -- 'scan_performance', 'dashboard', 'metrics', etc.
  file_path TEXT,
  db_table VARCHAR(100),
  last_db_sync TIMESTAMP,
  last_file_write TIMESTAMP,
  ttl_seconds INTEGER DEFAULT 300, -- 5 minutes default
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cache_metadata_key ON cache_metadata(cache_key);
CREATE INDEX idx_cache_metadata_type ON cache_metadata(cache_type);

-- Insert default cache configurations
INSERT INTO cache_metadata (cache_key, cache_type, file_path, db_table, ttl_seconds, is_enabled) VALUES
('scan_performance_daily', 'scan_performance', 'data/scan-performance-history', 'scan_performance_metrics', 300, true),
('dashboard_metrics', 'dashboard', 'data/dashboard-data.json', 'store_metrics', 600, true),
('store_metrics_daily', 'metrics', 'data/store-metrics', 'store_metrics', 3600, true),
('employees_cache', 'employees', 'data/employees-v2.json', 'users', 1800, true)
ON CONFLICT (cache_key) DO NOTHING;

-- Function to check if cache is stale
CREATE OR REPLACE FUNCTION is_cache_stale(p_cache_key VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_ttl_seconds INTEGER;
  v_last_sync TIMESTAMP;
  v_is_enabled BOOLEAN;
BEGIN
  SELECT ttl_seconds, last_db_sync, is_enabled 
  INTO v_ttl_seconds, v_last_sync, v_is_enabled
  FROM cache_metadata
  WHERE cache_key = p_cache_key;
  
  IF NOT FOUND OR NOT v_is_enabled THEN
    RETURN true;
  END IF;
  
  IF v_last_sync IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN (EXTRACT(EPOCH FROM (NOW() - v_last_sync)) > v_ttl_seconds);
END;
$$ LANGUAGE plpgsql;

-- Function to update cache timestamp
CREATE OR REPLACE FUNCTION update_cache_timestamp(p_cache_key VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE cache_metadata
  SET last_db_sync = NOW(),
      updated_at = NOW()
  WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE scan_performance_metrics IS 'RFID scan performance metrics per employee per day';
COMMENT ON TABLE cache_metadata IS 'Manages file-based caching for database queries';
COMMENT ON FUNCTION is_cache_stale IS 'Check if cache needs refresh based on TTL';
