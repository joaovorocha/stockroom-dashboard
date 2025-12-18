# Stockroom Dashboard - Change Log

## Session: December 13, 2025

### Admin Sync Fix
- **File:** `routes/auth.js`
- Added `syncUserToEmployees()` function to sync user changes to `employees-v2.json`
- When users are added/updated in admin, changes now sync to the game plan
- Fixed Daniel Iraheta and Daniel Valdez to appear in BOH section (not Management)

### Shipments Page Updates
- **File:** `public/shipments.html`
- Restricted access to Management, BOH, and Admin only
- Non-authorized users redirected to dashboard with alert

### Dashboard Navigation Updates
- **File:** `public/dashboard.html`
- Added "Refresh Data" button bar at top center
- Added Closing Duties link to navigation
- Added Feedback link (visible to managers)
- Added pending shipments badge counter
- Fixed Suitsupply logo (now SVG text instead of broken image)
- Added "Working Today" section showing Management and BOH on duty
- Added Loans Overdue modal with detailed table (click to view)

### Dashboard JavaScript Updates
- **File:** `public/js/dashboard.js`
- Added `loadPendingShipments()` function for badge count
- Added `setupNotesPermissions()` - Admin only edit, Management edit after publish
- Added `updateLastSyncTime()` and `refreshAllData()` functions
- Added `showLoansModal()` for detailed loans view
- Added `updateWorkingToday()` to show working staff
- Enhanced `setupWelcomeSection()` for SA with KPIs, appointments, store info

### Dashboard CSS Updates
- **File:** `public/css/dashboard.css`
- Added refresh bar styling
- Added nav badge styling
- Added clickable metric card styling
- Added loans table styling
- Added working today section styling
- Added SA welcome enhancements (KPIs row, appointments, store info)

### Lost Punch Updates
- **File:** `routes/lostPunch.js`
- Complete rewrite with proper CRUD endpoints
- Added batch update endpoint (`POST /api/lost-punch/batch`)
- Added reviewedBy and reviewedAt fields

- **File:** `public/lost-punch.html`
- Fixed Manager on Duty dropdown to only show MANAGEMENT (not BOH)
- Added batch select/approve/deny functionality
- Added completion info showing who approved and when
- Added checkbox selection for batch operations

### Feedback System (NEW)
- **File:** `routes/feedback.js` (NEW)
- Full CRUD API for feedback with image upload support
- Status management (new, reviewed, resolved)
- Response functionality for managers

- **File:** `public/feedback.html` (NEW)
- Submit feedback with text and images (drag & drop)
- View own feedback history
- Manager view with status updates and responses
- Image modal for full-size viewing

### Time Off Calendar Updates
- **File:** `public/time-off.html`
- Pending requests now show with faded/dashed styling
- Approved requests show solid with green background
- Denied requests show with strikethrough
- Added legend explaining status colors
- Added event detail modal (click any event)
- Shows approval info: who approved/denied and when

### Closing Duties Updates
- **File:** `public/closing-duties.html`
- "Submit Duties" is now the first tab
- Shows assigned duties to logged-in user
- Quick submit buttons for assigned sections
- KPI completion rate display
- Can submit for unassigned areas

### Server Updates
- **File:** `server.js`
- Added feedback routes
- Added feedback-uploads static file serving
- Old pages now redirect to new ones:
  - `/login` → `/login-v2`
  - `/gameplan` → `/dashboard`
  - `/gameplan-v2` → `/dashboard`
  - `/index.html` → `/login-v2`
  - `/` → `/login-v2`

### Data Updates
- **File:** `data/employees-v2.json`
- Daniel Iraheta moved to BOH with metrics
- Daniel Valdez moved to BOH with metrics
- Ivan Ramos in BOH with inventory accuracy metrics

---

## Files Modified This Session

### Routes
- `routes/auth.js` - User sync to employees
- `routes/lostPunch.js` - Complete rewrite
- `routes/feedback.js` - NEW FILE

### Public HTML
- `public/dashboard.html` - Multiple enhancements
- `public/shipments.html` - Access control
- `public/lost-punch.html` - Batch operations
- `public/closing-duties.html` - Submit first, assigned duties
- `public/time-off.html` - Calendar styling, modal
- `public/feedback.html` - NEW FILE

### Public CSS/JS
- `public/css/dashboard.css` - Multiple additions
- `public/js/dashboard.js` - Multiple functions

### Server
- `server.js` - Routes and redirects

### Data
- `data/employees-v2.json` - BOH employee sync

---

## Access URLs
- Main Dashboard: `https://localhost:3000/dashboard`
- Login: `https://localhost:3000/login-v2`
- Shipments: `https://localhost:3000/shipments` (Management/BOH only)
- Scanner: `https://localhost:3000/scanner`
- Lost Punch: `https://localhost:3000/lost-punch`
- Closing Duties: `https://localhost:3000/closing-duties`
- Time Off: `https://localhost:3000/time-off`
- Feedback: `https://localhost:3000/feedback`
- Admin: `https://localhost:3000/admin`
