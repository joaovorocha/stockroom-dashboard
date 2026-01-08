# Stockroom Dashboard — Server Map (Routes + Config)

This repo’s server entrypoint is `server.js` (Express). Route handlers live in `routes/*.js`. Persistent data is stored in `data/` (JSON files) via the DAL in `utils/dal/`.

## How To Get IPs (Client/Proxy/Tailscale)

- **Admin API**: `GET /api/admin/network-info`
  - Returns:
    - Client IP info (`req.ip`, socket remote address)
    - Proxy chain (`x-forwarded-for`, `forwarded`, etc)
    - Server interface IPs (IPv4/IPv6) and **Tailscale IP(s)** (heuristic: `tailscale*` interfaces + `100.64.0.0/10`)
- **Shell (server)**:
  - `ip a | rg -n \"tailscale|100\\.\"`
  - `tailscale ip -4` (if installed)

## App Structure

### Entrypoint
- `server.js`
  - Starts Express on `PORT` (default `3000`) and binds `0.0.0.0`
  - Mounts all `/api/*` routers and serves `public/*.html` pages
  - Provides SSE updates at `GET /api/sse/updates`

### Static Assets
- `GET /css/*`, `GET /js/*`, `GET /images/*`, etc via `express.static(public/)`
  - `.js`/`.css` are served with `Cache-Control: no-store` to avoid stale deploys
- Auth-protected static folders:
  - `GET /closing-duties/*` → `data/closing-duties/`
  - `GET /feedback-uploads/*` → `data/feedback-uploads/`
  - `GET /user-uploads/*` → `data/user-uploads/`

### Auth Model (high level)
- Cookie session is handled by `middleware/auth.js` + `routes/auth.js`
- Any direct request for a `.html` file is forced through auth middleware (prevents bypassing routes)

## HTML Routes (Pages)

All of these are served from `public/*.html` and require auth unless stated otherwise:

- `GET /login` → `public/login-v2.html`
- `GET /forgot-password` → `public/forgot-password.html` (no auth)
- `GET /reset-password` → `public/reset-password.html` (no auth)

- `GET /` → redirect to `/home` if authed, else `/login`
- `GET /index.html` → same as `/` (bookmark-friendly)
- `GET /home` → `public/app.html`
- `GET /app` → redirect to `/home` (backwards compatibility)

- `GET /dashboard` → redirects to:
  - Admins: `/gameplan-management`
  - Role-based: `/gameplan-sa` | `/gameplan-boh` | `/gameplan-tailors` | `/gameplan-management`

- `GET /gameplan-sa` → `public/gameplan-sa.html`
- `GET /gameplan-boh` → `public/gameplan-boh.html`
- `GET /gameplan-tailors` → `public/gameplan-tailors.html`
- `GET /gameplan-management` → `public/gameplan-management.html`
- `GET /gameplan-edit` → `public/gameplan-edit.html` (requires `canEditGameplan` OR manager/admin)

- `GET /operations-metrics` → `public/operations-metrics.html`
- `GET /ops-dashboard` → `public/ops-dashboard.html`
- `GET /shipments` → `public/shipments.html`
- `GET /scanner` → `public/scanner.html`
- `GET /radio` → `public/radio.html`
- `GET /radio-transcripts` → `public/radio-transcripts.html`
- `GET /radio-admin` → `public/radio-admin.html` (**admin only**)
- `GET /lost-punch` → `public/lost-punch.html`
- `GET /closing-duties` → `public/closing-duties.html`
- `GET /time-off` → `public/time-off.html`
- `GET /awards` → `public/awards.html`
- `GET /expenses` → `public/expenses.html`
- `GET /feedback` → `public/feedback.html`

- `GET /admin` → `public/admin.html` (**admin only**)

## API Routes (Mounted Routers)

Mounted in `server.js`:

