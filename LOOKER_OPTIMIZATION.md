# Looker Email Processing Optimization

## Problem
The system was processing ALL Looker emails (50+ historical emails), even though each email contains the FULL dataset for its dashboard type.

## Solution
**Deduplication Strategy**: Only process the LATEST email per category.

### Why This Works

**Looker Emails** 📊
- Each email = Complete dataset snapshot
- Subject: "Stores Performance" 
- Contains: ALL store metrics for the period
- **Only need**: Latest email per dashboard type
- **Old behavior**: Process all 50 emails
- **New behavior**: Process 1-5 emails (latest per category)

**UPS Emails** 📦
- Each email = Individual shipment update
- Subject: "UPS Delivery Notification, Tracking Number XXXXX"
- Contains: Unique tracking info
- **Must process**: ALL emails (each is different)

## Implementation

### Categories Detected
Based on email subject:
- `stores_performance` - Store ops and performance dashboards
- `expenses` - Work-related expenses
- `appointments` - Appointment booking insights
- `loan` - Loan dashboard
- `tailor` - Tailor MYR
- `overdue_audit` - Store ops overdue audit

### Deduplication Logic
```javascript
// For each category, keep only the email with the latest date
deduplicateLookerEmails(emails) {
  const categoryMap = new Map();
  
  for (const email of emails) {
    const category = this.getLookerCategory(email);
    const emailDate = new Date(email.date);
    
    const existing = categoryMap.get(category);
    if (!existing || new Date(existing.date) < emailDate) {
      categoryMap.set(category, email);
    }
  }
  
  return Array.from(categoryMap.values());
}
```

## Performance Impact

**Before Optimization:**
- Found: 50 Looker emails
- Processed: 50 emails
- Time: ~90 seconds (1.8s per email)
- Attachments: 50+ CSV files (many duplicates)

**After Optimization:**
- Found: 50 Looker emails
- **Deduplicated: 1-5 emails** (latest per category)
- Time: ~10 seconds (only latest files)
- Attachments: 1-5 CSV files (one per dashboard)

**Speed Improvement: ~80-90% faster** ⚡

## Log Output Example

```
[2026-01-22T19:50:15.452Z] Processing 45 Looker emails
[2026-01-22T19:50:15.678Z] Deduplicated 45 Looker emails to 3 (latest per category)
[2026-01-22T19:50:15.679Z]   - stores_performance: Stores Performance (2026-01-22T14:30:00.000Z)
[2026-01-22T19:50:15.680Z]   - expenses: Work Related Expenses (2026-01-22T14:30:00.000Z)
[2026-01-22T19:50:15.681Z]   - appointments: Appointment Booking Insights (2026-01-22T14:30:00.000Z)
[2026-01-22T19:50:15.682Z] Reduced from 45 to 3 emails after deduplication
```

## When This Runs

1. **Automatically every 30 minutes** via cron
2. **On Gmail push notification** when new Looker emails arrive
3. **Manual sync**: `node utils/unified-gmail-processor.js run`

## Files Modified

- `/var/www/stockroom-dashboard/utils/unified-gmail-processor.js`
  - Added `getLookerCategory()` - Extracts category from email subject
  - Added `deduplicateLookerEmails()` - Keeps only latest per category
  - Modified `processEmails()` - Applies deduplication before processing

## Benefits

1. **Faster Processing**: 80-90% reduction in processing time
2. **Reduced Load**: Less CPU and memory usage
3. **No Duplicate Data**: Only import latest datasets
4. **Same Result**: Dashboard shows same data (always latest)
5. **UPS Unaffected**: Still processes all UPS emails (each unique)

## Testing

```bash
# Run manual sync
cd /var/www/stockroom-dashboard
node utils/unified-gmail-processor.js run

# Watch logs for deduplication
tail -f /var/lib/stockroom-dashboard/data/scheduler-logs/unified-gmail-$(date +%Y-%m-%d).log | grep -i deduplica
```

## Future Enhancements

- Add more dashboard categories as new Looker reports are added
- Optionally mark old emails as read after deduplication
- Archive processed emails to reduce inbox size
