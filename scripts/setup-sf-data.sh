#!/bin/bash
# Complete SF Data Setup - Migrate admin settings and create sample gameplan

set -e

echo "=================================================="
echo "SF Store Data Setup"
echo "=================================================="
echo ""

# Step 1: Migrate settings to database
echo "Step 1: Migrating admin panel settings to database..."
sudo -u postgres psql stockroom_dashboard <<'SQL'
-- Create settings table
CREATE TABLE IF NOT EXISTS gameplan_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER DEFAULT 1,
  setting_type VARCHAR(50) NOT NULL,
  value VARCHAR(255) NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, setting_type, value)
);

-- Insert default settings
INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES
(1, 'zone', 'Floor', 1),
(1, 'zone', 'Fitting Rooms', 2),
(1, 'zone', 'Register', 3),
(1, 'shift', 'Opening', 1),
(1, 'shift', 'Mid', 2),
(1, 'shift', 'Closing', 3),
(1, 'closing_section', 'Suits', 1),
(1, 'closing_section', 'Shirts', 2),
(1, 'fitting_room', 'FR 1', 1),
(1, 'fitting_room', 'FR 2', 2),
(1, 'tailor_station', 'Station 1', 1)
ON CONFLICT DO NOTHING;

SELECT COUNT(*) as settings_count FROM gameplan_settings WHERE store_id = 1;
SQL

echo "✓ Settings migrated"
echo ""

# Step 2: Verify users
echo "Step 2: Verifying user data..."
sudo -u postgres psql stockroom_dashboard -t -c "SELECT COUNT(*) FROM users WHERE is_active = true AND store_id = 1;"
echo "✓ Users verified"
echo ""

# Step 3: Create sample gameplan
echo "Step 3: Creating sample gameplan..."
node /var/www/stockroom-dashboard/scripts/create-sample-gameplan.js
echo ""

echo "=================================================="
echo "✓ SF Store Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Visit http://localhost:5173/gameplan"
echo "2. Refresh the page"
echo "3. You should see all employee assignments!"
echo ""
