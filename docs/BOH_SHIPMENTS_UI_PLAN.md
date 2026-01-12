# BOH Shipments UI - Implementation Plan
**Developer:** Victor Rocha, Stockroom Manager @ Suit Supply  
**Date:** January 10, 2026  
**Status:** READY FOR GPT-4.1 IMPLEMENTATION

---

## 🎯 Overview
Create a dedicated BOH (Back of House) shipment management interface for picking, packing, and shipping workflow. This replaces the customer-facing shipments.html view with a BOH-optimized workflow UI.

---

## 📋 Requirements

### Core Features
1. **Dashboard View** - List of pending shipments sorted by priority/age
2. **Shipment Detail View** - Individual shipment with items, status, and actions
3. **RFID Scanning Interface** - Scan items during pick/pack workflow
4. **Status Workflow** - REQUESTED → PICKING → READY_TO_PACK → PACKING → PACKED → LABEL_CREATED
5. **Label Generation** - UPS label printing (ZPL format)
6. **Real-time Updates** - SSE integration for live status changes

### User Roles (from auth)
- **BOH Staff** - Can pick, pack, scan items
- **Management** - Full access + reporting
- **Admin** - All features + configuration

---

## 🗂 Files to Create

### 1. `/var/www/stockroom-dashboard/public/boh-shipments.html`
**Purpose:** Main BOH shipment management page  
**Base Template:** Copy structure from `public/gameplan-boh.html`  
**Key Sections:**
- Page header with title and stats
- Filter/search bar (status, priority, date)
- Summary cards (pending, picking, ready_to_pack, urgent)
- Shipment list (card grid)
- Shipment detail modal
- RFID scan modal
- Label print modal

**Layout Structure:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>BOH Shipments | Suit Supply</title>
  <link rel="stylesheet" href="/css/theme.css?v=14">
  <link rel="stylesheet" href="/css/shared-header.css?v=22">
  <link rel="stylesheet" href="/css/dashboard.css?v=17">
  <link rel="stylesheet" href="/css/mobile.css?v=6">
  <style>
    /* BOH-specific styles inline */
  </style>
</head>
<body>
  <div id="shared-header-mount"></div>
  
  <div class="page-wrap">
    <!-- Page Header -->
    <div class="page-header">
      <h1>📦 BOH Shipments</h1>
      <p>Pick, pack, and ship customer orders</p>
    </div>
    
    <!-- Summary Cards -->
    <div class="summary-row">
      <div class="summary-card" id="summaryPending"></div>
      <div class="summary-card" id="summaryPicking"></div>
      <div class="summary-card" id="summaryReadyToPack"></div>
      <div class="summary-card" id="summaryUrgent"></div>
    </div>
    
    <!-- Filters -->
    <div class="filter-bar">
      <input type="text" id="searchInput" placeholder="Search shipment, customer, order...">
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="REQUESTED">Requested</option>
        <option value="PICKING">Picking</option>
        <option value="READY_TO_PACK">Ready to Pack</option>
        <option value="PACKING">Packing</option>
      </select>
      <select id="priorityFilter">
        <option value="">All priorities</option>
        <option value="2">Rush</option>
        <option value="1">Urgent</option>
        <option value="0">Normal</option>
      </select>
    </div>
    
    <!-- Shipment List -->
    <div class="shipment-list" id="shipmentList"></div>
    <div class="empty-state" id="emptyState" style="display:none;">
      No shipments match your filters.
    </div>
  </div>
  
  <!-- Shipment Detail Modal -->
  <div class="modal-overlay" id="shipmentDetailModal">
    <div class="modal modal-large">
      <div class="modal-header">
        <h3 id="modalShipmentNumber">Shipment Details</h3>
        <button class="modal-close" id="closeDetailModal">&times;</button>
      </div>
      <div class="modal-body" id="modalShipmentBody">
        <!-- Populated by JS -->
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="closeDetailBtn">Close</button>
        <button class="btn btn-primary" id="modalActionBtn">Action</button>
      </div>
    </div>
  </div>
  
  <!-- RFID Scan Modal -->
  <div class="modal-overlay" id="scanModal">
    <div class="modal">
      <div class="modal-header">
        <h3>Scan Items</h3>
        <button class="modal-close" id="closeScanModal">&times;</button>
      </div>
      <div class="modal-body" id="scanModalBody">
        <!-- RFID scan interface -->
      </div>
    </div>
  </div>
  
  <script src="/js/shared-header.js?v=24"></script>
  <script src="/js/boh-shipments.js?v=1"></script>
  
  <!-- Bottom Nav -->
  <nav class="bottom-nav">
    <a href="/home" class="nav-item">
      <div class="nav-item-icon">🏠</div>
      <div class="nav-item-label">Home</div>
    </a>
    <a href="/gameplan-boh.html" class="nav-item">
      <div class="nav-item-icon">📋</div>
      <div class="nav-item-label">Game Plan</div>
    </a>
    <a href="/boh-shipments.html" class="nav-item active">
      <div class="nav-item-icon">📦</div>
      <div class="nav-item-label">Shipments</div>
    </a>
    <a href="/scanner.html" class="nav-item">
      <div class="nav-item-icon">📷</div>
      <div class="nav-item-label">Scanner</div>
    </a>
  </nav>
