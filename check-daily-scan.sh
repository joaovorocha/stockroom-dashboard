#!/bin/bash

echo "=== Daily Scan Database Check ==="
echo ""

echo "Total rows:"
psql -U suit -d stockroom_dashboard -t -c "SELECT COUNT(*) FROM daily_scan_results;"

echo ""
echo "Date range:"
psql -U suit -d stockroom_dashboard -t -c "SELECT MIN(scan_date), MAX(scan_date) FROM daily_scan_results;"

echo ""
echo "Rows by year:"
psql -U suit -d stockroom_dashboard -t -c "SELECT EXTRACT(YEAR FROM scan_date) as year, COUNT(*) FROM daily_scan_results GROUP BY year ORDER BY year;"

echo ""
echo "Recent rows (last 5):"
psql -U suit -d stockroom_dashboard -c "SELECT scan_date, counted_by, expected_units, counted_units FROM daily_scan_results ORDER BY scan_date DESC LIMIT 5;"

echo ""
echo "=== API Test ==="
echo "Testing /api/gameplan/daily-scan/results?days=365"
curl -s "http://localhost:3000/api/gameplan/daily-scan/results?days=365" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Returned {len(data)} rows')"

echo ""
echo "Testing /api/gameplan/daily-scan/results?days=30"
curl -s "http://localhost:3000/api/gameplan/daily-scan/results?days=30" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Returned {len(data)} rows')"
