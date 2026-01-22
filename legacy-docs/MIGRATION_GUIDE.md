# Migration Guide: From Node.js Backend to React Frontend

## Overview
This guide documents the current Node.js/PostgreSQL backend structure before migrating to a React frontend in the `/client` cfolder. It serves as a reference for active APIs, UI mappings, and database schemas.

## Active API Endpoints

### Authentication (`/api/auth`)
- **POST /api/auth/login** - User login with employee ID and password
- **POST /api/auth/logout** - User logout
- **GET /api/auth/check** - Check current session status
- **POST /api/auth/password-reset/request** - Request password reset
- **POST /api/auth/password-reset/confirm** - Confirm password reset
- **POST /api/auth/profile/complete** - Complete user profile setup
- **POST /api/auth/switch** - Switch user context (admin feature)
- **GET /api/auth/users** - List all users (admin only)
- **POST /api/auth/users** - Create new user (admin only)
- **PUT /api/auth/users/:id** - Update user (admin only)
- **DELETE /api/auth/users/:id** - Delete user (admin only)
- **POST /api/auth/users/:id/photo** - Upload user photo
- **GET /api/auth/activity** - Get user activity logs

### Shipments (`/api/shipments`)
- **GET /api/shipments** - List shipments with filters (status, email, order number, tracking)
- **POST /api/shipments** - Create new shipment
- **GET /api/shipments/:id** - Get shipment details with items and scans
- **PATCH /api/shipments/:id** - Update shipment
- **DELETE /api/shipments/:id** - Delete shipment
- **GET /api/shipments/:id/tracking** - Get real-time UPS tracking
- **POST /api/shipments/:id/items** - Add item to shipment
- **PATCH /api/shipments/items/:itemId** - Update shipment item
- **POST /api/shipments/:id/scan** - Record RFID scan
- **POST /api/shipments/:id/validate-address** - Validate shipping address
- **POST /api/shipments/:id/label** - Generate shipping label
- **POST /api/shipments/:id/print-label** - Print shipping label
- **PATCH /api/shipments/:id/status** - Update shipment status
- **PATCH /api/shipments/:id/assign-picker** - Assign picker to shipment
- **POST /api/shipments/:id/items/:itemId/pick** - Mark item as picked
- **POST /api/shipments/:id/generate-label** - Generate label
- **POST /api/shipments/refresh-statuses** - Refresh all shipment statuses from UPS

### Other Modules
- **Gameplan** (`/api/gameplan`) - Daily operations planning
- **Time Off** (`/api/timeoff`) - Employee time off requests
- **Feedback** (`/api/feedback`) - Employee feedback system
- **Closing Duties** (`/api/closing-duties`) - End-of-day checklists
- **Admin** (`/api/admin`) - Administrative functions
- **Awards** (`/api/awards`) - Employee recognition
- **Radio** (`/api/radio`) - Radio communication system
- **Expenses** (`/api/expenses`) - Expense tracking
- **Store Recovery** (`/api/store-recovery`) - Store recovery operations
- **Pickups** (`/api/pickups`) - Customer pickup management
- **Waitwhile** (`/api/waitwhile`) - Waitlist management
- **Manhattan** (`/api/manhattan`) - Inventory integration
- **RFID** (`/api/rfid`) - RFID scanning system
- **Logs** (`/api/logs`) - Client-side logging
- **Printers** (`/api/printers`) - Printer management
- **AI Assignment** (`/api/ai`) - AI-powered task assignment
- **Webhooks** (`/api/webhooks`) - External service webhooks

## Legacy HTML Files to Backend Routes Mapping

