-- ============================================================================
-- ENTERPRISE MULTI-STORE MIGRATION - Phase 2
-- Add store_id foreign key to all operational tables
-- ============================================================================

BEGIN;

-- Add store_id column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS primary_store_id INTEGER REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS stores_access INTEGER[] DEFAULT '{}';

-- Set default store (San Francisco) for existing users
UPDATE users 
SET store_id = 1, primary_store_id = 1, stores_access = ARRAY[1]
WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_primary_store ON users(primary_store_id);

-- Add store_id to daily_scan_results
ALTER TABLE daily_scan_results 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE daily_scan_results SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_scan_store ON daily_scan_results(store_id);
CREATE INDEX IF NOT EXISTS idx_daily_scan_store_date ON daily_scan_results(store_id, scan_date);

-- Add store_id to shipments
ALTER TABLE shipments 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE shipments SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_store ON shipments(store_id);
CREATE INDEX IF NOT EXISTS idx_shipments_store_date ON shipments(store_id, date);

-- Add store_id to closing_duties
ALTER TABLE closing_duties 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE closing_duties SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_closing_store ON closing_duties(store_id);
CREATE INDEX IF NOT EXISTS idx_closing_store_date ON closing_duties(store_id, duty_date);

-- Add store_id to lost_punch_requests
ALTER TABLE lost_punch_requests 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE lost_punch_requests SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lost_punch_store ON lost_punch_requests(store_id);

-- Add store_id to timeoff_requests
ALTER TABLE timeoff_requests 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE timeoff_requests SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_timeoff_store ON timeoff_requests(store_id);

-- Add store_id to game_plan_tasks
ALTER TABLE game_plan_tasks 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;

UPDATE game_plan_tasks SET store_id = 1 WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_gameplan_store ON game_plan_tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_gameplan_store_date ON game_plan_tasks(store_id, task_date);

-- Add store_id to expenses (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'expenses') THEN
    ALTER TABLE expenses 
      ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) DEFAULT 1;
    
    UPDATE expenses SET store_id = 1 WHERE store_id IS NULL;
    
    CREATE INDEX IF NOT EXISTS idx_expenses_store ON expenses(store_id);
  END IF;
END $$;

-- Add store_id to system_metrics for per-store monitoring
ALTER TABLE system_metrics 
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);

CREATE INDEX IF NOT EXISTS idx_system_metrics_store ON system_metrics(store_id);

-- Create store_metrics table for Looker data (one row per store per day)
CREATE TABLE IF NOT EXISTS store_metrics (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id) NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Sales metrics
  wtd_sales_amount NUMERIC(12,2),
  wtd_sales_vs_py NUMERIC(5,2),
  wtd_target NUMERIC(12,2),
  wtd_vs_target NUMERIC(5,2),
  
  -- Performance metrics
  sales_per_hour NUMERIC(8,2),
  sph_vs_py NUMERIC(5,2),
  items_per_customer NUMERIC(5,2),
  ipc_vs_py NUMERIC(5,2),
  apc NUMERIC(8,2),
  apc_vs_py NUMERIC(5,2),
  cpc NUMERIC(5,2),
  cpc_vs_py NUMERIC(5,2),
  drop_offs NUMERIC(5,2),
  
  -- Additional data
  metrics_data JSONB DEFAULT '{}',
  
  -- Metadata
  source VARCHAR(50) DEFAULT 'looker',
  imported_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(store_id, metric_date, source)
);

CREATE INDEX idx_store_metrics_store_date ON store_metrics(store_id, metric_date DESC);
CREATE INDEX idx_store_metrics_date ON store_metrics(metric_date DESC);

COMMIT;

-- Verification queries
SELECT 'Users with stores' as check, COUNT(*) as count FROM users WHERE store_id IS NOT NULL;
SELECT 'Stores in system' as check, COUNT(*) as count FROM stores WHERE active = true;
SELECT 'Daily scans with store' as check, COUNT(*) as count FROM daily_scan_results WHERE store_id IS NOT NULL;
