# API Documentation

## Overview
RESTful API for Daily Operations Dashboard - Manages game plans, shipments, lost punches, time off, and other operational tasks across multiple store locations.

**Base URL:** `http://localhost:3000/api`

---

## Authentication
All endpoints require a valid session cookie (`userSession`). User must be authenticated via `/api/auth/login`.

### Auth Endpoints

#### POST `/api/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "SA",
    "isManager": false,
    "isAdmin": false
  }
}
```

**Status Codes:**
- `200` - Login successful
- `401` - Invalid credentials
- `500` - Server error

---

#### POST `/api/auth/logout`
Logout current user.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### GET `/api/auth/current-user`
Get currently logged-in user details.

**Response:**
```json
{
  "id": "12345",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "SA",
  "isManager": false,
  "isAdmin": false
}
```

---

## Game Plan Endpoints

#### GET `/api/gameplan`
Fetch today's game plan.

**Query Parameters:**
- `date` (optional): ISO date string (default: today)

**Response:**
```json
{
  "date": "2026-01-10",
  "goals": {
    "manualGoal": 5000,
    "autoTarget": 5200,
    "daySliders": 100
  },
  "employees": {
    "SA": [...],
    "BOH": [...],
    "TAILOR": [...]
  }
}
```

---

#### POST `/api/gameplan`
Create or update today's game plan.

**Request:**
```json
{
  "date": "2026-01-10",
  "goals": {
    "manualGoal": 5000,
    "autoTarget": 5200,
    "daySliders": 100
  }
}
```

**Response:**
```json
{
  "success": true,
  "gameplan": { ... }
}
```

**Permissions:** Managers only

---

## Shipments Endpoints

#### GET `/api/shipments`
Get all shipments with status enrichment from UPS.

**Query Parameters:**
- `filter` (optional): "pending", "delivered", "in-transit"
- `carrier` (optional): "UPS", "FedEx", etc.

**Response:**
```json
[
  {
    "id": "auto-1234567890-xyz",
    "trackingNumber": "1ZY8V7180332776148",
    "carrier": "UPS",
    "status": "delivered",
    "customerName": "Riko Mendez",
    "address": {
      "line1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94102"
    },
    "createdAt": "2026-01-07T21:49:48.000Z",
    "updatedAt": "2026-01-09T15:30:00.000Z"
  }
]
```

---

#### POST `/api/shipments`
Create a new shipment request.

**Request:**
```json
{
  "trackingNumber": "1ZY8V7180332776148",
  "carrier": "UPS",
  "customerName": "John Doe",
  "address": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102"
  }
}
```

---

#### POST `/api/shipments/add`
Add a new shipment with custom details.

**Permissions:** Managers only

---

#### POST `/api/shipments/import-email`
Fetch and import shipments from Gmail UPS emails.

**Request:**
```json
{
  "daysBack": 7,
  "deleteAfterImport": false
}
```

**Permissions:** Managers only

---

#### POST `/api/shipments/import-tracking`
Manually import a tracking number.

**Request:**
```json
{
  "tracking": "1ZY8V7180332776148",
  "carrier": "UPS"
}
```

**Permissions:** Managers only

---

#### POST `/api/shipments/dedupe`
Trigger deduplication of shipments by tracking number.

**Response:**
```json
{
  "success": true,
  "message": "Deduplication complete. Removed 10 duplicate(s).",
  "before": 125,
  "after": 115,
  "removed": 10
}
```

**Permissions:** Managers only

---

## Lost Punch Endpoints

#### GET `/api/lost-punch`
Get all lost punch requests.

**Query Parameters:**
- `status` (optional): "pending", "approved", "denied"

**Response:**
```json
[
  {
    "id": "uuid",
    "employeeId": "12345",
    "employeeName": "John Doe",
    "missedDate": "2026-01-09",
    "clockOut": "17:00",
    "clockIn": "09:00",
    "reason": "System was down",
    "status": "pending",
    "submittedAt": "2026-01-09T18:00:00Z"
  }
]
```

---

#### POST `/api/lost-punch`
Submit a lost punch request.

**Request:**
```json
{
  "missedDate": "2026-01-09",
  "clockIn": "09:00",
  "clockOut": "17:00",
  "reason": "System was down"
}
```

---

#### POST `/api/lost-punch/:id/approve`
Approve a lost punch request.

**Permissions:** Managers only

---

#### POST `/api/lost-punch/:id/deny`
Deny a lost punch request.

**Request:**
```json
{
  "reason": "Already clocked in"
}
```

**Permissions:** Managers only

---

## Time Off Endpoints

#### GET `/api/time-off`
Get all time off requests.

**Response:**
```json
[
  {
    "id": "uuid",
    "employeeId": "12345",
    "employeeName": "John Doe",
    "startDate": "2026-02-01",
    "endDate": "2026-02-07",
    "type": "vacation",
    "reason": "Family trip",
    "status": "pending",
    "submittedAt": "2026-01-10T10:00:00Z"
  }
]
```

---

#### POST `/api/time-off`
Submit a time off request.

**Request:**
```json
{
  "startDate": "2026-02-01",
  "endDate": "2026-02-07",
  "type": "vacation",
  "reason": "Family trip"
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": "Error message",
  "details": "Additional context (optional)",
  "statusCode": 400
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden (no permission)
- `404` - Not found
- `500` - Server error

---

## Rate Limiting
Currently no rate limiting. Should be added before production scale.

---

## Versioning
API is currently v1 (unversioned). Consider versioning endpoints as `/api/v1/...` before major changes.

---

## Testing

### cURL Examples

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

**Get Shipments:**
```bash
curl http://localhost:3000/api/shipments \
  -b "connect.sid=your-session-cookie"
```

**Create Game Plan:**
```bash
curl -X POST http://localhost:3000/api/gameplan \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-01-10","goals":{"manualGoal":5000}}'
```
