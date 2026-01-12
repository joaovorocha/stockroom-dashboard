# Complete PostgreSQL Migration Plan
**Date:** January 11, 2026  
**Priority:** CRITICAL - Blocks multi-store rollout  
**Timeline:** 9-10 days total  
**Goal:** Migrate ALL JSON file-based data to PostgreSQL

---

## 🎯 Migration Overview

### Current State: Data Split Architecture
**PostgreSQL (Modern):**
- ✅ Shipments
- ✅ RFID tracking
- ✅ Printers
- ✅ Pickups
- ✅ Gameplan

**JSON Files (Legacy - MIGRATE):**
- 🔴 **Auth/Users** (CRITICAL)
- 🟠 **Time Off** (HIGH)
- 🟡 **Feedback** (MEDIUM)
- 🟡 **Lost Punch** (MEDIUM)
- 🟢 **Closing Duties** (LOW)

---

## 🚨 Why Migrate Now?

### Blocking Issues
1. **Multi-store rollout blocked** - Current auth system can't handle multiple stores
2. **No audit trail** - JSON writes don't track who/when/what changed
3. **Race conditions** - Concurrent writes can corrupt data
4. **No relationships** - Can't join user data with shipments/RFID/gameplan
5. **No backups** - File-based storage risky (one bad write = data loss)
6. **Performance** - Linear scans vs indexed queries

### Business Impact
- **Cannot expand to 2nd store** without PostgreSQL auth
- **Cannot track manager approvals** properly
- **Cannot generate reports** across systems
- **Compliance risk** - No audit logs for timesheet changes

---

## 📅 Migration Timeline

### Week 1: Auth + Time Off (5 days)
**Days 1-4: Auth Migration (CRITICAL)**
- Day 1: Schema design, test data migration
- Day 2: Update all authentication code
- Day 3: Migrate production data, test thoroughly
- Day 4: Monitor, fix bugs, rollback plan ready

**Day 5: Time Off Migration (HIGH)**
- Schema + code + migration + testing

### Week 2: Feedback + Lost Punch + Closing Duties (4-5 days)
**Days 6-7: Feedback Migration**
**Days 8-9: Lost Punch Migration**
**Day 10: Closing Duties Migration**

---

## 🔐 MIGRATION 1: Auth/Users (CRITICAL)

### Priority: 🔴 CRITICAL
**Effort:** 3-4 days  
**Risk:** High (affects all logins)  
**Blocks:** Multi-store rollout

### Current State
**File:** `data/users.json`
```json
{
  "users": [
    {
      "id": 1,
      "username": "victor.rocha",
      "email": "victor.rocha@suitsupply.com",
      "passwordHash": "$2b$10$...",
      "firstName": "Victor",
      "lastName": "Rocha",
      "role": "MANAGEMENT",
      "store": "San Francisco",
      "isManager": true,
      "isAdmin": false,
      "canEditGameplan": true,
      "createdAt": "2023-06-15T10:00:00Z"
    }
  ]
}
```

### New Schema
```sql
-- Users table (replaces users.json)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'MANAGEMENT', 'SA', 'BOH', 'TAILOR'
  store_id INTEGER REFERENCES stores(id), -- Multi-store support
  is_manager BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  can_edit_gameplan BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_store (store_id)
);

-- Stores table (new - supports multi-store)
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL, -- 'SF', 'NY', 'LA'
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  phone VARCHAR(50),
  timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User sessions table (replaces cookie-only sessions)
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(200) UNIQUE NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_session_token (session_token),
  INDEX idx_user_id (user_id),
  INDEX idx_expires (expires_at)
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(200) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_token (token)
);

-- Audit log for user changes
CREATE TABLE user_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  changed_by INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'login', 'logout'
  changes JSONB, -- Old vs new values
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

### Migration Script
```javascript
// scripts/migrate-auth-to-postgres.js
const fs = require('fs');
const { pool } = require('../utils/db');
const bcrypt = require('bcrypt');

