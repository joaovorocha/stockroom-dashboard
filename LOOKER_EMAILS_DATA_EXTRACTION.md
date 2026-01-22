# Looker Emails Data Extraction & Integration

## Overview
This document details what data is extracted from Looker Gmail emails and how it's integrated into the Daily Scan Performance page.

## Email Sources

### 1. **Store count performance - Employee level**
- **Subject:** "Store count performance - Employee level"
- **Attachment:** `Store_count_pe...` (employee_level.csv)
- **Directory:** `src/files/dashboard-store_count_performance_-_employee_level/`
- **File:** `employee_level.csv`

**Data Extracted:**
```csv
Employee, Location, Accuracy %, Missed Reserved Units, Counts Done, Rank (Accuracy), Rank (Counts), Rank (Missing)
```

**Used For:**
- Employee scan accuracy rankings
- Missed reserved units tracking
- Total counts completed per employee
- Top performers identification
- Performance comparison charts

---

### 2. **Store count performance - Store level**
- **Subject:** "Store count performance - Store level"
- **Attachment:** `Store_count_pe...` (store_level.csv)
- **Directory:** `src/files/dashboard-store_count_performance_-_store_level/`
- **File:** `store_level.csv`

**Data Extracted:**
```csv
Store, Total Counts, Accuracy %, Missed Available, Missed Reserved, New Units, Undecodable, Status
```

**Used For:**
- Overall store scan accuracy KPI
- Total missed units (available + reserved)
- Scan completion metrics
- Undecodable rate calculation
- Color-coded KPI cards (green/yellow/red)

---

### 3. **Stores Performance** (Multi-attachment)
- **Subject:** "Stores Performance"
- **Attachments:** Multiple CSVs including `kpis_per_employee.csv`
- **Directory:** `src/files/dashboard-stores_performance/`
- **File:** `kpis_per_employee.csv`

**Data Extracted:**
```csv
Employee, Employee Image, Sales Amount, APC, IPC, CPC, Sales per Hour, Sales Shares
```

**KPI Definitions:**
- **Sales Amount:** Total sales revenue generated
- **APC:** Average Price per Customer transaction
- **IPC:** Items Per Customer (units sold per transaction)
- **CPC:** Customers Per Count (traffic conversion)
- **SPH:** Sales Per Hour (productivity metric)
- **Sales Shares:** Percentage of total store sales

**Used For:**
- Employee profile images
- Sales performance alongside scan accuracy
- Comprehensive employee performance table
- Multi-metric employee comparison

---

## Integration Architecture

### Data Flow
```
Gmail IMAP
  ↓
unified-gmail-processor.js (runs every 30 min)
  ↓
Extracts CSV attachments → src/files/dashboard-{email_subject}/
  ↓
looker-data-processor.js
  ↓
Processes CSVs → dashboard-data.json
  ↓
API: GET /api/gameplan/daily-scan/looker-data
  ↓
Frontend: daily-scan-performance.js
  ↓
Renders: Charts + Tables + KPIs
```

### API Response Structure
```json
{
  "employee": {
    "employees": [
      {
        "name": "Employee Name",
        "accuracy": 98.5,
        "countsDone": 125,
        "missedReserved": 2,
        "salesAmount": "26800",
        "apc": "812",
        "ipc": "2.70",
        "cpc": "1.52",
        "sph": "1200",
        "salesShare": "18",
        "imageUrl": "https://cdn.suitsupply.com/..."
      }
    ],
    "summary": {
      "avgAccuracy": 97.8,
      "totalCounts": 450
    }
  },
  "store": {
    "storeData": {
      "accuracy": 98.2,
      "totalCounts": 450,
      "missedAvailable": 5,
      "missedReserved": 8,
      "newUnits": 12,
      "undecodable": 3
    },
    "summary": { ... }
  },
  "employeeKPIs": [ ... ],
  "lastUpdated": "2026-01-20"
}
```

---

## Frontend Display Components

### 1. **Overview Tab**
**KPI Cards (from Store-level data):**
- Average Accuracy → `store.accuracy`
- Avg Missed Units → `store.missedAvailable + store.missedReserved`
- Scans Completed → `store.totalCounts`
- Undecodable Rate → `(store.undecodable / store.totalCounts) * 100`

**Color Coding:**
- 🟢 Green: Accuracy ≥ 99%, Missed ≤ 10
- 🟡 Yellow: Accuracy ≥ 95%, Missed ≤ 50
- 🔴 Red: Accuracy < 95%, Missed > 50

