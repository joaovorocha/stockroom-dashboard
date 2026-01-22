-- Migration: Add Scheduled Daily Scan Tracking
-- Description: Adds columns for tracking scheduled vs actual employees for daily scans
-- Date: 2026-01-21

-- Step 1: Add columns to daily_scan_results table
ALTER TABLE daily_scan_results 
ADD COLUMN IF NOT EXISTS scheduled_employee VARCHAR(255),
ADD COLUMN IF NOT EXISTS completed_by_other BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scan_status VARCHAR(50) DEFAULT 'EXECUTED';

-- Step 2: Create game_plan_daily_scans table for future scheduled assignments
CREATE TABLE IF NOT EXISTS game_plan_daily_scans (
  id SERIAL PRIMARY KEY,
  scan_date DATE NOT NULL,
  scheduled_employee VARCHAR(255) NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(scan_date)
);

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_game_plan_daily_scans_date ON game_plan_daily_scans(scan_date);
CREATE INDEX IF NOT EXISTS idx_daily_scan_results_scheduled ON daily_scan_results(scheduled_employee);
CREATE INDEX IF NOT EXISTS idx_daily_scan_results_status ON daily_scan_results(scan_status);

-- Step 4: Create view for missed scans tracking
CREATE OR REPLACE VIEW missed_daily_scans AS
SELECT 
  COALESCE(gp.scan_date, ds.scan_date) as scan_date,
  gp.scheduled_employee,
  ds.counted_by as actual_employee,
  CASE 
    WHEN gp.scan_date IS NULL THEN 'UNSCHEDULED'
    WHEN ds.id IS NULL AND gp.scan_date > CURRENT_DATE THEN 'SCHEDULED'
    WHEN ds.id IS NULL THEN 'MISSED'
    WHEN ds.counted_by != gp.scheduled_employee THEN 'COMPLETED_BY_OTHER'
    ELSE 'EXECUTED'
  END as status,
  ds.id as scan_result_id,
  gp.id as schedule_id
FROM game_plan_daily_scans gp
FULL OUTER JOIN daily_scan_results ds ON gp.scan_date = ds.scan_date;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN daily_scan_results.scheduled_employee IS 'Email of employee who was scheduled to do the daily scan';
COMMENT ON COLUMN daily_scan_results.completed_by_other IS 'True if someone other than scheduled employee completed the scan';
COMMENT ON COLUMN daily_scan_results.scan_status IS 'EXECUTED, MISSED, COMPLETED_BY_OTHER, SCHEDULED, or UNSCHEDULED';
COMMENT ON TABLE game_plan_daily_scans IS 'Stores future scheduled daily scan assignments from game plan';

-- Step 6: Update existing records to have default status
UPDATE daily_scan_results 
SET scan_status = 'EXECUTED'
WHERE scan_status IS NULL;

-- Step 7: Create function to auto-update scan status
CREATE OR REPLACE FUNCTION update_scan_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there's a scheduled employee for this date
  SELECT scheduled_employee INTO NEW.scheduled_employee
  FROM game_plan_daily_scans
  WHERE scan_date = NEW.scan_date
  LIMIT 1;
  
  -- Set status based on who completed it
  IF NEW.scheduled_employee IS NULL THEN
    NEW.scan_status = 'EXECUTED';
    NEW.completed_by_other = false;
  ELSIF NEW.scheduled_employee = NEW.counted_by THEN
    NEW.scan_status = 'EXECUTED';
    NEW.completed_by_other = false;
  ELSE
    NEW.scan_status = 'COMPLETED_BY_OTHER';
    NEW.completed_by_other = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to auto-update status on insert/update
DROP TRIGGER IF EXISTS trigger_update_scan_status ON daily_scan_results;
CREATE TRIGGER trigger_update_scan_status
  BEFORE INSERT OR UPDATE ON daily_scan_results
  FOR EACH ROW
  EXECUTE FUNCTION update_scan_status();

-- Migration complete
SELECT 'Migration completed successfully!' as status;