</body>
</html>
```

---

### 2. `/var/www/stockroom-dashboard/public/js/boh-shipments.js`
**Purpose:** BOH shipment workflow logic  
**Key Functions:**

```javascript
// State Management
let allShipments = [];
let currentUser = null;
let selectedShipment = null;
let sseConnection = null;

// Core Functions (implement these):
async function loadShipments() {
  // GET /api/shipments?status=REQUESTED,PICKING,READY_TO_PACK,PACKING
}

async function loadShipmentDetail(shipmentId) {
  // GET /api/shipments/:id
  // Include items: GET /api/shipments/:id/items
}

async function updateShipmentStatus(shipmentId, newStatus) {
  // PATCH /api/shipments/:id/status
  // Body: { status: 'PICKING', employeeId: currentUser.id }
}

async function assignPicker(shipmentId, pickerId) {
  // PATCH /api/shipments/:id/assign-picker
}

async function recordItemPick(shipmentId, itemId) {
  // POST /api/shipments/:id/items/:itemId/pick
}

async function scanItem(shipmentId, sgtin, scanType) {
  // POST /api/shipments/:id/scan
  // Body: { sgtin, scanType: 'PICK'|'VERIFY'|'PACK', employeeId }
}

async function generateLabel(shipmentId) {
  // POST /api/shipments/:id/generate-label
  // Returns label file path for printing
}

// UI Rendering
function renderShipmentList(shipments) {
  // Render shipment cards with status badges, priority indicators
}

function renderShipmentDetail(shipment) {
  // Show full shipment details + item list + actions
}

function renderSummaryCards(shipments) {
  // Count shipments by status and show in summary cards
}

// Real-time Updates
function setupSSE() {
  // Connect to /api/sse/updates
  // Listen for 'shipment_updated' events
}

// Filters
function applyFilters() {
  // Filter by status, priority, search query
}

// Init
document.addEventListener('DOMContentLoaded', initPage);
```

---

## 🎨 UI/UX Design Specifications

### Color Coding (use CSS custom properties)
- **REQUESTED** - Purple (`#9c27b0`)
- **PICKING** - Blue (`#2196f3`)
- **READY_TO_PACK** - Orange (`#ff9800`)
- **PACKING** - Yellow (`#ffc107`)
- **PACKED** - Green (`#4caf50`)
- **Priority 2 (Rush)** - Red border (`#f44336`)
- **Priority 1 (Urgent)** - Orange border (`#ff9800`)

### Shipment Card Layout
```
┌─────────────────────────────────────────┐
│ SHIP-20260110-001          [STATUS]     │
│ Customer: John Doe                      │
│ Order: PS-12345                         │
│ Items: 3/5 picked | 2/5 scanned        │
│ Requested: 2h ago by Sarah              │
│ [Assign to Me] [View Details]          │
└─────────────────────────────────────────┘
```

### Mobile Optimizations
- Stack cards vertically on mobile
- Large touch targets (48px min)
- Sticky filter bar
- Bottom nav always visible
- Modal slides up from bottom on mobile

---

## 🔗 API Endpoints (already implemented)

### GET `/api/shipments`
Query params: `?status=REQUESTED,PICKING&priority=1,2`

### GET `/api/shipments/:id`
Returns full shipment with embedded items

### GET `/api/shipments/:id/items`
Returns array of shipment_items

### POST `/api/shipments`
Create new shipment (from PredictSpring or manual)

### PATCH `/api/shipments/:id/status`
Update shipment status
```json
{
  "status": "PICKING",
  "employeeId": 123,
  "notes": "Started picking"
}
```

