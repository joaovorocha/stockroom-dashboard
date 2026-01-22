# Gmail Data Processing Flow - How It Works

## Current Architecture (As of Jan 22, 2026 11:59 AM PST)

### System Time
- **Server Time**: PST (America/Los_Angeles) 
- **System**: Thu Jan 22 11:59:06 AM PST 2026
- **UTC**: Thu Jan 22 19:59:06 UTC 2026
- **Cron Timezone**: America/Los_Angeles (same as system)

---

## 📧 Two Methods of Gmail Processing

### Method 1: **Scheduled Polling (ACTIVE ✅)**
```
Every 30 minutes (*/30 * * * *)
↓
Cron Job Triggers
↓
Connect to Gmail via IMAP
↓
Search for new emails (UPS + Looker)
↓
Download & Process
```

**Schedule:**
- Runs: 12:00, 12:30, 1:00, 1:30, 2:00... (every 30 min)
- Next run: **12:00 PM PST** (in 1 minute from 11:59 AM)
- Timezone: `America/Los_Angeles` (PST/PDT)

**How it works:**
1. Node-cron wakes up every 30 minutes
2. Opens IMAP connection to `sanfranciscosuitsupplyredirect@gmail.com`
3. Searches for emails since last check
4. Downloads emails matching patterns (UPS, Looker)
5. Processes attachments
6. Updates dashboard data

**Status:** ✅ **WORKING NOW** (credentials fixed at 11:46 AM)

---

### Method 2: **Gmail Push Notifications (CONFIGURED BUT NOT TRIGGERING ⚠️)**

```
Gmail receives new email
↓
Google Pub/Sub sends webhook to our server
↓
POST /api/webhooks/gmail
↓
Trigger immediate processing (no wait)
```

**How it SHOULD work:**
1. Gmail Watch is active (expires Jan 29, 2026)
2. When Looker sends email → Google Pub/Sub notifies us
3. Webhook endpoint receives push notification
4. Immediately triggers email processing (don't wait 30 min)

**Current Status:** ⚠️ **NOT RECEIVING NOTIFICATIONS**

**Why:**
- Gmail Watch is active ✅
- Webhook endpoint exists ✅  
- BUT: No notifications in logs ❌

**Possible reasons:**
1. Pub/Sub topic misconfigured
2. Webhook URL not registered with Google Cloud
3. Authentication issues with Pub/Sub
4. Firewall blocking incoming webhooks

---

## 🔄 Current Flow (What's Actually Happening)

```
                   ┌─────────────────────────────────────┐
                   │    Looker Sends Email Daily         │
                   │    (Around 6:00 AM PST)             │
                   └─────────────┬───────────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────────────┐
                   │  sanfranciscosuitsupplyredirect     │
                   │  @gmail.com Inbox                    │
                   └─────────────┬───────────────────────┘
                                 │
                   ┌─────────────┴───────────────────────┐
                   │                                     │
                   │  SHOULD HAPPEN:                     │  ACTUALLY HAPPENING:
                   │  Webhook triggers                   │  Cron waits 30 min
                   │  immediately ❌                      │  then polls ✅
                   │                                     │
                   └─────────────┬───────────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────────────┐
                   │   EVERY 30 MINUTES (Cron)           │
                   │   12:00, 12:30, 1:00, 1:30...       │
                   │   Timezone: America/Los_Angeles     │
                   └─────────────┬───────────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────────────┐
                   │   unified-gmail-processor.js         │
                   │   • Connect via IMAP                │
                   │   • Search last 2 hours             │
                   │   • Find UPS + Looker emails        │
                   └─────────────┬───────────────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
                   ▼                           ▼
        ┌──────────────────┐      ┌──────────────────────┐
        │  UPS Emails      │      │  Looker Emails       │
        │  Process ALL     │      │  Deduplicate:        │
        │  (each unique)   │      │  Keep LATEST only    │
        └────────┬─────────┘      └──────────┬───────────┘
                 │                           │
                 ▼                           ▼
        ┌──────────────────┐      ┌──────────────────────┐
        │  Update          │      │  Extract CSVs        │
        │  Shipments DB    │      │  Import to DB        │
        └──────────────────┘      └──────────┬───────────┘
                                              │
                                              ▼
                                  ┌──────────────────────┐
                                  │  Dashboard Updated   │
                                  │  "Last sync: ..."    │
                                  └──────────────────────┘
```

---

## ⏰ Why Cron Uses System Timezone

The cron job is configured with:
```javascript
timezone: 'America/Los_Angeles'
```

This matches the system timezone:
```
Time zone: America/Los_Angeles (PST, -0800)
```

**Benefits:**
- ✅ Cron times match server time
- ✅ Easier to debug ("runs at 12:30 PM" = actually 12:30 PM locally)
- ✅ Logs show local time, not UTC

**Cron Expression:** `*/30 * * * *`
- `*/30` = Every 30 minutes
- `*` = Every hour
- `*` = Every day
- `*` = Every month
- `*` = Every day of week

**Real schedule (PST):**
- 12:00 AM, 12:30 AM, 1:00 AM, 1:30 AM...
- 12:00 PM, 12:30 PM, 1:00 PM, 1:30 PM...

---

## 🐛 Why Webhook Isn't Working

### What We Have:
1. ✅ Gmail Watch active (expires Jan 29)
2. ✅ Pub/Sub topic: `projects/trusty-bearing-484422-t3/topics/gmail-notifications`
3. ✅ Webhook endpoint: `POST /api/webhooks/gmail`
4. ✅ Server is running and accessible

### What's Missing:
❌ **No notifications arriving at the webhook**

### To Fix:
Need to verify Pub/Sub subscription is properly configured to push to:
```
https://yourdomain.com/api/webhooks/gmail
```

Check:
```bash
# View current Gmail watch
node utils/gmail-watch-setup.js status

# Check Pub/Sub subscription
gcloud pubsub subscriptions list
```

---

## 📊 Performance Impact

**With Polling Only (Current):**
- Looker sends email at 6:00 AM
- Cron runs at 6:00 AM ✅ (processes immediately)
- OR Cron runs at 6:30 AM (30 min delay)
- Worst case: **30 minute delay**

**With Webhook (If Fixed):**
- Looker sends email at 6:00 AM
- Webhook triggers at 6:00:01 AM ✅
- Data available within seconds
- **Near real-time updates**

---

## 🔧 How to Monitor

### Check Next Cron Run:
```bash
# Will run at the next :00 or :30 minute mark
# Next: 12:00 PM PST (in 1 minute)
date
```

### Watch Live Processing:
```bash
tail -f /var/lib/stockroom-dashboard/data/scheduler-logs/unified-gmail-$(date +%Y-%m-%d).log
```

### Check Last Sync:
Dashboard shows: "Last Looker sync: Jan 20 at 02:01 PM"

### Manual Trigger:
```bash
cd /var/www/stockroom-dashboard
node utils/unified-gmail-processor.js run
```

---

## Summary

**Current Setup:**
- ✅ Polling every 30 minutes (WORKING)
- ⚠️ Push notifications (CONFIGURED but NOT WORKING)
- ✅ Uses system timezone (PST)
- ✅ Deduplication optimized
- 📅 Next auto-sync: **12:00 PM PST** (next :30 mark)

**Data Freshness:**
- Worst case: 30 minutes behind
- Best case: Real-time (if webhook fixed)
- Typical: Within 30 minutes of Looker sending email
