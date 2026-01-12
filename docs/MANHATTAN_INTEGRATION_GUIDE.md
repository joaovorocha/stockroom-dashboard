# Manhattan Active® Cloud Integration Guide
**Developer:** Victor Rocha, Stockroom Manager @ Suit Supply  
**Date:** January 10, 2026  
**Status:** READY FOR API CREDENTIALS SETUP

---

## 🎯 Overview

This system is designed to **organize Suit Supply stores from the employee perspective** by pulling real-time data from Manhattan Active® Cloud (MAO) and presenting it in a BOH-friendly interface.

**What We're Building:**
- Real-time inventory visibility (Unit Inventory from MAO)
- RFID/SGTIN tracking integrated with Manhattan's unit status
- Order fulfillment workflow (Reserved → Picked → Packed → Departed)
- Employee-focused UI (not customer-facing like MAO)
- Shipment tracking with Manhattan inventory status

---

## 📊 Manhattan Active® Data We Need

Based on your screenshot, we need to pull:

### 1. **Unit Inventory API**
- **EPC/SGTIN** - RFID tag identifiers
- **Unit Inventory Status** - inbound, Reserved, Available, Departed
- **Overload Last Read Date** - Last RFID scan timestamp
- **Last Read Date Time** - Real-time inventory updates
- **Store Count ID** - Store location tracking
- **Fulfillment ID** - Order fulfillment reference
- **Package ID** - Shipping package tracking

### 2. **Order Management API**
- Customer orders
- Fulfillment status
- Reserved items
- Pickup orders

### 3. **Location/Zone API**
- Store zones (SR-US-SanFrancisco-Maiden, etc.)
- Rack positions
- BOH vs floor inventory

### 4. **RFID Read Events API**
- Real-time RFID scans
- Unit movement history
- Last known location

---

## 🔧 What's Already Built

### ✅ Manhattan Client - [utils/manhattan-client.js](../utils/manhattan-client.js)

We already have a **full Manhattan API client** with:

```javascript
// Authentication
✅ OAuth2 token management
✅ Auto-refresh when token expires
✅ Retry logic for 401 errors

// Unit Inventory Queries (matches your screenshot!)
✅ getUnitBySGTIN(sgtin)              // Get single unit by RFID tag
✅ getUnitsByItemId(itemId)            // All units for an item
✅ getUnitsByPackage(packageId)        // Units in a package
✅ getUnitsByLocation(locationId)      // All units at store
✅ getUnitsByStatus(status)            // Filter by inbound/Reserved/etc
✅ getRFIDUnitsAtLocation(locationId)  // RFID-enabled units only

// Order & Fulfillment
✅ getOrder(orderNumber)               // Order details
✅ getOrdersForCustomer(customerId)    // Customer order history
✅ getFulfillment(fulfillmentId)       // Fulfillment status
✅ getUnitsByOrder(orderNumber)        // Items in an order

// RFID Tracking
✅ getRFIDHistory(sgtin)               // RFID read history
✅ getLastRFIDRead(sgtin)              // Last known location

// Inventory Management
✅ getUnitsInZone(locationId, zone)    // Zone-specific inventory
✅ syncInventory()                      // Sync all store inventory to PostgreSQL
```

### ✅ API Routes - [routes/manhattan.js](../routes/manhattan.js)

```javascript
GET  /api/manhattan/units/sgtin/:sgtin
GET  /api/manhattan/units/item/:itemId
GET  /api/manhattan/units/location/:locationId
GET  /api/manhattan/orders/:orderNumber
POST /api/manhattan/sync
```

### ✅ PostgreSQL Integration

All Manhattan data syncs to local PostgreSQL for fast queries:
- `rfid_scans` table - RFID read events
- `store_zones` table - Location mapping
- `shipment_items` table - Links to Manhattan units

---

## 🔐 Getting Manhattan API Credentials

### Step 1: Log into Manhattan Developer Portal

**I cannot browse the web or log in for you**, but here's what you need to do:

1. Go to: **https://platform.developer.manh.com/**
2. Log in with your Suit Supply credentials
3. Navigate to: **Developer Portal → API Keys**

### Step 2: Create API Application

1. Click **"Create New Application"**
2. App Name: `Suit Supply Stockroom Dashboard`
3. Description: `Employee-facing BOH inventory and shipment management`
4. Select API Scopes:
   - ✅ **Inventory.Read** (Unit Inventory)
   - ✅ **Orders.Read** (Order Management)
   - ✅ **Fulfillment.Read** (Fulfillment Status)
   - ✅ **RFID.Read** (RFID Read Events)
   - ✅ **Locations.Read** (Store Zones)

### Step 3: Copy Credentials

You'll receive:
- **Client ID** (e.g., `manh_abc123xyz`)
- **Client Secret** (e.g., `secret_456def789`)
- **Tenant ID** (your Suit Supply tenant, e.g., `suitsupply-prod`)
- **API Base URL** (e.g., `https://api.manh.com/v1`)
- **OAuth Token URL** (e.g., `https://auth.manh.com/oauth/token`)

---

## ⚙️ Configuration Setup

### Create `.env` file in project root:

```bash
cd /var/www/stockroom-dashboard
nano .env
```

Add these lines:

```bash
# Manhattan Active® Cloud API
MANHATTAN_CLIENT_ID=your_client_id_here
MANHATTAN_CLIENT_SECRET=your_client_secret_here
MANHATTAN_TENANT_ID=suitsupply-prod
MANHATTAN_BASE_URL=https://api.manh.com/v1
MANHATTAN_AUTH_URL=https://auth.manh.com/oauth/token

# Store Configuration
MANHATTAN_STORE_LOCATION_ID=SR-US-SanFrancisco-Maiden
```

