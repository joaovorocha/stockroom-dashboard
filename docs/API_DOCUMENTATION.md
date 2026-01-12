# Stockroom Dashboard API Documentation
**Last Updated:** January 12, 2026

## Table of Contents
1. [Authentication APIs](#authentication-apis)
2. [Game Plan APIs](#game-plan-apis)
3. [Shipments APIs](#shipments-apis)
4. [Employee Management APIs](#employee-management-apis)
5. [Looker Integration APIs](#looker-integration-apis)
6. [Operations APIs](#operations-apis)
7. [Proposed New Endpoints](#proposed-new-endpoints)

---

## Authentication APIs
**Base Path:** `/api/auth`

### POST `/api/auth/login`
**Description:** Authenticate user with employee ID and password  
**Request Body:**
```json
{
  "employeeId": "30744",
  "password": "1234",
  "remember": false
}
```
**Response:**
```json
{
  "success": true,
  "user": {
    "userId": 3,
    "employeeId": "30744",
    "name": "Victor Rocha",
    "email": "vrocha@suitsupply.com",
    "role": "MANAGEMENT",
    "isManager": true,
    "isAdmin": true
  }
}
```

### GET `/api/auth/check`
**Description:** Validate current session  
**Response:**
```json
{
  "authenticated": true,
  "user": { /* user object */ }
}
```

### POST `/api/auth/logout`
**Description:** End current session  
**Response:** 200 OK

### GET `/api/auth/users`
**Description:** Get all users (admin/manager only)  
**Response:**
```json
{
  "users": [
    {
      "id": 1,
      "employeeId": "30744",
      "name": "Victor Rocha",
      "role": "MANAGEMENT",
      "active": true
    }
  ]
}
```

---

## Game Plan APIs
**Base Path:** `/api/gameplan`

### GET `/api/gameplan/today`
**Description:** Get today's game plan data  
**Response:**
```json
{
  "date": "2026-01-12",
  "employees": [],
  "metrics": {
    "traffic": 120,
    "conversion": 0.15,
    "appointments": 8
  },
  "bestSellers": []
}
```

### GET `/api/gameplan/date/:date`
**Description:** Get game plan for specific date  
**Params:** `date` - YYYY-MM-DD format  
**Response:** Same as `/today`

### POST `/api/gameplan/save`
**Description:** Save game plan updates (manager only)  
**Request Body:**
```json
{
  "date": "2026-01-12",
  "employees": [
    {
      "employeeId": "30744",
      "name": "Victor Rocha",
      "role": "SA",
      "shiftStart": "10:00",
      "shiftEnd": "18:00",
      "goals": "Focus on suits",
      "notes": "VIP client at 2pm"
    }
  ]
}
```

### GET `/api/gameplan/employees`
**Description:** Get all employees  
**Response:**
```json
{
  "employees": [
    {
      "employeeId": "30744",
      "name": "Victor Rocha",
      "role": "MANAGEMENT",
      "type": "SA",
      "active": true
    }
  ]
}
```

### GET `/api/gameplan/employees/:type`
**Description:** Get employees by type (SA, BOH, TAILOR, MANAGEMENT)  
**Params:** `type` - Employee type  

### GET `/api/gameplan/metrics`
**Description:** Get store performance metrics  
**Query Params:** `date` (optional)  
**Response:**
```json
{
  "date": "2026-01-12",
  "traffic": 120,
  "conversion": 0.15,
  "avgBasketSize": 850,
  "appointments": 8,
  "scanPerformance": {
    "total": 150,
    "onTime": 120,
    "late": 30
  }
}
```

### GET `/api/gameplan/appointments`
**Description:** Get appointments for the day  
**Response:**
```json
{
  "appointments": [
    {
      "time": "14:00",
      "customer": "John Doe",
      "sa": "Victor Rocha",
      "type": "VIP",
      "notes": "Wedding suit"
    }
  ]
}
```

### GET `/api/gameplan/best-sellers`
**Description:** Get best selling products  
**Response:**
```json
{
  "products": [
    {
      "code": "P123456",
      "name": "Navy Suit",
      "sales": 15,
      "revenue": 12750
    }
  ]
}
```

### POST `/api/gameplan/sync`
**Description:** Sync data from external sources (manager only)  
**Response:** 200 OK

### POST `/api/gameplan/import-looker`
**Description:** Import data from Looker (manager only)  
**Request Body:**
```json
{
  "date": "2026-01-12",
  "data": { /* Looker data */ }
}
```

---

## Shipments APIs
**Base Path:** `/api/shipments`

### GET `/api/shipments`
**Description:** Get all shipments with filtering  
**Query Params:**
- `status` - Filter by status (comma-separated)
- `search` - Search tracking, customer, order
- `limit` - Results limit (default: 100)

**Response:**
```json
{
  "shipments": [
    {
      "id": 1,
      "shipment_number": "SHP-001",
      "tracking_number": "1Z999AA10123456784",
      "status": "IN_TRANSIT",
      "customer_name": "John Doe",
      "order_number": "ORD-12345",
      "created_at": "2026-01-12T10:00:00Z"
    }
  ],
  "total": 150
}
```

### GET `/api/shipments/:id`
**Description:** Get shipment details with items  
**Response:**
```json
{
  "shipment": { /* shipment object */ },
  "items": [
    {
      "id": 1,
      "item_number": "P123456",
      "description": "Navy Suit",
      "quantity": 1,
      "picked": true,
      "scanned": true
    }
  ],
  "scans": []
}
```

### POST `/api/shipments`
**Description:** Create new shipment  
**Request Body:**
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "order_number": "ORD-12345",
  "items": [
    {
      "item_number": "P123456",
      "description": "Navy Suit",
      "quantity": 1
    }
  ]
}
```

### PATCH `/api/shipments/:id/status`
**Description:** Update shipment status  
**Request Body:**
```json
{
  "status": "PICKING",
  "employeeId": "30744"
}
```

### POST `/api/shipments/:id/items/:itemId/pick`
**Description:** Mark item as picked  
**Response:** 200 OK

### POST `/api/shipments/:id/scan`
**Description:** Record RFID scan  
**Request Body:**
```json
{
  "epc": "3003...",
  "employeeId": "30744"
}
```

### POST `/api/shipments/:id/label`
**Description:** Generate shipping label  
**Request Body:**
```json
{
  "carrier": "UPS",
  "service": "GROUND"
}
```

---

## Employee Management APIs
**Base Path:** `/api/admin`

### GET `/api/admin/users`
**Description:** Get all users with details (admin only)  
**Response:**
```json
{
  "users": [
    {
      "id": 1,
      "employeeId": "30744",
      "name": "Victor Rocha",
      "email": "vrocha@suitsupply.com",
      "role": "MANAGEMENT",
      "active": true,
      "last_login": "2026-01-12T08:00:00Z"
    }
  ]
}
```

### POST `/api/admin/users`
**Description:** Create new user (admin only)  
**Request Body:**
```json
{
  "employeeId": "30745",
  "name": "Jane Smith",
  "email": "jsmith@suitsupply.com",
  "role": "SA",
  "password": "temporary123"
}
```

### PATCH `/api/admin/users/:id`
**Description:** Update user (admin only)  

### DELETE `/api/admin/users/:id`
**Description:** Deactivate user (admin only)  

---

## Looker Integration APIs
**Base Path:** `/api/looker`

### 🆕 GET `/api/looker/traffic`
**Description:** Get store traffic data from Looker  
**Query Params:**
- `date` - Date (YYYY-MM-DD)
- `store` - Store ID (default: current store)

**Response:**
```json
{
  "date": "2026-01-12",
  "store": "SF",
  "traffic": {
    "total": 120,
    "byHour": {
      "10": 15,
      "11": 18,
      "12": 22
    }
  }
}
```

### 🆕 GET `/api/looker/sales`
**Description:** Get sales data from Looker  
**Response:**
```json
{
  "date": "2026-01-12",
  "sales": {
    "revenue": 45000,
    "transactions": 35,
    "avgBasket": 1285.71,
    "conversion": 0.15
  }
}
```

### 🆕 GET `/api/looker/employees`
**Description:** Get employee data from Looker  
**Response:**
```json
{
  "employees": [
    {
      "employeeId": "30744",
      "name": "Victor Rocha",
      "department": "SA",
      "schedule": {
        "start": "10:00",
        "end": "18:00",
        "break": "14:00-14:30"
      }
    }
  ]
}
```

### 🆕 GET `/api/looker/inventory`
**Description:** Get inventory levels from Looker  
**Response:**
```json
{
  "items": [
    {
      "sku": "P123456",
      "name": "Navy Suit",
      "onHand": 5,
      "reserved": 2,
      "available": 3
    }
  ]
}
```

### 🆕 POST `/api/looker/sync`
**Description:** Trigger full data sync from Looker  
**Request Body:**
```json
{
  "entities": ["traffic", "sales", "employees", "inventory"],
  "date": "2026-01-12"
}
```
**Response:**
```json
{
  "success": true,
  "syncId": "sync_123",
  "started": "2026-01-12T10:00:00Z"
}
```

### 🆕 GET `/api/looker/sync/:syncId`
**Description:** Check sync status  
**Response:**
```json
{
  "syncId": "sync_123",
  "status": "IN_PROGRESS",
  "progress": 0.75,
  "completed": {
    "traffic": true,
    "sales": true,
    "employees": false,
    "inventory": false
  }
}
```

---

## Operations APIs
**Base Path:** `/api/operations`

### 🆕 GET `/api/operations/dashboard`
**Description:** Get unified operations dashboard data  
**Response:**
```json
{
  "date": "2026-01-12",
  "store": "SF",
  "summary": {
    "traffic": 120,
    "sales": 45000,
    "conversion": 0.15,
    "activeEmployees": 12,
    "pendingShipments": 8
  },
  "realtime": {
    "currentTraffic": 15,
    "activeSales": 3,
    "queueDepth": 2
  }
}
```

### 🆕 GET `/api/operations/alerts`
**Description:** Get active alerts and notifications  
**Response:**
```json
{
  "alerts": [
    {
      "id": 1,
      "type": "LOW_INVENTORY",
      "severity": "WARNING",
      "message": "Navy Suit stock below 5 units",
      "sku": "P123456",
      "timestamp": "2026-01-12T14:00:00Z"
    }
  ]
}
```

---

## Proposed New Endpoints

### Game Plan Consolidation
**Goal:** Unified API that serves all employee types with role-based filtering

#### 🆕 GET `/api/gameplan/unified`
**Description:** Get unified game plan with role-based views  
**Query Params:**
- `date` - Date (YYYY-MM-DD)
- `view` - View type: `all`, `boh`, `sa`, `tailor`, `management`

**Response:**
```json
{
  "date": "2026-01-12",
  "view": "sa",
  "employees": [
    {
      "employeeId": "30744",
      "name": "Victor Rocha",
      "type": "SA",
      "shift": {
        "start": "10:00",
        "end": "18:00",
        "break": "14:00-14:30"
      },
      "goals": {
        "sales": 5000,
        "units": 4,
        "appointments": 2
      },
      "actual": {
        "sales": 3200,
        "units": 3,
        "appointments": 2
      }
    }
  ],
  "metrics": {
    "traffic": 120,
    "conversion": 0.15,
    "avgBasket": 1285
  }
}
```

### Looker Webhook Integration
#### 🆕 POST `/api/looker/webhook`
**Description:** Receive automatic updates from Looker  
**Request Body:**
```json
{
  "event": "data_updated",
  "entity": "traffic",
  "timestamp": "2026-01-12T10:00:00Z",
  "data": { /* updated data */ }
}
```

### Real-time Updates
#### 🆕 GET `/api/sse/gameplan`
**Description:** Server-Sent Events for real-time game plan updates  
**Response:** SSE stream

---

## API Standards

### Authentication
All endpoints except `/api/auth/login` require authentication via session cookie.

### Response Format
```json
{
  "success": true,
  "data": { /* response data */ },
  "error": null
}
```

### Error Format
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid session"
  }
}
```

### Rate Limiting
- Default: 100 requests/minute per user
- Admin endpoints: 1000 requests/minute

### Pagination
Large datasets support pagination:
```
?limit=50&offset=100
```

---

## Implementation Priority

### Phase 1: Immediate (Week 1)
1. Document existing endpoints ✅
2. Create `/api/gameplan/unified` endpoint
3. Implement role-based filtering
4. Add Looker data sync endpoints

### Phase 2: Integration (Week 2)
1. Build Looker webhook receiver
2. Create automated sync workflow
3. Implement real-time SSE updates
4. Add operations dashboard API

### Phase 3: Enhancement (Week 3)
1. Add advanced filtering
2. Implement caching layer
3. Create data export endpoints
4. Add analytics endpoints

---

## Next Steps

1. **Review with COO** - Present unified API structure
2. **Finalize Looker Integration** - Confirm data schema and sync frequency
3. **Implement Unified Game Plan** - Consolidate pages with role-based views
4. **Testing** - Full API testing with all employee types
5. **Documentation** - Create user guide for API consumption
