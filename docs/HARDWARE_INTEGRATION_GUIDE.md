# Hardware Integration Guide

Complete guide for integrating Zebra printers, RFID scanners, and Epson receipt printers with Stockroom Dashboard.

**Developer:** Victor Rocha, Stockroom Manager @ Suit Supply  
**Created:** January 10, 2026

---

## 🖨️ Supported Hardware

### Zebra Printers (ZPL)
- **Zebra ZQ520** - Mobile label printer (Bluetooth/WiFi)
- **Zebra ZT410** - Desktop thermal printer
- **Zebra ZD420** - Compact desktop printer

### RFID Scanners
- **Zebra RFD40+** - Handheld RFID/barcode scanner
- Network RFID readers (LLRP protocol)

### Receipt Printers
- **Epson TM-T88** Series (ESC/POS)
- Any ESC/POS compatible receipt printer

---

## 📋 Quick Start

### 1. Access Printer Manager
```
https://your-dashboard.com/printer-manager.html
```

### 2. Auto-Discover Printers
Click **"Auto-Discover Printers"** to scan your network for Zebra printers.

Network scan range: `10.201.40.1-254` (configurable via `.env`)

### 3. Manual Registration
If auto-discovery fails, manually add printers:
- **IP Address:** e.g., `10.201.40.100`
- **Type:** `zebra_zpl` or `epson_escpos`
- **Model:** e.g., `Zebra ZQ520`

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Printer Network Configuration
NETWORK_BASE_IP=10.201.40
PRINTER_IP_START=1
PRINTER_IP_END=254

# RFID Configuration
RFID_UDP_PORT=3040
DEFAULT_RFID_READER=rfd40-01

# Database
DATABASE_URL=postgresql://user:pass@localhost/dbname
```

### Database Schema

Run the migration:
```bash
node -e "require('dotenv').config(); const {Pool} = require('pg'); const pool = new Pool({connectionString: process.env.DATABASE_URL}); const fs = require('fs'); const sql = fs.readFileSync('migrations/create_print_jobs_table.sql', 'utf8'); pool.query(sql).then(() => {console.log('✅ Migration completed'); process.exit(0);});"
```

Creates tables:
- `print_jobs` - Audit log of all print operations
- `rfid_inventory_scans` - RFID bulk scan results
- `orders` / `order_items` - For receipt reprinting

---

## 🏷️ Label Printing

### API Endpoints

#### Product Label
```bash
POST /api/printers/print/product-label
Content-Type: application/json

{
  "sku": "PROD12345",
  "description": "Blue Suit 42R",
  "price": "599.00",
  "barcode": "123456789012",
  "printerIp": "10.201.40.100" # Optional
}
```

#### Shelf Location Label
```bash
POST /api/printers/print/shelf-label

{
  "location": "A1-B2",
  "zone": "Zone A",
  "capacity": "100",
  "printerIp": "10.201.40.100"
}
```

#### RFID Tag
```bash
POST /api/printers/print/rfid-label

{
  "sgtin": "urn:epc:tag:sgtin-96:1.0037000.065432.1234567890",
  "sku": "PROD12345",
  "description": "Blue Suit 42R",
  "printerIp": "10.201.40.100"
}
```

#### Shipping Label
```bash
POST /api/printers/print/shipping-label

{
  "shipmentId": 123,
  "printerIp": "10.201.40.100"
}
```

#### Order Receipt (BOH Reprint)
```bash
POST /api/printers/print/receipt

{
  "psuNumber": "PSU12345",
  "printerIp": "10.201.40.101" # Epson printer
}
```

### JavaScript Example

```javascript
async function printProductLabel(sku, description, price, barcode) {
  const response = await fetch('/api/printers/print/product-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, description, price, barcode })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('Label printed successfully');
  }
}
```

---

## 📡 RFID Scanning

### Access RFID Scanner UI
```
https://your-dashboard.com/rfid-scanner.html
```

### API Endpoints

#### Start Continuous Scanning
```bash
POST /api/rfid/scan/start

{
  "readerId": "rfd40-01",
  "options": {
    "mode": "continuous",
    "filter": null
  }
}
```

#### Stop Scanning
```bash
POST /api/rfid/scan/stop

{
  "sessionId": "rfd40-01_1736457600000"
}
```

#### Inventory Scan (10-second bulk read)
```bash
POST /api/rfid/scan/inventory

{
  "readerId": "rfd40-01",
  "options": {
    "duration": 10000
  }
}
```

#### Verify Item by SKU
```bash
POST /api/rfid/verify

{
  "readerId": "rfd40-01",
  "sku": "PROD12345",
  "timeout": 3000
}
```

#### Verify Shipment Items
```bash
POST /api/rfid/shipment/:shipmentId/verify