- `app.use('/api/auth', authRoutes)` → `routes/auth.js`
- `app.use('/api/shipments', authMiddleware, shipmentsRoutes)` → `routes/shipments.js`
- `app.use('/api/closing-duties', authMiddleware, closingDutiesRoutes)` → `routes/closingDuties.js`
- `app.use('/api/lost-punch', authMiddleware, lostPunchRoutes)` → `routes/lostPunch.js`
- `app.use('/api/gameplan', authMiddleware, gameplanRoutes)` → `routes/gameplan.js`
- `app.use('/api/timeoff', authMiddleware, timeoffRoutes)` → `routes/timeoff.js`
- `app.use('/api/feedback', authMiddleware, feedbackRoutes)` → `routes/feedback.js`
- `app.use('/api/admin', authMiddleware, adminOnly, adminRoutes)` → `routes/admin.js` (**admin only**)
- `app.use('/api/awards', authMiddleware, awardsRoutes)` → `routes/awards.js`
- `app.use('/api/radio', authMiddleware, radioRoutes)` → `routes/radio.js`
- `app.use('/api/expenses', authMiddleware, expensesRoutes)` → `routes/expenses.js`
- `app.use('/api/store-recovery', authMiddleware, storeRecoveryRoutes)` → `routes/storeRecovery.js`

### `/api/admin` (admin only) — `routes/admin.js`
- `GET /api/admin/store-config`
- `POST /api/admin/store-config`
- `GET /api/admin/tomato-awards`
- `POST /api/admin/tomato-awards/reset`
- `GET /api/admin/work-expenses-config`
- `POST /api/admin/work-expenses-config`
- `GET /api/admin/network-info` (IP/proxy/Tailscale debug)
- `GET /api/admin/backup.zip`
- `GET /api/admin/export.zip`

### `/api/auth` — `routes/auth.js`
- `POST /api/auth/login`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `POST /api/auth/logout`
- `GET /api/auth/check`
- `POST /api/auth/switch`
- `GET /api/auth/users`
- `POST /api/auth/users`
- `PUT /api/auth/users/:id`
- `POST /api/auth/profile/complete`
- `POST /api/auth/users/:id/photo`
- `DELETE /api/auth/users/:id`
- `GET /api/auth/activity`

### `/api/gameplan` — `routes/gameplan.js`
- `GET /api/gameplan/today`
- `GET /api/gameplan/yesterday`
- `GET /api/gameplan/date/:date`
- `POST /api/gameplan/save` (manager/admin)
- `GET /api/gameplan/employees`
- `GET /api/gameplan/employees/:type`
- `POST /api/gameplan/employees` (manager/admin)
- `POST /api/gameplan/employees/move` (manager/admin)
- `GET /api/gameplan/metrics`
- `POST /api/gameplan/metrics` (manager/admin)
- `GET /api/gameplan/loans`
- `GET /api/gameplan/scan-performance/history`
- `GET /api/gameplan/best-sellers`
- `GET /api/gameplan/product-image/:code`
- `GET /api/gameplan/appointments`
- `POST /api/gameplan/sync` (manager/admin)
- `GET /api/gameplan/sync-status`
- Looker import/sync:
  - `POST /api/gameplan/import-looker` (manager/admin)
  - `POST /api/gameplan/fetch-gmail` (manager/admin)
  - `POST /api/gameplan/fetch-microsoft` (manager/admin)
  - `GET /api/gameplan/microsoft-status`
  - `POST /api/gameplan/process-looker` (manager/admin)
  - `POST /api/gameplan/sync-looker` (manager/admin)
- Store config + weekly goals:
  - `GET /api/gameplan/settings`
  - `POST /api/gameplan/settings` (manager/admin)
  - `GET /api/gameplan/store-config` (read-only)
  - `GET /api/gameplan/weekly-goal-distribution/:weekKey`
  - `POST /api/gameplan/weekly-goal-distribution/:weekKey` (manager/admin)
- Notes templates:
  - `GET /api/gameplan/notes-templates` (manager/admin)
  - `POST /api/gameplan/notes-templates` (manager/admin)
  - `PUT /api/gameplan/notes-templates/:id` (manager/admin)
  - `DELETE /api/gameplan/notes-templates/:id` (manager/admin)

### `/api/expenses` — `routes/expenses.js`
- `GET /api/expenses/config`
- `GET /api/expenses` (orders + employees + totals)
- `GET /api/expenses/status`
- Notes + attachments:
  - `GET /api/expenses/orders/:orderId/notes`
  - `POST /api/expenses/orders/:orderId/notes`
  - `POST /api/expenses/orders/:orderId/attachments`
  - `GET /api/expenses/orders/:orderId/attachments/:attachmentId`

