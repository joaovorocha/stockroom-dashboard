# Stockroom Dashboard — Production Migration Audit (2026-01-08)

Target: new server `10.201.48.17` (old: `10.201.48.16`)

## Executive Summary

- **Stability**: Web app and PM2 processes are running; `/` returns a 302 to `/login` as expected.
- **Critical fix applied**: Separate schedulers consolidated into unified Gmail processor running within `server.js`; no longer uses PM2 arguments for cron scheduling.
- **Migration hardening applied**: Codebase now supports env-driven canonical storage directories; production runtime state is moved to `/var/lib/stockroom-dashboard` and repo directories are symlinked.
- **Security posture**: `npm audit --omit=dev` reports **0 vulnerabilities** after upgrading `nodemailer` and applying a safe lockfile bump for `qs`.

## Architecture Map (Runtime)

### Processes

- **PM2: `stockroom-dashboard`**
  - `node server.js`
  - Express server
  - Serves HTML pages + API routes
  - Hosts SSE endpoint `/api/sse/updates`
  - Runs unified Gmail processor for both UPS and Looker email processing

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

- Pages: `/dashboard`, `/gameplan-*`, `/ops-dashboard`, `/shipments`, `/closing-duties`, `/lost-punch`, `/time-off`, `/awards`, `/expenses`, `/admin`, plus auth pages.
- APIs: `/api/auth`, `/api/gameplan`, `/api/shipments`, `/api/closing-duties`, `/api/lost-punch`, `/api/timeoff`, `/api/feedback`, `/api/admin`, `/api/awards`, `/api/expenses`.

## Website Map (Full Web Surface)

This is the deployed web surface on the new server. For the authoritative route list, see `SERVER_MAP.md`.

### Public pages (no auth)

- `GET /` → redirects to `/login` unless session cookie exists
- `GET /login` → `public/login-v2.html`
- `GET /login-v2` → redirects to `/login`
- `GET /forgot-password` → `public/forgot-password.html`
- `GET /reset-password` → `public/reset-password.html`
- `GET /manifest.webmanifest`, `GET /sw.js`, `GET /favicon.ico`

### Public static assets (no auth)

- `GET /css/*`, `/js/*`, `/images/*`, `/icons/*`, `/vendor/*`, `/downloads/*`

### Auth-gated pages (HTML)

- `GET /home` → `public/app.html`
- `GET /dashboard` → role-based redirect to one of:
  - `/gameplan-sa`, `/gameplan-boh`, `/gameplan-tailors`, `/gameplan-management`
- `GET /gameplan-edit` → requires gameplan editor or manager/admin
- `GET /ops-dashboard`, `/operations-metrics`, `/shipments`, `/scanner`, `/qr-decode`
- `GET /store-recovery`, `/employee-discount` (alias: `/expenses`)
- `GET /closing-duties`, `/lost-punch`, `/time-off`, `/awards`, `/feedback`
- `GET /admin` → admin only

### Auth-gated static folders

- `GET /closing-duties/*` → serves images from `data/closing-duties/<date>/...`
- `GET /feedback-uploads/*` → serves images from `data/feedback-uploads/...`
- `GET /user-uploads/*` → serves user avatars from `data/user-uploads/...`

### Real-time endpoints

- `GET /api/sse/updates` → Server-Sent Events (SSE) for UI updates (auth required)

### Internal APIs (Express routers)

The server mounts routers under `/api/*` (see `SERVER_MAP.md` for the complete list). Key read/write surfaces:

- `/api/auth` → reads/writes:
  - `data/users.json`, `data/employees-v2.json`, `data/activity-log.json`
  - `data/password-reset-tokens.json`
  - `data/user-uploads/` (avatars)
- `/api/gameplan` → reads/writes:
  - `data/gameplan-daily/<date>.json`
  - `data/employees-v2.json`, `data/users.json`
  - `data/store-metrics/<date>.json`
  - `data/scan-performance-history/<date>.json`
  - `data/product-images-cache.json`
  - `data/work-expenses-config.json`
  - `data/weekly-goal-distributions.json`, `data/notes-templates.json`, `data/gameplan-templates.json`
  - `data/dashboard-data.json` (read via LookerDataProcessor)
- `/api/shipments` → reads/writes:
  - `data/shipments.json` (with backups in `data/shipments-backups/`)
  - Reads `data/employees-v2.json` for enrichment
  - Calls UPS status lookup (`utils/upsApi.js`)
- `/api/closing-duties` → reads/writes:
  - `data/closing-duties-log.json`
  - `data/closing-duties/<date>/...` (uploaded photos)
  - Reads `data/employees-v2.json`
- `/api/lost-punch` → reads/writes `data/lost-punch-log.json`
- `/api/timeoff` → reads/writes `data/time-off.json` (normalized to `{ entries: [...] }`)
- `/api/feedback` → reads/writes:
  - `data/feedback.json`
  - `data/feedback-uploads/...` (uploaded images)
- `/api/expenses` → reads/writes:
  - Reads `data/dashboard-data.json` (workRelatedExpenses)
  - Reads/writes `data/expense-order-notes.json`
  - Writes `data/expense-order-uploads/<orderId>/...`
