# RFID System Setup Guide
**Suitsupply Stockroom Dashboard**  
**Version:** 1.0  
**Date:** January 11, 2026  
**Status:** ⚠️ Hardware Pending Acquisition

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Hardware Requirements](#hardware-requirements)
3. [System Architecture](#system-architecture)
4. [Physical Setup](#physical-setup)
5. [Software Configuration](#software-configuration)
6. [Tag Encoding](#tag-encoding)
7. [Workflows](#workflows)
8. [Troubleshooting](#troubleshooting)
9. [Cost Analysis](#cost-analysis)

---

## Overview

### What is RFID?

**Radio-Frequency Identification (RFID)** uses electromagnetic fields to automatically identify and track tags attached to objects. Unlike barcodes, RFID tags can be read without line-of-sight and multiple tags can be scanned simultaneously.

### Why RFID for Retail?

**Current Challenges:**
- Manual inventory counts take 6-8 hours per month
- Inventory accuracy: 80-85% (industry average)
- Lost/misplaced items cost ~$2,000/month per store
- Fitting room tracking is manual and error-prone

**RFID Solution:**
- ✅ Inventory counts in 15-20 minutes (30x faster)
- ✅ 95-99% inventory accuracy
- ✅ Real-time item location tracking
- ✅ Automated replenishment alerts
- ✅ Theft detection and prevention
- ✅ Customer experience improvements

---

## Hardware Requirements

### Recommended RFID Scanner: Zebra RFD40+ UHF RFID Sled

**Specifications:**
- **Model:** RFD40 Standard Range UHF RFID Sled
- **Compatibility:** iPhone 12 Pro/Max, 13 Pro/Max, 14 Pro/Max, 15 Pro/Max
- **Read Rate:** Up to 900 tags per second
- **Read Range:** Up to 30 feet (9 meters)
- **Battery Life:** 7 hours continuous scanning
- **Frequency:** 865-868 MHz (Europe), 902-928 MHz (USA)
- **Standards:** EPC Gen 2 (ISO 18000-6C)
- **Price:** ~$3,000 USD
- **Vendor:** Zebra Technologies

**Alternative Options:**
| Device | Type | Range | Price | Use Case |
|--------|------|-------|-------|----------|
| **Zebra RFD90** | Handheld | 40 ft | $4,500 | High-volume warehouse |
| **Impinj Speedway R420** | Fixed Overhead | 25 ft | $1,800 | Portal/Door scanning |
| **TSL 1128** | Bluetooth Sled | 20 ft | $1,200 | Budget option |

**Purchase Recommendations:**
- ✅ Zebra RFD40+ for handheld scanning (best iPhone integration)
- ⏳ Impinj Speedway for future door portal (theft prevention)
- ⏳ Additional RFD40 units as stores scale up

---

### RFID Tags

**Tag Specifications:**
- **Standard:** EPC Gen 2 (ISO 18000-6C)
- **Format:** SGTIN-96 (Serialized Global Trade Item Number)
- **Form Factor:** Hang tags or sewn-in labels
- **Memory:** 96-bit EPC + 512-bit user memory
- **Price:** $0.10 - $0.15 per tag (bulk pricing)

**Tag Types:**
| Type | Use | Price | Notes |
|------|-----|-------|-------|
| **Paper Hang Tag** | Suits, Shirts | $0.10 | Removable, customer-visible |
| **Fabric Sewn-In** | Premium items | $0.15 | Permanent, discreet |
| **Hard Tag** | Reusable fixtures | $2.00 | Reusable, anti-theft |

**Recommended Vendors:**
- Avery Dennison
- Smartrac (Avery Dennison)
- Alien Technology

**Initial Order:**
- 10,000 tags for pilot store
- 50/50 mix of hang tags and sewn-in labels

---

## System Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        RFID SCANNING WORKFLOW                   │
└─────────────────────────────────────────────────────────────────┘

1. RFID Tag Attached to Item
   ↓
   [SGTIN-96 EPC] → Unique serial number
   ↓
2. Scanner Reads Tag
   ↓
   [Zebra RFD40+] → Captures EPC + RSSI (signal strength)
   ↓
3. Scanner Sends to Dashboard
   ↓
   [Bluetooth → iPhone → Dashboard API]
   ↓
4. Dashboard Processes Scan
   ↓
   [POST /api/rfid/scan] → Validates & stores in PostgreSQL
   ↓
5. Update Item Location
   ↓
   [items table] → zone_code, zone_id, last_seen_at updated
   ↓
6. Real-Time UI Update
   ↓
   [WebSocket or SSE] → Live scan feed on dashboard
   ↓
7. Analytics & Reporting
   ↓
   [Looker Studio] → Inventory accuracy, dwell time, movement patterns
```

### Database Schema

**Key Tables:**
```sql
-- RFID Scans (audit trail)
CREATE TABLE rfid_scans (
  id SERIAL PRIMARY KEY,
  sgtin VARCHAR(255) NOT NULL,      -- RFID tag serial number
  epc VARCHAR(255),                  -- Full EPC hex string
  scan_type VARCHAR(50),             -- 'handheld', 'overhead', 'portal'
  scanner_id VARCHAR(100),           -- Device identifier
  scanner_location VARCHAR(100),     -- Physical scanner location
  zone_id INTEGER REFERENCES store_zones(id),
  zone_code VARCHAR(50),             -- 'COG', 'BOH', 'FLOOR', 'FITTING'
  x_coordinate NUMERIC(10, 2),       -- Location if available
  y_coordinate NUMERIC(10, 2),
  scanned_by VARCHAR(255),           -- Employee email
  scanned_by_id INTEGER,             -- Employee ID
  movement_type VARCHAR(50),         -- 'received', 'moved', 'picked', 'returned'
  rssi INTEGER,                      -- Signal strength (dBm)
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Store Zones
CREATE TABLE store_zones (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(50) UNIQUE,      -- 'COG', 'BOH', 'FLOOR', 'FITTING', 'RACK'
  zone_name VARCHAR(100),            -- 'Customer Order Goods', 'Back of House'
  zone_type VARCHAR(50),             -- 'storage', 'display', 'processing'
  parent_zone_id INTEGER REFERENCES store_zones(id),
  x_min NUMERIC(10, 2),              -- Bounding box for overhead readers
  y_min NUMERIC(10, 2),
  x_max NUMERIC(10, 2),
  y_max NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Items (linked to RFID tags)
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  sgtin VARCHAR(255) UNIQUE,         -- RFID tag (links to rfid_scans)
  sku VARCHAR(100),                  -- Product SKU
  description TEXT,                  -- Item name/description
  size VARCHAR(50),
  color VARCHAR(50),
  current_zone_id INTEGER REFERENCES store_zones(id),
  current_zone_code VARCHAR(50),
  last_seen_at TIMESTAMP,            -- Last RFID scan timestamp
  status VARCHAR(50),                -- 'in_stock', 'sold', 'transferred', 'lost'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Physical Setup

### Step 1: Unbox & Charge Scanner

1. **Open Zebra RFD40+ package**
2. **Connect iPhone to RFD40 sled** (magnetic attachment)
3. **Charge via USB-C** (included cable)
   - Full charge: 2-3 hours
   - LED indicator: Red (charging) → Green (full)

### Step 2: Pair Scanner with iPhone

1. **Power on RFD40:** Press and hold power button (5 seconds)
2. **Enable Bluetooth on iPhone:** Settings → Bluetooth → On
3. **Pair device:**
   - Look for "RFD40-XXXXX" in Bluetooth devices
   - Tap to pair (no PIN required)
   - Status LED: Solid blue = Connected

### Step 3: Install Dashboard App

**Option A: Web App (Recommended)**
1. Open Safari on iPhone
2. Navigate to: `https://dashboard.suitsupply.com/rfid-scanner`
3. Tap Share icon → "Add to Home Screen"
4. Icon appears on home screen (PWA installed)

**Option B: Native App (Future)**
- Download from App Store (when available)
- Sign in with employee credentials

### Step 4: Test Scanner

1. **Open RFID Scanner page on dashboard**
2. **Tap "Start Scanning"**
3. **Point scanner at RFID-tagged item** (within 10 feet)
4. **Verify scan appears in UI** (item EPC + description)
5. **Check scan recorded in database**

---

## Software Configuration

### API Endpoints (Already Implemented ✅)

```bash
# Record RFID scan
POST /api/rfid/scan
Content-Type: application/json
Authorization: Bearer <employee-token>

{
  "sgtin": "3003012345678901234567890",
  "epc": "3034257BF468011016400001",
  "scanType": "handheld",
  "scannerId": "RFD40-12345",
  "zoneCode": "BOH",
  "scannedBy": "victor.rocha@suitsupply.com",
  "movementType": "moved",
  "rssi": -45,
  "notes": "Moved to fitting room"
}

# Response
{
  "success": true,
  "scan": { "id": 12345, "sgtin": "...", "created_at": "2026-01-11T10:30:00Z" },
  "item": { "sku": "SUIT-BLK-42R", "description": "Black Napoli Suit 42R", "zone": "BOH" }
}

# Get scan history
GET /api/rfid/scans?zone=BOH&startDate=2026-01-01&endDate=2026-01-11

# Get item location
GET /api/rfid/items/:sgtin

# Start inventory count session
POST /api/rfid/inventory-count
{
  "sessionType": "full_store",  # or "zone", "sku"
  "zoneCode": "BOH",
  "initiatedBy": "victor.rocha@suitsupply.com"
}
```

### WebSocket Real-Time Updates (Coming Soon)

```javascript
// Connect to scan feed
const ws = new WebSocket('wss://dashboard.suitsupply.com/ws/rfid');

// Listen for scans
ws.on('message', (data) => {
  const scan = JSON.parse(data);
  console.log('New scan:', scan.sgtin, scan.description);
  // Update UI with new scan
});

// Send scan from mobile device
ws.send(JSON.stringify({
  type: 'scan',
  sgtin: '3003012345678901234567890',
  zoneCode: 'FLOOR'
}));
```

---

## Tag Encoding

### SGTIN-96 Format

**Structure:**
```
Header (8 bits) | Filter (3 bits) | Partition (3 bits) | Company Prefix (20-40 bits) | Item Reference (24-4 bits) | Serial Number (38 bits)

Example:
30 03 0 12345678 901234 567890123456789
│  │  │  │        │      │
│  │  │  │        │      └─ Unique serial (38 bits)
│  │  │  │        └──────── Item SKU (24 bits)
│  │  │  └────────────────── GS1 Company Prefix (20-40 bits)
│  │  └────────────────────── Partition (3 bits)
│  └───────────────────────── Filter value (3 bits)
└──────────────────────────── Header = SGTIN-96 (8 bits)
```

**Encoding Example:**
```bash
# Item: Black Napoli Suit, Size 42R
# SKU: SUIT-BLK-42R
# GS1 Company Prefix: 0123456 (Suitsupply)
# Item Reference: 789012 (SUIT-BLK-42R)
# Serial: 000001 (first item)

SGTIN: 30-03-0-0123456-789012-000000000001
```

### Tag Writing (via Zebra SDK)

**Requirements:**
- Zebra RFD40+ with write capability enabled
- Blank RFID tags (user memory writable)
- Tag encoding software (Zebra 123RFID or Dashboard)

**Process:**
1. Scan barcode on garment (SKU)
2. Dashboard generates SGTIN-96 from SKU + serial counter
3. Write SGTIN to RFID tag via scanner
4. Attach tag to garment
5. Record tag→item mapping in database

**Bulk Encoding:**
```bash
# Python script for bulk tag writing
from zebra_rfd import RFD40Scanner

scanner = RFD40Scanner('RFD40-12345')
skus = ['SUIT-BLK-42R', 'SHIRT-WHT-15', 'TIE-RED-01']

for i, sku in enumerate(skus):
    sgtin = generate_sgtin(company_prefix='0123456', item_ref=sku_to_ref(sku), serial=i+1)
    scanner.write_epc(sgtin)
    print(f'Encoded tag {i+1}: {sgtin} → {sku}')
```

---

## Workflows

### Workflow 1: Receiving New Inventory

**Scenario:** Shipment of 50 suits arrives from warehouse

**Steps:**
1. **Unbox shipment** (COG area)
2. **Open RFID Scanner app** on iPhone
3. **Select zone:** "COG - Receiving"
4. **Tap "Start Scanning"**
5. **Wave scanner over entire shipment** (30 seconds)
6. **Review scanned items** (50/50 items found)
7. **Tap "Complete Receiving"**
8. **Dashboard updates:**
   - Items marked as "in_stock"
   - Locations set to "COG"
   - Inventory count updated
   - Notification sent to BOH team

**Time Savings:** 15 minutes → 2 minutes (87% faster)

---

### Workflow 2: Inventory Count

**Scenario:** Monthly full-store inventory count

**Steps:**
1. **Start inventory session:**
   - Dashboard → RFID Scanner → "New Count"
   - Session type: "Full Store"
   - Expected duration: 20 minutes
2. **Scan each zone systematically:**
   - BOH: 5 minutes (200 items)
   - Sales Floor: 8 minutes (500 items)
   - Fitting Rooms: 3 minutes (50 items)
   - COG: 4 minutes (100 items)
3. **Review discrepancies:**
   - Items found but not in system: 5
   - Items in system but not found: 12
4. **Reconcile:**
   - Mark missing items as "lost" (investigate)
   - Add found items to system (update records)
5. **Generate report:**
   - Total items: 850
   - Accuracy: 98.0% (17 discrepancies / 850 items)
   - Missing value: $2,400 (12 items × avg $200)

**Time Savings:** 6 hours → 20 minutes (95% faster)

---

### Workflow 3: Customer Purchase (Fitting Room)

**Scenario:** Customer tries on 3 suits, buys 1

**Steps:**
1. **Customer enters fitting room with 3 suits**
   - Overhead RFID reader (future) automatically scans tags
   - Dashboard shows: 3 items in Fitting Room 2
2. **Customer decides to buy 1 suit**
   - SA scans barcode at POS
   - Dashboard removes SGTIN from "in_stock"
   - Remaining 2 items still show in fitting room
3. **SA retrieves remaining 2 suits**
   - Handheld scan confirms 2 items retrieved
   - Dashboard updates: 2 items moved to FLOOR
4. **Analytics:**
   - Dwell time: 15 minutes (suits tried on for 15 min)
   - Conversion: 33% (1/3 suits purchased)
   - Items "forgotten" in fitting room: 0

**Future Enhancement:** Alert SA if items left in fitting room >30 min

---

### Workflow 4: Lost Item Search

**Scenario:** Customer wants specific suit, system shows "in stock" but can't find it

**Steps:**
1. **Open RFID Scanner**
2. **Search by SKU:** "SUIT-BLK-42R"
3. **View last known location:**
   - Zone: FLOOR - Rack 3
   - Last seen: 2 hours ago
   - RSSI: -55 dBm (10-15 feet away)
4. **Walk around Rack 3 with scanner**
5. **Scanner beeps when near item** (RSSI increasing)
6. **Item found:** Behind other garments on rack
7. **Update location:** Confirm still on FLOOR

**Time Savings:** 10 minutes searching → 1 minute RFID-guided search

---

## Troubleshooting

### Scanner Not Connecting

**Symptoms:** RFD40 won't pair with iPhone

**Solutions:**
1. ✅ Verify scanner is powered on (LED lit)
2. ✅ Check iPhone Bluetooth is enabled (Settings → Bluetooth)
3. ✅ Restart both devices (power cycle)
4. ✅ Forget device in Bluetooth settings, re-pair
5. ✅ Update RFD40 firmware (Zebra 123RFID Desktop app)
6. ✅ Check battery level (charge if <20%)

**Still not working?** Contact Zebra support: 1-800-423-0442

---

### Tags Not Reading

**Symptoms:** Scanner can't read RFID tags (0 reads)

**Solutions:**
1. ✅ Verify tag is EPC Gen 2 compatible (check vendor)
2. ✅ Check scanner frequency matches tag frequency:
   - USA: 902-928 MHz
   - Europe: 865-868 MHz
3. ✅ Reduce distance: Try scanning within 5 feet
4. ✅ Remove metal/liquids nearby (metal blocks RFID signals)
5. ✅ Check tag orientation: Rotate tag 90°, try again
6. ✅ Test with known-good tag (verify scanner works)

**Tag might be damaged:** Replace tag if consistently fails

---

### Low Read Range

**Symptoms:** Scanner only reads tags within 1-2 feet (expected: 10+ feet)

**Solutions:**
1. ✅ Check scanner power setting (high/medium/low)
   - Zebra 123RFID Desktop → Settings → Power: HIGH
2. ✅ Verify antenna is clean (no dirt/debris)
3. ✅ Check battery level (low battery = low power)
4. ✅ Test in open area (away from metal shelves/walls)
5. ✅ Update firmware (may improve read performance)

**Note:** Read range varies by tag type (paper vs fabric)

---

### Duplicate Scans

**Symptoms:** Same item appears multiple times in scan list

**Solutions:**
1. ✅ Enable deduplication in dashboard:
   - Settings → RFID → Dedupe window: 5 seconds
2. ✅ Scan more slowly (don't wave scanner rapidly)
3. ✅ Use "Inventory Mode" (counts unique EPCs only)

**This is normal:** RFID scanners read at 900 tags/sec, so duplicates are expected

---

### Database Performance

**Symptoms:** Dashboard slow when viewing scan history

**Solutions:**
1. ✅ Add database indexes:
```sql
CREATE INDEX idx_rfid_scans_sgtin ON rfid_scans(sgtin);
CREATE INDEX idx_rfid_scans_created_at ON rfid_scans(created_at);
CREATE INDEX idx_rfid_scans_zone_code ON rfid_scans(zone_code);
```
2. ✅ Archive old scans (>90 days) to separate table
3. ✅ Use pagination (limit 100 records per page)
4. ✅ Add Redis caching for frequent queries

---

## Cost Analysis

### Initial Investment

| Item | Quantity | Unit Cost | Total |
|------|----------|-----------|-------|
| **Zebra RFD40+ Scanner** | 1 | $3,000 | $3,000 |
| **RFID Tags (bulk)** | 10,000 | $0.12 | $1,200 |
| **Tag Printer (optional)** | 1 | $800 | $800 |
| **Training (staff)** | 5 staff | $50/hr × 2hr | $500 |
| **Setup & Config** | - | - | $500 |
| **Total Initial Cost** | | | **$6,000** |

### Ongoing Costs

| Item | Frequency | Annual Cost |
|------|-----------|-------------|
| **RFID Tags (replenishment)** | 5,000/year | $600/year |
| **Scanner maintenance** | As needed | $200/year |
| **Software license (if applicable)** | Monthly | $0 (included in dashboard) |
| **Total Annual Cost** | | **$800/year** |

---

### ROI Calculation

**Annual Labor Savings:**
| Task | Before RFID | After RFID | Time Saved | Hourly Rate | Annual Savings |
|------|-------------|------------|------------|-------------|----------------|
| **Inventory Counts** | 6 hrs/month | 20 min/month | 69 hrs/year | $20/hr | $1,380/year |
| **Item Search** | 30 min/day | 3 min/day | 137 hrs/year | $20/hr | $2,740/year |
| **Receiving** | 2 hrs/week | 15 min/week | 91 hrs/year | $20/hr | $1,820/year |
| **Replenishment** | 4 hrs/week | 30 min/week | 182 hrs/year | $20/hr | $3,640/year |
| **Total Labor Savings** | | | **479 hours/year** | | **$9,580/year** |

**Additional Benefits:**
- **Reduced shrinkage:** 2% reduction = $8,000/year (based on $400k inventory)
- **Improved accuracy:** 95% → 99% = fewer stockouts, happier customers
- **Faster checkout:** RFID basket scanning = higher customer satisfaction

**Total Annual Benefit:** $17,580/year

**Payback Period:** $6,000 / $17,580 = **4.1 months** ✅

**5-Year NPV:** $17,580 × 5 years - $6,000 - ($800 × 5) = **$77,900**

---

## Next Steps

### Phase 1: Planning (Week 1-2)
- [ ] Get budget approval ($6,000)
- [ ] Select pilot store (San Francisco recommended)
- [ ] Order Zebra RFD40+ scanner
- [ ] Order 10,000 RFID tags
- [ ] Schedule training sessions

### Phase 2: Implementation (Week 3-4)
- [ ] Receive & unbox hardware
- [ ] Charge scanner, pair with iPhone
- [ ] Test API endpoints with real scanner
- [ ] Train 5 BOH staff members (2 hours each)
- [ ] Tag 100 items (pilot test)

### Phase 3: Pilot (Month 2)
- [ ] Tag 1,000 items (full BOH inventory)
- [ ] Run parallel inventory count (manual vs RFID)
- [ ] Measure accuracy improvement
- [ ] Collect staff feedback
- [ ] Document issues/improvements

### Phase 4: Rollout (Month 3+)
- [ ] Tag remaining 9,000 items
- [ ] Implement fitting room tracking
- [ ] Add door portal reader (theft prevention)
- [ ] Train sales associates on item search
- [ ] Integrate with POS system
- [ ] Expand to additional stores

---

## Support & Resources

### Zebra Technologies
- **Website:** https://www.zebra.com/rfid
- **Support:** 1-800-423-0442
- **Documentation:** https://www.zebra.com/rfd40
- **Software:** Zebra 123RFID Desktop (free)

### GS1 (SGTIN Standards)
- **Website:** https://www.gs1.org/epcglobal
- **EPC Tag Data Standard:** https://www.gs1.org/tds

### RAIN RFID Alliance
- **Website:** https://rainrfid.org
- **Education:** Free RFID training courses

### Internal Support
- **Dashboard Issues:** Victor Rocha (Stockroom Manager, SF)
- **IT Support:** IT Help Desk
- **Budget/Purchasing:** Store Manager

---

## Appendix: Tag Specifications

### Recommended Tags

**1. Avery Dennison AD-383 Hang Tag**
- Size: 40mm x 70mm
- Chip: Impinj M730
- Memory: SGTIN-96 + 512-bit user
- Read range: 25+ feet
- Price: $0.10 (bulk 10k+)
- Best for: Suits, dress shirts, jackets

**2. Avery Dennison AD-237 Sewn-In Label**
- Size: 50mm x 15mm (fabric strip)
- Chip: NXP UCODE 8
- Memory: SGTIN-96 + 512-bit user
- Read range: 15+ feet (when sewn in)
- Price: $0.15 (bulk 10k+)
- Best for: Premium garments, permanent tracking

**3. Smartrac Belt UHF Tag**
- Size: 95mm x 15mm (flexible belt)
- Chip: Impinj Monza R6
- Memory: SGTIN-96 + 128-bit user
- Read range: 20+ feet
- Price: $0.12 (bulk 10k+)
- Best for: Pants, belts, accessories

---

**Document Version:** 1.0  
**Last Updated:** January 11, 2026  
**Next Review:** March 11, 2026  
**Status:** Ready for hardware acquisition and pilot implementation
