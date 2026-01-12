# Hardware Setup Checklist

Step-by-step checklist for deploying hardware integration at Suit Supply stores.

---

## 🖨️ Zebra Printer Setup

### Physical Installation

- [ ] Unbox Zebra ZQ520 printer
- [ ] Charge battery (4+ hours initial charge)
- [ ] Load label roll (2" x 1" or 4" x 6" depending on use case)
- [ ] Power on printer
- [ ] Print test label (hold feed button for 2 seconds)

### Network Configuration

- [ ] Connect printer to store WiFi
  - Settings → Network → WiFi → Select SSID
  - Enter WiFi password
  - Note IP address assigned

- [ ] Configure printer for ZPL raw TCP
  - Port: 9100
  - Protocol: TCP/IP
  - Enable raw mode

- [ ] Test connectivity from server
  ```bash
  ping [PRINTER_IP]
  nc -vz [PRINTER_IP] 9100
  ```

### Dashboard Registration

- [ ] Navigate to `https://dashboard/printer-manager.html`
- [ ] Click "Auto-Discover Printers" OR
- [ ] Click "Add Printer Manually"
  - IP: `10.201.40.XXX`
  - Type: `zebra_zpl`
  - Model: `Zebra ZQ520`
- [ ] Click "Test" to verify connection
- [ ] Click "Set Default" for primary printer
- [ ] Print test product label

### Label Calibration

- [ ] Adjust darkness (0-30, default: 20)
- [ ] Calibrate media sensor
  - Hold feed button until 1 flash
  - Release, printer will calibrate
- [ ] Test barcode scanning with printed labels

---

## 📡 RFID Scanner Setup (Zebra RFD40+)

### Device Preparation

- [ ] Charge RFD40+ scanner (USB-C cable)
- [ ] Install Zebra DataWedge app (should be pre-installed)
- [ ] Enable RFID module in settings

### Pairing & Connection

**Option 1: Bluetooth HID Mode**
- [ ] Enable Bluetooth on RFD40+
- [ ] Pair with mobile device (Settings → Bluetooth)
- [ ] Configure as keyboard input

**Option 2: Network Mode (Recommended)**
- [ ] Connect RFD40+ to store WiFi
- [ ] Note IP address: Settings → About → Network
- [ ] Configure UDP broadcasting to dashboard server

### Dashboard Registration

- [ ] Navigate to `rfid-scanner.html`
- [ ] In browser console:
  ```javascript
  const DEFAULT_READER_ID = 'rfd40-sf-01'; // Update in rfid-scanner.js
  ```
- [ ] Backend registration:
  ```bash
  curl -X POST http://localhost:3000/api/rfid/readers \
    -H "Content-Type: application/json" \
    -d '{"readerId":"rfd40-sf-01","config":{"type":"RFD40+","ipAddress":"10.201.40.XXX"}}'
  ```

### Test Scanning

- [ ] Click "Start Scanning" in RFID Scanner UI
- [ ] Scan RFID-tagged item
- [ ] Verify tag appears in UI
- [ ] Check tag EPC format parsing
- [ ] Stop scanning

### RFID Tag Encoding (if using RFID printer)

- [ ] Load RFID labels in Zebra printer
- [ ] Enable RFID module in printer settings
- [ ] Test print/encode cycle:
  ```bash
  POST /api/printers/print/rfid-label
  {
    "sgtin": "urn:epc:tag:sgtin-96:1.0037000.065432.1234567890",
    "sku": "TEST001",
    "description": "Test Item"
  }
  ```
- [ ] Verify tag encodes correctly with RFD40+ scanner

---

## 🧾 Epson Receipt Printer Setup

### Physical Installation

- [ ] Unbox Epson TM-T88 series printer
- [ ] Connect power cable
- [ ] Load receipt paper (thermal 80mm width)
- [ ] Connect via Ethernet or USB

### Network Configuration

- [ ] Configure static IP via printer DIP switches OR
- [ ] Use Epson network utility to set IP
  - IP: `10.201.40.XXX`
  - Port: `9100`
  - Protocol: TCP/IP

- [ ] Test connectivity:
  ```bash
  ping [PRINTER_IP]
  nc -vz [PRINTER_IP] 9100
  ```

### Dashboard Registration

- [ ] Navigate to `printer-manager.html`
- [ ] Add printer manually:
  - IP: `10.201.40.XXX`
  - Type: `epson_escpos`
  - Model: `Epson TM-T88VI`
- [ ] Test print receipt:
  ```javascript
  POST /api/printers/print/receipt-data
  {
    "receiptData": {
      "orderNumber": "TEST001",
      "customerName": "Test Customer",
      "items": [{"sku":"ITEM01","description":"Test Item","price":"10.00"}],
      "total": "10.00"
    }
  }
  ```

---

## 🔧 Server Configuration

### Environment Variables

Add to `/var/www/stockroom-dashboard/.env`:

```bash
# Printer Network Range
NETWORK_BASE_IP=10.201.40
PRINTER_IP_START=50
PRINTER_IP_END=100

# RFID Configuration
RFID_UDP_PORT=3040
DEFAULT_RFID_READER=rfd40-sf-01

# Feature Flags
ENABLE_AUTO_RFID_PICKING=true
ENABLE_LABEL_PRINTING=true
```

