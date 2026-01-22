# Daily Scan Performance - Debugging Summary

## Date: January 20, 2026

## Issue Reported
- Daily Scan Performance page showing empty/no data
- CSV import appears to work but data not visible in UI

## Investigation Steps Completed

### 1. Routes Verified
All daily-scan routes in `/var/www/stockroom-dashboard/routes/gameplan.js`:
- ✓ GET `/api/gameplan/daily-scan/results` - Returns scan data (lines 2764-2795)
- ✓ GET `/api/gameplan/daily-scan/performance` - Returns employee performance aggregates (lines 2798-2828)
- ✓ GET `/api/gameplan/daily-scan/looker-data` - Returns Looker dashboard data (lines 2695-2761)
- ✓ GET `/api/gameplan/daily-scan/import-history` - Returns import history (lines 2831-2851)
- ✓ POST `/api/gameplan/daily-scan/import` - CSV upload endpoint

### 2. Database Schema Verified
Table: `daily_scan_results`
- Columns aligned with route queries:
  - `missed_units_available` → aliased as `missed_available`
  - `missed_units_reserved` → aliased as `missed_reserved`
  - `found_previously_missed_units` → aliased as `found_previously_missed`
  - Plus: `scan_date`, `counted_by`, `expected_units`, `counted_units`, etc.

### 3. Frontend Code Verified
File: `/var/www/stockroom-dashboard/public/js/daily-scan-performance.js`
- Fetches data with default of 365 days when no date filter exists
- Handles session expiration (401/403)
- Updates KPIs and renders charts

### 4. Enhancements Added

#### A. Server-Side Logging (routes/gameplan.js)
Added detailed console logging to `/daily-scan/results` endpoint:
```javascript
console.log(`[daily-scan/results] Querying for ${days} days, startDate: ${dateFilter}`);
console.log(`[daily-scan/results] Found ${result.rows.length} rows`);
console.log(`[daily-scan/results] Date range: ${earliest} to ${latest}`);
```

#### B. Frontend Logging (daily-scan-performance.js)
Added console logging to track data flow:
```javascript
console.log(`[loadScanData] Fetching data for ${days} days`);
console.log(`[loadScanData] Response status: ${response.status}`);
console.log(`[loadScanData] Received ${scanData.length} scan records`);
console.log('[updateKPIs] scanData.length = ...  ');
```

#### C. Debug Page Created
Created `/public/daily-scan-debug.html` - a comprehensive debugging page that:
- Tests all API endpoints automatically
- Shows response status, data count, and sample data
- Tests with multiple day ranges (30, 90, 365, 730)
- Checks authentication status
- Captures all console logs
- **Access at: http://your-server/daily-scan-debug.html**

### 5. Cache Busting
Updated version in `daily-scan-performance.html`:
- Changed from `v=4` to `v=5` to force browser cache refresh

## Potential Root Causes

### Most Likely:
1. **Date Range Mismatch**: Imported data scan_dates may be outside the query range
   - Default query: last 30 days
   - Frontend override: 365 days
   - If imported dates are older than 365 days, they won't show

2. **Session/Authentication**: 
   - Cookies not being sent properly
   - Session expiring between page load and API calls
   - CORS or credentials issue

3. **Browser Cache**: 
   - Old JavaScript being served despite changes
   - Now mitigated with v=5 cache bust

### Less Likely:
4. **Database Connection**: pgPool might be null
5. **Query Error**: SQL syntax or column mismatch (already verified)
6. **Frontend Rendering**: Data loaded but not displayed (charts/tables not rendering)

## Next Steps for User

### 1. Access Debug Page (RECOMMENDED FIRST STEP)
```
http://your-server-ip:3000/daily-scan-debug.html
```
This will automatically run all tests and show:
- Exact API responses
- Data counts
- Sample records
- Authentication status
- Any errors

### 2. Check Server Logs
```bash
cd /var/www/stockroom-dashboard
pm2 logs stockroom-dashboard --lines 50
```
Look for lines with `[daily-scan/results]` to see:
- How many rows returned
- What date range was queried
- Any errors

### 3. Verify Database Contents
```bash
cd /var/www/stockroom-dashboard
node quick-db-check.js
```
This will show:
- Total row count
- Date range in database
- Sample records
- How many rows match different day ranges

### 4. Check Browser Console
On the daily-scan-performance page:
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for messages starting with `[loadScanData]` and `[updateKPIs]`
4. Check Network tab for API calls and their responses

### 5. Hard Refresh Browser
- Windows/Linux: Ctrl + Shift + R
- Mac: Cmd + Shift + R

## Files Modified in This Session

1. `/var/www/stockroom-dashboard/routes/gameplan.js`
   - Added detailed logging to `/daily-scan/results` endpoint

2. `/var/www/stockroom-dashboard/public/js/daily-scan-performance.js`
   - Added console logging for data loading and KPI updates

3. `/var/www/stockroom-dashboard/public/daily-scan-performance.html`
   - Updated cache version from v=4 to v=5

4. **NEW**: `/var/www/stockroom-dashboard/public/daily-scan-debug.html`
   - Comprehensive debug page

5. **NEW**: `/var/www/stockroom-dashboard/quick-db-check.js`
   - Database verification script

6. **NEW**: `/var/www/stockroom-dashboard/test-daily-scan-api.js`
   - API endpoint testing script

## Expected Behavior

When working correctly:
1. User visits `/daily-scan-performance.html`
2. Frontend calls `/api/gameplan/daily-scan/results?days=365`
3. Server logs: `[daily-scan/results] Querying for 365 days, startDate: YYYY-MM-DD`
4. Server logs: `[daily-scan/results] Found X rows`
5. Frontend logs: `[loadScanData] Received X scan records`
6. Frontend logs: `[updateKPIs] scanData.length = X`
7. Charts and tables render with data

If any step fails, the logs will show where the breakdown occurs.

## Quick Command Reference

```bash
# Restart server
pm2 restart stockroom-dashboard

# View logs
pm2 logs stockroom-dashboard --lines 100

# Database quick check
psql -U suit -d stockroom_dashboard -c "SELECT COUNT(*), MIN(scan_date), MAX(scan_date) FROM daily_scan_results;"

# Test API endpoint
curl "http://localhost:3000/api/gameplan/daily-scan/results?days=365" | python3 -m json.tool | head -100
```
