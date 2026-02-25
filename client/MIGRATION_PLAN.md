# React Migration Plan: Suitsupply Stockroom Dashboard

## Overview
Migrate legacy Plain JS dashboard to React (Vite) while maintaining **100% visual parity** with existing CSS.

---

## Phase 1: Foundation ✅ DONE
- [x] Vite + React project setup
- [x] Proxy configuration (`/api` → `localhost:8000`)
- [x] Axios client with auth interceptors
- [x] Legacy CSS imported (theme, shared-header, dashboard, app-home, mobile)
- [x] Layout component matching legacy header structure

---

## Phase 2: Auth & Context ✅ DONE
Priority: **HIGH** - Required for all protected pages

### Files Created:
```
src/
├── context/
│   └── AuthContext.jsx      ✅ User state, login/logout, role checks
├── components/
│   └── ProtectedRoute.jsx   ✅ Route guard for authenticated pages
└── pages/
    └── Login.jsx            ✅ Login page (matches login.html)
```

### API Endpoints Used:
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

---

## Phase 3: Core Pages ✅ DONE
Priority: **HIGH** - Daily use pages

| Page | Legacy File | React Component | API Endpoints |
|------|-------------|-----------------|---------------|
| Home | `app.html` | `Home.jsx` ✅ | `/api/gameplan/today` |
| Game Plan | `dashboard.html` | `Gameplan.jsx` ✅ | `/api/gameplan`, `/api/employees` |
| Shipments | `shipments.html` | `Shipments.jsx` ✅ | `/api/shipments` |
| Awards | `awards.html` | `Awards.jsx` ✅ | `/api/awards` |
| Closing Duties | `closing-duties.html` | `ClosingDuties.jsx` ✅ | `/api/closing-duties` |
| Time Off | `time-off.html` | `TimeOff.jsx` ✅ | `/api/timeoff` |
| Lost Punch | `lost-punch.html` | `LostPunch.jsx` ✅ | `/api/lost-punch` |

---

## Phase 4: Operations Pages ✅ DONE
Priority: **MEDIUM** - Manager/admin features

| Page | Legacy File | React Component | API Endpoints |
|------|-------------|-----------------|---------------|
| Employee Discount | `expenses.html` | `Expenses.jsx` ✅ | `/api/expenses` |
| Daily Scan | `daily-scan-performance.html` | `DailyScan.jsx` ✅ | `/api/daily-scan` |
| Ops Dashboard | `ops-dashboard.html` | `OpsDashboard.jsx` ✅ | Looker iframes |

---

## Phase 5: Admin Panels ✅ DONE
Priority: **LOW** - Admin-only features

| Page | Legacy File | React Component | API Endpoints |
|------|-------------|-----------------|---------------|
| Admin | `admin.html` | `Admin.jsx` ✅ | `/api/admin/*` |
| Store Admin | (new) | `StoreAdmin.jsx` 🔲 | `/api/store-admin/*` |
| Super Admin | (new) | `SuperAdmin.jsx` 🔲 | `/api/super-admin/*` |

---

## File Structure (Final)

```
client/src/
├── api/
│   └── client.js           ✅ Axios with interceptors
├── assets/
│   ├── theme.css           ✅ Legacy CSS
│   ├── shared-header.css   ✅
│   ├── dashboard.css       ✅
│   ├── app-home.css        ✅
│   └── mobile.css          ✅
├── components/
│   ├── Layout.jsx          ✅ Header + nav shell (with user info + logout)
│   ├── ProtectedRoute.jsx  ✅ Route guard
│   ├── LoadingSpinner.jsx  🔲 Shared loading state
│   └── ErrorBoundary.jsx   🔲 Error handling
├── context/
│   └── AuthContext.jsx     ✅ Auth state management
├── hooks/
│   ├── useAuth.js          ✅ (built into AuthContext)
│   └── useFetch.js         🔲 Data fetching hook
├── pages/
│   ├── Home.jsx            ✅ Quick access tiles
│   ├── Login.jsx           ✅ Login page
│   ├── StoreCountAnalysis.jsx ✅ Example metrics page
│   ├── Gameplan.jsx        ✅
│   ├── Shipments.jsx       ✅
│   ├── Awards.jsx          ✅
│   ├── ClosingDuties.jsx   ✅
│   ├── TimeOff.jsx         ✅
│   ├── LostPunch.jsx       ✅
│   ├── Expenses.jsx        ✅
│   ├── DailyScan.jsx       ✅
│   ├── OpsDashboard.jsx    ✅
│   └── Admin.jsx           ✅
├── App.jsx                 ✅ Router
└── main.jsx                ✅ Entry point
```

---

## Implementation Order

### Sprint 1: Auth ✅ DONE
1. `AuthContext.jsx` - User state management ✅
2. `ProtectedRoute.jsx` - Route protection ✅
3. `Login.jsx` - Login page ✅
4. Update `Layout.jsx` - Show user info, logout button ✅

### Sprint 2: Core Pages (CURRENT)
5. `Gameplan.jsx` - Daily assignments
6. `Shipments.jsx` - Package tracking
7. `Awards.jsx` - Team recognition
8. `ClosingDuties.jsx` - End of day checklist

### Sprint 3: Secondary Pages
9. `TimeOff.jsx` - Calendar view
10. `LostPunch.jsx` - Approval workflow
11. `Expenses.jsx` - Employee discount
12. `DailyScan.jsx` - Performance metrics

### Sprint 4: Admin
13. `Admin.jsx` - User management
14. Store/Super admin panels

---

## CSS Strategy
- **No new CSS files** - Use existing legacy CSS classes
- **Same HTML structure** - Classes like `.card`, `.btn`, `.table`, `.metric-card` work as-is
- **Inline styles only for React-specific** - Minor adjustments via `style={{}}`

---

## Next Step
**Implement Sprint 2: Core Pages**

Starting with `Gameplan.jsx` - the daily assignments page.

Ready to proceed?
