# Legion & Workday Integration Plan
**Date:** January 11, 2026  
**Purpose:** Integration roadmap for Legion WFM scheduling and Workday HCM  
**Context:** SuitSupply stockroom dashboard as central hub with redirects to specialized systems

---

## 🎯 Integration Strategy

### Core Concept
**Your dashboard = Central hub with contextual redirects**
- Keep core functions (shipments, RFID, gameplan) in-house
- Integrate Legion for advanced scheduling/labor forecasting
- Integrate Workday for HCM, payroll, time-off approvals
- Surface key metrics in your dashboard
- Deep links to Legion/Workday when needed

---

## 📊 Legion WFM Integration

### What Legion Offers (legion.co)
**AI-Powered Workforce Management:**
- **Labor demand forecasting** - Predict staffing needs based on sales data
- **Intelligent scheduling** - Auto-generate schedules based on demand + employee preferences
- **Budget management** - Real-time labor cost tracking against budget
- **Compliance automation** - Meal breaks, overtime rules, minimum wage by jurisdiction
- **Employee self-service** - Mobile app for shift swaps, time-off requests
- **Real-time adjustments** - React to call-outs, demand spikes

### Integration Points

#### 1. **Labor Budget Dashboard Widget**
**What to pull from Legion:**
```javascript
// Endpoint: GET /api/legion/labor-budget
{
  "store": "San Francisco",
  "week": "2026-W02",
  "budget": {
    "allocated": 2400,        // Hours allocated
    "scheduled": 2280,         // Hours scheduled
    "actual": 1850,            // Hours worked so far
    "projected": 2350,         // Projected by end of week
    "variance": -50,           // Under/over budget
    "variancePercent": -2.1    // %
  },
  "laborCost": {
    "budgeted": 48000,         // USD
    "scheduled": 45600,
    "actual": 37000,
    "projected": 47000
  }
}
```

**Dashboard Display:**
```
┌─────────────────────────────────────┐
│ 💰 Labor Budget - Week 2            │
├─────────────────────────────────────┤
│ Hours: 2350 / 2400 (98%)            │
│ Cost: $47,000 / $48,000 (98%)       │
│ Status: ✅ On Track                  │
│                                     │
│ [View Full Schedule in Legion →]    │
└─────────────────────────────────────┘
```

#### 2. **Shift Coverage Alerts**
**Use case:** Show staffing gaps in your dashboard
```javascript
// Endpoint: GET /api/legion/coverage-alerts
{
  "alerts": [
    {
      "date": "2026-01-15",
      "shift": "Opening (9am-2pm)",
      "department": "Back of House",
      "scheduled": 2,
      "required": 3,
      "gap": 1,
      "urgency": "high"
    }
  ]
}
```

**Dashboard Alert:**
```
⚠️ Staffing Gap - Jan 15
BOH Opening shift needs 1 more person
[Find Coverage in Legion →]
```

#### 3. **Schedule Integration with Gameplan**
**Pull today's schedule into your gameplan pages:**
```javascript
// Your existing gameplan could show who's working
{
  "shift": "Morning (8am-4pm)",
  "employees": [
    { "name": "Victor Rocha", "role": "Stockroom Manager", "hours": "8:00-16:00" },
    { "name": "John Smith", "role": "BOH Associate", "hours": "9:00-17:00" }
  ],
  "tasks": [...your existing gameplan tasks...]
}
```

#### 4. **Manager Quick Actions**
**Add to your manager dashboard:**
- "Approve Shift Swap" → Deep link to Legion
- "View Next Week's Schedule" → iFrame or new tab
- "Adjust Today's Coverage" → Legion mobile-optimized view

---

## 🏢 Workday HCM Integration

### What Workday Offers
**Human Capital Management:**
- **Employee master data** - Names, roles, hire dates, contact info
- **Time tracking** - Clock in/out, timesheet approvals
- **Time-off management** - PTO balances, request/approve leave
- **Payroll integration** - Bi-weekly pay runs
- **Performance reviews** - Goal setting, evaluations
- **Benefits administration** - Health insurance, 401k

### Integration Points

#### 1. **Employee Profile Sync**
**Sync Workday → Your Auth System:**
```javascript
// POST /api/workday/sync-employees (daily cron job)
// Pulls employee data from Workday, updates your PostgreSQL users table

{
  "employeeId": "WD-12345",
  "firstName": "Victor",
  "lastName": "Rocha",
  "email": "victor.rocha@suitsupply.com",
  "role": "Stockroom Manager",
  "hireDate": "2023-06-15",
  "isActive": true,
  "store": "San Francisco",
  "department": "Back of House"
}
```

