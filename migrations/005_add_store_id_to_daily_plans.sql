-- Add store_id to daily_plans table for multi-store support

-- Add store_id column
ALTER TABLE daily_plans ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;

-- Update the unique constraint to include store_id
ALTER TABLE daily_plans DROP CONSTRAINT IF EXISTS daily_plans_plan_date_key;
ALTER TABLE daily_plans ADD CONSTRAINT daily_plans_plan_date_store_key UNIQUE (plan_date, store_id);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_plans_store ON daily_plans(store_id);

-- Add foreign key to stores table
ALTER TABLE daily_plans ADD CONSTRAINT daily_plans_store_id_fkey 
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

-- Add store_id to plan_assignments if not exists
ALTER TABLE plan_assignments ADD COLUMN IF NOT EXISTS store_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_plan_assignments_store ON plan_assignments(store_id);

-- Update existing records to have store_id = 1 (San Francisco)
UPDATE daily_plans SET store_id = 1 WHERE store_id IS NULL;
UPDATE plan_assignments SET store_id = 1 WHERE store_id IS NULL;