### 2. **Performance Tab**
**Charts (from Employee-level data):**
- **Top Performers Chart:** Top 5 by `accuracy` (horizontal bar)
- **Most Missed Units:** Top 5 by `missedReserved` (horizontal bar)
- **Employee Comparison:** All employees with dual-axis (accuracy % + counts done)

### 3. **Details Tab**
**Employee Performance Table (merged data):**

| Column | Source | Data Field |
|--------|--------|------------|
| Employee | Employee-level | `name` |
| Scan Accuracy | Employee-level | `accuracy` |
| Counts Done | Employee-level | `countsDone` |
| Missed Units | Employee-level | `missedReserved` |
| Sales Amount | Stores Performance | `salesAmount` |
| APC | Stores Performance | `apc` |
| IPC | Stores Performance | `ipc` |
| SPH | Stores Performance | `sph` |
| Sales Share | Stores Performance | `salesShare` |

**Features:**
- Sortable columns
- Color-coded accuracy (green/yellow/red)
- Search/filter functionality
- Employee images from KPI data

---

## Auto-Population Schedule

- **Gmail Check:** Every 30 minutes (unified-gmail-processor.js)
- **CSV Processing:** Immediate upon email arrival
- **Dashboard Update:** Real-time via API endpoint
- **Frontend Refresh:** On page load + manual refresh

### Manual Trigger
```bash
# Force immediate email check and processing
pm2 trigger stockroom-dashboard check-looker
```

---

## Data Merge Strategy

### Employee Matching
Employees from "Store count performance - Employee level" are **enriched** with sales KPIs from "Stores Performance":

```javascript
const enrichedEmployees = employee.employees.map(scanEmp => {
  const kpi = employeeKPIs.find(k => 
    k.name.toLowerCase() === scanEmp.name.toLowerCase()
  );
  return kpi ? { ...scanEmp, ...kpi } : scanEmp;
});
```

**Matching Logic:**
- Case-insensitive name comparison
- Exact string match required
- Missing KPI data shown as `--` in table

---

## File Locations

### Backend Processing
- `utils/unified-gmail-processor.js` - Gmail IMAP fetcher
- `utils/looker-data-processor.js` - CSV parser and data processor
- `routes/gameplan.js` - API endpoints (line 2669+)

### Frontend Display
- `public/daily-scan.html` - Page structure
- `public/js/daily-scan-performance.js` - Data loading and rendering

### Data Storage
- `src/files/dashboard-store_count_performance_-_employee_level/employee_level.csv`
- `src/files/dashboard-store_count_performance_-_store_level/store_level.csv`
- `src/files/dashboard-stores_performance/kpis_per_employee.csv`
- `data/dashboard-data.json` - Consolidated cache

---

## Monitoring

### Check Email Processing
```bash
# View Gmail processor logs
pm2 logs stockroom-dashboard | grep -i "looker\|gmail\|store count"

# Check last processed data
cat data/dashboard-data.json | jq '.countPerformance, .storeCountPerformance' | head -50
```

### Verify CSV Files
```bash
# Check employee-level scan data
head -10 src/files/dashboard-store_count_performance_-_employee_level/employee_level.csv

# Check store-level scan data
cat src/files/dashboard-store_count_performance_-_store_level/store_level.csv

# Check sales KPIs
head -20 src/files/dashboard-stores_performance/kpis_per_employee.csv
```

---

## Troubleshooting

### No Data Showing
1. Check if emails arrived: Gmail inbox → Search "Looker"
2. Verify CSV extraction: `ls -la src/files/dashboard-*/`
3. Check processor logs: `pm2 logs stockroom-dashboard --lines 100`
4. Verify API response: `curl http://localhost:5005/api/gameplan/daily-scan/looker-data`

### Data Mismatch
- Employee names must match exactly between CSVs
- CSV parsing expects specific column order
- Check for special characters in employee names

### Stale Data
- Gmail processor runs every 30 minutes
- Force refresh: `pm2 restart stockroom-dashboard`
- Clear cache: `rm data/dashboard-data.json` (will regenerate)

---

## Summary

**3 Looker Emails → 3 Data Sources → 1 Unified Dashboard**

The Daily Scan Performance page now displays:
- ✅ Store-wide scan accuracy and metrics
- ✅ Employee-level scan performance rankings
- ✅ Sales KPIs (APC, IPC, SPH) per employee
- ✅ Combined scan + sales performance table
- ✅ Visual charts and color-coded KPIs
- ✅ Auto-updating every 30 minutes

All data auto-populates from Looker emails with no manual intervention required.
