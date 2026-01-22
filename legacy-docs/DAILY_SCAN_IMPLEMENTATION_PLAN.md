# Daily Scan Performance System - Implementation Plan

## Overview
The Daily Scan Performance system tracks inventory accuracy through two data sources:
1. **Looker Data** - Automated sync from business intelligence system
2. **CSV Imports** - Manual uploads of StoreCount export files

## Data Sources

### 1. Looker Data (From Operations Metrics)
- **Source**: Automated sync via `/api/looker/sync-operations`
- **Storage**: PostgreSQL `operations_metrics` table
- **Contains**: Store-wide operational KPIs including scan metrics
- **Update Frequency**: Automated (daily sync)

### 2. CSV Import (StoreCount Exports)
- **Source**: Manual upload via UI
- **Storage**: PostgreSQL `daily_scan_results` table
- **Contains**: Detailed individual scan session data
- **Update Frequency**: Manual (as needed)

## Database Schema

### Table: `daily_scan_results`
```sql
CREATE TABLE daily_scan_results (
  id SERIAL PRIMARY KEY,
  count_id VARCHAR(100) UNIQUE NOT NULL,  -- Unique scan ID from StoreCount
  status VARCHAR(50) NOT NULL,             -- COMPLETED, CANCELLED, etc.
  store_load VARCHAR(100),
  location_id VARCHAR(100),
  organization_id VARCHAR(100),
  date DATE NOT NULL,                      -- Date of the scan
  counted_by VARCHAR(255) NOT NULL,        -- Employee who performed scan
  expected_units INTEGER NOT NULL,
  counted_units INTEGER NOT NULL,
  missed_available INTEGER DEFAULT 0,
  missed_reserved INTEGER DEFAULT 0,
  new_units INTEGER DEFAULT 0,
  found_previously_missed INTEGER DEFAULT 0,
  undecodable_units INTEGER DEFAULT 0,
  unmapped_item_units INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `daily_scan_imports`
```sql
CREATE TABLE daily_scan_imports (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  records_count INTEGER NOT NULL,
  imported_by VARCHAR(255) NOT NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'SUCCESS'
);
```

## Data Flow & Matching Strategy

### Assignment Matching
Daily scan assignments are stored in game plans at:
```
data/gameplans/YYYY-MM-DD.json
```

Each game plan contains:
```json
{
  "dailyScan": {
    "assigned": true,
    "employeeId": "12345",
    "employeeName": "John Doe"
  }
}
```

### Matching Logic
1. **By Date**: Match scan results to assignments by date
2. **By Employee**: Match employee name from CSV to assignment
   - Use fuzzy matching (first name, last name variations)
   - Handle case-insensitive matching
3. **Assignment Status**:
   - **Assigned + Completed**: Employee completed their assigned scan
   - **Assigned + Not Found**: Employee hasn't scanned yet
   - **Not Assigned + Completed**: Scan performed without assignment
   - **Not Assigned + Not Found**: No activity

## API Endpoints

### Read Operations
- `GET /api/gameplan/daily-scan/check?date=YYYY-MM-DD` - Check assignment for a date
- `GET /api/gameplan/daily-scan/results?days=30` - Get scan results (last N days)
- `GET /api/gameplan/daily-scan/performance?days=30` - Employee performance aggregates
- `GET /api/gameplan/daily-scan/import-history` - List of past imports

### Write Operations
- `POST /api/gameplan/daily-scan/assign` - Assign employee to daily scan
- `POST /api/gameplan/daily-scan/import` - Upload CSV file

## CSV Format (StoreCount Export)

Expected columns:
- Count ID
- Status  
- Store Load
- Location ID
- Organization ID
- Created Date (e.g., "Feb 17, 2025 6:58 PM")
- Counted By
- Expected Units
- Counted Units
- Missed Units - Available
- Missed Units - Reserved
- New Units
- Found previously Missed Units
- Undecodable Units
- Unmapped Item Units

## Key Metrics Calculations

### Accuracy
```
Accuracy = (Counted Units / Expected Units) × 100
```

### Total Missed
```
Total Missed = Missed Available + Missed Reserved
```

### Undecodable Rate
```
Undecodable Rate = (Undecodable Units / Expected Units) × 100
```

### Assignment Match Rate
```
Match Rate = (Assigned Scans Completed / Total Assigned) × 100
```

## Implementation Checklist

### Phase 1: Database Setup ✓
- [x] Create migration files
- [x] Define schema for daily_scan_results
- [x] Define schema for daily_scan_imports
- [x] Create indexes for performance

### Phase 2: Backend API ✓
- [x] Implement GET /results endpoint
- [x] Implement GET /performance endpoint
- [x] Implement POST /import endpoint
- [x] Implement GET /import-history endpoint
- [ ] Add proper error handling
- [ ] Add validation for CSV format
- [ ] Add duplicate detection

### Phase 3: Frontend UI
- [ ] Fix CSV upload functionality
- [ ] Display today's assignment status
- [ ] Show KPI cards with real data
- [ ] Implement accuracy trend chart
- [ ] Create employee performance charts
- [ ] Build scan details table with filtering
- [ ] Add date range selector

### Phase 4: Data Integration
- [ ] Match assignments with scan results
- [ ] Handle name variations (fuzzy matching)
- [ ] Merge Looker data with CSV data
- [ ] Prevent duplicate metrics
- [ ] Add data validation rules

### Phase 5: Testing & Optimization
- [ ] Test CSV upload with real data
- [ ] Verify assignment matching accuracy
- [ ] Test edge cases (no assignment, multiple scans)
- [ ] Performance testing with large datasets
- [ ] Add logging for debugging

## Current Issues & Fixes Needed

### Issue 1: CSV Import Not Working
**Problem**: Upload functionality broken
**Fix**: 
- Check multer configuration for file upload
- Verify route is properly registered
- Add proper error messages
- Test with sample CSV

### Issue 2: Page Not Loading Data
**Problem**: API calls failing or returning no data
**Fix**:
- Run database migration
- Verify table exists: `\d daily_scan_results`
- Check API endpoints are registered
- Add console logging for debugging

### Issue 3: Assignment Matching
**Problem**: Need to match CSV names with assignments
**Fix**:
- Implement fuzzy name matching
- Handle variations (firstname, lastname, full name)
- Add manual override capability

## Next Steps

1. **Run Migration** (if not already done):
   ```bash
   psql -U suit -d stockroom_dashboard -f db/migrations/012_add_daily_scan_results.sql
   ```

2. **Test CSV Upload**:
   - Create test CSV with proper format
   - Upload via UI
   - Verify data in database

3. **Fix Frontend**:
   - Add proper error handling
   - Show loading states
   - Display imported data

4. **Implement Matching**:
   - Create matching algorithm
   - Test with real assignments
   - Add confidence scores

## Sample Data Flow

```
1. Manager assigns "John Doe" to daily scan via game plan
   → Saved to: data/gameplans/2026-01-20.json

2. John performs scan using StoreCount app
   → Data exported to CSV

3. Manager uploads CSV to dashboard
   → POST /api/gameplan/daily-scan/import
   → Parsed and stored in daily_scan_results table

4. System matches data:
   - Date: 2026-01-20
   - Employee: "John Doe" (from assignment)
   - Scan Result: "Doe, John" (from CSV)
   → Match found via fuzzy matching

5. Dashboard displays:
   - Today's Assignment: Completed ✅
   - Accuracy: 98.5%
   - Missed Units: 12
   - Status: On track
```

## File Structure

```
/var/www/stockroom-dashboard/
├── db/migrations/
│   └── 012_add_daily_scan_results.sql  ✓
├── routes/
│   └── gameplan.js                     ✓ (contains API endpoints)
├── public/
│   ├── daily-scan.html                 ⚠️ (needs fixes)
│   └── js/
│       └── daily-scan-performance.js   ⚠️ (needs fixes)
└── data/
    └── gameplans/                      ✓ (stores assignments)
```

## Notes
- CSV imports are additive (append to existing data)
- Duplicate detection uses count_id (unique constraint)
- Updates allowed via ON CONFLICT clause
- Historical data preserved for reporting
