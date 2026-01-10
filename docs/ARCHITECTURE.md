# System Architecture

## Overview

Daily Operations Dashboard is a Progressive Web Application (PWA) built with Node.js/Express backend and vanilla JavaScript/HTML/CSS frontend. It manages daily operations for retail locations including game plans, shipments, lost punches, time off requests, and store metrics.

---

## Technology Stack

### Backend
- **Runtime:** Node.js (v14+)
- **Framework:** Express.js
- **Language:** JavaScript (ES6+)
- **Session Management:** express-session with cookie-parser
- **Data Storage:** JSON files (can migrate to PostgreSQL)
- **Email:** Gmail IMAP (for UPS email parsing)
- **WebSockets:** ws (for real-time updates)

### Frontend
- **Languages:** HTML5, CSS3, JavaScript (vanilla, no frameworks)
- **Architecture:** Progressive Web App (PWA)
- **Offline Support:** Service Workers (sw.js)
- **Responsive Design:** Mobile-first CSS Grid/Flexbox
- **State Management:** sessionStorage, localStorage, in-memory

### Infrastructure
- **Server:** Linux (systemd)
- **Process Management:** PM2 (ecosystem.config.json)
- **SSL/TLS:** Optional HTTPS with self-signed certificates
- **Reverse Proxy:** Tailscale Serve (optional)

---

## Project Structure

```
stockroom-dashboard/
├── src/                          # Source code (organized)
│   ├── routes/                  # API endpoints
│   │   ├── auth.js              # Authentication (login, logout)
│   │   ├── gameplan.js          # Daily game plans
│   │   ├── shipments.js         # Shipment tracking
│   │   ├── lostPunch.js         # Lost punch requests
│   │   ├── timeoff.js           # Time off management
│   │   ├── closingDuties.js     # Store closing tasks
│   │   ├── expenses.js          # Expense tracking
│   │   ├── awards.js            # Employee awards
│   │   ├── radio.js             # Radio operations
│   │   ├── admin.js             # Admin functions
│   │   └── storeRecovery.js     # RFID store inventory
│   │
│   ├── middleware/              # Request processing
│   │   └── auth.js              # Authentication guard
│   │
│   ├── utils/                   # Shared utilities
│   │   ├── dal.js               # Data Access Layer (JSON file ops)
│   │   ├── paths.js             # File path management
│   │   ├── ups-api.js           # UPS tracking API integration
│   │   ├── ups-scheduler.js     # Scheduled UPS status updates
│   │   ├── ups-email-parser.js  # Gmail email parsing
│   │   ├── active-users.js      # Track online users
│   │   └── ... other utilities
│   │
│   └── models/                  # Data schemas (future)
│
├── public/                       # Frontend (HTML/CSS/JS)
│   ├── index.html               # Login page
│   ├── dashboard.html           # Main dashboard
│   ├── gameplan-edit.html       # Game plan editor
│   ├── gameplan-sa.html         # Sales Associate view
│   ├── gameplan-boh.html        # Back of House view
│   ├── gameplan-management.html # Manager view
│   ├── shipments.html           # Shipment tracking UI
│   ├── lost-punch.html          # Lost punch request form
│   ├── ... other pages
│   │
│   ├── css/                     # Stylesheets
│   │   ├── theme.css            # Color & typography system
│   │   ├── dashboard.css        # Layout & components
│   │   ├── shared-header.css    # Global header
│   │   ├── mobile.css           # Responsive breakpoints
│   │   └── ... page-specific styles
│   │
│   ├── js/                      # Client-side JavaScript
│   │   ├── dashboard.js         # Main app logic
│   │   ├── shared-header.js     # Navigation/header functionality
│   │   ├── store-recovery.js    # RFID scanning logic
│   │   └── ... page-specific scripts
│   │
│   ├── icons/                   # App icons
│   └── images/                  # Static images
│
├── data/                        # JSON data storage (gitignored)
│   ├── users.json               # Employee directory
│   ├── employees-v2.json        # Extended employee data
│   ├── shipments.json           # Shipment records
│   ├── gameplan-daily/          # Daily game plans
│   ├── closing-duties-log.json  # Store closing records
│   └── ... other data files
│
├── tests/                       # Unit & integration tests
├── docs/                        # Documentation
├── config/                      # Environment configs
├── scripts/                     # Utility scripts
│   └── dedupe-shipments.js      # Deduplication tool
│
├── server.js                    # Express app entry point
├── package.json                 # Dependencies & scripts
├── ecosystem.config.json        # PM2 configuration
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Template for .env
├── .gitignore                   # Git ignore rules
└── README.md                    # Project overview
```

---

## Data Flow

### Authentication Flow
```
User Input (email/password)
  ↓
POST /api/auth/login
  ↓
Verify credentials (users.json)
  ↓
Create session (express-session)
  ↓
Set userSession cookie
  ↓
Redirect to dashboard
```

### Game Plan Update Flow
```
Manager Updates Goals (UI)
  ↓
POST /api/gameplan
  ↓
Validate manager permission
  ↓
Update gameplan-daily/{date}.json
  ↓
Broadcast update to all clients (WebSocket)
  ↓
Update UI in real-time
```

