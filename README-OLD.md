# Stockroom Dashboard (Game Plan)

## What this is
- Node/Express app that serves a role-based “Daily Game Plan” dashboard.

## Main pages (auth required)
- `/dashboard` → redirects based on logged-in role:
  - `SA` → `/gameplan-sa`
  - `TAILOR` → `/gameplan-tailors`
  - `BOH` → `/gameplan-boh`
  - `MANAGEMENT`/`ADMIN` → `/gameplan-management`
- `/gameplan-sa` (Sales Associates)
- `/gameplan-tailors` (Tailors)
- `/gameplan-boh` (Back of House)
- `/gameplan-management` (Management overview)
- `/gameplan-edit` (manager-only edit page)

## Key files
- `server.js` — Express server, routing, auth enforcement
- `routes/` — API routes
- `middleware/auth.js` — cookie-based auth middleware
- `public/` — HTML pages + static assets (css/js/images)
- `public/js/dashboard.js` — frontend logic shared by Game Plan pages
- `data/` — runtime data files (employees, gameplan daily saves, metrics, logs)
- `legacy/` — old/duplicate files kept for reference

## Run locally
- `npm install`
- `npm start`

## Optional: UPS Tracking Status
To show real UPS tracking statuses (label created / in transit / delivered) on shipments, set these in `.env`:
- `UPS_CLIENT_ID=...`
- `UPS_CLIENT_SECRET=...`
- `UPS_TRANSACTION_SRC=stockroom-dashboard` (optional)
- `UPS_MERCHANT_ID=######` (optional; your 6-digit UPS account number if required)
- `UPS_ENV=prod` (or `cie` for Customer Integration Environment)

Without these, the dashboard won’t guess UPS statuses (shipments with a tracking number stay `label-created` unless updated by UPS).