### Restart server:

```bash
pm2 restart stockroom-dashboard
```

---

## 🧪 Test Manhattan Integration

### Test 1: Check Authentication

```bash
curl http://localhost:3000/api/manhattan/test \
  -H "Cookie: session=your_session_cookie"
```

**Expected:** `{ "authenticated": true, "tenant": "suitsupply-prod" }`

### Test 2: Query Unit Inventory (from your screenshot)

```bash
# Get a unit by SGTIN (EPC from your screenshot)
curl http://localhost:3000/api/manhattan/units/sgtin/010871264757727721353 \
  -H "Cookie: session=your_session_cookie"
```

**Expected Response:**
```json
{
  "sgtin": "010871264757727721353",
  "epc": "303614311C4B7FA0220...",
  "itemId": "...",
  "status": "Reserved",
  "locationId": "SR-US-SanFrancisco-Maiden",
  "lastReadDate": "2026-01-10T23:23:...",
  "fulfillmentId": "PSU502555661",
  "packageId": "Zhuo_PSU502553..."
}
```

### Test 3: Get All Units at Your Store

```bash
curl http://localhost:3000/api/manhattan/units/location/SR-US-SanFrancisco-Maiden \
  -H "Cookie: session=your_session_cookie"
```

**Expected:** Array of ~500 units (matching your screenshot count)

### Test 4: Sync All Inventory to PostgreSQL

```bash
curl -X POST http://localhost:3000/api/manhattan/sync \
  -H "Cookie: session=your_session_cookie"
```

**Expected:** `{ "synced": 500, "errors": 0 }`

---

## 🏗️ How Manhattan Data Flows Through the System

```
┌─────────────────────────────────────────────────────────────┐
│  Manhattan Active® Cloud (MAO)                              │
│  - Unit Inventory (500+ records)                            │
│  - RFID Read Events                                         │
│  - Order Fulfillment Status                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │ OAuth2 API
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Stockroom Dashboard Backend                                │
│  - utils/manhattan-client.js (API wrapper)                  │
│  - routes/manhattan.js (REST endpoints)                     │
│  - Auto-sync every 5 minutes                                │
└─────────────────┬───────────────────────────────────────────┘
                  │ Store in PostgreSQL
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL Database                                        │
│  - rfid_scans (SGTIN, location, timestamp)                 │
│  - shipment_items (Manhattan unit_id, status)              │
│  - store_zones (location mapping)                           │
└─────────────────┬───────────────────────────────────────────┘
                  │ REST API + SSE
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  BOH Employee UI                                            │
│  - /boh-shipments.html (BOH shipment workflow)             │
│  - /scanner.html (RFID scanning)                           │
│  - /gameplan-boh.html (Daily operations)                   │
│  Shows: "Reserved" items, RFID status, last read time      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Employee Perspective Features

### What BOH Staff See (vs MAO):

| MAO (Technical View) | Stockroom Dashboard (Employee View) |
|---------------------|-------------------------------------|
| SGTIN: 010871264... | "Blue Suit - Size 42R" |
| Status: Reserved | "🛒 Customer Order - Pick Now" |
| Location: SR-US-SF-M | "BOH Rack A-12" |
| Fulfillment: PSU502... | "Order for John Doe - Pickup 3PM" |
| Last Read: 2026-01-10... | "Scanned 2 hours ago by Sarah" |

### BOH Workflow Integration:

1. **Morning:** Sync inventory from Manhattan → Show "Reserved" items that need picking
2. **Customer Arrives:** Pull order from Manhattan → Guide BOH to exact rack location
3. **Picking:** Scan RFID → Auto-update Manhattan status to "Departed"
4. **Packing:** Verify all items scanned → Create UPS label
5. **Shipping:** Mark shipped → Update Manhattan fulfillment status

---

## 🚀 Next Steps

### 1. Get API Credentials (You Do This)
- [ ] Log into https://platform.developer.manh.com/
- [ ] Create new API application
- [ ] Copy Client ID, Secret, Tenant ID
- [ ] Share credentials with me (I'll add to `.env`)

### 2. Configure Integration (I Do This)
- [ ] Create `.env` file with Manhattan credentials
- [ ] Test authentication
- [ ] Test unit inventory query
- [ ] Run initial sync (pull all 500+ units to PostgreSQL)

### 3. Build UI Integration (We Do Together)
- [ ] Add Manhattan status badges to BOH shipment UI
- [ ] Show RFID "Last Read" timestamps
- [ ] Link shipment items to Manhattan units
- [ ] Auto-sync inventory every 5 minutes
- [ ] Add "Sync Now" button for manual refresh

### 4. Real-time RFID Integration
- [ ] Push RFID scans back to Manhattan
- [ ] Update unit status when items picked/packed
- [ ] Show live inventory counts
- [ ] Alert when reserved items go missing

---

## 📞 Support

If you need help getting credentials or configuring Manhattan APIs:
1. Contact your **Suit Supply IT team** (they manage Manhattan tenant)
2. Or reach out to **Manhattan Support**: support@manh.com
3. Reference: **Developer Portal** - https://platform.developer.manh.com/docs/

---

## 🎯 Why This Matters

**Manhattan = Backend System (for corporate/IT)**  
**Stockroom Dashboard = Frontend System (for employees)**

Employees don't want to:
- Navigate complex MAO filters
- Search by SGTIN numbers
- Read technical status codes
- Switch between multiple systems

They want:
- "Pick these 5 orders now"
- "Scan this item to verify"
- "Customer is here - where's their suit?"
- "Ship this package - done!"

**That's what we're building.** 🚀

---

**Ready to get your Manhattan API credentials?** Once you have them, I'll wire everything up and show you live inventory flowing through the system!
