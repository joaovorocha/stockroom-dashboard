# System Cleanup & Documentation Update Plan
**Date:** January 22, 2026
**Status:** In Progress

## Summary
Comprehensive audit and cleanup of stockroom-dashboard system, including:
- Bug identification and fixes
- Documentation consolidation
- Legacy file organization
- README and SERVER_MAP updates

## Bugs Found

### Critical
None

### Minor TODOs
1. `routes/gameplan.js:2561` - Hardcoded store 'SF', needs to be dynamic
2. `routes/manhattan.js:536` - Order and unit sync logic not implemented
3. `routes/pickups.js:290,299` - WaitWhile integration incomplete
4. `routes/waitwhile.js:489` - Real-time sync logic placeholder

## Documentation Organization

### Keep (Active)
- README.md
- SERVER_MAP.md
- CONTRIBUTING.md
- NETWORK_OPTIMIZATION.md
- GMAIL_PUSH_QUICKSTART.md
- GMAIL_PUSH_SETUP.md

### Move to Legacy
- AI_AUTOMATION_MASTER_PLAN.md (outdated planning doc)
- CLEANUP_SUMMARY.md (old cleanup report)
- COO_DEMO_SCRIPT.md (one-time demo script)
- CRITICAL_PATCHES_APPLIED.md (historical)
- DAILY_SCAN_IMPLEMENTATION_PLAN.md (completed feature)
- DAILY_SCAN_SETUP_INSTRUCTIONS.md (completed)
- DAILY_SCAN_DEBUG_GUIDE.md (integrated into main docs)
- GAMEPLAN_DATABASE_MIGRATION.md (historical migration)
- DATABASE_MIGRATION_COMPLETE.md (completed)
- POSTGRES_MIGRATION_STATUS.md (completed)
- PLAN_A_COMPLETE.md (historical)
- PRODUCTION_PATCHES_COMPLETE.md (historical)
- iOS_STRATEGY.md (integrated)
- IOS_TESTING_CHECKLIST.md (integrated)
- PHASE2_TASKS.md (outdated roadmap)
- MIGRATION_GUIDE.md (historical)
- PICKUP_SYSTEM_SETUP.md (feature-specific)
- WAITWHILE_INTEGRATION_SPEC.md (incomplete feature)

### Consolidate
- COMPREHENSIVE_SYSTEM_DOCUMENTATION.md → Merge useful parts into README
- SYSTEM_AUDIT_REPORT.md → Merge into docs/
- DATA_ARCHITECTURE.md → Move to docs/architecture/
- QUICK_REFERENCE.md → Keep or merge into README

## Data Folder Status

### Active (Keep)
- data/dashboard-data.json - Active cache
- data/employees-v2.json - Active employee data
- data/gmail-credentials.json - Gmail API auth
- data/gmail-token.json - OAuth tokens
- data/gmail-watch-info.json - Gmail push config
- data/scan-performance-history/ - Active metrics
- data/scheduler-logs/ - Active logs
- data/store-metrics/ - Active analytics
- data/cache/ - Active cache

### Check for Migration
- PostgreSQL migration complete - most data now in DB
- Files data in `files/` directory

## New Features Since Last Update
1. **Gmail Push Notifications** - Real-time email processing (Jan 2026)
2. **Network Optimization** - Smart WiFi/Tailscale detection (Jan 2026)
3. **PWA Optimization** - iPhone Add to Home Screen prompt (Jan 2026)
4. **App Rebranding** - Changed to "Daily Operations"

## Action Items
- [ ] Move legacy docs to legacy-docs/
- [ ] Update README.md with current features
- [ ] Update SERVER_MAP.md with new endpoints
- [ ] Fix hardcoded store value
- [ ] Document incomplete features (WaitWhile, Manhattan)
- [ ] Test critical endpoints
- [ ] Update package.json scripts

