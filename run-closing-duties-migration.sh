#!/bin/bash
# Run migration to link closing duties to gameplan

PGPASSWORD=suit2024 psql -U suit -h localhost -d stockroom_dashboard << 'EOF'
-- Add plan_id column
ALTER TABLE closing_duties ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES daily_plans(id) ON DELETE SET NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_closing_duties_plan ON closing_duties(plan_id);

-- Add section_name column
ALTER TABLE closing_duties ADD COLUMN IF NOT EXISTS section_name VARCHAR(200);

-- Add index for section
CREATE INDEX IF NOT EXISTS idx_closing_duties_section ON closing_duties(section_name);

-- Check the result
SELECT 'Migration complete!' as status;
\d closing_duties
EOF