### `/api/store-recovery` — `routes/storeRecovery.js`
- `GET /api/store-recovery/recent`
- `GET /api/store-recovery/lookup?epc=...&sku=...&ean=...`
- `POST /api/store-recovery/scan` (persists scan + broadcasts SSE update)

### `/api/radio` — `routes/radio.js`
- `GET /api/radio/status`
- `GET /api/radio/live`
- `GET /api/radio/config`
- `POST /api/radio/config` (privileged: admin/manager/canConfigRadio)
- Service controls:
  - `GET /api/radio/service`
  - `POST /api/radio/service/start`
  - `POST /api/radio/service/stop`
  - `POST /api/radio/rtl/kill`
- `GET /api/radio/transcripts`

### `/api/shipments` — `routes/shipments.js`
- `GET /api/shipments`
- `POST /api/shipments/add`
- `POST /api/shipments`
- `PUT /api/shipments/:id`
- `DELETE /api/shipments/:id`
- Imports:
  - `POST /api/shipments/import-email`
  - `POST /api/shipments/import-tracking`

### `/api/lost-punch` — `routes/lostPunch.js`
- `GET /api/lost-punch`
- `POST /api/lost-punch`
- `POST /api/lost-punch/batch`
- `GET /api/lost-punch/my-entries`
- `POST /api/lost-punch/submit`

### `/api/closing-duties` — `routes/closingDuties.js`
- `GET /api/closing-duties/employees`
- `GET /api/closing-duties`
- `GET /api/closing-duties/:date`
- `POST /api/closing-duties/submit` (with photo upload)

### `/api/timeoff` — `routes/timeoff.js`
- `GET /api/timeoff`
- `POST /api/timeoff/request`
- `PUT /api/timeoff/:id`
- `DELETE /api/timeoff/:id`

### `/api/feedback` — `routes/feedback.js`
- `GET /api/feedback`
- `POST /api/feedback` (with image upload)
- `DELETE /api/feedback/:id`

### `/api/awards` — `routes/awards.js`
- `GET /api/awards/tomato`

### SSE (server push)
- `GET /api/sse/updates` (auth required)

## Config Files / Data Paths

The JSON DAL defines canonical paths in `utils/dal/json.js`:

- Store config: `data/store-config.json` (admin editable)
  - Example: `docs/examples/store-config.json`
- Users: `data/users.json`
- Employees index: `data/employees-v2.json`
- Dashboard payload cache: `data/dashboard-data.json`
- Game plan daily data: `data/gameplan-daily/`
- Shipments: `data/shipments.json` (+ backups in `data/shipments-backups/`)
- Time off: `data/time-off.json`
- Work expenses limits: `data/work-expenses-config.json`
- Awards config: `data/awards-config.json`
- Logs/metrics:
  - `data/activity-log.json`
  - `data/scan-performance-history/`
  - `data/store-metrics/`

### Work-Related Expenses (Employee Discount)
- Looker email import assets live under `files/dashboard-work_related_expenses/`
- Per-order notes and uploads:
  - `data/expense-order-notes.json`
  - `data/expense-order-uploads/<orderId>/...`

## Environment Variables (common)

- `PORT` (default `3000`)
- `APP_BASE_URL` (used in email links; `utils/mailer.js`)
- Gmail/SMTP (email + imports):
  - `GMAIL_USER`, `GMAIL_APP_PASSWORD`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- UPS email scheduler (runs in `server.js`):
  - `UPS_EMAIL_IMPORT_CRON`
  - `UPS_EMAIL_IMPORT_DAYS`
  - `UPS_EMAIL_DELETE_AFTER_IMPORT` (`true` to delete emails after importing; default is safe/no delete)
- Microsoft Graph (optional Looker email import):
  - `MS_CLIENT_ID`, `MS_TENANT_ID`
- UPS API (optional/future):
  - `UPS_CLIENT_ID` / `UPS_OAUTH_CLIENT_ID`
  - `UPS_CLIENT_SECRET` / `UPS_OAUTH_CLIENT_SECRET`
  - `UPS_MERCHANT_ID` / `UPS_ACCOUNT_NUMBER`
  - `UPS_ENV`