### Database Migration

```bash
cd /var/www/stockroom-dashboard
node -e "require('dotenv').config(); const {Pool} = require('pg'); const pool = new Pool({connectionString: process.env.DATABASE_URL}); const fs = require('fs'); const sql = fs.readFileSync('migrations/create_print_jobs_table.sql', 'utf8'); pool.query(sql).then(() => {console.log('✅ Migration completed'); process.exit(0);});"
```

### Restart Server

```bash
pm2 restart stockroom-dashboard
pm2 logs stockroom-dashboard --lines 50
```

### Verify Routes

```bash
# Test printer discovery
curl http://localhost:3000/api/printers

# Test RFID stats
curl http://localhost:3000/api/rfid/stats

# Test print job history
curl http://localhost:3000/api/printers/print-jobs
```

---

## 🌐 Dashboard Access

### Desktop URLs

- **Printer Manager:** `https://dashboard/printer-manager.html`
- **RFID Scanner:** `https://dashboard/rfid-scanner.html`
- **BOH Shipments:** `https://dashboard/boh-shipments.html`

### Mobile PWA Installation

#### iPhone/iPad:
1. Open Safari and navigate to `https://dashboard/rfid-scanner.html`
2. Tap Share button
3. Tap "Add to Home Screen"
4. Name: "RFID Scanner"
5. Tap "Add"

#### Android:
1. Open Chrome and navigate to `https://dashboard/rfid-scanner.html`
2. Tap menu (three dots)
3. Tap "Add to Home screen"
4. Name: "RFID Scanner"
5. Tap "Add"

### RFD40+ Configuration

Install dashboard PWA on RFD40+ device:
- The RFD40+ runs Android, so use Chrome browser
- Follow Android PWA installation steps above
- Pin app to home screen for quick access

---

## 🧪 Testing & Validation

### Label Printing Tests

- [ ] **Product Label:**
  - Print barcode label
  - Scan with barcode scanner
  - Verify SKU matches

- [ ] **Shelf Label:**
  - Print location label
  - Place in stockroom
  - Scan to verify location code

- [ ] **Shipping Label:**
  - Create test shipment
  - Generate shipping label
  - Verify tracking number prints correctly

- [ ] **Receipt Reprint:**
  - Look up order by PSU number
  - Print receipt to Epson printer
  - Verify all items and totals correct

### RFID Tests

- [ ] **Single Tag Read:**
  - Start scanning
  - Hold RFID-tagged item near scanner
  - Verify tag EPC appears in UI

- [ ] **Inventory Scan:**
  - Place 10+ RFID items in area
  - Run 10-second inventory scan
  - Verify all items detected

- [ ] **Shipment Verification:**
  - Create test shipment with RFID items
  - Use "Verify Shipment" API
  - Check matched vs. missing items

### Real-Time Updates

- [ ] Open BOH Shipments on two devices
- [ ] Pick item on Device 1
- [ ] Verify Device 2 updates in real-time (SSE)
- [ ] Scan RFID tag during picking
- [ ] Verify auto-pick triggers

---

## 📊 Post-Deployment Monitoring

### Daily Checks

- [ ] Check printer status: `GET /api/printers`
- [ ] Review print job errors: `SELECT * FROM print_jobs WHERE status='failed'`
- [ ] Check RFID scan stats: `GET /api/rfid/stats`
- [ ] Monitor PM2 logs: `pm2 logs stockroom-dashboard --lines 100`

### Weekly Maintenance

- [ ] Clean printer print heads
- [ ] Check label/paper stock
- [ ] Charge scanner batteries
- [ ] Review print job analytics
- [ ] Update printer firmware if needed

### Monthly Review

- [ ] Analyze print job volume by type
- [ ] Calculate cost savings vs. Avery labels
- [ ] Review RFID scan accuracy
- [ ] Gather BOH team feedback
- [ ] Plan optimizations

---

## 🎯 Success Metrics

Track these KPIs after deployment:

- **Label Cost Savings:** Target 60% reduction vs. Avery
- **Pick Time Reduction:** Target 30% faster with RFID auto-scan
- **Print Job Volume:** Track labels/receipts per day
- **RFID Accuracy:** Target 95%+ tag read rate
- **BOH Efficiency:** Shipments processed per hour

---

## 🆘 Troubleshooting Contacts

**Hardware Vendor Support:**
- Zebra Technologies: 1-800-423-0422
- Epson Support: 1-800-463-7766

**Internal IT:**
- Victor Rocha (Stockroom Manager): [Your Email]
- IT Help Desk: [IT Contact]

**Emergency Procedures:**
- If printers offline: Use manual labels temporarily
- If RFID fails: Fall back to barcode scanning
- If server down: Contact IT immediately

---

## ✅ Final Sign-Off

**Store Manager Approval:**
- [ ] Hardware tested and operational
- [ ] Staff trained on printer manager
- [ ] Staff trained on RFID scanner
- [ ] Emergency procedures documented
- [ ] Go-live date: __________

**Signature:** ____________________  
**Date:** ____________________

---

**Document Version:** 1.0  
**Created:** January 10, 2026  
**Last Updated:** January 10, 2026
