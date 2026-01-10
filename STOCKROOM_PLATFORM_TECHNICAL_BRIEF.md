# Stockroom Platform — Technical / IT Architecture Brief (Enterprise Review)

**Date:** 2026-01-08  
**Scope:** This brief is based on the current repository implementation in `/var/www/stockroom-dashboard` (Node/Express + static HTML) and associated runtime configuration (PM2). It intentionally avoids proposing or claiming any capabilities not evident in the codebase.

---

## 1) Executive Technical Summary

The Stockroom Dashboard is a self-contained, on-prem style web application:

- **Runtime:** Node.js application (`server.js`) serving static HTML/JS from `public/` and JSON APIs under `/api/*`.
- **Process model:** Managed by **PM2** with multiple processes: the web server, a Looker/Gmail ingestion scheduler, and two Python radio/transcription services.
- **Data persistence:** File-based JSON storage via a DAL (`utils/dal`) rooted at a canonical data directory (`/var/lib/stockroom-dashboard/data`) and file directory (`/var/lib/stockroom-dashboard/files`).
- **Security posture (as implemented):** Cookie-based session, “auth-by-default” routing, role/permission gating, basic security headers, and basic CSRF mitigation for API write requests.
- **Integration points:** Gmail-based ingestion for Looker export emails and UPS shipment emails; optional Microsoft Graph path exists for Looker ingestion (dependencies and endpoints are present).
- **Real-time:** SSE endpoint for updates; WebSocket endpoints used for radio monitoring/spectrum, with local UDP feeds as the source.

This architecture is operationally simple (few moving parts, no external database required) and is naturally suited to isolated deployment within a store LAN or a private overlay network.

---

## 2) System Context and Component Model

### 2.1 High-level component view

**User Clients (Browsers)**
- Access authenticated HTML pages (e.g., `/home`, `/dashboard`, `/operations-metrics`, `/shipments`, `/radio`, etc.).
- Call JSON APIs under `/api/*`.
- Receive server push via:
  - **SSE:** `GET /api/sse/updates`
  - **WebSockets:** `/ws/radio-monitor`, `/ws/radio-spectrum`

**Node/Express Web Server (`server.js`)**
- Serves static assets from `public/` with `Cache-Control: no-store` on `.js`/`.css`.
- Mounts API routers from `routes/*.js`.
- Enforces auth-by-default; only a small set of public routes/assets are unauthenticated.
- Hosts SSE broadcast mechanism and WebSocket upgrade handling for radio endpoints.
- Starts the UPS email import scheduler in-process at boot.

**Background Schedulers (Node)**
- **Looker data scheduler:** `utils/looker-scheduler.js` (cron default `30 6 * * *`, timezone `America/Los_Angeles`)
- **UPS email import scheduler:** `utils/ups-scheduler.js` (in `server.js`, default cron `0,30 8-19 * * *;0 20 * * *`, timezone `America/Los_Angeles`)

**Radio Services (Python)**
- `radio/radio_service.py` (PM2 app: `radio`)
- `radio/transcribe_worker.py` (PM2 app: `radio-transcriber`)

**Persistence Layer (File-based)**
- JSON data and uploads stored under `STOCKROOM_DATA_DIR` and `STOCKROOM_FILES_DIR`.
- DAL centralizes canonical paths (`utils/dal`).

### 2.2 Process topology (PM2)
PM2 ecosystem configuration in `ecosystem.config.json` defines:

- `stockroom-dashboard` → `server.js`
- `looker-scheduler` → `utils/looker-scheduler.js start`
- `radio` → `radio/radio_service.py` (Python interpreter: `/var/www/stockroom-dashboard/.venv/bin/python`)
- `radio-transcriber` → `radio/transcribe_worker.py` (Python interpreter: `/var/www/stockroom-dashboard/.venv/bin/python`)

Each process sets (via PM2 env):
- `STOCKROOM_DATA_DIR=/var/lib/stockroom-dashboard/data`
- `STOCKROOM_FILES_DIR=/var/lib/stockroom-dashboard/files`
- `STOCKROOM_LOG_DIR=/var/www/stockroom-dashboard/logs`

