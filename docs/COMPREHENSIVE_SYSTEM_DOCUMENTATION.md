# Stockroom Dashboard - Complete System Documentation

## System Overview

The Stockroom Dashboard is a comprehensive retail operations management system built for Suit Supply, integrating real-time inventory tracking, shipment management, employee scheduling, RFID location tracking, and multiple external service integrations.

### Core Features
- **Real-time Shipment Tracking**: UPS integration with automated email processing
- **RFID Location Tracking**: Zebra RFID system for inventory and asset management
- **Employee Management**: Time tracking, scheduling, and performance metrics
- **Gameplan Management**: Daily operational planning and goal tracking
- **Radio Communication**: Two-way radio monitoring and spectrum analysis
- **WaitWhile Integration**: Customer appointment and visit management
- **Manhattan Active® Integration**: Enterprise inventory and order management
- **PredictSpring Integration**: Demand forecasting and inventory optimization

## Architecture & Technology Stack

### Backend
- **Runtime**: Node.js with Express.js framework
- **Database**: PostgreSQL with connection pooling
- **Authentication**: Session-based with scrypt password hashing
- **Real-time Communication**: WebSocket for radio monitoring, Server-Sent Events (SSE) for updates
- **Process Management**: PM2 with ecosystem configuration
- **Email Processing**: Gmail IMAP integration with automated shipment capture

### Frontend
- **Framework**: Vanilla JavaScript with HTML5/CSS3
- **Real-time Updates**: WebSocket connections for live data
- **Responsive Design**: Mobile-first approach for iOS PWA compatibility

### External Integrations
- **UPS**: Shipment tracking and label generation
- **WaitWhile**: Customer appointment management
- **Manhattan Active®**: Enterprise inventory system
- **PredictSpring**: Demand forecasting
- **Gmail IMAP**: Automated email processing for shipments
- **Zebra RFID**: Hardware integration for location tracking

### Development Tools
- **MCP Servers**: Model Context Protocol servers for AI-assisted operations
- **Radio Services**: Python-based radio monitoring and spectrum analysis
- **Build Tools**: NPM scripts for deployment and maintenance

## Database Schema

### Core Tables

