# USB Printer Setup Guide

How to connect USB printers (like Zebra ZP450) to the network using StarTech PM1115U2 print server.

**Store:** Suit Supply San Francisco  
**Created:** January 10, 2026

---

## 📋 Overview

Many stores have legacy USB printers like the **Zebra ZP450** that can't connect directly to the network. This guide shows how to make them network-accessible using a USB print server.

### Your Current Setup
- **Printer:** Zebra ZP450 (USB thermal printer)
- **Solution:** StarTech PM1115U2 USB Print Server
- **Result:** Network printing from any device

---

## 🖨️ Zebra ZP450 Specifications

**Model:** Zebra ZP450 (Legacy UPS Thermal Printer)

**Key Features:**
- Direct thermal printing (no ink/ribbon needed)
- 203 DPI resolution
- 4" max label width
- USB 2.0 connectivity
- ZPL programming language
- Same ZPL commands as modern Zebra printers

**Perfect for:** Shipping labels, product labels, shelf labels

---

## 🔌 StarTech PM1115U2 Print Server

**Model:** PM1115U2 - USB 2.0 Print Server

**Features:**
- 1x USB 2.0 port
- Ethernet 10/100 Mbps
- Supports TCP/IP raw printing (port 9100)
- Web-based configuration
- Compatible with Windows, Mac, Linux
- Price: ~$50-70

**Alternative Print Servers:**
- TP-Link TL-PS110U (~$30)
- IOGEAR GPSU21 (~$40)
- D-Link DP-301U (~$50)

---

## 🛠️ Hardware Setup

### Step 1: Connect Print Server

1. **Unbox StarTech PM1115U2**
2. **Connect USB cable:**
   - Plug USB cable into Zebra ZP450
   - Connect to PM1115U2 USB port
3. **Connect Ethernet:**
   - Plug Ethernet cable into PM1115U2
   - Connect to network switch/router
4. **Power on:**
   - Connect power adapter
   - Wait for LED to stabilize (solid green)

### Step 2: Find Print Server IP

**Option A: Check router DHCP leases**
- Log into router admin panel
- Look for device named "PM1115U2" or "StarTech"
- Note the assigned IP address

**Option B: Use StarTech discovery tool**
- Download from StarTech website
- Run network scan
- Tool will find print server and show IP

**Option C: Direct connection**
- Default IP: `192.168.1.1`
- Connect PC directly to print server
- Configure PC with IP `192.168.1.2`
- Access web interface at `http://192.168.1.1`

### Step 3: Configure Print Server

1. **Access web interface:**
   ```
   http://[PRINT_SERVER_IP]
   ```
   Default credentials: `admin` / `admin`

2. **Network Settings:**
   - Set static IP: `10.201.40.50` (or your network range)
   - Subnet: `255.255.255.0`
   - Gateway: `10.201.40.1` (your router)
   - DNS: `8.8.8.8`
   - **Save and reboot**

3. **Printer Settings:**
   - Protocol: **TCP/IP Raw**
   - Port: **9100**
   - Bidirectional: **Enabled**
   - **Save settings**

4. **Test connectivity:**
   ```bash
   ping 10.201.40.50
   ```

### Step 4: Test Printing

**From terminal:**
```bash
# Send ZPL test label
echo "^XA^FO50,50^A0N,50,50^FDTest Print^FS^XZ" | nc 10.201.40.50 9100
```

**Expected result:** ZP450 should print a label with "Test Print"

---

## 📱 Dashboard Integration

### Register USB Printer in Dashboard

1. **Navigate to Printer Manager:**
   ```
   https://your-dashboard.com/printer-manager.html
   ```

2. **Click "Add Printer Manually"**

3. **Enter details:**
   - **IP Address:** `10.201.40.50`
   - **Type:** `zebra_usb` or `zebra_zpl`
   - **Model:** `Zebra ZP450 (USB Print Server)`

4. **Click "Test"** to verify connection

5. **Click "Set Default"** for primary printer

### API Registration (Backend)

```javascript
const printerClient = require('./utils/printer-client');

// Register USB printer via print server
printerClient.registerUSBPrinter(
  '10.201.40.50',  // Print server IP
  'USB1',          // USB port name
  'Zebra ZP450'    // Model name
);
```

### Print Labels

```javascript
// Print product label
await fetch('/api/printers/print/product-label', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sku: 'PROD123',
    description: 'Blue Suit 42R',
    price: '599.00',
    barcode: '123456789012',
    printerIp: '10.201.40.50'  // Print server IP
  })
});
```

---

## 🏪 Multi-Store Rollout

### For Stores with USB Printers

**Step 1: Audit Existing Hardware**
- Identify USB printers (Zebra ZP450, ZP505, etc.)
- Check if they support ZPL (most Zebra printers do)
- Note USB connectivity type

**Step 2: Order Print Servers**
- StarTech PM1115U2 (recommended)
- One per USB printer
- Order 1 extra for backup