**Why:** Single source of truth for employee data, auto-disable users who leave

#### 2. **Time-Off Balance Widget**
**Show PTO balance in your dashboard:**
```javascript
// GET /api/workday/time-off-balance?employeeId=WD-12345
{
  "employee": "Victor Rocha",
  "balances": [
    { "type": "Vacation", "available": 80, "unit": "hours" },
    { "type": "Sick Leave", "available": 40, "unit": "hours" },
    { "type": "Personal", "available": 16, "unit": "hours" }
  ]
}
```

**Dashboard Display:**
```
┌─────────────────────────────────────┐
│ 🌴 Your Time Off                     │
├─────────────────────────────────────┤
│ Vacation: 80 hours (10 days)       │
│ Sick Leave: 40 hours (5 days)      │
│                                     │
│ [Request Time Off in Workday →]     │
└─────────────────────────────────────┘
```

#### 3. **Time-Off Request Flow**
**Option A: Redirect to Workday**
- User clicks "Request Time Off" → Opens Workday mobile in new tab
- Managers approve in Workday → Webhook notifies your system

**Option B: Lightweight integration**
- User fills form in your UI
- POST to Workday API to create request
- Manager approves in Workday (or in your UI via Workday API)

#### 4. **Timesheet Approvals**
**For managers:**
```javascript
// GET /api/workday/pending-timesheets?managerId=WD-12345
{
  "pending": [
    {
      "employee": "John Smith",
      "week": "2026-W02",
      "hoursSubmitted": 40,
      "needsReview": true
    }
  ]
}
```

**Manager Dashboard:**
```
📋 3 timesheets need approval
[Review in Workday →]
```

---

## 🔗 Integration Architecture

### Approach: "Hub and Spoke"

```
┌────────────────────────────────────────────────┐
│     SuitSupply Stockroom Dashboard             │
│            (Central Hub)                       │
├────────────────────────────────────────────────┤
│                                                │
│  ✅ Core Operations (Your System):            │
│  - Shipments tracking                         │
│  - RFID inventory                             │
│  - Printer management                         │
│  - Gameplan tasks                             │
│  - Lost punch requests                        │
│  - Store recovery                             │
│                                                │
│  📊 Dashboard Widgets (Read-Only):            │
│  - Legion: Labor budget, shift gaps           │
│  - Workday: PTO balance, pending approvals    │
│                                                │
│  🔗 Quick Actions (Deep Links):               │
│  - "View Full Schedule" → Legion              │
│  - "Request Time Off" → Workday               │
│  - "Approve Timesheets" → Workday             │
│                                                │
└────────────────────────────────────────────────┘
           ↓                    ↓
    ┌──────────┐          ┌──────────┐
    │  Legion  │          │ Workday  │
    │   WFM    │          │   HCM    │
    └──────────┘          └──────────┘
```

### API Integration Methods

#### 1. **REST API Calls (Server-Side)**
```javascript
// routes/legion.js
const axios = require('axios');

router.get('/labor-budget', authMiddleware, async (req, res) => {
  try {
    const response = await axios.get('https://api.legion.co/v1/labor-budget', {
      headers: {
        'Authorization': `Bearer ${process.env.LEGION_API_KEY}`,
        'X-Store-ID': req.user.store
      }
    });
    
    res.json(response.data);
  } catch (err) {
    console.error('Legion API error:', err);
    res.status(500).json({ error: 'Failed to fetch labor budget' });
  }
});
```

#### 2. **Webhooks (Event-Driven)**
```javascript
// Legion sends webhook when schedule changes
// POST /api/webhooks/legion/schedule-updated
router.post('/webhooks/legion/schedule-updated', async (req, res) => {
  const { store, date, employees } = req.body;
  
  // Update your database
  await db.query(
    'INSERT INTO schedule_snapshots (store, date, employees, source) VALUES ($1, $2, $3, $4)',
    [store, date, JSON.stringify(employees), 'legion']
  );
  
  // Notify connected clients via WebSocket
  broadcastToStore(store, {
    type: 'schedule_updated',
    date,
    message: 'Schedule has been updated in Legion'
  });
  
  res.status(200).send('OK');
});
```

