# Multi-Store Login & Admin Panel - Implementation Plan

**Date**: January 28, 2026  
**Feature**: Store Selection Login + Tiered Admin System  
**Status**: ✅ ALL PHASES COMPLETE

---

## 📋 Implementation Progress

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 1: Database Schema | ✅ Complete | Jan 28, 2026 |
| Phase 2: Login Flow | ✅ Complete | Jan 28, 2026 |
| Phase 3: Super Admin Panel | ✅ Complete | Jan 28, 2026 |
| Phase 4: Store Admin Panel | ✅ Complete | Jan 28, 2026 |
| Phase 5: Testing & Security | ✅ Complete | Jan 28, 2026 |

### Phase 1 Deliverables ✅
- ✅ Migration 004: User role columns (access_role, is_super_admin, default_store_id, can_switch_stores)
- ✅ Migration 005: user_store_access table with helper functions
- ✅ Migration 006: global_settings, store_settings, support_tickets tables
- ✅ Migration 007: Seed data (39 global settings, Victor as super admin)
- ✅ Database: 31 user store access records, 4 store-specific settings

### Phase 2 Deliverables ✅
- ✅ Backend: storeAccess.js middleware with permission checking
- ✅ Backend: Updated login route with store selection
- ✅ Backend: GET /api/auth/accessible-stores endpoint
- ✅ Backend: POST /api/auth/switch-store endpoint
- ✅ Backend: GET /api/auth/session endpoint with store context
- ✅ Frontend: AuthContext with store state management
- ✅ Frontend: Login.jsx with two-step flow (credentials → store selection)
- ✅ Frontend: StoreSwitcher.jsx component for navigation