---

## 3) Deployment Model (Current State)

### 3.1 Runtime assumptions
- **OS context:** Linux server deployment.
- **Web server:** Express listens on `PORT` (default `3000`) and binds `0.0.0.0`.
- **Reverse proxy awareness:** `app.set('trust proxy', true)` is enabled to support operation behind a reverse proxy (comment references “Tailscale Serve”).

### 3.2 TLS / HTTPS behavior
- `FORCE_HTTPS` is supported via env var (`FORCE_HTTPS === 'true'`).
- When enabled, the app redirects GET/HEAD to HTTPS unless the request is via a private LAN IP host, and rejects non-GET HTTP requests with `400`.

### 3.3 Static assets and caching
- Static files served via `express.static(public/)`.
- `.js` and `.css` are served with `Cache-Control: no-store` (intended to avoid stale assets during rapid deployments).

---

## 4) External Integrations and Interfaces

### 4.1 Gmail-based ingestion (Looker + UPS)
Implemented via Node dependencies and scheduler logic:

- Looker scheduler description states it “fetches Looker data from Gmail and processes it daily.”
- UPS scheduler imports shipments from UPS emails, requiring Gmail credentials.

**Credential inputs (observed):**
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` are referenced in UPS scheduler.

### 4.2 Microsoft Graph (optional path)
- Dependencies include `@azure/msal-node` and `@microsoft/microsoft-graph-client`.
- `SERVER_MAP.md` lists Microsoft-related endpoints in `routes/gameplan.js` (e.g., `/api/gameplan/fetch-microsoft`, `/api/gameplan/microsoft-status`) and env vars `MS_CLIENT_ID`, `MS_TENANT_ID`.

This indicates an alternate ingestion method exists in the API surface for Looker-related import/sync.

### 4.3 UPS (operational workflows)
- UPS scheduler imports shipment records from email.
- Shipments API supports email/tracking imports (see `SERVER_MAP.md` under `/api/shipments`).
- There is an authenticated UI page `/ups-extension` serving `public/ups-extension.html` for Chrome extension distribution/instructions.

### 4.4 Real-time mechanisms
- **SSE:** `GET /api/sse/updates` (auth required) maintains client list and sends heartbeat every 30 seconds.
- **Radio WebSockets:**
  - `/ws/radio-monitor`
  - `/ws/radio-spectrum`

**Radio internal feeds:**
- UDP → WebSocket bridge is implemented in `server.js`:
  - Monitor audio: UDP `127.0.0.1:7355` (default) with PCM frames described as “100ms chunks of mono int16 PCM @ 24000 Hz”.
  - Spectrum: UDP `127.0.0.1:7356` (default) sending JSON payloads.

---

## 5) Security Model (As Implemented)

### 5.1 Authentication and session handling
- Sessions are stored in a cookie named `userSession`.
- `middleware/auth.js` parses the cookie (JSON), then **validates the user still exists** by reading the users data file (`dal.paths.usersFile`, referenced as `users.json` in code comments/logs).
- If validation fails (missing user or users file read failure), the middleware **fails closed** (clears cookie and requires re-authentication).

### 5.2 Authorization
- Role/permission flags are computed in `middleware/auth.js` (e.g., `isAdmin`, `isManager`, `canEditGameplan`, `canConfigRadio`, `canManageLostPunch`).
- Server-side route guards exist:
  - `adminOnly`, `managerOnly`, `gameplanEditorOnly` in `server.js`.
- Admin-only routes include:
  - `/api/admin/*`
  - `/admin` (HTML)
  - `/radio-admin` redirects to `/admin#radio`.

### 5.3 Auth-by-default routing
In `server.js`:
- Everything requires authentication **except** a small set of explicit public routes and static asset prefixes.
- `/api/auth` is explicitly public (auth endpoints handle their own checks).

### 5.4 CSRF mitigation for cookie-auth APIs
- For non-GET `/api/*` requests, the server checks `Origin` (preferred) or `Referer` host against the expected host (`x-forwarded-host` or `host`).
- If mismatch, returns `403` with JSON error.

### 5.5 HTTP security headers
Set globally in `server.js`:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- Conditional `Strict-Transport-Security` when request is considered secure.
- A Content Security Policy is adjusted to include a `frame-ancestors` directive allowing `self` and `builder.io` domains.

### 5.6 WebSocket access control
- WebSocket upgrades validate the session by parsing `userSession` from the `Cookie` header and validating against `users.json` (via DAL path).
- Unauthorized connections receive `401` and are closed.

---

## 6) Data Model and Storage (As Implemented)

### 6.1 Canonical directories
PM2 config sets canonical storage locations:
- **Data:** `/var/lib/stockroom-dashboard/data`
- **Files:** `/var/lib/stockroom-dashboard/files`
- **Logs:** `/var/www/stockroom-dashboard/logs`

### 6.2 Data persistence approach
- Primary persistence is JSON files and file uploads managed via a DAL (`utils/dal`).
- Scheduler logs are written under `data/scheduler-logs/` (see `utils/looker-scheduler.js` and `utils/ups-scheduler.js`).
- Sync results are saved under `data/sync-results/`.

### 6.3 Authenticated file serving
`SERVER_MAP.md` documents auth-protected static folders routed by Express:
- `/closing-duties/*` → closing duties photo directory
- `/feedback-uploads/*` → feedback uploads
- `/user-uploads/*` → user uploads

---

## 7) API Surface and UI Surface (Inventory)

A complete route inventory is captured in `SERVER_MAP.md`.

### 7.1 UI routes (HTML)
Pages served from `public/*.html` include (non-exhaustive; see `SERVER_MAP.md` for full list):
- Auth: `/login`, `/forgot-password`, `/reset-password`
- Home: `/home`
- Role-based dashboard: `/dashboard` (redirects to a role page)
- Role pages: `/gameplan-sa`, `/gameplan-boh`, `/gameplan-tailors`, `/gameplan-management`
- Operations: `/operations-metrics`, `/ops-dashboard`
- Workflows: `/shipments`, `/closing-duties`, `/lost-punch`, `/time-off`, `/feedback`, `/employee-discount`
- Tools: `/scanner`, `/store-recovery`, `/qr-decode`
- Radio: `/radio`, `/radio-transcripts`, `/radio-admin` (admin only)
- Admin: `/admin` (admin only)

### 7.2 API routers
Mounted routers in `server.js` (see also `SERVER_MAP.md`):
- `/api/auth`
- `/api/gameplan`
- `/api/shipments`
- `/api/closing-duties`
- `/api/lost-punch`
- `/api/timeoff`
- `/api/feedback`
- `/api/admin` (admin only)
- `/api/awards`
- `/api/radio`
- `/api/expenses`
- `/api/store-recovery`

---

## 8) Maintainability and Operational Characteristics

### 8.1 Code organization
- `server.js` is the single entrypoint and contains cross-cutting concerns (auth-by-default, headers, CSRF check, SSE, WebSocket upgrades).
- Feature APIs are modularized in `routes/*.js`.
- Persistence paths are centralized in the DAL (`utils/dal`).
- Scheduling logic is explicit and isolated in `utils/looker-scheduler.js` and `utils/ups-scheduler.js`.

### 8.2 Operability
- PM2 provides process supervision and log file separation (ecosystem config includes dedicated logs for radio processes).
- Scheduler jobs maintain their own log files under the data directory.

### 8.3 Change safety
- Static assets are served with `no-store` for `.js`/`.css`, reducing “stale frontend” issues after deployment.
- Auth middleware “fails closed” if user validation cannot be performed.

---

## 9) Fit Within Suitsupply Infrastructure (Based on Current Design)

The current implementation aligns with a “store-local + centrally managed” pattern:

- **Isolation-friendly:** File-based persistence and local schedulers reduce external dependencies; the app can operate in an isolated network segment.
- **Network model:** The server explicitly supports operation behind a reverse proxy (`trust proxy`) and includes optional HTTPS enforcement.
- **Identity alignment:** Current auth is application-managed cookie session validated against a local users file. Integrating with corporate identity (SSO/IdP) is not part of the current implementation and would be a future change.
- **Data gravity:** Persisted state is localized to the server filesystem under canonical directories; this is compatible with store-local deployments and centralized backup/replication strategies.

---

## 10) What Is Needed to Productionize Properly (Gap Analysis / Recommendations)

This section describes additional work typically required for enterprise-grade productionization. These items are **not** claimed to exist today; they are recommended controls/engineering steps based on the observed architecture.

### 10.1 Identity and session hardening
- Replace or wrap local cookie JSON sessions with a signed, tamper-evident session format and/or server-side session store.
- If aligning to Suitsupply identity standards, implement SSO integration (e.g., OIDC/SAML) and map enterprise groups/roles to app permissions.

### 10.2 Secrets management
- Move Gmail credentials and any other integration secrets from `.env`/process environment into an enterprise secrets manager.
- Establish rotation procedures (especially for app passwords if still used).

### 10.3 Data durability, backup, and retention
- Formalize backup strategy for `/var/lib/stockroom-dashboard/data` and `/var/lib/stockroom-dashboard/files` (snapshot schedule, retention, restore testing).
- Define retention policy for:
  - scheduler logs (`data/scheduler-logs/`)
  - sync results (`data/sync-results/`)
  - uploads and audio/transcription artifacts (as applicable)

### 10.4 Observability
- Centralize logs (PM2 stdout/stderr + app logs + scheduler logs) into the enterprise log pipeline.
- Add health endpoints and/or external monitoring checks around:
  - web server availability
  - scheduler run outcomes
  - radio services health (already has `/api/radio/status` per server map)

### 10.5 Release engineering and configuration management
- Establish CI/CD pipeline that:
  - validates `ecosystem.config.json` and config schema
  - runs any linters/static checks available
  - creates an immutable deploy artifact
- Document environment variables required for each integration, including safe defaults.

### 10.6 Security controls and posture
- Confirm TLS termination strategy (reverse proxy standardization) and enforce HTTPS as a policy where appropriate.
- Review CSP requirements (currently allows Builder.io framing) against enterprise security standards.
- Perform threat modeling for cookie auth + CSRF protections under actual proxy/hostname configurations.

### 10.7 Dependency and platform lifecycle
- Maintain OS and runtime baselines (Node.js version, Python venv dependencies) with a patch cadence.
- Consider containerization if it better fits Suitsupply’s standard runtime model; the current process split (Node + Python services + schedulers) is compatible with either VM+PM2 or container orchestration, but would require packaging decisions.

---

## 11) Risk Notes (Conservative, Based on Observed Implementation)

- **File-based persistence:** Simple and robust for single-instance deployments; introduces considerations for concurrency, backups, and multi-node scaling.
- **In-process scheduler startup:** UPS scheduler is started from within `server.js`, coupling the scheduler lifecycle to the web process lifecycle (acceptable for single-node; worth revisiting for separation-of-duties in enterprise ops).
- **Cookie session content:** Session validation is performed against `users.json`, but session format is JSON-in-cookie; enterprise hardening typically adds signing/encryption and centralized revocation controls.

---

## 12) Appendix: Primary Sources in Repo

- `server.js` — routing, middleware, SSE, WebSocket upgrades, UPS scheduler startup
- `ecosystem.config.json` — PM2 process definitions and canonical storage env vars
- `middleware/auth.js` — cookie session validation and role derivation
- `utils/looker-scheduler.js` — Looker/Gmail ingestion scheduler
- `utils/ups-scheduler.js` — UPS email import scheduler
- `SERVER_MAP.md` — authoritative map of UI routes, API routes, and key data paths
