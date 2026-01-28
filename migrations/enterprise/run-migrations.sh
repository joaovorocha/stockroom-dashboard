#!/bin/bash

# ============================================================================
# Enterprise Multi-Store Migration Runner
# Executes all migration SQL files in order
# ============================================================================

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR"
DB_NAME="${DB_NAME:-stockroom_dashboard}"
DB_USER="${DB_USER:-suit}"

echo "=========================================="
echo "Enterprise Multi-Store Migration"
echo "=========================================="
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to run a migration
run_migration() {
  local file=$1
  local filename=$(basename "$file")
  
  echo -n "Running $filename... "
  
  if psql -U "$DB_USER" -d "$DB_NAME" -f "$file" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ SUCCESS${NC}"
    return 0
  else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Error running $filename. Check logs for details."
    return 1
  fi
}

# Check if database exists
if ! psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo -e "${RED}Error: Database '$DB_NAME' does not exist${NC}"
  exit 1
fi

echo "Starting migrations..."
echo ""

# Run migrations in order
for migration in "$MIGRATIONS_DIR"/*.sql; do
  if [ -f "$migration" ]; then
    run_migration "$migration" || {
      echo -e "${RED}Migration failed. Stopping.${NC}"
      exit 1
    }
  fi
done

echo ""
echo -e "${GREEN}=========================================="
echo "All migrations completed successfully!"
echo "==========================================${NC}"
echo ""

# Run verification queries
echo "Verification:"
echo "-------------"

psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
  'Active Stores' as metric,
  COUNT(*)::text as value
FROM stores 
WHERE active = true

UNION ALL

SELECT 
  'Users with Store Assignment' as metric,
  COUNT(*)::text as value
FROM users 
WHERE store_id IS NOT NULL

UNION ALL

SELECT 
  'Daily Scans with Store Assignment' as metric,
  COUNT(*)::text as value
FROM daily_scan_results 
WHERE store_id IS NOT NULL;
"

echo ""
echo "North America Stores:"
echo "--------------------"

psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
  store_code,
  store_name,
  city || ', ' || state_province as location,
  country
FROM stores 
WHERE region = 'North America' AND active = true
ORDER BY country, state_province, city
LIMIT 10;
"

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Review the stores table to ensure all stores are correct"
echo "2. Update Looker email processor to handle (ALL) emails"
echo "3. Test with sample email data"
echo "4. Update frontend to show store selector"
echo ""
