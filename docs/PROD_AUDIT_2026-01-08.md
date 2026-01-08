# Stockroom Dashboard — Production Migration Audit (2026-01-08)

Target: new server `10.201.48.17` (old: `10.201.48.16`)

## Executive Summary

- **Stability**: Web app and PM2 processes are running; `/` returns a 302 to `/login` as expected.
- **Critical fix applied**: `looker-scheduler` was effectively running every minute due to a malformed cron argument passed via PM2; this is corrected and now runs on the intended schedule.
- **Migration hardening applied**: Codebase now supports env-driven canonical storage directories; production runtime state is moved to `/var/lib/stockroom-dashboard` and repo directories are symlinked.
- **Security posture**: `npm audit --omit=dev` reports **0 vulnerabilities** after upgrading `nodemailer` and applying a safe lockfile bump for `qs`.

## Architecture Map (Runtime)

### Processes

- **PM2: `stockroom-dashboard`**
  - `node server.js`
  - Express server
  - Serves HTML pages + API routes
  - Hosts SSE endpoint `/api/sse/updates`
  - Runs UDP listeners and WebSocket upgrade handlers for radio monitoring
  - Starts in-process UPS email scheduler

- **PM2: `looker-scheduler`**
  - `node utils/looker-scheduler.js start`
  - Runs a node-cron schedule which executes the Looker ingest + processing pipeline

### Storage Layout

- Canonical production storage:
  - `/var/lib/stockroom-dashboard/data`
  - `/var/lib/stockroom-dashboard/files`

- Repo symlinks:
  - `/var/www/stockroom-dashboard/data` -> `/var/lib/stockroom-dashboard/data`
  - `/var/www/stockroom-dashboard/files` -> `/var/lib/stockroom-dashboard/files`

- Logs:
  - App logs: `/var/www/stockroom-dashboard/logs`
  - PM2 logs: `/home/suit/.pm2/logs`

### Configuration

- PM2 definitions: `ecosystem.config.json`
- Canonical dir env vars (applied in PM2):
  - `STOCKROOM_DATA_DIR=/var/lib/stockroom-dashboard/data`
  - `STOCKROOM_FILES_DIR=/var/lib/stockroom-dashboard/files`
  - `STOCKROOM_LOG_DIR=/var/www/stockroom-dashboard/logs`

## Routes / Features Inventory

Authoritative route inventory is maintained in `SERVER_MAP.md`.

High-level:

- Pages: `/dashboard`, `/gameplan-*`, `/ops-dashboard`, `/shipments`, `/radio`, `/radio-transcripts`, `/closing-duties`, `/lost-punch`, `/time-off`, `/awards`, `/expenses`, `/admin`, plus auth pages.
- APIs: `/api/auth`, `/api/gameplan`, `/api/shipments`, `/api/closing-duties`, `/api/lost-punch`, `/api/timeoff`, `/api/feedback`, `/api/admin`, `/api/awards`, `/api/radio`, `/api/expenses`.

## Findings and Actions

### 1) Looker scheduler misfire (CRITICAL)

**Symptom**
- Logs showed Looker processing firing every minute, generating `dashboard-data.json` and daily metrics repeatedly.

**Root cause**
- Malformed cron expression passed as PM2 argument to `utils/looker-scheduler.js` caused node-cron to schedule in an unintended high-frequency pattern.

**Fix**
- Updated `ecosystem.config.json` to stop passing the malformed cron argument; scheduler now runs with the safe default cron (`30 6 * * *`).

**Verification**
- Check scheduler startup line:
  - `pm2 logs looker-scheduler --lines 200 | rg -n "Starting scheduler with cron expression"`

### 2) Hardcoded repo-relative data paths (HIGH)

**Risk**
- Many modules wrote directly under `../data` relative to code paths, making migrations/permissions fragile.

**Fix**
- Implemented env-driven canonical path resolution (`utils/paths.js`) and refactored key routes and utilities to use the DAL’s canonical paths and atomic writes.

**Verification**
- Confirm PM2 env:
  - `pm2 env looker-scheduler | rg -n "STOCKROOM_(DATA|FILES|LOG)_DIR"`
- Confirm repo uses symlinks:
  - `ls -la /var/www/stockroom-dashboard | rg -n "data ->|files ->"`

### 3) Dependency vulnerabilities (MEDIUM)

**Current state**
- `npm audit --omit=dev` reports **0 vulnerabilities**.

**Actions taken**
- Applied safe remediation for `qs` (lockfile bump to `qs@6.14.1`).
- Upgraded the app’s direct dependency to `nodemailer@7.0.12` (the advisory’s recommended fixed version).

**Validation step**
- Trigger a password reset end-to-end (email delivery + reset link works).

## Old Server Backup Check

- Reference-only backup path inspected: `/home/suit/old-server-backup/victor`.
- No clear missing production data was identified during shallow scan; deeper targeted searches should be driven by specific missing artifacts (e.g., radio clips/transcripts, uploads, shipment backups).

## Operational Checklists

### Post-restart smoke test

- `pm2 ls`
- `curl -I http://127.0.0.1:3000/`
- `pm2 logs stockroom-dashboard --lines 200`
- `pm2 logs looker-scheduler --lines 200`

### Backups

- Confirm `/var/lib/stockroom-dashboard` ownership:
  - `sudo chown -R suit:suit /var/lib/stockroom-dashboard`
- Run periodic tar backup (see docs/RUNBOOK.md).

## Notes / Next Steps

- If you want a GitHub mirror, do **not** push runtime `data/` / `files/` contents. Remove tracked artifacts and ensure `.gitignore` is enforced.
- Decide on nodemailer upgrade strategy and schedule a small maintenance window to validate email flows.

