# System Health Monitoring - User Guide

## 🎉 System Successfully Implemented!

The comprehensive system health monitoring is now active and collecting metrics in real-time.

---

## 📊 Features Implemented

### ✅ Real-Time Monitoring
- **CPU**: Per-core usage, load averages, temperature
- **Memory**: RAM & swap usage, with leak detection
- **Disk**: Space usage, I/O performance, SMART status
- **Network**: Bandwidth (RX/TX), active connections, interface stats
- **GPU/NPU**: Utilization, memory, temperature (if available)
- **Processes**: Top CPU/memory consumers, zombie detection

### ✅ User Activity Tracking
- Active user sessions with real-time count
- Login/logout event logging
- Session duration and idle time tracking
- Device type detection (desktop/mobile/tablet)
- IP address and user agent logging

### ✅ System Information
- Complete hardware inventory
- USB device tracking and change detection
- Network interface configuration
- Connected device monitoring

### ✅ Alert System
- Threshold-based alerting
- Auto-resolution when conditions normalize
- Alert history and acknowledgment
- WebSocket push notifications (ready for frontend)

---

## 🚀 Quick Start

### Access the Dashboard

**Admin Users Only:**
1. Log in to the Stockroom Dashboard
2. Navigate to: **Admin → System Health** or directly visit:
   ```
   http://localhost:3000/admin/system-health.html
   ```

### API Endpoints

All endpoints require authentication and admin permissions.

#### Service Status
```bash
GET /api/system-health/status
```

#### Current Metrics
```bash
# Complete snapshot
GET /api/system-health/metrics/current

# Individual components
GET /api/system-health/cpu/current
GET /api/system-health/memory/current
GET /api/system-health/disk/current
GET /api/system-health/network/current
GET /api/system-health/gpu/current
```

#### Historical Data
```bash
# Get metrics for time range
GET /api/system-health/metrics/range/1h   # Last hour
GET /api/system-health/metrics/range/6h   # Last 6 hours
GET /api/system-health/metrics/range/24h  # Last 24 hours
GET /api/system-health/metrics/range/7d   # Last 7 days
GET /api/system-health/metrics/range/30d  # Last 30 days
```

#### Active Users
```bash
GET /api/system-health/users/active
GET /api/system-health/users/sessions/:userId
GET /api/system-health/users/statistics?days=7
```

#### Alerts
```bash
GET /api/system-health/alerts/active
GET /api/system-health/alerts/history?days=7&severity=critical
POST /api/system-health/alerts/:id/acknowledge
POST /api/system-health/alerts/:id/resolve
```

#### System Information
```bash
GET /api/system-health/info/hardware
GET /api/system-health/info/summary
GET /api/system-health/info/usb
```

#### Processes
```bash
GET /api/system-health/processes/current
GET /api/system-health/processes/top
GET /api/system-health/processes/zombies
GET /api/system-health/processes/node
```

#### Export Data
```bash
# Export as JSON
GET /api/system-health/export/metrics?format=json&start=2026-01-01&end=2026-01-31

# Export as CSV
GET /api/system-health/export/metrics?format=csv&start=2026-01-01&end=2026-01-31
```

---

## 📈 Monitoring Schedule

### Real-time (Every 5 seconds)
- CPU usage
- Memory usage
- Network bandwidth
- Active users

### Frequent (Every 30 seconds)
- Disk I/O
- GPU/NPU metrics
- Process snapshots

### Periodic (Every 5 minutes)
- System uptime
- Inactive session cleanup

### Hourly
- Hardware inventory scan
- USB device change detection
- Full system information collection

---

## 🚨 Alert Thresholds

Current default thresholds (configured in database):

| Metric | Warning | Critical | Sustained Time |
|--------|---------|----------|----------------|
| **CPU** | 75% | 90% | 60 seconds |
| **Memory** | 80% | 95% | 120 seconds |
| **Disk** | 85% | 95% | N/A |
| **GPU** | 90% | 99% | 60 seconds |
| **Network** | 800 Mbps | 950 Mbps | N/A |

### Modify Thresholds

Thresholds are stored in the `monitoring_config` table:

```sql
-- View current thresholds
SELECT * FROM monitoring_config WHERE config_key LIKE '%_thresholds';

-- Update CPU threshold
UPDATE monitoring_config 
SET config_value = '{"warning": 80, "critical": 95, "sustained_seconds": 60}'
WHERE config_key = 'cpu_thresholds';
```

---

## 💾 Database Tables

### Data Storage

| Table | Purpose | Retention |
|-------|---------|-----------|
| `system_metrics` | Real-time metrics | 90 days |
| `user_sessions_log` | User activity | 365 days |
| `system_events_log` | System events | 730 days |
| `system_alerts` | Alert history | 180 days |
| `system_hardware_info` | Hardware inventory | Current only |
| `process_snapshots` | Process data | 30 days |
| `monitoring_config` | Configuration | Permanent |

