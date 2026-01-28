# Daily Operations Dashboard — Server Map (Routes + Config)

**Last Updated:** January 22, 2026  
**Server:** Express.js on Node.js 18+  
**Database:** PostgreSQL 15  
**Entry Point:** `server.js`

This repo's server entrypoint is `server.js` (Express). Route handlers live in `routes/*.js` (21 route files). Persistent data is stored in PostgreSQL via the DAL in `utils/dal/pg.js`.

## Quick Stats

- **Total API Endpoints:** 58+
- **Route Files:** 21
- **Server Port:** 3000 (default) - proxied by Apache on port 80
- **Local IP:** 10.201.48.17
- **Tailscale:** suitserver.tail39e95f.ts.net
- **Smart Network Detection:** Enabled (auto-switches WiFi/Tailscale)

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
  - Provides WebSocket updates at various endpoints

### Static Assets
- `GET /css/*`, `GET /js/*`, `GET /images/*`, etc via `express.static(public/)`
  - `.js`/`.css` are served with `Cache-Control: no-store` to avoid stale deploys
- Auth-protected static folders:
  - `GET /closing-duties/*` → `data/closing-duties/`
  - `GET /feedback-uploads/*` → `data/feedback-uploads/`
  - `GET /user-uploads/*` → `data/user-uploads/`

### Auth Model (high level)
- Cookie session is handled by `middleware/auth-pg.js` + `routes/auth-pg.js`
- PostgreSQL stores user sessions and authentication data
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
- `GET /lost-punch` → `public/lost-punch.html`
- `GET /closing-duties` → `public/closing-duties.html`
- `GET /time-off` → `public/time-off.html`
- `GET /awards` → `public/awards.html`
- `GET /expenses` → `public/expenses.html`
- `GET /feedback` → `public/feedback.html`

- `GET /admin` → `public/admin.html` (**admin only**)

## API Routes (Mounted Routers)

Mounted in `server.js`:

- `app.use('/api/webhooks', webhookRoutes)` → `routes/webhooks.js` (**NO AUTH - Public webhooks**)
- `app.use('/api/auth', authRoutes)` → `routes/auth.js`
- `app.use('/api/shipments', authMiddleware, shipmentsRoutes)` → `routes/shipments.js`
- `app.use('/api/closing-duties', authMiddleware, closingDutiesRoutes)` → `routes/closingDuties.js`
- `app.use('/api/lost-punch', authMiddleware, lostPunchRoutes)` → `routes/lostPunch.js`
- `app.use('/api/gameplan', authMiddleware, gameplanRoutes)` → `routes/gameplan.js`
- `app.use('/api/timeoff', authMiddleware, timeoffRoutes)` → `routes/timeoff.js`
- `app.use('/api/feedback', authMiddleware, feedbackRoutes)` → `routes/feedback.js`
- `app.use('/api/admin', authMiddleware, adminOnly, adminRoutes)` → `routes/admin.js` (**admin only**)
- `app.use('/api/awards', authMiddleware, awardsRoutes)` → `routes/awards.js`
- `app.use('/api/expenses', authMiddleware, expensesRoutes)` → `routes/expenses.js`
- `app.use('/api/store-recovery', authMiddleware, storeRecoveryRoutes)` → `routes/storeRecovery.js`
- `app.use('/api/pickups', authMiddleware, pickupsRoutes)` → `routes/pickups.js`
- `app.use('/api/waitwhile', authMiddleware, waitwhileRoutes)` → `routes/waitwhile.js`
- `app.use('/api/manhattan', authMiddleware, manhattanRoutes)` → `routes/manhattan.js`
- `app.use('/api/rfid', authMiddleware, rfidRoutes)` → `routes/rfid.js`
- `app.use('/api/logs', clientLogsRoutes)` → `routes/clientLogs.js`
- `app.use('/api/printers', authMiddleware, printersRoutes)` → `routes/printers.js`
- `app.use('/api/ai', authMiddleware, aiAssignmentRoutes)` → `routes/ai-assignment.js`
- `app.use('/api/mock', mockApiRoutes)` → `routes/mockApi.js`

### Special Endpoints (No Auth Required)

- `GET /api/health` - Health check endpoint (returns `{status: 'ok', timestamp}`)

### `/api/webhooks` (NO AUTH) — `routes/webhooks.js`
**Gmail Push Notifications (January 2026)**
- `POST /api/webhooks/gmail` - Google Cloud Pub/Sub push notification endpoint
  - Receives real-time Gmail notifications
  - Decodes base64 Pub/Sub message
  - Triggers async email processing via `unified-gmail-processor.js`
  - Responds 200 OK immediately (required by Google within 10 seconds)

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
- `GET /api/sse/updates` (auth required) - Real-time server-sent events for dashboard updates