#### 3. **OAuth 2.0 Authentication**
```javascript
// Workday OAuth flow
// 1. User clicks "Connect Workday"
// 2. Redirect to Workday authorization URL
// 3. User approves
// 4. Workday redirects back with auth code
// 5. Exchange code for access token
// 6. Store token securely, refresh as needed

router.get('/workday/oauth/callback', async (req, res) => {
  const { code } = req.query;
  
  const tokenResponse = await axios.post('https://wd2-impl.workday.com/ccx/oauth2/token', {
    grant_type: 'authorization_code',
    code,
    client_id: process.env.WORKDAY_CLIENT_ID,
    client_secret: process.env.WORKDAY_CLIENT_SECRET,
    redirect_uri: 'https://suitserver.tail39e95f.ts.net/workday/oauth/callback'
  });
  
  // Store token for this user
  await db.query(
    'UPDATE users SET workday_access_token = $1, workday_refresh_token = $2 WHERE id = $3',
    [tokenResponse.data.access_token, tokenResponse.data.refresh_token, req.user.id]
  );
  
  res.redirect('/dashboard');
});
```

---

## 💡 Implementation Ideas

### Phase 1: Read-Only Dashboards (Low Risk, High Value)
**Timeline: 2 weeks**

1. **Legion Labor Budget Widget**
   - Show weekly hours: budgeted vs. actual
   - Color-coded: green (under budget), yellow (at budget), red (over budget)
   - Click to open Legion in new tab

2. **Workday PTO Balance**
   - Display vacation/sick leave balances
   - Link to request time off in Workday

3. **Legion Shift Coverage Alerts**
   - Show staffing gaps for next 7 days
   - Actionable: "Find coverage" button → Legion

**Files to create:**
- `routes/legion.js` - API proxy to Legion
- `routes/workday.js` - API proxy to Workday
- `public/js/legion-widget.js` - Dashboard widget
- `public/js/workday-widget.js` - PTO display

### Phase 2: Employee Self-Service (Medium Risk)
**Timeline: 3 weeks**

1. **Unified Time-Off Requests**
   - Employee fills form in your UI
   - POST to Workday API
   - Confirmation: "Request submitted to Workday"

2. **Shift Swap Requests**
   - Employee initiates swap in your UI
   - POST to Legion API
   - Manager approves in Legion (or your UI)

3. **Schedule View in Gameplan**
   - Pull today's schedule from Legion
   - Display on gameplan-sa.html, gameplan-boh.html
   - "Full week view" → Legion

### Phase 3: Manager Workflows (Higher Risk)
**Timeline: 4-5 weeks**

1. **Timesheet Approval Flow**
   - Manager sees pending timesheets in your dashboard
   - Can approve/reject via Workday API
   - Fallback: "Review in Workday" button

2. **Schedule Adjustments**
   - Manager adjusts coverage via Legion API
   - Real-time updates via webhook
   - Notifications to affected employees

3. **Budget Variance Alerts**
   - Daily check: is labor cost trending over budget?
   - Email/SMS to managers if >10% variance
   - Actionable: "Review schedule" → Legion

---

## 🗄️ Database Schema Updates

### New Tables for Integration