### Useful Queries

```sql
-- Get latest system metrics
SELECT * FROM v_latest_system_metrics;

-- Get active user sessions
SELECT * FROM v_active_user_sessions;

-- Get active alerts
SELECT * FROM v_active_alerts;

-- Get recent system events (last 24h)
SELECT * FROM v_recent_system_events;

-- CPU usage over time
SELECT 
    date_trunc('hour', timestamp) as hour,
    AVG(cpu_usage_percent) as avg_cpu,
    MAX(cpu_usage_percent) as max_cpu
FROM system_metrics
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;

-- Memory usage trend
SELECT 
    date_trunc('hour', timestamp) as hour,
    AVG(memory_usage_percent) as avg_memory,
    MAX(memory_usage_percent) as max_memory
FROM system_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Active users by hour
SELECT 
    date_trunc('hour', login_time) as hour,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) as total_sessions
FROM user_sessions_log
WHERE login_time >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;
```

---

## 🔧 Maintenance

### Manual Cleanup

```sql
-- Clean up old metrics (automatically runs daily)
SELECT cleanup_old_metrics();

-- Close inactive sessions (automatically runs every 5 minutes)
SELECT close_inactive_sessions();

-- Auto-resolve old alerts (automatically runs daily)
SELECT auto_resolve_old_alerts();
```

### Service Management

```bash
# Check service status
curl http://localhost:3000/api/system-health/status

# View logs
tail -f /var/www/stockroom-dashboard/logs/system-health/combined-$(date +%Y-%m-%d).log

# View metrics logs
tail -f /var/www/stockroom-dashboard/logs/system-health/metrics-$(date +%Y-%m-%d).log

# View error logs
tail -f /var/www/stockroom-dashboard/logs/system-health/error-$(date +%Y-%m-%d).log
```

---

## 📊 Dashboard Features

The web dashboard at `/admin/system-health.html` provides:

- **Real-time metrics** with 5-second refresh
- **Visual indicators** (normal/warning/critical)
- **Progress bars** for resource usage
- **Active user list** with device types
- **Active alerts** with severity badges
- **Top processes** by CPU/Memory
- **Network throughput** visualization

---

## 🔒 Security

- **Admin-only access**: All endpoints require admin privileges
- **Session tracking**: User activity is logged for audit purposes
- **Alert acknowledgment**: Track who responded to alerts
- **Secure data**: No sensitive information in logs
- **Rate limiting**: API endpoints are protected

---

## 📝 Logs

Log files are located in: `/var/www/stockroom-dashboard/logs/system-health/`

| File | Content |
|------|---------|
| `combined-YYYY-MM-DD.log` | All log levels |
| `error-YYYY-MM-DD.log` | Errors only |
| `metrics-YYYY-MM-DD.log` | Metric collections |

Logs are automatically rotated daily and kept for 30 days.

---

## 🎯 Current System Status

The system is now monitoring:

✅ **CPU**: 14 cores, measuring usage, load, and temperature  
✅ **Memory**: 15.09 GB total RAM  
✅ **Disk**: Tracking space and I/O  
✅ **Network**: Bandwidth and connections  
✅ **GPU**: Detection enabled (if available)  
✅ **Users**: Session tracking active  
✅ **Alerts**: Threshold monitoring enabled  
✅ **Hardware**: Inventory collected  

**First metric detected:**
- High memory usage alert triggered (97% usage)
- System uptime: 144.37 hours (6+ days)

---

## 🆘 Troubleshooting

### Monitoring service not starting

Check PM2 logs:
```bash
pm2 logs stockroom-dashboard --lines 50
```

### No metrics being collected

Verify service status:
```bash
curl http://localhost:3000/api/system-health/status
```

### Database connection errors

Check PostgreSQL:
```bash
psql -U suit -d stockroom_dashboard -c "SELECT COUNT(*) FROM system_metrics;"
```

### High memory alerts

Current system is using 97% memory. Consider:
- Reviewing running processes
- Restarting heavy services
- Increasing system RAM

---

## 📚 Next Steps

### Immediate:
1. ✅ Access dashboard at `/admin/system-health.html`
2. ✅ Review active alerts
3. ✅ Check system metrics

### Future Enhancements:
- WebSocket real-time updates to frontend
- Email notifications for critical alerts
- Custom dashboards for specific metrics
- Predictive analytics and trends
- Multi-server monitoring
- Mobile app integration

---

## 📞 Support

For issues or questions:
1. Check system logs in `/logs/system-health/`
2. Review database views for current status
3. Check PM2 process status: `pm2 status`

---

**Implementation Complete: January 22, 2026**  
**Version:** 1.0  
**Status:** ✅ Active and Monitoring
