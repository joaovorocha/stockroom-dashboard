# Enterprise Scaling Plan
## Multi-Store System with 800-1000 Concurrent Users

**Project**: Stockroom Dashboard Enterprise Edition  
**Target**: Support multiple stores with centralized management  
**Scale**: 800-1000 concurrent users  
**Timeline**: Phased rollout with foundation in place before production deployment

---

## Executive Summary

This plan outlines the architectural changes, database optimizations, and best practices needed to scale the current single-store Stockroom Dashboard to an enterprise multi-store system supporting 800-1000 concurrent users.

**Key Deliverables:**
- Multi-store architecture with store selection
- User photo management at scale
- Database optimization for high concurrency
- Connection pooling and caching strategy
- Separate development branch for safe iteration

---

## Current System Assessment

### ✅ Strengths
- **Modern stack**: Express.js + PostgreSQL + Redis
- **Connection pooling**: Already using pg Pool (max: 20)
- **Session management**: Redis-based sessions (scalable)
- **Real-time updates**: Socket.IO for live data
- **Modular routing**: Clean separation of concerns

### ⚠️ Areas Requiring Enhancement
- **Single-store architecture**: No store selection/filtering
- **Fixed connection pool**: max: 20 connections (too small for 1000 users)
- **No database indexing strategy**: Missing indexes for multi-store queries
- **Image storage**: No CDN or optimized storage for user photos
- **No load balancing**: Single Node.js process
- **Limited caching**: Basic Redis caching implemented

---

## Phase 1: Foundation & Database Architecture

### 1.1 Multi-Store Data Model

**Add `stores` table:**
```sql
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  store_code VARCHAR(50) UNIQUE NOT NULL,  -- 'SF', 'NYC', 'LA', 'CHI'
  store_name VARCHAR(255) NOT NULL,        -- 'San Francisco - Union Square'
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  country VARCHAR(50),
  timezone VARCHAR(100) DEFAULT 'America/Los_Angeles',
  currency VARCHAR(10) DEFAULT 'USD',
  active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stores_code ON stores(store_code);
CREATE INDEX idx_stores_active ON stores(active);
```

**Add `store_id` to ALL tables:**
```sql
-- Users table enhancement
ALTER TABLE users ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE users ADD COLUMN stores_access INTEGER[] DEFAULT '{}';  -- Array of store IDs
ALTER TABLE users ADD COLUMN primary_store_id INTEGER REFERENCES stores(id);

CREATE INDEX idx_users_store ON users(store_id);
CREATE INDEX idx_users_primary_store ON users(primary_store_id);

-- Add to all operational tables
ALTER TABLE daily_scan_results ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE shipments ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE closing_duties ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE lost_punch_requests ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE timeoff_requests ADD COLUMN store_id INTEGER REFERENCES stores(id);
ALTER TABLE expenses ADD COLUMN store_id INTEGER REFERENCES stores(id);

-- Create indexes for EVERY table with store_id
CREATE INDEX idx_daily_scan_store ON daily_scan_results(store_id);
CREATE INDEX idx_shipments_store ON shipments(store_id);
CREATE INDEX idx_closing_store ON closing_duties(store_id);
CREATE INDEX idx_lost_punch_store ON lost_punch_requests(store_id);
CREATE INDEX idx_timeoff_store ON timeoff_requests(store_id);
CREATE INDEX idx_expenses_store ON expenses(store_id);
```

### 1.2 User Photo Management at Scale

**Image Storage Strategy:**
```sql
-- Users table photo enhancement
ALTER TABLE users ADD COLUMN image_url VARCHAR(500);
ALTER TABLE users ADD COLUMN image_thumbnail_url VARCHAR(500);
ALTER TABLE users ADD COLUMN image_storage_provider VARCHAR(50) DEFAULT 'local';
ALTER TABLE users ADD COLUMN image_uploaded_at TIMESTAMP;

CREATE INDEX idx_users_image ON users(image_url) WHERE image_url IS NOT NULL;
```

**Storage Options (Recommended Order):**

1. **Option A: S3-Compatible Storage (BEST for scale)**
   - Use AWS S3 or Backblaze B2
   - CloudFront CDN for fast delivery
   - Automatic image optimization
   - Cost: ~$5-20/month for 1000 users

2. **Option B: Local + Nginx CDN (GOOD)**
   - Store in `/public/uploads/photos/`
   - Nginx serves static files directly
   - Image optimization with Sharp.js
   - Cost: Free, but limited scalability

3. **Option C: Database BYTEA (NOT RECOMMENDED)**
   - Stores binary in PostgreSQL
   - Slow for 1000 users
   - Bloats database size

