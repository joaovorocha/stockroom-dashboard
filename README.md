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