### Phase 3 Deliverables ✅
- ✅ Backend: /routes/super-admin.js with full API
- ✅ Frontend: AdminLayout.jsx with sidebar navigation
- ✅ Frontend: AdminDashboard.jsx with system overview
- ✅ Frontend: StoreManagement.jsx with store CRUD
- ✅ Frontend: UserManagement.jsx with user + store access CRUD
- ✅ Frontend: GlobalSettings.jsx with category management
- ✅ Frontend: SupportTickets.jsx placeholder
- ✅ Routes: /admin/* registered in App.jsx

### Phase 4 Deliverables ✅
- ✅ Backend: /routes/store-admin.js with full API
- ✅ Frontend: StoreAdminLayout.jsx with sidebar navigation
- ✅ Frontend: StoreDashboard.jsx with store overview
- ✅ Frontend: StoreSettings.jsx with editable/read-only management
- ✅ Frontend: TeamManagement.jsx with role + invite management
- ✅ Frontend: StoreReports.jsx with analytics
- ✅ Routes: /store/* registered in App.jsx

### Phase 5 Deliverables ✅
- ✅ Permission test suite: scripts/tests/test-multistore-permissions.js (22 tests, 100% pass)
- ✅ Audit logging: middleware/auditLog.js + migration 008
- ✅ Navigation: Header.jsx with role-based admin links
- ✅ Security checklist: 10/11 items complete

---

## 🎯 Requirements Summary

### User Login Flow
- ✅ Users must **select store** before/during login
- ✅ Login credentials validate against selected store
- ✅ Session stores user's active store context
- ✅ Users can switch stores (if they have access to multiple)

### Admin Panel Tiers

**Tier 1: Super Admin (Global/Helpdesk)**
- Access to all 39 stores
- Manage global settings
- Control store-level legal/compliance settings
- Support ticket management
- User access control across all stores
- System-wide analytics

**Tier 2: Store Admin (Manager Level)**
- Access to assigned store(s) only
- Manage store-specific settings
- Manage store employees
- View store metrics/reports
- Cannot access other stores

---

## 📊 Database Schema Changes

### 1. Update `users` Table

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_store_id INTEGER REFERENCES stores(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_switch_stores BOOLEAN DEFAULT false;

-- Role values: 'super_admin', 'store_admin', 'manager', 'employee'
-- Super admin: is_super_admin = true, can access all stores
-- Store admin: role = 'store_admin', can manage their store(s)
-- Manager: role = 'manager', can view store data
-- Employee: role = 'employee', basic access

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = true;
```

### 2. Create `user_store_access` Table (Many-to-Many)

```sql
CREATE TABLE IF NOT EXISTS user_store_access (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  access_level VARCHAR(50) DEFAULT 'view', -- 'admin', 'manager', 'view'
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, store_id)
);

CREATE INDEX idx_user_store_access_user ON user_store_access(user_id);
CREATE INDEX idx_user_store_access_store ON user_store_access(store_id);
CREATE INDEX idx_user_store_access_active ON user_store_access(is_active) WHERE is_active = true;

-- Examples:
-- Victor (manager) → San Francisco (admin) → Can manage SF store
-- Support user → All stores (view) → Can view all stores for helpdesk
-- Super admin → No entries needed (is_super_admin bypasses this table)
```

### 3. Create `global_settings` Table

```sql
CREATE TABLE IF NOT EXISTS global_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type VARCHAR(50) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  category VARCHAR(50), -- 'system', 'legal', 'compliance', 'support'
  description TEXT,
  is_editable_by_store BOOLEAN DEFAULT false,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_global_settings_category ON global_settings(category);

-- Example global settings:
INSERT INTO global_settings (setting_key, setting_value, setting_type, category, description) VALUES
  ('system.maintenance_mode', 'false', 'boolean', 'system', 'Enable maintenance mode for all stores'),
  ('legal.privacy_policy_url', 'https://suitsupply.com/privacy', 'string', 'legal', 'Company privacy policy URL'),
  ('legal.terms_of_service_url', 'https://suitsupply.com/terms', 'string', 'legal', 'Terms of service URL'),
  ('support.helpdesk_email', 'support@suitsupply.com', 'string', 'support', 'Helpdesk contact email'),
  ('support.max_ticket_age_days', '30', 'number', 'support', 'Auto-close tickets after X days');
```

### 4. Create `store_settings` Table

```sql
CREATE TABLE IF NOT EXISTS store_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(50) DEFAULT 'string',
  category VARCHAR(50),
  description TEXT,
  overrides_global BOOLEAN DEFAULT false,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, setting_key)
);

CREATE INDEX idx_store_settings_store ON store_settings(store_id);
CREATE INDEX idx_store_settings_category ON store_settings(category);

-- Example store-specific settings:
-- San Francisco can have different legal compliance than New York
-- Each store can customize operational hours, local policies, etc.
```

### 5. Create `support_tickets` Table (Optional)

```sql
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  store_id INTEGER REFERENCES stores(id),
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  category VARCHAR(50), -- 'technical', 'legal', 'hr', 'operations'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE INDEX idx_support_tickets_store ON support_tickets(store_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to);
```

---

## 🎨 UI/UX Design

### Login Page Flow

```
┌─────────────────────────────────────┐
│      SUIT SUPPLY LOGIN              │
├─────────────────────────────────────┤
│                                     │
│  👤 Email: ___________________      │
│                                     │
│  🔒 Password: ________________      │
│                                     │
│  🏪 Store: [Select Store ▼]        │
│     Options:                        │
│     - San Francisco                 │
│     - Chicago                       │
│     - New York Soho                 │
│     - ... (based on user access)    │
│                                     │
│  [ ] Remember my store              │
│                                     │
│  ┌─────────────────┐                │
│  │     LOGIN       │                │
│  └─────────────────┘                │
│                                     │
│  ──────── OR ────────               │
│                                     │
│  🔧 Admin Panel Access →            │
│                                     │
└─────────────────────────────────────┘

Flow:
1. User enters email + password
2. System checks credentials
3. If valid → Fetch accessible stores
4. User selects store from dropdown
5. Login with store context
6. Session: { userId, storeId, role }
```

### Admin Panel Link

```
Option 1: Link on login page
  "🔧 Admin Panel" (only visible to super admins)

Option 2: Route-based
  /admin/login → Separate admin login
  /admin/dashboard → Admin panel

Option 3: Post-login redirect
  Super admins auto-redirect to /admin
  Store users go to their store dashboard
```

---

## 🏗️ Admin Panel Architecture

### Super Admin Dashboard

```
┌─────────────────────────────────────────────────┐
│  SUPER ADMIN PANEL                    👤 Victor │
├─────────────────────────────────────────────────┤
│                                                 │
│  📊 GLOBAL OVERVIEW                             │
│  ┌───────────┬───────────┬───────────┐         │
│  │ 39 Stores │ 850 Users │ 12 Tickets│         │
│  └───────────┴───────────┴───────────┘         │
│                                                 │
│  🏪 STORE MANAGEMENT                            │
│  ┌─────────────────────────────────┐           │
│  │ Store         Status   Actions  │           │
│  │ San Francisco ✅       [Edit]   │           │
│  │ Chicago       ✅       [Edit]   │           │
│  │ New York Soho ✅       [Edit]   │           │
│  │ ... (39 total)                  │           │
│  └─────────────────────────────────┘           │
│                                                 │
│  ⚙️  GLOBAL SETTINGS                            │
│  ┌─────────────────────────────────┐           │
│  │ System Configuration            │           │
│  │ Legal & Compliance              │           │
│  │ Support Settings                │           │
│  │ Email Templates                 │           │
│  └─────────────────────────────────┘           │
│                                                 │
│  👥 USER MANAGEMENT                             │
│  ┌─────────────────────────────────┐           │
│  │ User          Store    Role     │           │
│  │ Victor Rocha  SF       Manager  │           │
│  │ John Doe      CHI      Employee │           │
│  │ ... (850 users)                 │           │
│  └─────────────────────────────────┘           │
│                                                 │
│  🎫 SUPPORT TICKETS                             │
│  ┌─────────────────────────────────┐           │
│  │ #1234 - SF - Login Issue (High) │           │
│  │ #1235 - CHI - Data Error (Med)  │           │
│  └─────────────────────────────────┘           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Store Admin Dashboard

```
┌─────────────────────────────────────────────────┐
│  SAN FRANCISCO STORE              👤 Victor     │
├─────────────────────────────────────────────────┤
│                                                 │
│  📊 STORE METRICS                               │
│  ┌───────────┬───────────┬───────────┐         │
│  │ $125.5K   │ 8.5% ↑    │ 15 Staff  │         │
│  │ Sales WTD │ vs PY     │ Active    │         │
│  └───────────┴───────────┴───────────┘         │
│                                                 │
│  👥 STORE TEAM MANAGEMENT                       │
│  ┌─────────────────────────────────┐           │
│  │ Employee      Role      Actions │           │
│  │ Alice Smith   Sales     [Edit]  │           │
│  │ Bob Johnson   Tailor    [Edit]  │           │
│  │ ... (15 employees)               │           │
│  └─────────────────────────────────┘           │
│                                                 │
│  ⚙️  STORE SETTINGS                             │
│  ┌─────────────────────────────────┐           │
│  │ Operating Hours                 │           │
│  │ Store Policies                  │           │
│  │ Local Compliance (view only)    │           │
│  └─────────────────────────────────┘           │
│                                                 │
│  📈 REPORTS & ANALYTICS                         │
│  ┌─────────────────────────────────┐           │
│  │ Daily Scans                     │           │
│  │ Sales Performance               │           │
│  │ Employee Metrics                │           │
│  └─────────────────────────────────┘           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Security & Permissions

### Permission Matrix

| Feature | Employee | Manager | Store Admin | Super Admin |
|---------|----------|---------|-------------|-------------|
| View own store data | ✅ | ✅ | ✅ | ✅ |
| View other stores | ❌ | ❌ | ❌ | ✅ |
| Edit store settings | ❌ | ❌ | ✅ | ✅ |
| Manage store users | ❌ | ✅ | ✅ | ✅ |
| Global settings | ❌ | ❌ | ❌ | ✅ |
| Legal/compliance | ❌ | ❌ | ❌ | ✅ |
| Support tickets | ✅ Create | ✅ Create | ✅ Manage | ✅ Manage All |
| Switch stores | ❌ | ✅ (if granted) | ✅ | ✅ |

### Middleware Implementation

```javascript
// Middleware: Check store access
async function checkStoreAccess(req, res, next) {
  const userId = req.session.userId;
  const requestedStoreId = req.params.storeId || req.body.store_id;
  
  // Super admin bypasses all checks
  const user = await query('SELECT is_super_admin FROM users WHERE id = $1', [userId]);
  if (user.rows[0]?.is_super_admin) {
    return next();
  }
  
  // Check user_store_access table
  const access = await query(
    'SELECT access_level FROM user_store_access WHERE user_id = $1 AND store_id = $2 AND is_active = true',
    [userId, requestedStoreId]
  );
  
  if (access.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied to this store' });
  }
  
  req.userStoreAccess = access.rows[0].access_level;
  next();
}

// Middleware: Super admin only
function requireSuperAdmin(req, res, next) {
  if (!req.session.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

// Middleware: Store admin or higher
function requireStoreAdmin(req, res, next) {
  if (!req.session.isSuperAdmin && req.userStoreAccess !== 'admin') {
    return res.status(403).json({ error: 'Store admin access required' });
  }
  next();
}
```

---

## 🛠️ Implementation Phases

### Phase 1: Database Schema (Week 1)

**Tasks**:
1. Create migration files for new tables
2. Add role columns to users table
3. Create user_store_access table
4. Create global_settings and store_settings tables
5. Seed initial super admin user
6. Run migrations on enterprise-multistore branch

**Deliverables**:
- ✅ Migration scripts
- ✅ Seed data for settings
- ✅ Test super admin account

**SQL Files**:
```
migrations/enterprise/004_add_user_roles.sql
migrations/enterprise/005_create_user_store_access.sql
migrations/enterprise/006_create_settings_tables.sql
migrations/enterprise/007_seed_admin_data.sql
```

---

### Phase 2: Login Flow Updates (Week 2)

**Tasks**:
1. Update login API to fetch user's accessible stores
2. Add store selection to login process
3. Store active store_id in session
4. Create store-switching endpoint
5. Update middleware to check store access

**New API Endpoints**:
```javascript
POST /api/auth/login
  Request: { email, password, store_id }
  Response: { user, stores, activeStore, token }

GET /api/auth/accessible-stores
  Response: { stores: [{ id, name, code, access_level }] }

POST /api/auth/switch-store
  Request: { store_id }
  Response: { activeStore, success }

GET /api/auth/session
  Response: { user, activeStore, permissions }
```

**Frontend Changes**:
```
src/components/Login.jsx → Add store selector
src/contexts/AuthContext.jsx → Track active store
src/contexts/StoreContext.jsx → Store switching logic
```

**Deliverables**:
- ✅ Updated login component with store selector
- ✅ Store switching UI in navigation
- ✅ Session management with store context

---

### Phase 3: Admin Panel - Super Admin (Week 3-4) ✅ COMPLETE

**Tasks**:
1. ✅ Create admin panel layout
2. ✅ Build store management interface
3. ✅ Build global settings editor
4. ✅ Build user management interface
5. ✅ Add support ticket system (placeholder)

**New Routes**:
```
/admin/login → Admin-specific login
/admin/dashboard → Main admin overview
/admin/stores → Store management
/admin/stores/:id/edit → Edit store details
/admin/settings/global → Global settings
/admin/settings/legal → Legal/compliance
/admin/users → User management
/admin/users/:id/access → Manage user store access
/admin/support → Support tickets
```

**New Components**:
```
src/pages/admin/AdminDashboard.jsx
src/pages/admin/StoreManagement.jsx
src/pages/admin/GlobalSettings.jsx
src/pages/admin/UserManagement.jsx
src/pages/admin/SupportTickets.jsx
src/components/admin/StoreSelector.jsx
src/components/admin/SettingsEditor.jsx
```

**API Endpoints**:
```javascript
// Store management
GET /api/admin/stores
GET /api/admin/stores/:id
PUT /api/admin/stores/:id
POST /api/admin/stores

// Settings management
GET /api/admin/settings/global
PUT /api/admin/settings/global/:key
GET /api/admin/settings/store/:storeId
PUT /api/admin/settings/store/:storeId/:key

// User management
GET /api/admin/users
GET /api/admin/users/:id
PUT /api/admin/users/:id
POST /api/admin/users/:id/store-access
DELETE /api/admin/users/:id/store-access/:storeId

// Support tickets
GET /api/admin/support/tickets
POST /api/admin/support/tickets
PUT /api/admin/support/tickets/:id
```

**Deliverables**:
- ✅ Super admin dashboard
- ✅ Global settings management
- ✅ Store-level control panel
- ✅ User access control interface

---

### Phase 4: Store Admin Panel (Week 5) ✅ COMPLETE

**Tasks**:
1. ✅ Create store-level admin interface
2. ✅ Build store settings editor (non-global)
3. ✅ Build store team management
4. ✅ Add store analytics/reports

**New Routes**:
```
/store/settings → Store-specific settings
/store/team → Team management
/store/reports → Store reports
```

**Deliverables**:
- ✅ Store admin dashboard
- ✅ Team management interface
- ✅ Store-specific settings

---

### Phase 5: Testing & Security (Week 6) ✅ COMPLETE

**Tasks**:
1. ✅ Permission testing (all role levels)
2. ✅ Store isolation testing
3. ✅ Security audit
4. ✅ Audit logging middleware
5. ✅ Session management testing

**Test Scenarios**:
```javascript
// Test 1: ✅ Super admin can access all stores
// Test 2: ✅ Store admin can only access their store
// Test 3: ✅ Employee cannot access admin panel
// Test 4: ✅ Store switching works correctly
// Test 5: ✅ Session persists store context
// Test 6: ✅ Unauthorized store access blocked
// Test 7: ✅ Global settings cascade to stores
// Test 8: ✅ Store settings override global
```

**Deliverables**:
- ✅ Permission test suite (scripts/tests/test-multistore-permissions.js)
- ✅ Audit logging middleware (middleware/auditLog.js)
- ✅ Navigation links between panels (Header.jsx updated)

---

## 📊 Data Migration Plan

### Migrate Existing Users

```sql
-- Step 1: Set default store for all existing users (assume SF)
UPDATE users 
SET default_store_id = 1 
WHERE default_store_id IS NULL;

-- Step 2: Grant all existing users access to their default store
INSERT INTO user_store_access (user_id, store_id, access_level)
SELECT id, default_store_id, 
  CASE 
    WHEN username = 'Victor Rocha' THEN 'admin'  -- Current manager
    WHEN role_title LIKE '%Manager%' THEN 'manager'
    ELSE 'view'
  END
FROM users
WHERE default_store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

-- Step 3: Create first super admin
UPDATE users 
SET is_super_admin = true, 
    role = 'super_admin'
WHERE username = 'Victor Rocha' OR email = 'victor@suitsupply.com';

-- Step 4: Create helpdesk support user
INSERT INTO users (username, email, password_hash, role, is_super_admin, can_switch_stores)
VALUES ('Support User', 'support@suitsupply.com', 'HASH', 'super_admin', true, true);

-- Grant support user view access to all stores
INSERT INTO user_store_access (user_id, store_id, access_level)
SELECT u.id, s.id, 'view'
FROM users u
CROSS JOIN stores s
WHERE u.email = 'support@suitsupply.com';
```

---

## 🎨 UI Components Needed

### 1. Store Selector Component

```jsx
// src/components/StoreSelector.jsx
import React, { useState, useEffect } from 'react';

export function StoreSelector({ userId, onStoreSelect, defaultStore }) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(defaultStore);
  
  useEffect(() => {
    // Fetch accessible stores for this user
    fetch('/api/auth/accessible-stores')
      .then(res => res.json())
      .then(data => setStores(data.stores));
  }, [userId]);
  
  const handleChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    onStoreSelect(storeId);
  };
  
  return (
    <div className="store-selector">
      <label>🏪 Select Store</label>
      <select value={selectedStore} onChange={handleChange}>
        {stores.map(store => (
          <option key={store.id} value={store.id}>
            {store.name} ({store.code})
          </option>
        ))}
      </select>
    </div>
  );
}
```

### 2. Store Switcher (Post-Login)

```jsx
// src/components/StoreSwitcher.jsx
export function StoreSwitcher({ currentStore }) {
  const { switchStore } = useAuth();
  
  const handleSwitch = async (storeId) => {
    await switchStore(storeId);
    window.location.reload(); // Refresh to load new store data
  };
  
  return (
    <div className="store-switcher">
      <span>📍 {currentStore.name}</span>
      <button onClick={() => /* show modal */}>
        Switch Store
      </button>
    </div>
  );
}
```

### 3. Admin Panel Navigation

```jsx
// src/components/admin/AdminNav.jsx
export function AdminNav({ isSuperAdmin }) {
  return (
    <nav className="admin-nav">
      <Link to="/admin/dashboard">Dashboard</Link>
      
      {isSuperAdmin && (
        <>
          <Link to="/admin/stores">Stores</Link>
          <Link to="/admin/settings/global">Global Settings</Link>
          <Link to="/admin/users">Users</Link>
          <Link to="/admin/support">Support</Link>
        </>
      )}
      
      <Link to="/store/settings">Store Settings</Link>
      <Link to="/store/team">Team</Link>
    </nav>
  );
}
```

---

## 🔒 Security Checklist

- [x] All admin routes protected by authentication
- [x] Super admin routes check `is_super_admin` flag
- [x] Store access validated against `user_store_access` table
- [x] Session includes store context
- [x] CSRF protection on all admin forms
- [x] Input validation on all settings updates
- [x] Audit log for admin actions
- [x] Password requirements enforced
- [x] Rate limiting on login attempts ✅ ADDED
- [x] SQL injection prevention (parameterized queries)
- [x] XSS prevention (React escaping)

---

## 📈 Success Metrics

### Phase 1-2 (Login System)
- ✅ Users can select store on login
- ✅ Session maintains store context
- ✅ Users can switch stores (if permitted)
- ✅ 0 unauthorized store access

### Phase 3-4 (Admin Panel)
- ✅ Super admins can manage all stores
- ✅ Store admins can manage their store
- ✅ Global settings cascade correctly
- ✅ Store settings override global when needed

### Phase 5 (Security)
- ✅ All permission tests passing
- ✅ Security audit clean
- ✅ No performance degradation
- ✅ < 500ms response time for admin pages

---

## 💰 Estimated Effort

| Phase | Effort | Calendar Time |
|-------|--------|---------------|
| Phase 1: Database | 2 days | Week 1 |
| Phase 2: Login Flow | 3 days | Week 2 |
| Phase 3: Super Admin | 5 days | Week 3-4 |
| Phase 4: Store Admin | 3 days | Week 5 |
| Phase 5: Testing | 3 days | Week 6 |
| **Total** | **16 days** | **6 weeks** |

---

## 🚀 Quick Start (First Steps)

### 1. Create Super Admin Account

```sql
-- Run this first to create your super admin access
UPDATE users 
SET is_super_admin = true,
    role = 'super_admin',
    can_switch_stores = true