**Implementation:**
```javascript
// utils/image-upload.js
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

// Local storage (can be swapped for S3)
const storage = multer.diskStorage({
  destination: './public/uploads/photos/',
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${req.user.id}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  }
});

// Generate thumbnail
async function createThumbnail(imagePath) {
  const thumbnailPath = imagePath.replace(/(\.[^.]+)$/, '-thumb$1');
  await sharp(imagePath)
    .resize(150, 150, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);
  return thumbnailPath;
}

module.exports = { upload, createThumbnail };
```

### 1.3 Database Connection Pooling Optimization

**Current pool config** (utils/dal/pg.js):
```javascript
poolConfig = {
  database: 'stockroom_dashboard',
  user: 'suit',
  max: 20,  // ⚠️ TOO SMALL for 1000 users
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

**Recommended pool config for scale:**
```javascript
poolConfig = {
  database: process.env.DB_NAME || 'stockroom_dashboard',
  user: process.env.DB_USER || 'suit',
  
  // Connection pool sizing
  max: 100,  // Maximum connections (tune based on load testing)
  min: 10,   // Minimum idle connections
  
  // Timeouts
  idleTimeoutMillis: 60000,      // 60s - Keep connections alive longer
  connectionTimeoutMillis: 5000,  // 5s - Allow more time to acquire
  
  // Health checks
  allowExitOnIdle: false,
  
  // Statement timeout (prevent long queries)
  statement_timeout: 30000,  // 30 seconds max per query
};
```

**PostgreSQL server configuration** (`postgresql.conf`):
```conf
# Increase max connections
max_connections = 200

# Memory settings for high concurrency
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB

# Performance
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200

# Logging for optimization
log_min_duration_statement = 1000  # Log queries > 1s
log_connections = on
log_disconnections = on
```

---

## Phase 2: Performance Optimization

### 2.1 Essential Database Indexes

**Create comprehensive indexes for common queries:**

```sql
-- Users table (most frequently queried)
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
CREATE INDEX idx_users_role_active ON users(role, active) WHERE active = true;
CREATE INDEX idx_users_store_role ON users(store_id, role);
CREATE INDEX idx_users_manager ON users(is_manager) WHERE is_manager = true;

-- Daily scans (heavy read/write)
CREATE INDEX idx_scans_date_store ON daily_scan_results(scan_date, store_id);
CREATE INDEX idx_scans_counted_by ON daily_scan_results(counted_by);
CREATE INDEX idx_scans_created_at ON daily_scan_results(created_at DESC);

-- Shipments
CREATE INDEX idx_shipments_date_store ON shipments(date, store_id);
CREATE INDEX idx_shipments_received_at ON shipments(received_at DESC) WHERE received_at IS NOT NULL;

-- Time-series data (partition by month for scale)
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_user_sessions_created ON user_sessions_log(created_at DESC);
```

### 2.2 Query Optimization

**Use prepared statements and query caching:**

```javascript
// utils/dal/cached-queries.js
const { query } = require('./pg');
const { getCache, setCache } = require('../cache');

async function getCachedUsers(storeId, ttl = 300) {
  const cacheKey = `users:store:${storeId}`;
  
  // Check cache first
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Query database
  const result = await query(
    'SELECT * FROM users WHERE store_id = $1 AND active = true ORDER BY name',
    [storeId]
  );
  
  // Cache for 5 minutes
  await setCache(cacheKey, JSON.stringify(result.rows), ttl);
  
  return result.rows;
}

// Invalidate cache on updates
async function updateUser(userId, updates) {
  const user = await query('SELECT store_id FROM users WHERE id = $1', [userId]);
  
  // Update database
  await query('UPDATE users SET ... WHERE id = $1', [userId]);
  
  // Clear cache
  const cacheKey = `users:store:${user.rows[0].store_id}`;
  await delCache(cacheKey);
}
```

### 2.3 Implement Table Partitioning (for large datasets)

**Partition time-series data by month:**

```sql
-- Example: Partition daily_scan_results by month
CREATE TABLE daily_scan_results_2026_01 PARTITION OF daily_scan_results
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE daily_scan_results_2026_02 PARTITION OF daily_scan_results
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Automate partition creation with function
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name TEXT, year INT, month INT)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  partition_name := table_name || '_' || year || '_' || LPAD(month::TEXT, 2, '0');
  start_date := (year || '-' || month || '-01')::DATE;
  end_date := start_date + INTERVAL '1 month';
  
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name, table_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

---

## Phase 3: Application Architecture

### 3.1 Multi-Store Context Middleware

**Add store context to all requests:**

