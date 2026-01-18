# Stockroom Dashboard - Data Architecture

## Overview

The Stockroom Dashboard uses a **hybrid data architecture** combining PostgreSQL for persistent data and JSON files for caching and daily operations.

## Data Storage Strategy

### PostgrexSQL Database (Primary Storage)

**Location:** `stockroom_dashboard` database at `localhost:5432`

**Tables:**
- `users` - All employee/user accounts (30 users)
- `sessions` - User authentication sessions
- `pickups` - Customer pickup orders
- `shipments` - UPS/shipping tracking
- `closing_duties` - End-of-day checklist submissions
- `time_off_requests` - PTO and time-off requests
- `lost_punch_requests` - Clock-in/out corrections
- `feedback` - Employee feedback submissions

**Why PostgreSQL?**
- ✅ Reliable data persistence
- ✅ ACID transactions
- ✅ Multi-user concurrent access
- ✅ Backup and recovery
- ✅ Query performance at scale

### JSON Files (Caching & Quick Access)

**Location:** `/var/lib/stockroom-dashboard/data/`

**Active Files:**
- `employees-v2.json` - Employee cache (synced from PostgreSQL)
- `gameplan-daily/*.json` - Daily game plans (one file per date)
- `store-metrics/*.json` - Daily metrics snapshots
- `notes-templates.json` - Game plan note templates
- `weekly-goal-distributions.json` - Sales goal settings

**Location:** `/var/www/stockroom-dashboard/data/`

**Active Files:**
- `shipments.json` - Shipments workflow data
- `store-config.json` - Store configuration
- `settings.json` - App settings
- Various config files for features

**Why JSON?**
- ✅ Fast read access for frequently accessed data
- ✅ Simple structure for daily game plans
- ✅ Easy to backup and version control
- ✅ No database overhead for temporary data

## Data Flow Diagrams

### Employee Data Flow

```
┌─────────────────────────────────────┐
│   PostgreSQL users table            │
│   (Source of Truth)                 │
│   - 30 active users                 │
│   - Roles, permissions, passwords   │
└──────────────┬──────────────────────┘
               │
               │ [sync-employees-from-db.js]
               │ (Runs on server start + manual sync)
               ↓
┌─────────────────────────────────────┐
│   /var/lib/.../employees-v2.json    │
│   (Cache File)                      │
│   - Grouped by role (SA/BOH/MGMT)   │
│   - Daily assignment fields         │
└──────────────┬──────────────────────┘
               │
               │ [routes/gameplan.js]
               │ (pruneEmployeesFile())
               ↓
┌─────────────────────────────────────┐
│   Game Plan API Endpoints           │
│   GET /api/gameplan/employees       │
└─────────────────────────────────────┘
```

### Game Plan Save Flow

```
User edits game plan in browser
               ↓
POST /api/gameplan/save
               ↓
┌─────────────────────────────────────┐
│   Save to daily file                │
│   gameplan-daily/2026-01-12.json    │
└──────────────┬──────────────────────┘
               │
               │ (Also update cache)
               ↓
┌─────────────────────────────────────┐
│   Update employees-v2.json          │
│   (Daily assignment fields only)    │
└─────────────────────────────────────┘
```

### Authentication Flow

```
User login (POST /api/auth/login)
               ↓
┌─────────────────────────────────────┐
│   Query PostgreSQL users table      │
│   - Verify password (scrypt)        │
│   - Check is_active = true          │
└──────────────┬──────────────────────┘
               │
               │ (Success)
               ↓
┌─────────────────────────────────────┐
│   Create session in sessions table  │
│   Return session cookie             │
└─────────────────────────────────────┘
```

## File Locations

### Important Paths

| Purpose | Path | Type |
|---------|------|------|
| Employee cache | `/var/lib/stockroom-dashboard/data/employees-v2.json` | JSON |
| Daily game plans | `/var/lib/stockroom-dashboard/data/gameplan-daily/` | JSON |
| Store metrics | `/var/lib/stockroom-dashboard/data/store-metrics/` | JSON |
| Users/Auth | PostgreSQL `users` table | Database |
| Sessions | PostgreSQL `sessions` table | Database |
| Shipments | PostgreSQL `shipments` table + JSON cache | Hybrid |

### Why Two Data Directories?

- `/var/lib/stockroom-dashboard/` - Production data (persistent, backed up)
- `/var/www/stockroom-dashboard/data/` - Repository data (configs, templates)

## Data Sync & Consistency

### Employee Data Sync

**Trigger Points:**
1. Server startup (automatic)
2. Manual sync via `/api/gameplan/sync` endpoint
3. When pruning employees file (daily reset)

**Script:** `sync-employees-from-db.js`

**What it does:**
```javascript
1. Query PostgreSQL: SELECT * FROM users WHERE is_active = true
2. Group by role: SA, BOH, MANAGEMENT, TAILOR
3. Add default game plan fields (zones, shift, lunch, etc.)
4. Write to employees-v2.json
5. Update lastSyncedFromDB timestamp
```

### Daily Reset Logic

Game plan assignments reset daily at midnight (or when no game plan exists for today):
- `isOff` → `true` (all employees marked as off)
- `zones` → `[]` (clear zone assignments)
- All daily fields cleared
- Prevents carrying over yesterday's assignments

## Backup Strategy

### PostgreSQL Backups
- Automated daily backups (managed by system)
- Manual backup: `pg_dump stockroom_dashboard > backup.sql`

### JSON File Backups
- Version controlled via Git
- Server-level backups in `/var/lib/stockroom-dashboard/_repo-data-backup-*/`
- Manual backups: `backup-to-github.sh` script

## Migration History

### Phase 1: PostgreSQL Migration (Completed January 2026)
- ✅ Migrated users from `users.json` to PostgreSQL
- ✅ Migrated employees to PostgreSQL `users` table
- ✅ Updated authentication to use PostgreSQL
- ✅ Created employee sync script
- ✅ Updated all routes to use PostgreSQL

### Phase 2: Cleanup (Completed January 2026)
- ✅ Removed duplicate employee files
- ✅ Organized legacy files
- ✅ Documented data architecture
- ✅ Fixed employee toggle functionality

## Troubleshooting

### Employees not showing in game plan?
1. Check if PostgreSQL is running: `systemctl status postgresql`
2. Verify users in database: `psql -U suit -d stockroom_dashboard -c "SELECT COUNT(*) FROM users WHERE is_active = true;"`
3. Sync from database: `node sync-employees-from-db.js`
4. Restart server: `pm2 restart stockroom-dashboard`

### Changes not saving?
1. Check file permissions: `ls -la /var/lib/stockroom-dashboard/data/`
2. Check server logs: `pm2 logs stockroom-dashboard`
3. Verify employee IDs match between database and cache file

### Data inconsistency?
1. Re-sync from PostgreSQL (source of truth)
2. Check for circular dependencies in code
3. Clear browser cache and reload

---

**Last Updated:** January 12, 2026  
**Architecture Version:** 2.0 (PostgreSQL Primary)  
**Status:** Production Ready