{
  "readerId": "rfd40-01"
}
```

### Real-Time Events (SSE)

Subscribe to RFID tag reads:
```javascript
const eventSource = new EventSource('/api/rfid/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'tag_read') {
    console.log('Tag scanned:', data.tag.epc, data.tag.sku);
  }
};
```

Event types:
- `tag_read` - RFID tag detected
- `scan_started` - Scanning session began
- `scan_stopped` - Scanning session ended
- `reader_connected` - RFID reader connected

---

## 🔌 Integration with BOH Shipments

### Enable RFID Auto-Scan in Shipment Workflow

In `boh-shipments.js`:

```javascript
// Listen for RFID tags during picking
const rfidEventSource = new EventSource('/api/rfid/events');

rfidEventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'tag_read' && currentShipment) {
    const item = currentShipment.items.find(i => i.sku === data.tag.sku);
    
    if (item && !item.picked) {
      // Auto-mark item as picked
      pickItem(currentShipment.id, item.id);
      showNotification(`✅ Auto-picked: ${item.sku}`);
    }
  }
};
```

### Verify All Shipment Items Before Packing

```javascript
async function verifyShipmentRFID(shipmentId) {
  const response = await fetch(`/api/rfid/shipment/${shipmentId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ readerId: 'rfd40-01' })
  });
  
  const result = await response.json();
  
  if (result.verified) {
    console.log('✅ All items verified');
  } else {
    console.log(`❌ Missing items: ${result.missingSKUs.join(', ')}`);
  }
}
```

---

## 🛠️ Troubleshooting

### Printer Not Detected

1. **Check network connectivity:**
   ```bash
   ping 10.201.40.100
   ```

2. **Test ZPL port:**
   ```bash
   nc -vz 10.201.40.100 9100
   ```

3. **Manual test print:**
   ```bash
   echo "^XA^FO50,50^A0N,50,50^FDTest^FS^XZ" | nc 10.201.40.100 9100
   ```

### RFID Scanner Not Reading

1. **Check scanner connection:**
   - Bluetooth paired?
   - WiFi connected?
   - Battery charged?

2. **Verify reader registration:**
   ```bash
   curl http://localhost:3000/api/rfid/readers
   ```

3. **Test UDP listener:**
   ```bash
   echo '{"type":"rfid_tag","readerId":"test","epc":"123456"}' | nc -u localhost 3040
   ```

### Receipt Printer Issues

1. **Ensure ESC/POS mode:**
   - Check printer DIP switches
   - Enable USB/Network interface

2. **Test connection:**
   ```bash
   echo -e "\x1B@Test Receipt\n\n\n\x1DVA\x03" | nc 10.201.40.101 9100
   ```

---

## 📊 Analytics & Monitoring

### Print Job History

```bash
GET /api/printers/print-jobs?limit=50
```

Returns recent print jobs with:
- Type (product_label, shelf_label, etc.)
- Printer IP
- Status (completed/failed)
- Timestamp

### RFID Statistics

```bash
GET /api/rfid/stats
```

Returns:
- Total readers registered
- Connected readers
- Active scanning sessions
- Total tags scanned

---

## 🚀 Advanced Features

### Custom ZPL Templates

Create custom label designs:

```javascript
const printerClient = require('./utils/printer-client');

function generateCustomLabel(data) {
  return `^XA
^FO50,50^A0N,40,40^FD${data.title}^FS
^FO50,100^BY3^BCN,100,N,N,N^FD${data.barcode}^FS
^FO50,220^A0N,30,30^FD${data.description}^FS
^XZ`;
}

await printerClient.printZPL(generateCustomLabel({ ... }));
```

### RFID Tag Encoding

Write data to RFID tags:

```javascript
const zpl = printerClient.generateRFIDLabel(
  'urn:epc:tag:sgtin-96:1.0037000.065432.1234567890',
  'PROD12345',
  'Blue Suit 42R'
);

await printerClient.printZPL(zpl, '10.201.40.100');
```

### Receipt Template Customization

Modify ESC/POS receipt format in `utils/printer-client.js`:

```javascript
generateReceiptESCPOS(data) {
  // Customize header, items, footer
  // Use ESC/POS commands for formatting
}
```

---

## 📞 Support

**Developed by:** Victor Rocha  
**Email:** [Your Email]  
**Store:** Suit Supply San Francisco

For technical issues, check:
- Server logs: `pm2 logs stockroom-dashboard`
- Browser console for client errors
- Database logs for query issues

---

## 🔐 Security Notes

- Printers on local network (10.201.40.0/24)
- No authentication required for TCP/IP printing
- Print jobs logged to database for audit trail
- RFID data encrypted in transit (HTTPS)

---

## 📝 Next Steps

1. ✅ Register your printers via Printer Manager
2. ✅ Test label printing with sample data
3. ✅ Configure RFID scanner (RFD40+)
4. ✅ Integrate RFID with BOH shipment workflow
5. ⏳ Deploy PWA for mobile scanners
6. ⏳ Build analytics dashboard for BOH metrics

---

**Version:** 1.0  
**Last Updated:** January 10, 2026
