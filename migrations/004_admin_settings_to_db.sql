-- Migrate Admin Panel Settings to Database
-- All settings from admin.html should be in database tables

BEGIN;

-- Create gameplan_settings table for zones, shifts, etc.
CREATE TABLE IF NOT EXISTS gameplan_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id) DEFAULT 1,
  setting_type VARCHAR(50) NOT NULL, -- 'zone', 'shift', 'fitting_room', 'closing_section', 'tailor_station', 'lunch_time'
  value VARCHAR(255) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, setting_type, value)
);

CREATE INDEX IF NOT EXISTS idx_gameplan_settings_store_type ON gameplan_settings(store_id, setting_type);

-- Seed default SF store settings
INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES
-- Sales Zones
(1, 'zone', 'Floor', 1),
(1, 'zone', 'Fitting Rooms', 2),
(1, 'zone', 'Front Door', 3),
(1, 'zone', 'Register', 4),
(1, 'zone', 'Back of House', 5),

-- Fitting Rooms
(1, 'fitting_room', 'FR 1', 1),
(1, 'fitting_room', 'FR 2', 2),
(1, 'fitting_room', 'FR 3', 3),
(1, 'fitting_room', 'FR 4', 4),
(1, 'fitting_room', 'FR 5', 5),
(1, 'fitting_room', 'FR 6', 6),

-- Shifts
(1, 'shift', 'Opening', 1),
(1, 'shift', 'Mid', 2),
(1, 'shift', 'Closing', 3),
(1, 'shift', 'All Day', 4),

-- Closing Sections
(1, 'closing_section', 'Suits & Jackets', 1),
(1, 'closing_section', 'Shirts', 2),
(1, 'closing_section', 'Pants', 3),
(1, 'closing_section', 'Shoes & Accessories', 4),
(1, 'closing_section', 'Fitting Rooms', 5),
(1, 'closing_section', 'Front of House', 6),
(1, 'closing_section', 'Register & Till', 7),

-- Tailor Stations
(1, 'tailor_station', 'Station 1', 1),
(1, 'tailor_station', 'Station 2', 2),
(1, 'tailor_station', 'Station 3', 3),

-- Lunch Times
(1, 'lunch_time', '12:00-12:30', 1),
(1, 'lunch_time', '12:30-1:00', 2),
(1, 'lunch_time', '1:00-1:30', 3),
(1, 'lunch_time', '1:30-2:00', 4),
(1, 'lunch_time', '2:00-2:30', 5)
ON CONFLICT (store_id, setting_type, value) DO NOTHING;

-- Verify users table has all needed columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'hire_date') THEN
    ALTER TABLE users ADD COLUMN hire_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department') THEN
    ALTER TABLE users ADD COLUMN department VARCHAR(100);
  END IF;
END $$;

COMMIT;

-- Verify migration
SELECT 
  setting_type, 
  COUNT(*) as count 
FROM gameplan_settings 
WHERE store_id = 1 
GROUP BY setting_type 
ORDER BY setting_type;
