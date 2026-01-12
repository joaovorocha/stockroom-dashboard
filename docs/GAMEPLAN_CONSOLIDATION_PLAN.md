# Game Plan Consolidation Plan

## Current State

### Existing Pages
1. **gameplan.html** - Main view (dashboard style)
2. **gameplan-boh.html** - Back of House employees
3. **gameplan-sa.html** - Sales Associates
4. **gameplan-tailors.html** - Tailors
5. **gameplan-management.html** - Management team
6. **gameplan-edit.html** - Edit mode for managers

### Problem
- 6 different pages showing similar data with slight variations
- Hard to maintain consistency
- Duplicate code across pages
- No unified data source

## Proposed Solution

### Single Unified Page: `gameplan.html`
**URL:** `/dashboard` (existing route)

### Features
1. **Role-Based Views** - Automatic view switching based on user role
2. **Tab Navigation** - Switch between employee groups
3. **Unified Data Source** - Single API endpoint
4. **Consistent Layout** - Same structure, different filters
5. **Edit Mode Toggle** - Built-in edit capability for managers

### View Structure

```
┌─────────────────────────────────────────┐
│  Game Plan - January 12, 2026           │
│  [All] [BOH] [SA] [Tailors] [Mgmt]    │  ← Tabs
├─────────────────────────────────────────┤
│  📊 Metrics Row                         │
│  Traffic: 120 | Conv: 15% | Sales: $45k│
├─────────────────────────────────────────┤
│  Employee List (filtered by tab)        │
│  ┌─────────────────────────────────┐   │
│  │ Victor Rocha - SA               │   │
│  │ 10:00-18:00 | Goal: $5k         │   │
│  │ Current: $3.2k (64%)            │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  📅 Appointments | 📦 Best Sellers     │
└─────────────────────────────────────────┘
```

### Role-Based Default Views
- **BOH Employee** → See only BOH tab
- **Sales Associate** → See only SA tab
- **Tailor** → See only Tailors tab
- **Management** → See all tabs + edit button

### Tab Configuration
```javascript
const tabs = [
  { 
    id: 'all', 
    label: 'All Employees', 
    filter: null,
    roles: ['MANAGEMENT', 'ADMIN']
  },
  { 
    id: 'boh', 
    label: 'Back of House', 
    filter: 'BOH',
    roles: ['MANAGEMENT', 'ADMIN', 'BOH']
  },
  { 
    id: 'sa', 
    label: 'Sales Associates', 
    filter: 'SA',
    roles: ['MANAGEMENT', 'ADMIN', 'SA']
  },
  { 
    id: 'tailors', 
    label: 'Tailors', 
    filter: 'TAILOR',
    roles: ['MANAGEMENT', 'ADMIN', 'TAILOR']
  },
  { 
    id: 'management', 
    label: 'Management', 
    filter: 'MANAGEMENT',
    roles: ['MANAGEMENT', 'ADMIN']
  }
];
```

## Data Schema

### Unified Employee Object
```javascript
{
  employeeId: "30744",
  name: "Victor Rocha",
  type: "SA",  // BOH, SA, TAILOR, MANAGEMENT
  role: "MANAGEMENT",  // Permission level
  shift: {
    start: "10:00",
    end: "18:00",
    break: "14:00-14:30",
    hours: 8
  },
  goals: {
    sales: 5000,
    units: 4,
    appointments: 2,
    tasks: ["VIP client", "New collection display"]
  },
  actual: {
    sales: 3200,
    units: 3,
    appointments: 2,
    tasksCompleted: 1
  },
  performance: {
    salesProgress: 0.64,  // 64%
    onTrack: true,
    lastUpdate: "2026-01-12T14:00:00Z"
  },
  notes: "VIP client at 2pm",
  status: "ACTIVE"  // ACTIVE, BREAK, OFFLINE
}
```

### API Endpoint Response
```javascript
// GET /api/gameplan/unified?date=2026-01-12&view=sa
{
  date: "2026-01-12",
  store: "SF",
  view: "sa",
  metrics: {
    traffic: 120,
    conversion: 0.15,
    avgBasket: 1285,
    totalSales: 45000,
    appointments: 8
  },
  employees: [
    { /* SA employees only */ }
  ],
  appointments: [
    {
      time: "14:00",
      customer: "John Doe",
      sa: "Victor Rocha",
      type: "VIP"
    }
  ],
  bestSellers: [
    {
      sku: "P123456",
      name: "Navy Suit",
      sales: 15
    }
  ]
}
```

## Implementation Steps

### Phase 1: Backend (API)
1. ✅ Document current endpoints
2. 🔲 Create `/api/gameplan/unified` endpoint
3. 🔲 Add role-based filtering logic
4. 🔲 Implement employee type grouping
5. 🔲 Add real-time update support