| HTML File | Route | Purpose |
|-----------|-------|---------|
| `app.html` | `/` or `/home` | Main dashboard/home page |
| `shipments.html` | `/shipments` | Shipment tracking and management |
| `gameplan-sa.html` | `/gameplan-sa` | Sales Associate gameplan |
| `gameplan-tailors.html` | `/gameplan-tailors` | Tailors gameplan |
| `gameplan-boh.html` | `/gameplan-boh` | Back of House gameplan |
| `gameplan-management.html` | `/gameplan-management` | Management gameplan |
| `gameplan-edit.html` | `/gameplan-edit` | Edit gameplan (editors only) |
| `ops-dashboard.html` | `/ops-dashboard` | Operations dashboard |
| `time-off.html` | `/time-off` | Time off requests |
| `awards.html` | `/awards` | Employee awards |
| `admin.html` | `/admin` | Admin panel |
| `feedback.html` | `/feedback` | Feedback submission |
| `closing-duties.html` | `/closing-duties` | Closing duties checklist |
| `lost-punch.html` | `/lost-punch` | Lost punch clock entries |
| `printer-manager.html` | `/printer-manager` | Printer management |
| `rfid-scanner.html` | `/rfid-scanner` | RFID scanner interface |
| `pickup-status.html` | `/pickup-status` | Customer pickup status |
| `radio.html` | `/radio` | Radio interface |
| `radio-transcripts.html` | `/radio-transcripts` | Radio transcripts |
| `store-recovery.html` | `/store-recovery` | Store recovery operations |
| `qr-decode.html` | `/qr-decode` | QR code decoding |
| `scanner.html` | `/scanner` | General scanner interface |
| `ups-extension.html` | `/ups-extension` | UPS extension tools |
| `login.html` | `/login` | Login page |
| `forgot-password.html` | `/forgot-password` | Password reset request |
| `reset-password.html` | `/reset-password` | Password reset confirmation |
| `complete-profile.html` | `/complete-profile` | Profile completion |

## PostgreSQL Schema Summary: Shipments

### Main Table: `shipments`
**Purpose**: Tracks complete shipment lifecycle from request to delivery.

**Key Fields**:
- `id` (SERIAL PRIMARY KEY)
- Customer info: `customer_name`, `customer_email`, `customer_phone`
- Order info: `order_number`, `ps_order_id`, `ps_fulfillment_id`
- Address: `customer_address` (JSONB), plus individual fields
- UPS info: `tracking_number`, `carrier`, `service_type`, `status_from_ups`
- Status: `status` (enum: REQUESTED → PICKING → PACKING → etc.)
- Employee assignments: `assigned_picker_id`, `picked_by_id`, `packed_by_id`
- Timestamps: `requested_at`, `shipped_at`, `delivered_at`
- RFID: `requires_rfid_scan`, `all_items_scanned`
- Integration data: `ps_raw_data`, `ups_raw_response`

**Indexes**: Status, customer email, tracking number, order number, priority

### Related Table: `shipment_items`
**Purpose**: Individual items within shipments.

**Key Fields**:
- `shipment_id` (FK to shipments)
- Item identification: `item_number`, `sgtin` (RFID), `barcode`
- Manhattan integration: `manhattan_unit_id`, `unit_status`
- Picking: `picked`, `picked_by_id`, `current_zone_id`, `rack_position`
- RFID: `rfid_scanned`, `rfid_scanned_by_id`

## Refactoring Suggestions: Inline Scripts to React Components

### Shipments Page (`shipments.html`)
**Core Logic to Extract**:

1. **Data Fetching & State Management**
   - `loadShipments()` → React `useEffect` with `fetch('/api/shipments')`
   - `allShipments` state → React `useState([])`
   - SSE real-time updates → React `useEffect` with EventSource

2. **Filtering Logic**
   - `applyFilters()` → Custom React hook `useShipmentFilters`
   - Status filtering, text search → Controlled input components

3. **Rendering Components**
   - Shipment cards → `<ShipmentCard>` component
   - Summary stats → `<ShipmentSummary>` component
   - Tracking modal → `<TrackingModal>` component

4. **Event Handlers**
   - `handleDeleteShipment` → `onDelete` prop in components
   - `fetchAndRenderTracking` → `useTracking` hook
   - `handleRefreshAll` → Button `onClick` handler

5. **Utility Functions**
   - `formatDate`, `trackingLink`, `canManage` → Shared utility modules
   - Sorting logic → `useMemo` with sort function

### General Patterns
- Replace DOM manipulation with React state updates
- Convert event listeners to React event handlers
- Move inline styles to CSS modules or styled-components
- Extract reusable logic into custom hooks
- Use React Router for navigation instead of `window.location.href`

## Security Notes
- All routes use environment variables for sensitive data (API keys, secrets)
- No hardcoded credentials found in codebase
- CSRF protection implemented for API writes
- HTTPS enforcement in production
- Session-based authentication with SameSite cookies

## Migration Checklist
- [ ] Create `/client` folder with React app
- [ ] Set up React Router with routes matching current paths
- [ ] Implement authentication context for session management
- [ ] Create shipment components (list, card, filters, tracking)
- [ ] Migrate gameplan components
- [ ] Set up API client for backend calls
- [ ] Implement real-time updates with SSE
- [ ] Add error boundaries and loading states
- [ ] Test all API integrations
- [ ] Deploy and test in staging environment</content>
<parameter name="filePath">/var/www/stockroom-dashboard/MIGRATION_GUIDE.md