# Stockroom Dashboard — Route / Feature Checklist

This is a migration-audit oriented checklist (not a full QA plan). For a full route inventory, see `SERVER_MAP.md`.

Legend:
- **OK (reviewed)**: Audited in this migration session
- **Needs review**: Not fully audited in this migration session

## Pages

- **OK (reviewed)**
  - `/radio` (page exists; backend storage paths hardened)
  - `/radio-transcripts` (page exists; backend storage paths hardened)

- **Needs review**
  - `/dashboard`, `/gameplan-*`, `/gameplan-edit`
  - `/ops-dashboard`, `/operations-metrics`
  - `/shipments`, `/scanner`
  - `/lost-punch`, `/closing-duties`, `/time-off`
  - `/awards`, `/expenses`, `/feedback`
  - `/admin`, `/radio-admin`

## APIs

- **OK (reviewed / path-hardening applied)**
  - `/api/timeoff` (migrated to DAL paths + atomic JSON writes)
  - `/api/lost-punch` (migrated to DAL paths + atomic JSON writes)
  - `/api/closing-duties` (migrated to DAL paths + atomic JSON writes; uploads now go under canonical closing-duties dir)
  - `/api/feedback` (migrated to DAL paths + atomic JSON writes; uploads and delete-path mapping fixed)
  - `/api/radio` (migrated to canonical data dir; logs dir via `STOCKROOM_LOG_DIR`)

- **Needs review**
  - `/api/auth`
  - `/api/gameplan`
  - `/api/shipments`
  - `/api/closing-duties`
  - `/api/admin`
  - `/api/awards`
  - `/api/expenses`
  - `/api/sse/updates` (SSE)

## Background jobs

- **OK (reviewed / fixed)**
  - Unified Gmail processor (`utils/unified-gmail-processor.js` via `server.js`): handles both Looker and UPS email processing with safe default schedules.