async function migrateAuth() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Create San Francisco store
    const storeResult = await client.query(`
      INSERT INTO stores (name, code, city, state, timezone)
      VALUES ('San Francisco', 'SF', 'San Francisco', 'CA', 'America/Los_Angeles')
      RETURNING id
    `);
    const sfStoreId = storeResult.rows[0].id;
    
    // 2. Read users from JSON
    const usersJson = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
    
    // 3. Insert users into PostgreSQL
    for (const user of usersJson.users) {
      await client.query(`
        INSERT INTO users (
          username, email, password_hash, first_name, last_name,
          role, store_id, is_manager, is_admin, can_edit_gameplan,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        user.username,
        user.email,
        user.passwordHash,
        user.firstName,
        user.lastName,
        user.role,
        sfStoreId,
        user.isManager || false,
        user.isAdmin || false,
        user.canEditGameplan || false,
        user.createdAt || new Date()
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`✅ Migrated ${usersJson.users.length} users to PostgreSQL`);
    
    // 4. Backup JSON file
    fs.renameSync('data/users.json', `data/users.json.backup-${Date.now()}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrateAuth().catch(console.error);
```

### Code Changes Required
**File:** `routes/auth.js`
```javascript
// OLD (JSON):
const dal = require('../utils/dal');
const users = await dal.readJson(dal.paths.usersJson);

// NEW (PostgreSQL):
const { pool } = require('../utils/db');
const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
const user = result.rows[0];
```

### Testing Checklist
- [ ] Can login with existing users
- [ ] Password reset flow works
- [ ] Session management works
- [ ] Admin can create new users
- [ ] Multi-store user assignment works
- [ ] Audit log captures all changes

---

## 📅 MIGRATION 2: Time Off (HIGH PRIORITY)

### Priority: 🟠 HIGH
**Effort:** 2 days  
**Risk:** Medium  
**Depends on:** Auth migration (needs user IDs)

### Current State
**File:** `data/timeoff.json`
```json
{
  "requests": [
    {
      "id": 1,
      "employeeId": 123,
      "employeeName": "Victor Rocha",
      "type": "VACATION",
      "startDate": "2026-02-01",
      "endDate": "2026-02-07",
      "days": 5,
      "reason": "Family trip",
      "status": "APPROVED",
      "approvedBy": "Manager Name",
      "approvedAt": "2026-01-15T14:30:00Z",
      "submittedAt": "2026-01-10T09:00:00Z"
    }
  ]
}
```

### New Schema
```sql
-- Time off requests
CREATE TABLE timeoff_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'VACATION', 'SICK', 'PERSONAL', 'UNPAID'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested DECIMAL(4,2) NOT NULL, -- Support half days (0.5)
  reason TEXT,
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DENIED', 'CANCELLED'
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  denial_reason TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_start_date (start_date)
);

-- Time off balances (track accruals)
CREATE TABLE timeoff_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  vacation_hours DECIMAL(6,2) DEFAULT 0,
  sick_hours DECIMAL(6,2) DEFAULT 0,
  personal_hours DECIMAL(6,2) DEFAULT 0,
  vacation_used DECIMAL(6,2) DEFAULT 0,
  sick_used DECIMAL(6,2) DEFAULT 0,
  personal_used DECIMAL(6,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- Time off audit log
CREATE TABLE timeoff_audit_log (
  id SERIAL PRIMARY KEY,
  request_id INTEGER REFERENCES timeoff_requests(id) ON DELETE CASCADE,
  changed_by INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'submitted', 'approved', 'denied', 'cancelled'
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Migration Script
```javascript
// scripts/migrate-timeoff-to-postgres.js
const fs = require('fs');
const { pool } = require('../utils/db');

async function migrateTimeOff() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const timeoffJson = JSON.parse(fs.readFileSync('data/timeoff.json', 'utf8'));
    
    for (const request of timeoffJson.requests) {
      // Find user by old employee ID or name
      const userResult = await client.query(
        'SELECT id FROM users WHERE email LIKE $1 OR first_name || \' \' || last_name = $2 LIMIT 1',
        [`%${request.employeeId}%`, request.employeeName]
      );
      
      if (!userResult.rows.length) {
        console.warn(`⚠️ User not found: ${request.employeeName}`);
        continue;
      }
      
      const userId = userResult.rows[0].id;
      
      // Find approver
      let approverId = null;
      if (request.approvedBy) {
        const approverResult = await client.query(
          'SELECT id FROM users WHERE first_name || \' \' || last_name = $1 LIMIT 1',
          [request.approvedBy]
        );
        if (approverResult.rows.length) {
          approverId = approverResult.rows[0].id;
        }
      }
      
      // Insert request
      await client.query(`
        INSERT INTO timeoff_requests (
          user_id, type, start_date, end_date, days_requested,
          reason, status, approved_by, approved_at, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        userId,
        request.type,
        request.startDate,
        request.endDate,
        request.days,
        request.reason,
        request.status,
        approverId,
        request.approvedAt,
        request.submittedAt
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`✅ Migrated ${timeoffJson.requests.length} time-off requests`);
    
    fs.renameSync('data/timeoff.json', `data/timeoff.json.backup-${Date.now()}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrateTimeOff().catch(console.error);
```

---

## 💬 MIGRATION 3: Feedback (MEDIUM PRIORITY)

### Priority: 🟡 MEDIUM
**Effort:** 1 day  
**Risk:** Low (no critical workflows)

### New Schema
```sql
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  status VARCHAR(50) DEFAULT 'NEW', -- 'NEW', 'IN_PROGRESS', 'RESOLVED'
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_category (category)
);
```

---

## ⏰ MIGRATION 4: Lost Punch (MEDIUM PRIORITY)

### Priority: 🟡 MEDIUM
**Effort:** 1 day  
**Risk:** Low

### New Schema
```sql
CREATE TABLE lost_punch_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  total_hours DECIMAL(4,2),
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DENIED'
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  denial_reason TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_date (date)
);
```

---

## 🧹 MIGRATION 5: Closing Duties (LOW PRIORITY)

### Priority: 🟢 LOW
**Effort:** 2 days  
**Risk:** Low (more complex with photos)

### New Schema
```sql
CREATE TABLE closing_duties (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  store_id INTEGER REFERENCES stores(id),
  date DATE NOT NULL,
  completed_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_date (date)
);

CREATE TABLE closing_duty_tasks (
  id SERIAL PRIMARY KEY,
  closing_duty_id INTEGER REFERENCES closing_duties(id) ON DELETE CASCADE,
  task_name VARCHAR(200) NOT NULL,
  completed BOOLEAN DEFAULT false,
  photo_url TEXT,
  notes TEXT,
  completed_at TIMESTAMP
);
```

---

## 🔄 Migration Process (Step-by-Step)

### Pre-Migration Checklist
- [ ] Full database backup
- [ ] Full JSON files backup
- [ ] Test migration on dev/staging first
- [ ] Alert users of maintenance window
- [ ] Prepare rollback plan

### Migration Day Process
1. **Maintenance Mode** (5 min)
   - Set `MAINTENANCE_MODE=true` in `.env`
   - Show "System maintenance in progress" page

2. **Backup Everything** (10 min)
   ```bash
   # Backup PostgreSQL
   pg_dump -U postgres stockroom_db > backup_$(date +%Y%m%d_%H%M%S).sql
   
   # Backup JSON files
   cp -r data data_backup_$(date +%Y%m%d_%H%M%S)
   ```

3. **Run Migration Scripts** (30-60 min)
   ```bash
   node scripts/migrate-auth-to-postgres.js
   node scripts/migrate-timeoff-to-postgres.js
   node scripts/migrate-feedback-to-postgres.js
   node scripts/migrate-lost-punch-to-postgres.js
   node scripts/migrate-closing-duties-to-postgres.js
   ```

4. **Smoke Tests** (15 min)
   - Login works
   - Create new user
   - Submit time-off request
   - Submit feedback
   - Create lost punch request

5. **Turn Off Maintenance Mode** (2 min)
   - Set `MAINTENANCE_MODE=false`
   - Monitor logs for errors

6. **Post-Migration Monitoring** (24 hours)
   - Watch error logs
   - Check query performance
   - User reports of issues

---

## 🚨 Rollback Plan

### If Migration Fails
1. **Stop the server**
   ```bash
   pm2 stop all
   ```

2. **Restore PostgreSQL backup**
   ```bash
   psql -U postgres stockroom_db < backup_20260111_120000.sql
   ```

3. **Restore JSON files**
   ```bash
   cp -r data_backup_20260111_120000/* data/
   ```

4. **Revert code changes** (if deployed)
   ```bash
   git reset --hard HEAD~1
   npm install
   pm2 restart all
   ```

5. **Verify system works**
   - Test login
   - Check all features

---

## 📊 Performance Considerations

### Indexing Strategy
```sql
-- Critical indexes for performance
CREATE INDEX CONCURRENTLY idx_users_username ON users(username);
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_sessions_token ON user_sessions(session_token);
CREATE INDEX CONCURRENTLY idx_timeoff_user_status ON timeoff_requests(user_id, status);
CREATE INDEX CONCURRENTLY idx_feedback_status ON feedback(status);
```

### Query Optimization
- Use `EXPLAIN ANALYZE` on all new queries
- Add indexes for foreign keys
- Use connection pooling (already configured)
- Cache user sessions in Redis (future enhancement)

---

## 🔐 Security Enhancements

### After Migration
1. **Enable Row-Level Security (RLS)**
   ```sql
   ALTER TABLE timeoff_requests ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY user_own_timeoff ON timeoff_requests
     FOR ALL
     USING (user_id = current_setting('app.current_user_id')::int);
   ```

2. **Audit All Changes**
   - Use triggers to auto-populate audit logs
   - Track who/when/what for compliance

3. **Encrypted Backups**
   - Encrypt `pg_dump` files before storing
   - Use `gpg` or similar

---

## ✅ Post-Migration Benefits

### Immediate Wins
1. **Multi-store ready** - Can add NY, LA stores easily
2. **Audit trail** - Know who changed what and when
3. **Better reports** - JOIN across tables
4. **No race conditions** - ACID transactions
5. **Referential integrity** - Foreign keys prevent orphaned data
6. **Performance** - Indexed queries vs linear JSON scans

### Long-Term Wins
1. **Horizontal scaling** - PostgreSQL replication
2. **Advanced queries** - CTEs, window functions, aggregates
3. **Data analytics** - Connect Looker, Metabase, etc.
4. **API consistency** - All data accessed same way
5. **Compliance ready** - Audit logs, GDPR export/delete

---

## 📋 Migration Checklist

### Auth Migration (Day 1-4)
- [ ] Create stores table and seed SF store
- [ ] Create users table with all columns
- [ ] Create user_sessions table
- [ ] Create password_reset_tokens table
- [ ] Create user_audit_log table
- [ ] Write migration script
- [ ] Test on dev environment
- [ ] Update routes/auth.js
- [ ] Update middleware/auth.js
- [ ] Test login/logout/session management
- [ ] Run migration on production
- [ ] Monitor for 24 hours

### Time Off Migration (Day 5)
- [ ] Create timeoff_requests table
- [ ] Create timeoff_balances table
- [ ] Create timeoff_audit_log table
- [ ] Write migration script
- [ ] Update routes/timeoff.js
- [ ] Test request/approve/deny flows
- [ ] Run migration on production

### Feedback Migration (Day 6-7)
- [ ] Create feedback table
- [ ] Write migration script (handle image paths)
- [ ] Update routes/feedback.js
- [ ] Run migration on production

### Lost Punch Migration (Day 8-9)
- [ ] Create lost_punch_requests table
- [ ] Write migration script
- [ ] Update routes/lostPunch.js
- [ ] Run migration on production

### Closing Duties Migration (Day 10)
- [ ] Create closing_duties table
- [ ] Create closing_duty_tasks table
- [ ] Write migration script (handle photos)
- [ ] Update routes/closingDuties.js
- [ ] Run migration on production

---

## 💡 Recommendations

### Immediate (This Week)
1. **Start with Auth** - Most critical, blocks everything else
2. **Test thoroughly** - Auth bugs affect all users
3. **Schedule maintenance window** - Friday evening 6pm-8pm PST

### Next Steps (After Auth)
1. Migrate Time Off (day 5)
2. Migrate Feedback & Lost Punch (days 6-9)
3. Migrate Closing Duties last (day 10)

### Future Enhancements
1. **Redis caching** - Cache user sessions
2. **PostgreSQL replication** - For disaster recovery
3. **Automated backups** - Daily pg_dump to S3
4. **Monitoring** - pg_stat_statements for slow queries

---

**Total Effort:** 9-10 days  
**Risk Level:** Medium-High (auth is critical)  
**Recommendation:** Start next week, complete by end of month  
**Impact:** Unlocks multi-store rollout, enables reporting, improves reliability

---

**Next:** Run `node scripts/create-migration-scripts.js` to generate all migration files