```sql
-- Store external system tokens
CREATE TABLE integration_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  system VARCHAR(50) NOT NULL, -- 'legion' or 'workday'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, system)
);

-- Cache Legion schedule data
CREATE TABLE legion_schedules (
  id SERIAL PRIMARY KEY,
  store VARCHAR(100),
  date DATE NOT NULL,
  shift_start TIME,
  shift_end TIME,
  employee_name VARCHAR(200),
  employee_role VARCHAR(100),
  hours_scheduled DECIMAL(4,2),
  synced_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_store_date (store, date)
);

-- Cache Workday employee data (daily sync)
CREATE TABLE workday_employees (
  id SERIAL PRIMARY KEY,
  workday_id VARCHAR(50) UNIQUE NOT NULL,
  internal_user_id INTEGER REFERENCES users(id),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(200),
  store VARCHAR(100),
  department VARCHAR(100),
  role VARCHAR(100),
  hire_date DATE,
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Track webhook deliveries
CREATE TABLE webhook_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50), -- 'legion' or 'workday'
  event_type VARCHAR(100),
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Security Considerations

### 1. **API Keys & Tokens**
- Store in environment variables (`.env`)
- Never commit to Git
- Rotate quarterly
- Use separate keys for dev/staging/prod

### 2. **OAuth Token Storage**
- Encrypt tokens at rest (use `pgcrypto`)
- Refresh tokens before expiry
- Revoke on user logout/termination

### 3. **Webhook Verification**
- Verify webhook signatures (HMAC-SHA256)
- Check timestamp to prevent replay attacks
- Whitelist IP addresses if possible

### 4. **Rate Limiting**
- Cache Legion/Workday API responses (5-15 min TTL)
- Don't call external APIs on every page load
- Use background jobs for syncs

---

## 💰 Cost Estimates

### Legion WFM
- **Pricing:** ~$4-8 per employee/month
- **For 10 employees:** $40-80/month
- **API access:** Typically included in plan
- **ROI:** Better scheduling = 5-10% labor cost reduction

### Workday HCM
- **Pricing:** Enterprise pricing (varies widely)
- **Typical:** $100-200 per employee/year
- **For 10 employees:** $1,000-2,000/year (~$83-167/month)
- **Note:** You may already have Workday at corporate level

### Development Time
- **Phase 1 (widgets):** 80 hours = $8,000 (if outsourced at $100/hr)
- **Phase 2 (self-service):** 120 hours = $12,000
- **Phase 3 (manager flows):** 160 hours = $16,000
- **Total:** 360 hours = $36,000

**Or:** Build incrementally in-house over 3-4 months

---

## 📋 Recommended Next Steps

### Immediate (This Month)
1. ✅ **Fix routing** - Added routes for printer-manager, rfid-scanner, boh-shipments
2. 🔄 **Migrate to PostgreSQL** - Move auth, timeoff, feedback to database (see POSTGRESQL_MIGRATION_PLAN.md)
3. 📞 **Contact Legion sales** - Get demo, understand API capabilities, pricing
4. 📞 **Contact Workday team** - Check if API access enabled, get credentials

### Short-Term (Next 2 Months)
1. **Phase 1 Implementation:**
   - Legion labor budget widget
   - Workday PTO balance display
   - Basic API integration (read-only)
   
2. **Test with small group:**
   - SF store managers only
   - Gather feedback
   - Iterate on UI/UX

### Medium-Term (Months 3-6)
1. **Phase 2 Implementation:**
   - Employee self-service (time-off, shift swaps)
   - Schedule display in gameplan
   
2. **Rollout to all stores:**
   - Train managers
   - Document workflows
   - Support tickets

### Long-Term (6+ months)
1. **Phase 3 Implementation:**
   - Manager approval workflows
   - Budget variance alerts
   - Advanced analytics

2. **Optimization:**
   - Webhook-based real-time updates
   - Mobile app (PWA improvements)
   - Custom reporting

---

## 🎨 UI Mockups

### Dashboard with Legion + Workday Widgets

```
┌────────────────────────────────────────────────────────────────┐
│  🏠 Dashboard - San Francisco Store                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐  ┌──────────────────────┐          │
│  │ 💰 Labor Budget      │  │ 🌴 Your Time Off     │          │
│  ├──────────────────────┤  ├──────────────────────┤          │
│  │ Week 2: 98% of budget│  │ Vacation: 80 hrs     │          │
│  │ $47K / $48K          │  │ Sick: 40 hrs         │          │
│  │ Status: ✅ On Track   │  │                      │          │
│  │                      │  │ [Request Time Off →] │          │
│  │ [View in Legion →]   │  │                      │          │
│  └──────────────────────┘  └──────────────────────┘          │
│                                                                │
│  ┌──────────────────────┐  ┌──────────────────────┐          │
│  │ ⚠️ Staffing Alerts    │  │ 📦 Shipments Today   │          │
│  ├──────────────────────┤  ├──────────────────────┤          │
│  │ Jan 15: BOH Opening  │  │ Showing: 3           │          │
│  │ needs 1 more person  │  │ In Transit: 5        │          │
│  │                      │  │ Delivered: 2         │          │
│  │ [Find Coverage →]    │  │                      │          │
│  └──────────────────────┘  └──────────────────────┘          │
│                                                                │
│  [Your Existing Dashboard Content...]                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## ✅ Summary

**What to do:**
1. Use Legion for **scheduling & budget forecasting**
2. Use Workday for **HCM, payroll, time-off**
3. Keep your dashboard as **central hub**
4. Show **key metrics** from both systems
5. Deep link for **detailed workflows**

**What NOT to do:**
- ❌ Don't rebuild Legion/Workday features
- ❌ Don't try to be "all-in-one"
- ❌ Don't store duplicate employee data long-term

**Your strength:**
- ✅ Store operations (shipments, RFID, gameplan)
- ✅ Custom workflows (lost punch, closing duties)
- ✅ Real-time updates (WebSocket, SSE)
- ✅ Mobile-first UI

**External systems' strength:**
- ✅ Legion: AI scheduling, compliance, forecasting
- ✅ Workday: Enterprise HCM, payroll, benefits

---

**Next Document:** POSTGRESQL_MIGRATION_PLAN.md (migrate all JSON data)