#### Users & Authentication
```sql
users (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(100) UNIQUE NOT NULL,
  login_alias VARCHAR(255),
  email VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  password_hash TEXT,
  image_url TEXT,
  is_manager BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  can_edit_gameplan BOOLEAN DEFAULT false,
  can_config_radio BOOLEAN DEFAULT false,
  can_manage_lost_punch BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

user_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(255) NOT NULL,
  changes JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
)

password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### Shipments & Inventory
```sql
shipments (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(255),
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  tracking_number VARCHAR(255),
  carrier VARCHAR(50) DEFAULT 'UPS',
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  ship_date DATE,
  delivery_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

shipment_items (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES shipments(id),
  product_id VARCHAR(255),
  product_name VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  location VARCHAR(255),
  scanned BOOLEAN DEFAULT false,
  scan_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
)

shipment_scan_events (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER REFERENCES shipments(id),
  item_id INTEGER REFERENCES shipment_items(id),
  rfid_tag VARCHAR(255),
  location VARCHAR(255),
  employee_id INTEGER REFERENCES users(id),
  scan_type VARCHAR(50),
  scan_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### RFID & Location Tracking
```sql
rfid_scans (
  id SERIAL PRIMARY KEY,
  rfid_tag VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  zone_code VARCHAR(50),
  employee_id INTEGER REFERENCES users(id),
  scan_type VARCHAR(50),
  product_data JSONB,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
)

store_zones (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(50) UNIQUE NOT NULL,
  zone_name VARCHAR(255) NOT NULL,
  zone_type VARCHAR(50) NOT NULL,
  description TEXT,
  coordinates JSONB,
  rack_positions TEXT[],
  capacity INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
)
```

#### WaitWhile Integration
```sql
waitwhile_customers (
  id SERIAL PRIMARY KEY,
  waitwhile_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  full_name VARCHAR(255),
  customer_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

waitwhile_appointments (
  id SERIAL PRIMARY KEY,
  waitwhile_id VARCHAR(255) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES waitwhile_customers(id),
  customer_email VARCHAR(255),
  service_name VARCHAR(255),
  appointment_time TIMESTAMP,
  duration_minutes INTEGER,
  status VARCHAR(50),
  notes TEXT,
  appointment_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

## API Endpoints & Routes

### Authentication Routes (`/api/auth/`)

#### POST `/api/auth/login`
**Purpose**: User authentication
**Body**: `{ employeeId, password, remember }`
**Response**: `{ success: true, user: {...} }`

#### POST `/api/auth/logout`
**Purpose**: Session termination
**Response**: `{ success: true }`

#### GET `/api/auth/check`
**Purpose**: Session validation
**Response**: `{ authenticated: true, user: {...} }`

#### POST `/api/auth/password-reset/request`
**Purpose**: Initiate password reset
**Body**: `{ login }`
**Response**: Generic success message

#### POST `/api/auth/password-reset/confirm`
**Purpose**: Complete password reset
**Body**: `{ token, password, email?, phone?, rememberDevice }`
**Response**: `{ success: true, user: {...}, redirectTo }`

### Shipments API (`/api/shipments/`)

#### GET `/api/shipments`
**Purpose**: List shipments with filtering
**Query Params**: `status`, `customer_email`, `order_number`, `tracking_number`, `all`, `since`, `allow_non_1z`
**Response**: `{ shipments: [...] }`

#### GET `/api/shipments/:id`
**Purpose**: Get shipment details with items and scans
**Response**: `{ shipment: {...}, items: [...], scans: [...] }`

#### GET `/api/shipments/:id/tracking`
**Purpose**: Get UPS tracking information
**Response**: UPS tracking data

#### POST `/api/shipments`
**Purpose**: Create new shipment
**Body**: Shipment data with items
**Response**: Created shipment object

#### PUT `/api/shipments/:id`
**Purpose**: Update shipment
**Body**: Updated shipment data
**Response**: Updated shipment object

#### DELETE `/api/shipments/:id`
**Purpose**: Delete shipment
**Response**: Success confirmation

### Gameplan API (`/api/gameplan/`)

#### GET `/api/gameplan/daily`
**Purpose**: Get daily gameplan data
**Query Params**: `date`, `includeMetrics`
**Response**: Daily gameplan with metrics

#### POST `/api/gameplan/daily`
**Purpose**: Update daily gameplan
**Body**: Gameplan data
**Response**: Updated gameplan

#### GET `/api/gameplan/templates`
**Purpose**: Get gameplan templates
**Response**: Available templates

#### GET `/api/gameplan/metrics`
**Purpose**: Get performance metrics
**Response**: Metrics data

### RFID API (`/api/rfid/`)

#### GET `/api/rfid/scans`
**Purpose**: Get RFID scan history
**Query Params**: `tag`, `location`, `since`, `limit`
**Response**: `{ scans: [...] }`

#### POST `/api/rfid/scan`
**Purpose**: Record RFID scan
**Body**: `{ rfid_tag, location, zone_code, scan_type, product_data }`
**Response**: Scan record

#### GET `/api/rfid/locations`
**Purpose**: Get current RFID locations
**Response**: Current tag locations

### Radio API (`/api/radio/`)

#### GET `/api/radio/status`
**Purpose**: Get radio system status
**Response**: Radio configuration and status

#### POST `/api/radio/config`
**Purpose**: Update radio configuration
**Body**: Radio settings
**Response**: Updated configuration

#### GET `/api/radio/transcripts`
**Purpose**: Get radio transcripts
**Query Params**: `date`, `channel`, `limit`
**Response**: `{ transcripts: [...] }`

### Admin API (`/api/admin/`)

#### GET `/api/admin/users`
**Purpose**: List all users
**Response**: `{ users: [...] }`

#### POST `/api/admin/users`
**Purpose**: Create new user
**Body**: User data
**Response**: Created user

#### PUT `/api/admin/users/:id`
**Purpose**: Update user
**Body**: Updated user data
**Response**: Updated user

#### GET `/api/admin/audit`
**Purpose**: Get audit logs
**Query Params**: `user_id`, `action`, `since`, `limit`
**Response**: `{ logs: [...] }`

## Authentication & Security

### Session Management
- **Session Storage**: PostgreSQL `user_sessions` table
- **Session Expiry**: 24 hours (or 30 days with "remember me")
- **Cookie Security**: `httpOnly`, `secure`, `sameSite: 'lax'`
- **Session Validation**: Automatic cleanup of expired sessions

### Password Security
- **Hashing Algorithm**: scrypt with 16-byte salt, 64-byte derived key
- **Password Requirements**: Minimum 4 characters (configurable)
- **Reset Process**: Email-based with secure tokens (30-minute expiry)

### Role-Based Access Control
```javascript
const roles = {
  'SA': 'Style Advisor',
  'Tailor': 'Tailor',
  'BOH': 'Back of House',
  'Manager': 'Manager',
  'Admin': 'Administrator'
};

const permissions = {
  canEditGameplan: ['Manager', 'Admin'],
  canConfigRadio: ['Admin'],
  canManageLostPunch: ['Manager', 'Admin'],
  isManager: ['Manager', 'Admin'],
  isAdmin: ['Admin']
};
```

### Security Middleware
- **CSRF Protection**: Double-submit cookie pattern
- **HTTPS Enforcement**: Automatic redirect to HTTPS
- **Input Validation**: Server-side validation on all inputs
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Content Security Policy headers

## Configuration Settings

### Environment Variables

#### Core Application
```bash
PORT=3000                              # Server port
NODE_ENV=production                    # Environment mode
TZ=America/Los_Angeles                 # Timezone
APP_BASE_URL=https://stockroom.suitsd.com  # Base URL for redirects
```

#### Database
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/stockroom
PG_CONNECTION_STRING=postgresql://user:pass@localhost:5432/stockroom
```

#### Authentication
```bash
DEV_AUTH_BYPASS=false                  # Development auth bypass
DEV_AUTH_USER_EMAIL=                   # Development user email
```

#### Email Integration
```bash
GMAIL_USER=                            # Gmail account for IMAP
GMAIL_APP_PASSWORD=                    # Gmail app password
UNIFIED_GMAIL_CRON=*/30 * * * *         # Email processing schedule
```

#### Radio System
```bash
RADIO_MONITOR_UDP_HOST=127.0.0.1
RADIO_MONITOR_UDP_PORT=7355
RADIO_MONITOR_SAMPLE_RATE=24000
RADIO_SPECTRUM_UDP_HOST=127.0.0.1
RADIO_SPECTRUM_UDP_PORT=7356
```

#### External Services
```bash
UPS_ACCESS_KEY=                        # UPS API credentials
UPS_USER_ID=
UPS_PASSWORD=
WAITWHILE_API_KEY=                     # WaitWhile API key
MANHATTAN_API_KEY=                     # Manhattan Active® API
PREDICTSPRING_API_KEY=                 # PredictSpring API
```

### File Paths & Directories

#### Application Structure
```
/var/www/stockroom-dashboard/          # Application root
├── server.js                          # Main server file
├── package.json                       # Dependencies and scripts
├── ecosystem.config.json              # PM2 configuration
├── public/                            # Static web assets
├── routes/                            # API route handlers
├── middleware/                        # Express middleware
├── utils/                             # Utility functions
├── models/                            # Data models
├── db/                                # Database schemas and migrations
├── mcp-servers/                       # MCP server implementations
├── radio/                             # Radio service scripts
├── scripts/                           # Maintenance scripts
├── tests/                             # Test files
├── ssl/                               # SSL certificates
├── logs/                              # Application logs
└── config/                            # Configuration files
```

#### Data Directories
```
/var/lib/stockroom-dashboard/
├── data/                              # Application data files
│   ├── users.json                     # User data (legacy)
│   ├── employees.json                 # Employee data (legacy)
│   ├── shipments.json                 # Shipment data (legacy)
│   ├── gameplan/                      # Daily gameplan files
│   ├── metrics/                       # Performance metrics
│   └── radio/                         # Radio configuration
└── files/                             # User-uploaded files
```

## Business Logic & Workflows

### Shipment Workflow

1. **Request Phase**
   - Customer places order via e-commerce or in-store
   - Order data synced from Manhattan Active®
   - Shipment record created in system

2. **Picking Phase**
   - Items located using RFID scanning
   - Items moved to packing area
   - Scan events logged for tracking

3. **Packing Phase**
   - Items verified against order
   - UPS labels generated
   - Package prepared for shipping

4. **Shipping Phase**
   - Package handed to UPS
   - Tracking number recorded
   - Email notifications sent

5. **Delivery Phase**
   - UPS tracking monitored
   - Delivery confirmation received
   - Customer notified

### RFID Location Tracking

#### Zone Definitions
- **COG**: Center of Gravity (Main Warehouse)
- **BOH**: Back of House (Production Area)
- **RACK**: Pickup Rack (Customer Staging)
- **FITTING**: Fitting Rooms
- **FLOOR**: Sales Floor

#### Scan Types
- `location_update`: Item moved to new zone
- `inventory_check`: Periodic inventory verification
- `pickup_ready`: Item staged for customer pickup
- `quality_check`: Quality control scan

### Gameplan Management

#### Daily Goals
- **Sales Targets**: Revenue and transaction goals
- **Productivity Metrics**: Items processed per hour
- **Quality Standards**: Accuracy and customer satisfaction
- **Team Objectives**: Department-specific goals

#### Performance Tracking
- **Real-time Metrics**: Current day progress
- **Historical Analysis**: Trend identification
- **Goal Achievement**: Target vs actual comparison
- **Employee Performance**: Individual contribution tracking

## External Integrations

### UPS Integration
- **API Endpoints**: Tracking, label generation, rate shopping
- **Email Processing**: Automated shipment capture from UPS emails
- **Webhook Support**: Real-time delivery updates
- **Label Printing**: Direct thermal printer integration

### WaitWhile Integration
- **Customer Sync**: Automatic customer data synchronization
- **Appointment Tracking**: Real-time appointment status updates
- **Service Management**: Appointment type configuration
- **Reporting**: Visit analytics and customer insights

### Manhattan Active® Integration
- **Inventory Sync**: Real-time inventory level updates
- **Order Management**: Order status and fulfillment tracking
- **Product Data**: Item master and pricing information
- **Reporting**: Sales and inventory analytics

### Gmail IMAP Integration
- **Automated Processing**: Shipment emails parsed automatically
- **Tracking Extraction**: UPS tracking numbers captured
- **Status Updates**: Delivery confirmations processed
- **Error Handling**: Failed parsing logged for manual review

### Radio System Integration
- **Audio Monitoring**: Live radio channel streaming
- **Spectrum Analysis**: Frequency monitoring and analysis
- **Recording**: Automated audio recording and transcription
- **Alert System**: Keyword detection and notifications

## Process Management

### PM2 Configuration

#### Main Application
```json
{
  "name": "stockroom-dashboard",
  "script": "server.js",
  "instances": 1,
  "autorestart": true,
  "max_memory_restart": "500M",
  "env": {
    "NODE_ENV": "production",
    "TZ": "America/Los_Angeles"
  }
}
```

#### Radio Services
```json
{
  "name": "radio",
  "script": "radio/radio_service.py",
  "interpreter": "/var/www/stockroom-dashboard/.venv/bin/python",
  "autorestart": true,
  "out_file": "/var/www/stockroom-dashboard/logs/radio.log"
}
```

#### Spectrum Analysis
```json
{
  "name": "radio-spectrum",
  "script": "radio/spectrum_service.py",
  "autostart": false,
  "restart_delay": 2000,
  "out_file": "/var/www/stockroom-dashboard/logs/radio-spectrum.log"
}
```

### Scheduled Tasks

#### Email Processing
- **Cron Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Function**: Process new emails for shipment updates
- **Error Handling**: Automatic retry with exponential backoff

#### Report Generation
- **Cron Schedule**: Every 4 hours (`0 */4 * * *`)
- **Function**: Generate and email daily performance reports
- **Distribution**: Management team and key stakeholders

#### Data Synchronization
- **WaitWhile Sync**: Real-time via webhooks
- **Manhattan Sync**: Hourly batch updates
- **RFID Sync**: Continuous real-time updates

## Deployment & Operations

### Server Setup
```bash
# Install dependencies
npm install

# Database setup
psql -d stockroom < db/schema.sql

# PM2 deployment
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

### SSL Configuration
- **Certificate Location**: `/var/www/stockroom-dashboard/ssl/`
- **Auto-renewal**: Let's Encrypt with Certbot
- **HTTP Redirect**: Automatic HTTPS enforcement

### Backup Strategy
- **Database**: Daily PostgreSQL dumps
- **Application Data**: File system snapshots
- **Logs**: Rotated and archived weekly
- **Offsite Storage**: Encrypted backups to cloud storage

### Monitoring & Alerting
- **Application Health**: PM2 monitoring
- **Database Connectivity**: Connection pool monitoring
- **External Service Status**: Integration health checks
- **Performance Metrics**: Response time and error rate tracking

### Troubleshooting

#### Common Issues
1. **Database Connection Failures**
   - Check PostgreSQL service status
   - Verify connection string and credentials
   - Review connection pool configuration

2. **Authentication Problems**
   - Clear browser cookies
   - Check session table for expired sessions
   - Verify password hashing configuration

3. **Real-time Updates Not Working**
   - Check WebSocket connections
   - Verify SSE endpoint accessibility
   - Review network connectivity

4. **External API Failures**
   - Check API credentials and endpoints
   - Review rate limiting and quotas
   - Verify network connectivity to external services

#### Log Locations
- **Application Logs**: `/var/www/stockroom-dashboard/logs/`
- **PM2 Logs**: `~/.pm2/logs/`
- **Database Logs**: PostgreSQL log directory
- **Radio Logs**: `/var/www/stockroom-dashboard/logs/radio-*.log`

This comprehensive documentation covers all aspects of the Stockroom Dashboard system. Use this reference to understand system architecture, troubleshoot issues, plan updates, and ensure operational continuity.</content>
<parameter name="filePath">/var/www/stockroom-dashboard/COMPREHENSIVE_SYSTEM_DOCUMENTATION.md