### PATCH `/api/shipments/:id/assign-picker`
Assign BOH picker
```json
{
  "assignedPickerId": 123
}
```

### POST `/api/shipments/:id/items/:itemId/pick`
Mark item as picked
```json
{
  "pickedById": 123
}
```

### POST `/api/shipments/:id/scan`
Record RFID scan event
```json
{
  "sgtin": "urn:epc:id:sgtin:0614141.812345.6789",
  "scanType": "PICK",
  "scannedById": 123,
  "zoneId": 5
}
```

### POST `/api/shipments/:id/generate-label`
Generate UPS shipping label (ZPL format)

---

## 📱 Workflow States

### 1. REQUESTED → Start Picking
**Button:** "Assign to Me" or "Start Picking"  
**Action:** 
- PATCH `/api/shipments/:id/assign-picker` with currentUser.id
- PATCH `/api/shipments/:id/status` to "PICKING"

### 2. PICKING → Items Picked
**UI:** Item checklist with "Pick" buttons  
**Action:** POST `/api/shipments/:id/items/:itemId/pick`  
**Auto-transition:** When all items picked → status = "READY_TO_PACK"

### 3. READY_TO_PACK → Start Packing
**Button:** "Start Packing"  
**Action:** PATCH `/api/shipments/:id/status` to "PACKING"

### 4. PACKING → Scan & Verify
**UI:** RFID scan modal with item checklist  
**Action:** POST `/api/shipments/:id/scan` for each item  
**Show:** Green checkmark when item scanned

### 5. PACKING → Generate Label
**Button:** "Generate Label" (enabled when all items scanned)  
**Action:** POST `/api/shipments/:id/generate-label`  
**Auto-transition:** status = "LABEL_CREATED"

### 6. LABEL_CREATED → Ship
**Button:** "Mark as Shipped"  
**Action:** PATCH `/api/shipments/:id/status` to "IN_TRANSIT"

---

## 🔐 Permissions

```javascript
function canManageShipments(user) {
  const role = user?.role?.toUpperCase();
  return user.isAdmin || user.isManager || role === 'BOH' || role === 'MANAGEMENT';
}

function canPickShipment(user) {
  const role = user?.role?.toUpperCase();
  return role === 'BOH' || user.isManager || user.isAdmin;
}

function canGenerateLabel(user) {
  return user.isManager || user.isAdmin;
}
```

---

## 🔄 Real-time Updates (SSE)

### Listen for Events:
```javascript
sseConnection.addEventListener('message', (event) => {
  const update = JSON.parse(event.data);
  
  if (update.type === 'shipment_updated') {
    // Reload shipment list
    loadShipments();
    
    // If viewing this shipment, refresh detail
    if (selectedShipment?.id === update.data?.shipmentId) {
      loadShipmentDetail(update.data.shipmentId);
    }
    
    // Show notification
    showNotification(`Shipment ${update.data.shipmentNumber} updated`);
  }
});
```

---

## 🎯 Success Metrics

After implementation, BOH users should be able to:
- ✅ See all pending shipments at a glance
- ✅ Assign themselves to pick a shipment
- ✅ Check off items as they're picked
- ✅ Scan items with RFID during packing
- ✅ Generate UPS labels with one click
- ✅ See real-time status updates from other BOH staff
- ✅ Complete full workflow in under 5 minutes per shipment

---

## 📝 Implementation Checklist for GPT-4.1

### Phase 1: HTML Structure ✓
- [ ] Create `public/boh-shipments.html`
- [ ] Copy header/footer from `gameplan-boh.html`
- [ ] Add page header with title and description
- [ ] Create summary cards section (4 cards)
- [ ] Add filter bar (search, status dropdown, priority dropdown)
- [ ] Create shipment list container
- [ ] Add empty state message
- [ ] Create shipment detail modal structure
- [ ] Create RFID scan modal structure
- [ ] Add bottom navigation
- [ ] Link CSS files (theme, shared-header, dashboard, mobile)

### Phase 2: CSS Styling ✓
- [ ] Add BOH-specific styles inline in `<style>` block
- [ ] Style summary cards (grid layout, responsive)
- [ ] Style filter bar (flex layout, mobile stack)
- [ ] Style shipment cards (grid, shadows, hover states)
- [ ] Add status badges with color coding
- [ ] Add priority indicators (colored borders)
- [ ] Style modal overlays (backdrop, transitions)
- [ ] Add mobile-responsive breakpoints
- [ ] Style buttons (primary, secondary, danger)
- [ ] Add loading states (skeleton loaders)

