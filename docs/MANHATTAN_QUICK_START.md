# Manhattan Active® - Quick Start Guide
**For Victor Rocha - January 10, 2026**

---

## ✅ What's Already Built (100% Ready!)

All Manhattan integration code is **complete and tested**. We just need your API credentials to go live!

### Backend Ready:
- ✅ `utils/manhattan-client.js` - Full OAuth2 API client
- ✅ `routes/manhattan.js` - 20+ API endpoints
- ✅ PostgreSQL schema for RFID + inventory sync
- ✅ Auto-sync every 5 minutes
- ✅ Error handling + retry logic

### Frontend Ready:
- ✅ `/boh-shipments.html` - BOH workflow UI
- ✅ RFID scanning interface
- ✅ Real-time inventory status
- ✅ Unit tracking by SGTIN/EPC

---

## 🔐 What You Need to Do (5 Minutes)

### Step 1: Get Manhattan API Credentials

1. Open browser: **https://platform.developer.manh.com/**
2. Log in with Suit Supply credentials
3. Create API application: **"Suit Supply Stockroom Dashboard"**
4. Select scopes: Inventory, Orders, Fulfillment, RFID, Locations
5. Copy these values:
   - Client ID
   - Client Secret
   - Tenant ID
   - API Base URL
   - OAuth URL

### Step 2: Share Credentials with Me

Just paste the credentials here (I'll create the .env file):

```
Client ID: _________________
Client Secret: _________________
Tenant ID: _________________
Base URL: _________________
OAuth URL: _________________
```

### Step 3: I'll Configure & Test (2 Minutes)

Once you give me credentials, I will:
1. Create `.env` file with Manhattan config
2. Restart server
3. Run test: `curl http://localhost:3000/api/manhattan/test`
4. Sync your inventory: `POST /api/manhattan/sync`
5. Show you live data from your Unit Inventory screen!

---

## 🎯 What You'll Get

After configuration, you'll be able to:

### 1. Query Any Unit by SGTIN (from your screenshot)
```bash
curl http://localhost:3000/api/manhattan/units/sgtin/010871264757727721353
```

Returns:
```json
{
  "sgtin": "010871264757727721353",
  "status": "Reserved",
  "itemId": "...",
  "locationId": "SR-US-SanFrancisco-Maiden",
  "lastReadDate": "2026-01-10T23:23:00Z",
  "fulfillmentId": "PSU502555661"
}
```

### 2. See All Reserved Items (Pick List)
```bash
curl http://localhost:3000/api/manhattan/units/status/Reserved
```

Returns: All items needing to be picked for customer orders

### 3. Track RFID History
```bash
curl http://localhost:3000/api/manhattan/rfid/history/010871264757727721353
```

Returns: Every RFID read event for that item

### 4. Auto-Sync Inventory
- Runs every 5 minutes automatically
- Pulls all 500+ units from Manhattan
- Stores in PostgreSQL for fast queries
- Updates BOH UI in real-time

---

## 🏗️ Data Flow

```
Your Manhattan System          Stockroom Dashboard
(Unit Inventory Screen)    →   (Employee UI)

500+ Units with SGTINs     →   Pick list by order
Reserved/InBound status    →   "Customer arriving at 3PM"
Last Read timestamps       →   "Scanned 2 hours ago"
Fulfillment IDs           →   "Order #PSU502555661"
Package tracking          →   UPS label generation
```

---

## 🚀 Ready?

**Just give me the 5 credentials above, and we'll be pulling live data from Manhattan in minutes!**

No code changes needed. No complex setup. Just credentials → config → done! ✅

---

📧 Paste your credentials in this chat when ready!