- `/api/store-recovery` → reads/writes:
  - `data/store-recovery-scan-log.json`
  - `data/store-recovery-config.json` (also editable via admin API)
- `/api/admin` (admin-only) → reads/writes:
  - `data/store-config.json`
  - `data/awards-config.json`
  - `data/work-expenses-config.json`
  - `data/store-recovery-config.json`
  - Exports/backups via `backup.zip` / `export.zip`
- `/api/awards` → reads:
  - `data/awards-config.json`
  - `data/lost-punch-log.json`
  - `data/closing-duties-log.json`
  - `data/gameplan-daily/<date>.json`
  - `data/settings.json`

## Findings and Actions

### 1) Looker scheduler misfire (CRITICAL)

**Symptom**
- Logs showed Looker processing firing every minute, generating `dashboard-data.json` and daily metrics repeatedly.

**Root cause**
- Separate schedulers were running with potentially conflicting cron configurations; consolidated into unified processor to eliminate scheduling conflicts.

**Fix**
- Consolidated separate schedulers into unified Gmail processor running within `server.js`; no longer uses PM2 arguments for cron scheduling.

**Verification**
- Check scheduler startup line:
  - `pm2 logs stockroom-dashboard --lines 200 | rg -n "Starting.*scheduler with cron expression"`

### 2) Hardcoded repo-relative data paths (HIGH)

**Risk**
- Many modules wrote directly under `../data` relative to code paths, making migrations/permissions fragile.

**Fix**
- Implemented env-driven canonical path resolution (`utils/paths.js`) and refactored key routes and utilities to use the DAL’s canonical paths and atomic writes.

**Verification**
- Confirm PM2 env:
  - `pm2 env stockroom-dashboard | rg -n "STOCKROOM_(DATA|FILES|LOG)_DIR"`
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

### Backups

- Confirm `/var/lib/stockroom-dashboard` ownership:
  - `sudo chown -R suit:suit /var/lib/stockroom-dashboard`
- Run periodic tar backup (see docs/RUNBOOK.md).

## Notes / Next Steps

- If you want a GitHub mirror, do **not** push runtime `data/` / `files/` contents. Remove tracked artifacts and ensure `.gitignore` is enforced.
- Decide on nodemailer upgrade strategy and schedule a small maintenance window to validate email flows.

## Data Flow Map

### Looker → dashboard data (primary)

1) Unified Gmail processor runs within `server.js` via `node-cron` (default schedules for both UPS and Looker processing).
2) `utils/gmail-looker-fetcher.js` downloads attachments from Gmail IMAP and writes them under `files/`:
  - `files/dashboard-stores_performance/`, `files/dashboard-work_related_expenses/`, etc.
3) `utils/looker-data-processor.js` reads those CSV/PDF artifacts and writes:
  - `data/dashboard-data.json` (frontend consumes this indirectly through APIs)
  - `data/store-metrics/<date>.json`
  - `data/employees-v2.json` updates (employee metrics)
  - `data/scan-performance-history/<date>.json`

Frontend consumption:
- Gameplan + Ops dashboards call `/api/gameplan/*`, `/api/expenses/*`, etc.
- Those route handlers load derived JSON from `data/` and return JSON to browser JS under `public/js/*`.

### Shipments (UPS email → shipments.json)

- `server.js` starts the unified Gmail processor at runtime.
- `utils/ups-email-parser.js` (invoked by unified Gmail processor) imports shipments from Gmail and updates `data/shipments.json`.
- UI uses `/api/shipments` to view/manage shipments.

## Tailscale State (2026-01-08)

- Tailscale is installed and connected.
- Node name: `suitserver`
- Tailscale IPv4: `100.84.243.127`

## HTTPS Exposure Strategy (Recommended)

Safest + simplest for this environment: **Tailscale Serve** (HTTPS inside the tailnet; no public internet exposure).

Rationale:
- Avoids opening inbound ports on the LAN/WAN.
- Automatic TLS within tailnet; pairs well with MagicDNS.
- Keeps auth and cookies working cleanly because the app already supports reverse proxies (`trust proxy` is enabled).

## GitHub Hygiene

- Repo is git-initialized.
- `.gitignore` already excludes `node_modules/`, `.env*`, `data/`, `files/`, `logs/`, and `ssl/`.
- Do not commit symlink targets (runtime state under `/var/lib/stockroom-dashboard`).

### Post-migration commit plan (no secrets)

Goal: capture *code + docs* only.

1) Sanity check tracked secrets/state (should be empty):
  - `git ls-files | rg -n "^(data/|files/|logs/|ssl/|\.env|ecosystem\.config\.json)$" || true`

2) If anything under runtime dirs is tracked, untrack it (keeps files on disk):
  - `git rm -r --cached data files logs ssl || true`
  - `git rm --cached .env ecosystem.config.json || true`

3) Add/verify `.gitignore` (already present) and re-check:
  - `git status --porcelain=v1`

4) Commit in two safe chunks:
  - Commit A: “Post-migration docs/runbook updates”
  - Commit B: “Path normalization and scheduler fixes”

5) Before pushing anywhere remote:
  - `git grep -n "GMAIL_APP_PASSWORD\|SMTP_PASS\|tskey-auth\|BEGIN PRIVATE KEY" -- . || true`
  - Confirm `data/` and `files/` are not tracked.