```javascript
// middleware/store-context.js
async function storeContext(req, res, next) {
  if (!req.user) return next();
  
  // Get selected store from session or cookie
  let selectedStoreId = req.session.selectedStoreId || req.cookies.selectedStore;
  
  // If no selection, use user's primary store
  if (!selectedStoreId) {
    selectedStoreId = req.user.primary_store_id;
  }
  
  // Verify user has access to this store
  const hasAccess = req.user.stores_access?.includes(selectedStoreId) || 
                    req.user.isAdmin;
  
  if (!hasAccess) {
    return res.status(403).json({ error: 'No access to selected store' });
  }
  
  // Add to request context
  req.storeId = selectedStoreId;
  req.userStores = req.user.stores_access || [req.user.primary_store_id];
  
  next();
}

module.exports = storeContext;
```

**Update server.js:**
```javascript
const storeContext = require('./middleware/store-context');

// Apply after auth middleware
app.use(authMiddleware);
app.use(storeContext);

// All routes now have req.storeId and req.userStores
```

### 3.2 Store Selector UI Component

**Add store selector to admin console:**

```javascript
// public/js/store-selector.js
async function loadStoreSelector() {
  const stores = await fetch('/api/stores/accessible').then(r => r.json());
  const currentStore = await fetch('/api/stores/current').then(r => r.json());
  
  const selector = document.createElement('select');
  selector.id = 'store-selector';
  selector.className = 'store-selector';
  
  stores.forEach(store => {
    const option = document.createElement('option');
    option.value = store.id;
    option.textContent = `${store.store_name} (${store.store_code})`;
    option.selected = store.id === currentStore.id;
    selector.appendChild(option);
  });
  
  selector.addEventListener('change', async (e) => {
    await fetch('/api/stores/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: e.target.value })
    });
    window.location.reload();
  });
  
  document.querySelector('.header').prepend(selector);
}
```

### 3.3 Load Balancing with PM2 Cluster Mode

**Update ecosystem.config.json:**

```json
{
  "apps": [{
    "name": "stockroom-dashboard",
    "script": "server.js",
    "instances": 4,  // Use 4 CPU cores
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3000
    },
    "max_memory_restart": "500M",
    "error_file": "./logs/pm2-error.log",
    "out_file": "./logs/pm2-out.log",
    "merge_logs": true,
    "autorestart": true,
    "watch": false,
    "max_restarts": 10,
    "min_uptime": "10s"
  }]
}
```

---

## Phase 4: Testing & Monitoring

### 4.1 Load Testing Strategy

**Use Artillery.io for load testing:**

```yaml
# load-test.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users/sec
      name: "Warm up"
    - duration: 300
      arrivalRate: 50  # 50 users/sec (3000 users/min)
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100  # Spike to 100 users/sec
      name: "Stress test"

scenarios:
  - name: "User login and dashboard"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "test{{ $randomNumber() }}@suitsupply.com"
            password: "testpass"
      - get:
          url: "/api/users"
      - get:
          url: "/api/shipments"
      - get:
          url: "/api/gameplan/today"
```

**Run tests:**
```bash
npm install -g artillery
artillery run load-test.yml
```

### 4.2 Performance Monitoring

**Add New Relic or DataDog APM:**

```javascript
// Add at top of server.js
if (process.env.NODE_ENV === 'production') {
  require('newrelic');  // or 'dd-trace/init' for DataDog
}
```

**Custom metrics:**
```javascript
// middleware/metrics.js
const responseTime = require('response-time');

app.use(responseTime((req, res, time) => {
  const metric = {
    method: req.method,
    path: req.route?.path || req.path,
    status: res.statusCode,
    duration: time,
    store_id: req.storeId,
    timestamp: new Date()
  };
  
  // Log slow queries
  if (time > 1000) {
    console.warn('Slow request:', metric);
  }
  
  // Store in metrics table for analysis
  recordMetric(metric);
}));
```

---

## Phase 5: Deployment Strategy

### 5.1 Create Development Branch

**Create enterprise branch:**
```bash
cd /var/www/stockroom-dashboard

# Create and checkout new branch
git checkout -b enterprise-multistore

# Tag current production state
git tag -a v1.0-single-store -m "Production baseline before multi-store"

# Push branch
git push origin enterprise-multistore
git push origin v1.0-single-store
```

### 5.2 Feature Flags

**Implement feature flags for gradual rollout:**

```javascript
// config/features.js
const features = {
  multiStore: process.env.FEATURE_MULTISTORE === 'true',
  photoUpload: process.env.FEATURE_PHOTOS === 'true',
  advancedMetrics: process.env.FEATURE_METRICS === 'true'
};

function isEnabled(feature) {
  return features[feature] || false;
}

module.exports = { isEnabled };
```

**Usage:**
```javascript
const { isEnabled } = require('../config/features');

if (isEnabled('multiStore')) {
  // Show store selector
  app.use(storeContext);
}
```

### 5.3 Database Migration Strategy

**Create migration files:**

```bash
mkdir -p migrations/enterprise
```