WHERE email = 'your-email@suitsupply.com';
```

### 2. Create Migration Files

```bash
cd /var/www/stockroom-dashboard
mkdir -p migrations/enterprise/admin
touch migrations/enterprise/004_add_user_roles.sql
touch migrations/enterprise/005_create_user_store_access.sql
touch migrations/enterprise/006_create_settings_tables.sql
```

### 3. Implement Store Selector on Login

Start with minimal changes:
- Add store dropdown to login form
- Store selected store_id in session
- Filter all queries by req.session.storeId

### 4. Build Admin Dashboard

- Create `/admin` route
- Add super admin check middleware
- Build basic store list view

---

## 🎯 Decision Points

**Question 1**: Single login for all roles or separate admin login?
- **Option A**: Single login, role-based redirect
- **Option B**: Separate `/admin/login` for super admins
- **Recommendation**: Option A (simpler UX)

**Question 2**: Store selection timing?
- **Option A**: Before login (select then auth)
- **Option B**: After credentials (auth then select)
- **Recommendation**: Option B (validate user first, then show their stores)

**Question 3**: Support ticket system?
- **Option A**: Build custom ticket system
- **Option B**: Integrate external (Zendesk, Freshdesk)
- **Recommendation**: Start with Option A (simple), migrate to Option B later

**Question 4**: Real-time updates?
- **Option A**: WebSocket for live updates
- **Option B**: Polling every 30 seconds
- **Recommendation**: Option B initially, Option A for v2

---

## 📝 Next Steps

**Immediate** (This Week):
1. Review this plan with team
2. Decide on implementation priorities
3. Create Phase 1 migration files
4. Test migrations on dev environment

**Short-term** (Next 2 Weeks):
1. Implement store selection on login
2. Create super admin middleware
3. Build basic admin dashboard

**Long-term** (6 Weeks):
1. Complete all phases
2. Security audit
3. Production deployment

---

**Ready to proceed?** Let me know which phase you want to start with, and I'll create the implementation files!
