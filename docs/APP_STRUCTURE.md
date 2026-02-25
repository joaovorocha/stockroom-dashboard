# App Structure (Dual-Frontend Architecture)

**Last Updated:** February 24, 2026  
**Status:** Active (Vanilla production + React migration)

---

## Overview

This repository currently runs **two frontend apps** against a shared backend:

1. **Vanilla App (Production Runtime)**
   - Served by Express from `public/*.html`
   - Main routes are handled in `server.js`
   - Current production users hit this app

2. **React App (Migration Runtime)**
   - Located under `client/`
   - Served by Vite during development (`:5173`)
   - Incrementally replacing vanilla views/component logic

Both apps share:
- The same Node/Express backend (`server.js`)
- The same API surface (`/api/*` routes)
- The same PostgreSQL data layer

---

## Runtime Map

### Backend
- Entry point: `server.js`
- API routes: `routes/`
- Middleware: `middleware/`
- Data utilities: `utils/`

### Frontend A (Vanilla)
- HTML pages: `public/*.html`
- JS modules: `public/js/`
- CSS: `public/css/`

### Frontend B (React)
- App root: `client/src/`
- Router/layout: `client/src/App.jsx`, `client/src/components/Layout.jsx`
- Pages: `client/src/pages/`
- Feature migration plan: `client/MIGRATION_PLAN.md`

---

## Source of Truth Rules

- **Production routing truth:** `server.js`
- **API contract truth:** route files in `routes/`
- **Migration target truth:** React files in `client/src/`
- **Operational status truth:** `SYSTEM_STATUS.md`
- **Route inventory truth:** `SERVER_MAP.md`

---

## GitHub Structure (Presentation Ready)

- CI workflows: `.github/workflows/`
- PR template: `.github/pull_request_template.md`
- Agent config: `.github/agents/`

Recommended branch workflow:
1. Feature branch from active branch
2. Keep commits scoped (backend, frontend, docs)
3. Build-check React client before PR
4. Include docs updates for architecture changes

---

## Current Migration Strategy

- Keep vanilla pages stable for production
- Port one feature/page at a time to React
- Validate each migrated route against existing `/api` behavior
- Avoid breaking server-side auth/session behavior during migration

---

## Validation Commands

```bash
# Backend syntax check
node --check server.js

# React app build check
cd client && npm run build

# PM2 process status
pm2 list
```
