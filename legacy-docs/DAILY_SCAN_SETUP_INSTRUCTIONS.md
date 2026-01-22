# Daily Scan Performance - Setup Instructions

## Quick Start

### 1. Ensure Database Tables Exist

Run the migration:
```bash
cd /var/www/stockroom-dashboard
psql -U suit -d stockroom_dashboard < db/migrations/012_add_daily_scan_results.sql
```

Verify tables were created:
```bash
psql -U suit -d stockroom_dashboard -c "\dt daily_scan*"
```

You should see:
- `daily_scan_results`
- `daily_scan_imports`

### 2. Test the CSV Import

Create a test CSV file with this format:

**File: test-scan.csv**
```csv
Count ID,Status,Store Load,Location ID,Organization ID,Created Date,Counted By,Expected Units,Counted Units,Missed Units - Available,Missed Units - Reserved,New Units,Found previously Missed Units,Undecodable Units,Unmapped Item Units
SCAN-001,COMPLETED,SF-Main,SF001,ORG123,Jan 20, 2026 2:00 PM,John Doe,1000,985,10,5,20,5,3,2
SCAN-002,COMPLETED,SF-Main,SF001,ORG123,Jan 19, 2026 3:30 PM,Jane Smith,950,940,8,2,15,3,2,1
```

### 3. Upload via UI

1. Navigate to: http://suitserver.tail39e95f.ts.net/daily-scan-performance
2. Click the "Import Data" tab
3. Upload the test-scan.csv file
4. Verify import was successful

### 4. Verify Data

Check the database:
```bash
psql -U suit -d stockroom_dashboard -c "SELECT * FROM daily_scan_results ORDER BY date DESC LIMIT 5;"
```

Check import history:
```bash
psql -U suit -d stockroom_dashboard -c "SELECT * FROM daily_scan_imports ORDER BY imported_at DESC LIMIT 5;"
```

## Troubleshooting

### CSV Upload Fails

**Check 1: Verify upload directory exists**
```bash
mkdir -p /var/www/stockroom-dashboard/data/tmp
chmod 755 /var/www/stockroom-dashboard/data/tmp
```

**Check 2: Check server logs**
```bash
pm2 logs stockroom-dashboard --lines 50
```

**Check 3: Test the API directly**
```bash
curl -X POST \
  -F "file=@test-scan.csv" \
  -H "Cookie: $(cat ~/.cookie)" \
  http://localhost:3000/api/gameplan/daily-scan/import
```

### No Data Showing

**Check 1: Verify tables exist**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'daily_scan%';
```

**Check 2: Check if data exists**
```sql
SELECT COUNT(*) FROM daily_scan_results;
SELECT COUNT(*) FROM daily_scan_imports;
```

**Check 3: Verify API responses**
```bash
curl http://localhost:3000/api/gameplan/daily-scan/results?days=30
```

### Assignment Matching Not Working

**Check 1: Verify game plan has assignment**
```bash
cat data/gameplans/$(date +%Y-%m-%d).json | grep -A 5 dailyScan
```

**Check 2: Test assignment API**
```bash
curl "http://localhost:3000/api/gameplan/daily-scan/check?date=$(date +%Y-%m-%d)"
```

## CSV Column Mapping

| StoreCount CSV Column | Database Column | Type | Required |
|-----------------------|-----------------|------|----------|
| Count ID | count_id | string | Yes |
| Status | status | string | Yes |
| Store Load | store_load | string | No |
| Location ID | location_id | string | No |
| Organization ID | organization_id | string | No |
| Created Date | date | date | Yes |
| Counted By | counted_by | string | Yes |
| Expected Units | expected_units | integer | Yes |
| Counted Units | counted_units | integer | Yes |
| Missed Units - Available | missed_available | integer | No |
| Missed Units - Reserved | missed_reserved | integer | No |
| New Units | new_units | integer | No |
| Found previously Missed Units | found_previously_missed | integer | No |
| Undecodable Units | undecodable_units | integer | No |
| Unmapped Item Units | unmapped_item_units | integer | No |

## Date Format Examples

The system accepts these date formats:
- `Jan 20, 2026 2:00 PM`
- `2026-01-20`
- `01/20/2026`
- Any format parseable by JavaScript `new Date()`

## API Endpoints Reference

### GET /api/gameplan/daily-scan/results
Get scan results for date range

**Parameters:**
- `days` (optional, default: 30) - Number of days to look back

**Response:**
```json
[
  {
    "id": 1,
    "count_id": "SCAN-001",
    "status": "COMPLETED",
    "date": "2026-01-20",
    "counted_by": "John Doe",
    "expected_units": 1000,
    "counted_units": 985,
    "missed_available": 10,
    "missed_reserved": 5,
    "new_units": 20,
    "undecodable_units": 3
  }
]
```

### GET /api/gameplan/daily-scan/performance
Get employee performance aggregates

**Parameters:**
- `days` (optional, default: 30)

**Response:**
```json
[
  {
    "counted_by": "John Doe",
    "total_scans": 15,
    "avg_accuracy": 98.5,
    "total_missed": 120,
    "total_new": 250,
    "total_undecodable": 25
  }
]
```

### POST /api/gameplan/daily-scan/import
Upload CSV file

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file` (CSV file)

**Response:**
```json
{
  "success": true,
  "imported": 45,
  "message": "Successfully imported 45 records"
}
```

### GET /api/gameplan/daily-scan/check
Check assignment for a specific date

**Parameters:**
- `date` (required) - YYYY-MM-DD format

**Response:**
```json
{
  "assigned": true,
  "employeeId": "12345",
  "employeeName": "John Doe",
  "date": "2026-01-20"
}
```

## Next Steps After Setup

1. **Assign Daily Scan** - Use the game plan editor to assign employees
2. **Upload Historical Data** - Import past CSV exports
3. **Monitor Performance** - Check the performance tab daily
4. **Review Accuracy** - Identify trends and improvement areas

## Support

For issues or questions:
- Developer: Victor Rocha
- Phone: 831-998-3808
- Location: San Francisco Store
