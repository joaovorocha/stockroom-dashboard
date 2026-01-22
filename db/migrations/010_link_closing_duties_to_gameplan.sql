-- Migration: 010_link_closing_duties_to_gameplan.sql
-- Links closing_duties table to daily_plans for better integration

-- Add foreign key to link closing duties to the daily plan
ALTER TABLE closing_duties 
ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES daily_plans(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_closing_duties_plan ON closing_duties(plan_id);

-- Add column to track which section was completed (from gameplan assignments)
ALTER TABLE closing_duties 
ADD COLUMN IF NOT EXISTS section_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_closing_duties_section ON closing_duties(section_name);

-- Add function to get gameplan assignments for a user on a specific date
CREATE OR REPLACE FUNCTION get_user_closing_sections(p_user_id INTEGER, p_date DATE)
RETURNS TEXT[] AS $$
  SELECT closing_sections 
  FROM plan_assignments pa
  JOIN daily_plans dp ON pa.plan_id = dp.id
  WHERE pa.user_id = p_user_id 
    AND dp.plan_date = p_date
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Add view to see gameplan assignments vs actual closing duty submissions
CREATE OR REPLACE VIEW closing_duty_compliance AS
SELECT 
  dp.plan_date,
  dp.id as plan_id,
  pa.user_id,
  u.name as user_name,
  u.employee_id,
  pa.closing_sections as assigned_sections,
  array_agg(DISTINCT cd.section_name) FILTER (WHERE cd.section_name IS NOT NULL) as completed_sections,
  CASE 
    WHEN pa.closing_sections IS NULL OR array_length(pa.closing_sections, 1) IS NULL THEN 'not_assigned'
    WHEN COUNT(cd.id) = 0 THEN 'missing'
    WHEN array_length(pa.closing_sections, 1) = COUNT(DISTINCT cd.section_name) THEN 'complete'
    ELSE 'partial'
  END as compliance_status
FROM daily_plans dp
JOIN plan_assignments pa ON dp.id = pa.plan_id
LEFT JOIN users u ON pa.user_id = u.id
LEFT JOIN closing_duties cd ON cd.user_id = pa.user_id AND cd.date = dp.plan_date
WHERE pa.closing_sections IS NOT NULL 
  AND array_length(pa.closing_sections, 1) > 0
GROUP BY dp.plan_date, dp.id, pa.user_id, u.name, u.employee_id, pa.closing_sections
ORDER BY dp.plan_date DESC, u.name;

-- Update existing closing_duties to link them to their daily_plans
UPDATE closing_duties cd
SET plan_id = dp.id
FROM daily_plans dp
WHERE cd.date = dp.plan_date
  AND cd.plan_id IS NULL;

-- Add comment
COMMENT ON COLUMN closing_duties.plan_id IS 'Links closing duty submission to the daily game plan';
COMMENT ON COLUMN closing_duties.section_name IS 'Which closing section was completed (e.g., Fitting Rooms, Cash Wrap)';
COMMENT ON VIEW closing_duty_compliance IS 'Shows gameplan closing duty assignments vs actual completions';