**migrations/enterprise/001_add_stores_table.sql:**
```sql
-- Run with: psql -U suit -d stockroom_dashboard -f migrations/enterprise/001_add_stores_table.sql

BEGIN;

CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  store_code VARCHAR(50) UNIQUE NOT NULL,
  store_name VARCHAR(255) NOT NULL,
  -- ... rest of schema
);

-- Seed default store
INSERT INTO stores (store_code, store_name, city, state)
VALUES ('SF', 'San Francisco - Union Square', 'San Francisco', 'CA');

COMMIT;
```

**Run migrations in order:**
```bash
for file in migrations/enterprise/*.sql; do
  echo "Running $file..."
  psql -U suit -d stockroom_dashboard -f "$file"
done
```

---

## Phase 6: Security Best Practices

### 6.1 Row-Level Security (RLS)

**Implement PostgreSQL RLS for multi-store isolation:**

```sql
-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see users in their accessible stores
CREATE POLICY users_store_access ON users
  FOR SELECT
  USING (
    store_id = ANY(current_setting('app.user_stores')::INTEGER[])
    OR current_setting('app.is_admin')::BOOLEAN = true
  );

-- Set context in application
-- In middleware:
await client.query(`SET app.user_stores = '{${req.userStores.join(',')}}'`);
await client.query(`SET app.is_admin = ${req.user.isAdmin}`);
```

### 6.2 API Rate Limiting

**Implement rate limiting per user/store:**

```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: async (req) => {
    // Different limits based on role
    if (req.user?.isAdmin) return 1000;
    if (req.user?.isManager) return 500;
    return 200;
  },
  keyGenerator: (req) => {
    return `${req.user?.id || req.ip}:${req.storeId || 'global'}`;
  }
});

app.use('/api/', limiter);
```

---

## Implementation Checklist

### Foundation (Week 1-2)
- [ ] Create `enterprise-multistore` branch
- [ ] Add `stores` table to database
- [ ] Add `store_id` to all operational tables
- [ ] Create database indexes
- [ ] Implement store context middleware
- [ ] Update connection pool configuration

### Core Features (Week 3-4)
- [ ] Build store selector UI
- [ ] Implement photo upload system
- [ ] Add caching layer for users/stores
- [ ] Update all API routes to filter by store
- [ ] Add store management admin page

### Performance (Week 5-6)
- [ ] Optimize slow queries (use EXPLAIN ANALYZE)
- [ ] Implement query caching
- [ ] Set up PM2 cluster mode
- [ ] Configure load balancer (Nginx)
- [ ] Run load tests with Artillery

### Testing (Week 7)
- [ ] Load test with 100 concurrent users
- [ ] Load test with 500 concurrent users
- [ ] Load test with 1000 concurrent users
- [ ] Fix performance bottlenecks
- [ ] Document optimization findings

### Production Prep (Week 8)
- [ ] Set up monitoring (New Relic/DataDog)
- [ ] Configure alerts for high latency
- [ ] Create runbook for operations
- [ ] Train team on new features
- [ ] Plan phased rollout

---

## Cost Estimates

### Infrastructure (Monthly)
- **Database**: PostgreSQL on managed service (AWS RDS) - $100-200/mo
- **Image Storage**: S3 + CloudFront CDN - $10-30/mo
- **Redis Cache**: Managed Redis (AWS ElastiCache) - $50-100/mo
- **Monitoring**: New Relic or DataDog - $100-200/mo
- **Load Balancer**: Nginx on server or AWS ALB - $20-50/mo

**Total**: ~$280-580/month for 1000 users

### Development Time
- **Database architecture**: 2 weeks
- **Multi-store UI/UX**: 2 weeks
- **Photo management**: 1 week
- **Performance optimization**: 2 weeks
- **Testing & deployment**: 1 week

**Total**: 8 weeks with 1 developer

---

## Success Metrics

Track these KPIs to measure success:

1. **Performance**
   - Page load time < 2 seconds (p95)
   - API response time < 500ms (p95)
   - Database query time < 100ms (p95)

2. **Scalability**
   - Support 1000 concurrent users
   - Handle 10,000 requests/minute
   - 99.9% uptime

3. **User Experience**
   - Store switching < 1 second
   - Photo upload < 3 seconds
   - Zero data leakage between stores

---

## Next Steps

1. **Review this plan** with your boss and get approval
2. **Create the enterprise branch** to start development
3. **Set up a staging environment** identical to production
4. **Begin with Phase 1** (database foundation)
5. **Schedule weekly demos** to show progress

**Would you like me to:**
- Create the enterprise branch now?
- Generate the migration SQL files?
- Build the store selector UI component?
- Set up load testing infrastructure?

Let me know which part you'd like to tackle first!
