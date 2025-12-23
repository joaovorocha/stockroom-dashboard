# Multi‑Store Rollout (Draft)

This repo currently runs a **single-store instance** with local JSON files under `data/`.
To make it easy to deploy to **all SuitSupply stores**, we should make the app multi-tenant (“multi-store”) with a stable data access layer.

## Goals
- One codebase supports **many stores** without copy/pasting folders.
- Store-specific settings are config-driven:
  - timezone (used for “midnight reset”, weekly boundaries)
  - currency + formatting
  - Looker parameters (Location, contract codes, dashboard URLs)
  - enabled/disabled pages per store (feature flags)
- Storage is abstracted behind a DAL so we can swap JSON → SQL later.

## Recommended structure
### 1) Store identity (“storeId”)
Pick a stable store key, e.g. `sr-us-sf-maiden`.

**Where it comes from**
- `process.env.STORE_ID` (simplest for a single instance)
- OR derive from subdomain/host (`sf.dashboard...` → `sr-us-sf-maiden`)
- OR a “store picker” for HQ/admin users.

### 2) Data layout
Instead of `data/<file>.json`, move to:
```
data/
  stores/
    <storeId>/
      config.json
      users.json
      employees.json
      time-off.json
      gameplan-daily/
      store-metrics/
      scan-performance-history/
      shipments.json
      closing-duties/
      ...
```

This keeps data clean per store and makes backups/export trivial.

### 3) Config schema (store-level)
Example: `docs/examples/store-config.json` (timezone, currency, looker embeds, feature flags).

### 4) DAL (Data Access Layer)
Create a stable interface used by routes and processors:
- `dal.getUsers() / dal.saveUsers()`
- `dal.getEmployees() / dal.saveEmployees()`
- `dal.getTimeOff() / dal.saveTimeOff()`
- `dal.getGamePlan(date) / dal.saveGamePlan(date, plan)`
- `dal.getMetrics(date) / dal.saveMetrics(date, metrics)`

Implementation v1 uses JSON per-store (`utils/dal/fs-json.js`).
Later we can replace with SQL (Postgres) without rewriting routes/UI.

### 5) Migration plan
1) Introduce store context + DAL (still reading current files).
2) Add `storeId` and begin writing to `data/stores/<storeId>/...` in parallel.
3) Migrate legacy data files into store folder once stable.
4) Optional: add SQL backend and a migration script to import JSON.

## Notes on SQL (future)
SQL is a good idea once:
- multiple stores
- history queries (awards/tomato, analytics)
- concurrency (many users editing)

Suggested SQL boundary:
- Keep “big blobs” like closing-duty photos on filesystem/object storage
- Keep structured metadata + history in SQL

## Current risks / tech debt (from logs)
- Repeated runtime errors around Time Off (`routes/timeoff.js`), plus some missing file lookups.
- Some features write state into repo-tracked files under `data/` (should be store-scoped and ignored from git).
- External dependencies (Gmail/IMAP) can time out; should be isolated and retried with clearer status in UI.