## Recent Features (January 2026)

### Gmail Push Notifications
- **Real-time email processing** using Gmail API + Google Cloud Pub/Sub
- **OAuth 2.0 authentication** with automatic token refresh
- **Gmail watch** expires every 7 days, auto-renewed by cron job
- **PM2 process:** `gmail-watch-renewal` - Runs renewal cron
- **Credentials:** `data/gmail-credentials.json`, `data/gmail-token.json`, `data/gmail-watch-info.json`
- **Commands:**
  - `npm run gmail-watch-setup` - Enable Gmail watch
  - `npm run gmail-watch-status` - Check watch status

### Smart Network Detection  
- **Automatic WiFi/Tailscale switching** for optimal performance
- **Local WiFi users** (10.201.48.x) → Auto-redirect to `http://10.201.48.17/` (1000+ Mbps)
- **Remote users** → Stay on `https://suitserver.tail39e95f.ts.net/` (Tailscale 10 Mbps)
- **JavaScript:** `public/js/network-detect.js` - Loaded on all gameplan and admin pages
- **Detection:** Tests local IP connectivity, redirects if reachable
- **Test page:** `https://suitserver.tail39e95f.ts.net/network-test.html`

### PWA Enhancements
- **App Name:** Changed from "Stockroom Dashboard" to "Daily Operations"
- **Add to Home Screen:** iOS-optimized installation prompt
- **JavaScript:** `public/js/add-to-homescreen.js` - Balloon prompt on home page
- **Features:** 
  - Shows after 2 seconds on first visit
  - Dismissible with 7-day cooldown
  - Auto-dismisses after 15 seconds
  - Dark mode support
- **iOS optimization:** Black translucent status bar, full-screen mode, no zoom

## Config Files / Data Paths

The JSON DAL defines canonical paths in `utils/dal/json.js`:

- Store config: `data/store-config.json` (admin editable)
  - Example: `docs/examples/store-config.json`
- Users: `data/users.json` (**DEPRECATED - migrated to PostgreSQL**)
- Employees index: `data/employees-v2.json`
- Dashboard payload cache: `data/dashboard-data.json`
- Game plan daily data: `data/gameplan-daily/` (**DEPRECATED - migrated to PostgreSQL**)
- Shipments: `data/shipments.json` (+ backups in `data/shipments-backups/`)
- Time off: `data/time-off.json` (**DEPRECATED - migrated to PostgreSQL**)
- Work expenses limits: `data/work-expenses-config.json`
- Awards config: `data/awards-config.json`
- Gmail API: `data/gmail-credentials.json`, `data/gmail-token.json`, `data/gmail-watch-info.json` (**NEW - Jan 2026**)
- Logs/metrics:
  - `data/activity-log.json`
  - `data/scan-performance-history/`
  - `data/store-metrics/`
  - `data/scheduler-logs/`
  - `data/cache/`

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

## Known TODOs & Incomplete Features

### Minor Issues
1. **Hardcoded Store Value** - `routes/gameplan.js:2561`
   - Currently hardcoded to 'SF' (San Francisco)
   - Should be made dynamic based on user's store

### Incomplete Integrations
1. **Manhattan POS** - `routes/manhattan.js:536`
   - Order and unit sync logic not implemented
   - Placeholder endpoints exist but need real integration

2. **WaitWhile Pickup System** - `routes/pickups.js:290,299`
   - Database creation logic incomplete
   - Inventory sync logic placeholder
   - See `routes/waitwhile.js:489` for real-time sync placeholder

### Migration Status
- ✅ **PostgreSQL Migration Complete** - All user data, gameplan, time-off, closing duties migrated
- ✅ **Gmail Push Notifications** - Fully implemented and operational
- ✅ **Network Optimization** - Smart WiFi/Tailscale detection working
- ✅ **PWA Enhancements** - iOS optimization complete
- ⏳ **Manhattan Integration** - Pending implementation
- ⏳ **WaitWhile Integration** - Pending completion

## PM2 Processes

Current running processes:
- `stockroom-dashboard` (id:6) - Main Express server
- `gmail-watch-renewal` (id:7) - Gmail watch auto-renewal cron

## Environment Variables

Key environment variables in `.env`:
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `GMAIL_USER` - Gmail account for push notifications
- `GMAIL_PUBSUB_TOPIC` - Google Cloud Pub/Sub topic
- `SESSION_SECRET` - Session encryption key
- `NODE_ENV` - Environment (production/development)

See `.env.example` for complete list.

---

**Last Updated:** January 22, 2026  
**Documentation:** See `README.md`, `NETWORK_OPTIMIZATION.md`, `GMAIL_PUSH_QUICKSTART.md`  
**Legacy Docs:** Moved to `legacy-docs/` folder