**Step 3: Network Configuration**
- Assign static IPs in range: `10.201.[STORE_ID].50-99`
- Example: SF Store = `10.201.40.50`, NYC Store = `10.201.41.50`
- Document IP assignments

**Step 4: Install & Test**
- Follow setup steps above
- Test print from dashboard
- Train BOH staff

### For Stores with Network Printers

If store already has network Zebra printers (ZT410, ZD420, etc.):
- Use auto-discovery in Printer Manager
- No print server needed
- Register directly by IP

---

## 🔧 Troubleshooting

### Print Server Not Responding

**Issue:** Can't ping `10.201.40.50`

**Solutions:**
1. Check power LED on print server
2. Verify Ethernet cable connection
3. Check network switch port
4. Reset print server to factory defaults (hold reset button 10 sec)
5. Reconfigure with static IP

### Printer Not Printing

**Issue:** Labels not coming out of ZP450

**Solutions:**
1. Check USB cable connection (ZP450 → print server)
2. Verify ZP450 has power and is on
3. Check label roll is loaded correctly
4. Test ZP450 directly (connect USB to PC, use Zebra Designer)
5. Check print server port settings (should be 9100)

### Garbled Output

**Issue:** Printer prints random characters

**Solutions:**
1. Ensure print server is in **TCP/IP Raw** mode (not LPR/IPP)
2. Check ZPL syntax in label templates
3. Verify printer supports ZPL (not EPL or other language)
4. Reset printer to factory defaults

### Network Connectivity

**Issue:** Print server keeps disconnecting

**Solutions:**
1. Use static IP (not DHCP)
2. Check Ethernet cable quality (Cat5e or better)
3. Update print server firmware
4. Check network switch configuration (disable power saving)

---

## 💡 Best Practices

### IP Address Management

```bash
# Store IP scheme
# 10.201.[STORE_ID].[DEVICE]

# San Francisco (40)
10.201.40.50 - Zebra ZP450 (USB print server)
10.201.40.51 - Epson TM-T88 (receipt printer)
10.201.40.52 - Zebra ZT410 (backup)

# New York (41)
10.201.41.50 - Zebra ZP450 (USB print server)
10.201.41.51 - Epson TM-T88 (receipt printer)
```

### Label Calibration

**After setup, calibrate ZP450:**
1. Load labels
2. Hold feed button until 1 flash
3. Release - printer will auto-calibrate
4. Adjust darkness: Settings → Darkness (0-30, start at 20)

### Maintenance

**Weekly:**
- Check label roll stock
- Clean print head with alcohol wipe
- Verify print server still accessible

**Monthly:**
- Update print server firmware
- Backup print server configuration
- Test backup printers

---

## 📊 Cost Analysis

### Per Store Investment

| Item | Cost | Qty | Total |
|------|------|-----|-------|
| StarTech PM1115U2 Print Server | $60 | 1 | $60 |
| Ethernet Cable (25ft) | $10 | 1 | $10 |
| **Total** | | | **$70** |

**Note:** Existing Zebra ZP450 printer = $0 (already owned)

### Alternative: Buy New Network Printer

| Item | Cost |
|------|------|
| Zebra ZD420 (network) | $450 |
| Zebra ZT410 (network) | $1,200 |

**Savings:** $380-$1,130 per store by using print server!

---

## 🚀 Migration Path

### Phase 1: USB Printer Stores (Now)
1. Install print servers
2. Register in dashboard
3. Test label printing
4. Train staff

### Phase 2: Network Printer Stores (Next)
1. Use auto-discovery
2. Direct IP registration
3. No hardware changes

### Phase 3: Mobile Printing (Future)
1. Deploy PWA on mobile devices
2. Bluetooth printing from RFD40+ scanners
3. Optional: Zebra Browser Print SDK

---

## 📞 Support

**Hardware Vendor:**
- StarTech: 1-800-265-1844
- Zebra Technologies: 1-800-423-0422

**Internal:**
- Victor Rocha (SF Store): victor@suitsupply.com
- IT Help Desk: it@suitsupply.com

**Emergency:**
- If print server fails: Connect ZP450 directly to PC temporarily
- Use Zebra Designer software to print labels manually
- Order replacement print server (1-2 day shipping)

---

## ✅ Setup Checklist

### Hardware
- [ ] StarTech PM1115U2 received
- [ ] USB cable connected (ZP450 → print server)
- [ ] Ethernet cable connected
- [ ] Power adapter connected
- [ ] LEDs show solid connection

### Network
- [ ] Print server has static IP
- [ ] Can ping print server from server
- [ ] Port 9100 accessible
- [ ] No firewall blocking

### Dashboard
- [ ] Printer registered in Printer Manager
- [ ] Test print successful
- [ ] Set as default printer
- [ ] BOH staff trained

### Testing
- [ ] Product label prints correctly
- [ ] Shelf label prints correctly
- [ ] Barcode scans successfully
- [ ] Print from mobile device works

---

**Version:** 1.0  
**Last Updated:** January 10, 2026  
**Tested Hardware:** Zebra ZP450 + StarTech PM1115U2  
**Status:** ✅ Production Ready