### Phase 2: Frontend (UI)
1. 🔲 Create unified gameplan component
2. 🔲 Add tab navigation system
3. 🔲 Implement role-based tab visibility
4. 🔲 Add edit mode toggle
5. 🔲 Build employee cards with progress
6. 🔲 Add real-time updates (SSE)

### Phase 3: Migration
1. 🔲 Backup old pages to legacy/
2. 🔲 Update navigation to point to unified page
3. 🔲 Redirect old URLs to new page
4. 🔲 Test with all user roles
5. 🔲 Deploy and monitor

### Phase 4: Enhancement
1. 🔲 Add drag-and-drop scheduling
2. 🔲 Implement notifications
3. 🔲 Add export functionality
4. 🔲 Create mobile-optimized view

## File Structure

```
routes/
  gameplan.js           ← Add /unified endpoint

public/
  gameplan.html         ← Unified page
  js/
    gameplan.js         ← Unified logic
    
legacy/
  gameplan-boh.html     ← Backup
  gameplan-sa.html      ← Backup
  gameplan-tailors.html ← Backup
  gameplan-management.html ← Backup
```

## Database Schema (PostgreSQL)

### gameplan_entries table
```sql
CREATE TABLE gameplan_entries (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  employee_id VARCHAR(20) NOT NULL,
  employee_name VARCHAR(100),
  employee_type VARCHAR(20),  -- BOH, SA, TAILOR, MANAGEMENT
  shift_start TIME,
  shift_end TIME,
  shift_break VARCHAR(50),
  goals_sales INTEGER,
  goals_units INTEGER,
  goals_appointments INTEGER,
  actual_sales INTEGER DEFAULT 0,
  actual_units INTEGER DEFAULT 0,
  actual_appointments INTEGER DEFAULT 0,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(20),
  updated_by VARCHAR(20),
  UNIQUE(date, employee_id)
);

CREATE INDEX idx_gameplan_date ON gameplan_entries(date);
CREATE INDEX idx_gameplan_type ON gameplan_entries(employee_type);
CREATE INDEX idx_gameplan_employee ON gameplan_entries(employee_id);
```

### gameplan_metrics table
```sql
CREATE TABLE gameplan_metrics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  store VARCHAR(10) DEFAULT 'SF',
  traffic INTEGER DEFAULT 0,
  conversion DECIMAL(5,4) DEFAULT 0,
  avg_basket DECIMAL(10,2) DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  appointments INTEGER DEFAULT 0,
  best_sellers JSONB,
  source VARCHAR(50),  -- MANUAL, LOOKER, POS
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_date ON gameplan_metrics(date);
```

## Looker Integration

### Data Sources
1. **Employee Schedules** → Legion/Workday API
2. **Sales Data** → POS System via Looker
3. **Traffic Data** → Store sensors via Looker
4. **Appointments** → CRM system via Looker

### Sync Workflow
```
Looker → Webhook → /api/looker/webhook → Parse → Update DB → Notify Clients (SSE)
```

### Sync Frequency
- **Traffic:** Every 5 minutes
- **Sales:** Real-time (on transaction)
- **Schedules:** Daily at 6 AM
- **Metrics:** Hourly

## Testing Checklist

### User Roles
- [ ] BOH employee sees only BOH tab
- [ ] SA sees only SA tab
- [ ] Tailor sees only Tailors tab
- [ ] Manager sees all tabs + edit button
- [ ] Admin sees all tabs + edit button

### Functionality
- [ ] Tab switching works smoothly
- [ ] Data updates in real-time
- [ ] Edit mode saves correctly
- [ ] Mobile view is responsive
- [ ] Offline mode shows cached data

### Performance
- [ ] Page loads < 2 seconds
- [ ] Tab switching < 100ms
- [ ] SSE reconnects automatically
- [ ] No memory leaks on long sessions

## Rollout Plan

### Week 1
- Implement unified API endpoint
- Create database tables
- Build frontend tabs structure

### Week 2
- Integrate Looker data sync
- Implement real-time updates
- Add edit mode

### Week 3
- Testing with all user types
- Bug fixes and polish
- Documentation

### Week 4
- Soft launch (management only)
- Collect feedback
- Full rollout to all employees

## Success Metrics

1. **User Satisfaction** - 90%+ approval from employees
2. **Load Time** - < 2 seconds page load
3. **Update Latency** - < 5 seconds for real-time updates
4. **Adoption Rate** - 100% daily active users
5. **Data Accuracy** - 99%+ match with POS system

## Questions for COO

1. Preferred Looker data sync frequency?
2. Required metrics beyond traffic/sales?
3. Mobile app requirements?
4. Integration with other systems?
5. Reporting requirements?
