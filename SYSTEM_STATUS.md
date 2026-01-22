# System Status - January 22, 2026

## ✅ Production System Health

**Last Updated:** January 22, 2026 12:07 PM PST  
**Server Status:** All systems operational  
**Commit:** 17d30249 - Gmail optimization & Looker deduplication

---

## 🔄 Gmail Email Processing

### Current Configuration
- **Gmail Account:** `sanfranciscosuitsupplyredirect@gmail.com`
- **Authentication:** App Password (configured ✅)
- **Polling Schedule:** Every 30 minutes
- **Next Run:** Next :30 mark (12:30 PM, 1:00 PM, etc.)
- **Timezone:** America/Los_Angeles (PST/PDT)

### Performance Metrics
- **Last Successful Sync:** Jan 22, 2026 12:00 PM PST
- **Emails Found:** 41 Looker emails
- **After Deduplication:** 1 email (97% reduction)
- **Processing Time:** ~90 seconds → ~10 seconds
- **Speed Improvement:** 80-90% faster ⚡

### Email Sources
- ✅ **Looker Reports:** `noreply@lookermail.com` - Active
- ✅ **UPS Shipments:** `pkginfo@ups.com` - Active
- ⚠️ **Push Notifications:** Configured but not triggering

---

## 📊 Looker Data Integration

### Active Schedules (from Looker)
All schedules send to: `sanfranciscosuitsupplyredirect@gmail.com`

| Dashboard | Schedule | Last Run |
|-----------|----------|----------|
| Stores Performance | Every 15 min | Jan 22, 11:54 AM |
| Work-Related Expenses | Daily 6:00 AM | Jan 15, 6:00 AM |
| Store Ops Dashboard | Daily 6:00 AM | Jan 15, 6:00 AM |
| Store Ops - Overdue Audit | Daily 6:00 AM | Jan 15, 6:00 AM |
| Store Ops - Productivity | Daily 6:00 AM | Jan 15, 6:00 AM |
| Customer Reserved Orders | Daily 6:00 AM | Jan 15, 6:00 AM |
| Bestsellers | Daily 6:00 AM | Jan 15, 6:00 AM |
| Unpaid Loans Report | Daily 6:00 AM | Jan 15, 6:00 AM |

### Deduplication Strategy
**Why:** Each Looker email contains complete dataset snapshot  
**Strategy:** Keep only LATEST email per category  
**Categories Detected:**
- `stores_performance` - Store operations and performance
- `expenses` - Work-related expenses
- `appointments` - Appointment booking insights
- `loan` - Loan dashboard
- `tailor` - Tailor MYR
- `overdue_audit` - Store ops overdue audit

### Data Flow
```
Looker Schedule → Email sent to Gmail → 
→ Polling every 30 min → Find new emails → 
→ Deduplicate by category → Extract CSV → 
→ Import to PostgreSQL → Dashboard updated
```

---

## 🚀 Running Services

| Service | Status | Memory | Restarts |
|---------|--------|--------|----------|
| stockroom-dashboard | ✅ Online | 160 MB | 156 |
| radio | ✅ Online | 36 MB | 1205 |
| radio-transcriber | ✅ Online | 574 MB | 1149 |
| gmail-watch-renewal | ✅ Online | 125 MB | 0 |
| vite-dev | ⏸️ Stopped | 0 MB | 10 |

---

## 🔧 System Configuration

### Environment Variables (Critical)
```bash
GMAIL_USER=sanfranciscosuitsupplyredirect@gmail.com
GMAIL_APP_PASSWORD=************** # Set ✅
GMAIL_PUBSUB_TOPIC=projects/trusty-bearing-484422-t3/topics/gmail-notifications
```

### Cron Schedules
- **Gmail Processing:** `*/30 * * * *` (every 30 minutes)
- **Gmail Watch Renewal:** Every 6 days at midnight
- **Report Emails:** `0 */4 * * *` (every 4 hours)

### Key Files Modified Today
- `utils/unified-gmail-processor.js` - Added deduplication logic
- `public/app.html` - Looker iframe full height + desktop-only
- `public/css/app-home.css` - Viewport-based sizing
- `public/css/mobile.css` - Hide desktop-only on mobile
- `README.md` - Updated documentation
- **New:** `GMAIL_PROCESSING_FLOW.md` - Architecture documentation
- **New:** `LOOKER_OPTIMIZATION.md` - Deduplication strategy
- **New:** `fix-looker-sync.sh` - Quick reference guide

---

## 🐛 Known Issues

### 1. Gmail Push Notifications Not Triggering
**Status:** ⚠️ Configured but not receiving  
**Impact:** Medium - Polling works as fallback (30 min max delay)  
**Details:**
- Gmail Watch active (expires Jan 29, 2026)
- Webhook endpoint exists at `/api/webhooks/gmail`
- Pub/Sub topic configured
- No notifications arriving in logs

**To Fix:**
1. Verify Pub/Sub subscription configuration
2. Check webhook URL registration with Google Cloud
3. Test push notification delivery

### 2. Some Looker Schedules Not Running
**Status:** ⚠️ Multiple schedules show last run Jan 15  
**Impact:** Low - Stores Performance is active (primary dashboard)  
**Details:**
- "Stores Performance" running every 15 min ✅
- Other dashboards last ran Jan 15, 6:00 AM
- May be intentionally disabled or schedule changed

---

## 📈 API Endpoints Status

| Endpoint | Status | Response Time |
|----------|--------|---------------|
| `/api/health` | ✅ 200 OK | < 50ms |
| `/api/webhooks/gmail` | ✅ 200 OK | < 100ms |
| `/api/webhooks/ups` | ✅ 200 OK | < 100ms |
| Main App | ✅ 200 OK | < 200ms |

---

## 📝 Recent Changes Summary

**Commit:** `17d30249` - Jan 22, 2026 12:06 PM PST

**Major Changes:**
1. Fixed Gmail credentials (correct email + app password)
2. Implemented Looker email deduplication (80-90% faster)
3. Updated UI - Looker iframe full height, mobile hidden
4. Comprehensive documentation added
5. All changes committed to git

**Performance Impact:**
- Before: Processing 50+ Looker emails (~90 seconds)
- After: Processing 1-5 emails (~10 seconds)
- Speed improvement: 80-90% ⚡

---

## 🔍 How to Monitor

### Check Current Status
```bash
# System health
pm2 list

# Latest logs
tail -f /var/lib/stockroom-dashboard/data/scheduler-logs/unified-gmail-$(date +%Y-%m-%d).log

# Last sync results
tail -20 /var/lib/stockroom-dashboard/data/scheduler-logs/unified-gmail-$(date +%Y-%m-%d).log | grep -i deduplicated
```

### Manual Sync
```bash
cd /var/www/stockroom-dashboard
node utils/unified-gmail-processor.js run
```

### Check Gmail Watch Status
```bash
node utils/gmail-watch-setup.js status
```

---

## 📚 Documentation

- [GMAIL_PROCESSING_FLOW.md](GMAIL_PROCESSING_FLOW.md) - Architecture & flow diagrams
- [LOOKER_OPTIMIZATION.md](LOOKER_OPTIMIZATION.md) - Deduplication strategy
- [fix-looker-sync.sh](fix-looker-sync.sh) - Quick troubleshooting guide
- [README.md](README.md) - Main project documentation

---

**Next Review:** January 29, 2026 (Gmail Watch expiration)
