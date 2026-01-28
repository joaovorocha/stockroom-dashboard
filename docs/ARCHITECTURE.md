# System Architecture

## Overview

Stockroom Dashboard is a comprehensive Progressive Web Application (PWA) built with Node.js/Express backend, PostgreSQL database, and integrated MCP (Model Context Protocol) servers. It manages retail operations including game plans, shipments, employee scheduling, and real-time task management.

---

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL with automated migrations
- **Language:** JavaScript (ES6+)
- **Session Management:** Cookie-based with PostgreSQL storage
- **Real-time:** Server-Sent Events (SSE)
- **Email Processing:** Gmail IMAP with automated Looker report ingestion
- **MCP Integration:** Custom servers for inventory and shipments

### Frontend
- **Languages:** HTML5, CSS3, JavaScript (vanilla, no frameworks)
- **Architecture:** Progressive Web App (PWA)
- **State Management:** sessionStorage, localStorage, WebSocket sync
- **Responsive Design:** Mobile-first CSS Grid/Flexbox
- **Offline Support:** Service Workers for critical functionality

### Infrastructure
- **Server:** Linux (Ubuntu 20.04+)
- **Process Management:** PM2 with ecosystem configuration
- **SSL/TLS:** HTTPS with Let's Encrypt certificates
- **Reverse Proxy:** Nginx (recommended)
- **Monitoring:** PM2 monitoring and log aggregation

---

## Project Structure

```
stockroom-dashboard/
├── routes/                      # API endpoints
│   ├── auth-pg.js              # Authentication & user management
│   ├── gameplan.js             # Daily game plans & assignments
│   ├── shipments.js            # Shipment tracking & UPS integration
│   ├── lostPunch-pg.js         # Lost punch requests
│   ├── timeoff-pg.js           # Time off management
│   ├── closingDuties-pg.js     # Store closing tasks
│   ├── expenses.js             # Expense tracking
│   ├── awards.js               # Employee awards
│   ├── admin.js                # Administrative functions
│   ├── pickups.js              # Customer pickup management
│   ├── waitwhile.js            # WaitWhile integration
│   └── webhooks.js             # External webhook handlers
├── middleware/
│   └── auth-pg.js              # Authentication middleware
├── utils/                       # Shared utilities
│   ├── dal/                    # Data access layer (PostgreSQL)
│   ├── gmail-looker-fetcher.js # Email processing
│   ├── looker-data-processor.js # Report processing
│   ├── ups-client.js           # UPS API integration
│   ├── mcp-clients/           # MCP server clients
│   └── mailer.js               # Email sending
├── mcp-servers/                # Model Context Protocol servers
│   ├── stockroom-inventory/    # Inventory management MCP
│   ├── stockroom-shipments/    # Shipment tracking MCP
├── public/                     # Static web assets
│   ├── *.html                  # Page templates
│   ├── css/                    # Stylesheets
│   └── js/                     # Client-side JavaScript
├── models/                     # Data models & schemas
├── scripts/                    # Utility scripts
├── migrations/                 # Database migrations
├── tests/                      # Test suites
├── docs/                       # Documentation
├── data/                       # Runtime data (gitignored)
└── logs/                       # Application logs
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

### 4. MCP Integration
- Model Context Protocol servers for specialized operations
- Inventory management via `stockroom-inventory` MCP server
- Shipment tracking via `stockroom-shipments` MCP server

---

## Database Schema (PostgreSQL)

### Core Tables

#### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  store_id VARCHAR(10) DEFAULT 'SF',
  is_manager BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  can_edit_gameplan BOOLEAN DEFAULT false,
  can_manage_lost_punch BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT false,
  image_url VARCHAR(500),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### user_sessions
```sql
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### shipments
```sql
CREATE TABLE shipments (
  id SERIAL PRIMARY KEY,
  tracking_number VARCHAR(100) UNIQUE,
  status VARCHAR(50),
  carrier VARCHAR(50) DEFAULT 'UPS',
  ship_date DATE,
  estimated_delivery DATE,
  actual_delivery TIMESTAMP,
  recipient_name VARCHAR(255),
  recipient_address TEXT,
  weight DECIMAL(10,2),
  service_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
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