### Phase 3: JavaScript Core ✓
- [ ] Create `public/js/boh-shipments.js`
- [ ] Set up global state variables
- [ ] Implement `initPage()` function
- [ ] Implement `loadShipments()` with fetch
- [ ] Implement `renderShipmentList()`
- [ ] Implement `renderSummaryCards()`
- [ ] Implement `applyFilters()`
- [ ] Add event listeners for filters
- [ ] Implement search functionality
- [ ] Add loading indicators

### Phase 4: Shipment Detail Modal ✓
- [ ] Implement `loadShipmentDetail(id)`
- [ ] Implement `renderShipmentDetail(shipment)`
- [ ] Show customer info, address, status
- [ ] Render item list with checkboxes
- [ ] Add "Assign to Me" button logic
- [ ] Add "Start Picking" button logic
- [ ] Add "Mark Item Picked" logic
- [ ] Add "Start Packing" button logic
- [ ] Show status timeline/history
- [ ] Add modal open/close handlers

### Phase 5: RFID Scan Interface ✓
- [ ] Implement scan modal open/close
- [ ] Create RFID input field (auto-focus)
- [ ] Implement `scanItem(shipmentId, sgtin, scanType)`
- [ ] Show scanned items checklist
- [ ] Add visual feedback (green checkmark when scanned)
- [ ] Auto-submit on scan (detect RFID reader input)
- [ ] Show scan count: "3/5 items scanned"
- [ ] Disable "Generate Label" until all scanned
- [ ] Add manual SKU/barcode entry fallback

### Phase 6: Label Generation ✓
- [ ] Implement `generateLabel(shipmentId)`
- [ ] Show loading state during label generation
- [ ] Display label file path or download link
- [ ] Add "Print Label" button (open ZPL file)
- [ ] Auto-transition to LABEL_CREATED status
- [ ] Show "Mark as Shipped" button after label
- [ ] Add error handling for label generation failures

### Phase 7: Status Updates ✓
- [ ] Implement `updateShipmentStatus(id, status)`
- [ ] Add confirmation modals for status changes
- [ ] Show success/error notifications
- [ ] Update UI after status change (no full reload)
- [ ] Add optimistic UI updates
- [ ] Handle API errors gracefully
- [ ] Log status changes in browser console

### Phase 8: Real-time Updates (DEFER TO CLAUDE) ⚠️
- [ ] **STOP HERE - SWITCH BACK TO CLAUDE**
- [ ] SSE connection setup
- [ ] Event listeners for shipment updates
- [ ] Auto-refresh logic
- [ ] Conflict resolution (multiple users editing same shipment)

---

## 🚨 HANDOFF FLAG FOR USER

```
═══════════════════════════════════════════════════════════
🎯 GPT-4.1 IMPLEMENTATION COMPLETE - SWITCH TO CLAUDE
═══════════════════════════════════════════════════════════

Tasks completed:
✅ Phase 1-7: HTML, CSS, JS core, modals, scanning, labels

Next tasks require Claude (complex logic):
⏳ Phase 8: Real-time SSE integration
⏳ Advanced error handling and conflict resolution
⏳ Code review and optimization
⏳ Security audit

ACTION REQUIRED:
👉 Switch back to Claude Sonnet 4.5 to complete Phase 8

═══════════════════════════════════════════════════════════
```

---

## 🔍 Testing Checklist (for Claude after GPT-4.1)

- [ ] Test shipment list loading
- [ ] Test filters and search
- [ ] Test "Assign to Me" workflow
- [ ] Test item picking workflow
- [ ] Test RFID scanning (mock RFID input)
- [ ] Test label generation
- [ ] Test status transitions
- [ ] Test mobile responsiveness
- [ ] Test SSE real-time updates
- [ ] Test multiple users editing same shipment
- [ ] Test error states (API failures)
- [ ] Test permissions (BOH vs SA vs Admin)

---

## 📚 Reference Files

- **Schema:** `db/shipments-schema.sql`
- **API Routes:** `routes/shipments.js`
- **DAL Methods:** `utils/dal/pg.js` (search for "shipment")
- **Similar UI:** `public/gameplan-boh.html`, `public/shipments.html`
- **Shared JS:** `public/js/dashboard.js`, `public/js/shared-header.js`

---

**END OF PLAN - READY FOR GPT-4.1 EXECUTION** 🚀