### Shipment Tracking Flow
```
Email arrives (Gmail)
  ↓
UPS Email Parser extracts tracking
  ↓
Check if tracking already exists
  ↓
If new: Create shipment record
  ↓
If exists: Update status
  ↓
Save to shipments.json
  ↓
Display in UI with latest UPS status
```

---

## Key Design Patterns

### 1. Middleware-Based Auth
```javascript
// All protected routes use authMiddleware
router.get('/api/gameplan', authMiddleware, (req, res) => {
  // req.user is populated by middleware
});
```

### 2. Data Access Layer (DAL)
```javascript
// dal.js abstracts JSON file operations
dal.readJson(path, defaultValue)
dal.writeJson(path, data)
dal.ensureDir(path)
```

### 3. Role-Based Access Control
```javascript
// Routes check user.isManager, user.isAdmin, or user.role
function canManageShipments(user) {
  return user?.isManager || user?.isAdmin;
}
```

### 4. Graceful Degradation
- Service Workers enable offline access
- Critical endpoints have retry logic
- Failed requests show user-friendly errors

---

## Database Schema (Current: JSON)

### users.json
```json
{
  "users": [
    {
      "id": "unique-id",
      "email": "user@example.com",
      "password": "hashed-password",
      "name": "John Doe",
      "role": "SA|BOH|TAILOR|MANAGEMENT",
      "employeeId": "12345",
      "storeId": "SF001",
      "isManager": false,
      "isAdmin": false
    }
  ]
}
```

### gameplan-daily/{YYYY-MM-DD}.json
```json
{
  "date": "2026-01-10",
  "goals": {
    "manualGoal": 5000,
    "autoTarget": 5200,
    "daySliders": 100
  },
  "employees": {
    "SA": [
      {
        "employeeId": "12345",
        "name": "John Doe",
        "assignment": "Floor",
        "notes": "Lead customer"
      }
    ]
  }
}
```

### shipments.json
```json
[
  {
    "id": "auto-1234567890-xyz",
    "trackingNumber": "1ZY8V7180332776148",
    "carrier": "UPS",
    "status": "delivered|in-transit|label-created|requested",
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

## API Architecture

### RESTful Endpoints
- `GET /api/{resource}` - List resources
- `POST /api/{resource}` - Create resource
- `POST /api/{resource}/{id}/action` - Perform action
- All requests require authentication (except `/login`, `/reset-password`)

### Response Format
```json
{
  "success": true|false,
  "data": {...},
  "error": "error message (if failed)",
  "statusCode": 200|400|401|403|500
}
```

---

## Security Considerations

### Current Implementation
- ✅ Session-based authentication (express-session)
- ✅ Role-based access control (middleware checks)
- ✅ HTTPS support (optional, with self-signed certs)
- ✅ .env secrets management (gitignored)

### Gaps Before Production
- ❌ No rate limiting
- ❌ No input validation/sanitization
- ❌ No SQL injection protection (uses JSON, but migrate carefully)
- ❌ No CSRF tokens
- ❌ No audit logging
- ❌ No encryption for sensitive data at rest

---

## Scalability Considerations

### Current Limitations
- JSON file-based storage (not suitable for 5,000+ concurrent users)
- Single-threaded Node.js (works fine, but no load balancing)
- All data in memory (problematic for large datasets)

### Migration Path
1. Keep current API structure (no breaking changes)
2. Replace DAL with database adapter (PostgreSQL, MongoDB)
3. Add caching layer (Redis)
4. Deploy on load-balanced servers
5. Add CDN for static assets

---

## Deployment Architecture

### Development
```
Local Machine
├── Node.js server (port 3000)
├── Git repo (origin)
└── .env (local secrets)
```

### Staging (Pre-Production)
```
Staging Server
├── Node.js cluster (PM2)
├── PostgreSQL database
├── Git (origin/staging branch)
└── SSL certificates
```

### Production (Future)
```
Cloud Provider (AWS/Azure)
├── Load Balancer
├── 3-5 App Servers (Node.js)
├── Database Cluster (PostgreSQL HA)
├── Redis Cache
├── Backup System
└── Monitoring & Alerts
```

---

## Performance Metrics

### Current Performance
- Page load: < 500ms (cached)
- API response: < 200ms (average)
- User capacity: 100-200 concurrent users (single server)

### Targets Before 5,000 Employees
- Page load: < 1s (p95)
- API response: < 100ms (p95)
- User capacity: 1000+ concurrent users
- Uptime: 99.9%

---

## Monitoring & Logging

### Current
- PM2 logs (automatically rotated)
- Browser console errors
- Manual testing

### Needed Before Production
- Centralized logging (ELK, Datadog, or similar)
- Error tracking (Sentry)
- Performance monitoring (APM)
- User analytics
- Security auditing

---

## Future Improvements

### Phase 1 (Q1 2026)
- [ ] Migrate to PostgreSQL
- [ ] Add automated tests
- [ ] Setup CI/CD pipeline
- [ ] Add error monitoring

### Phase 2 (Q2 2026)
- [ ] Multi-store support (currently single store)
- [ ] Advanced analytics
- [ ] User management UI
- [ ] API versioning

### Phase 3 (Q3 2026)
- [ ] Mobile app (React Native)
- [ ] Global localization
- [ ] Advanced permissions system
- [ ] Audit trails
