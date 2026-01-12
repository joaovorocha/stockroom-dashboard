# Legacy Files Archive

This directory contains archived files from the stockroom dashboard migration to PostgreSQL.

## Directory Structure

### `/archived-routes/`
Old route handlers that have been replaced:
- `auth-json.js` - Old JSON-file based authentication (replaced by auth-pg.js)
- `auth-middleware-json.js` - Old auth middleware (replaced by auth-pg.js middleware)

### `/old-data-files/`
Duplicate and legacy data files:
- `employees*.json` - Employee data files (now stored in PostgreSQL `users` table)
- `users.json.*` - User authentication files (now stored in PostgreSQL `users` table)
- `shipments-backup-*.json` - Old shipments backups

### `/backup-files/`
HTML and code backup files (.bak, .backup, .bak2):
- Various `.bak` files from public HTML pages
- Backup copies of edited files

## Why v2 vs v1?

Originally, there were two employee file formats:
- `employees.json` - Legacy format with flat structure
- `employees-v2.json` - New format with role groupings (SA, BOH, MANAGEMENT, TAILOR)

Both files have been archived because **all employee data is now in PostgreSQL**. The application now uses:
- PostgreSQL `users` table as the source of truth
- `/var/lib/stockroom-dashboard/data/employees-v2.json` as a synced cache file

## Migration Status

### ✅ Completed Migrations

1. **Authentication System**
   - FROM: JSON file (`data/users.json`)
   - TO: PostgreSQL (`users` table)
   - Status: Complete, all users migrated

2. **Employee Data**
   - FROM: Multiple JSON files (`employees.json`, `employees-v2.json`)
   - TO: PostgreSQL (`users` table)
   - Status: Complete, 30 employees migrated

3. **Game Plan System**
   - Uses PostgreSQL for user data
   - Daily game plans still stored in JSON for quick access
   - Status: Working correctly with fixed employee toggle

## Files Safe to Delete

After verification that everything works correctly, these files can be permanently deleted:
- All files in `old-data-files/` (data is in PostgreSQL)
- All files in `backup-files/` (if no longer needed)
- Archived route files (new PostgreSQL routes are in use)

---

Last Updated: January 12, 2026
Migration Status: Phase 1 Complete (PostgreSQL migration)
