# Google Cloud Hosting Cost Analysis
## Stockroom Dashboard - Suitsupply SF

**Report Date:** January 16, 2026  
**Current Setup:** On-premise server at Suitsupply SF  
**Proposed Setup:** Google Cloud Platform (GCP)

---

## Executive Summary

This report analyzes the monthly cost of migrating the Stockroom Dashboard from an on-premise server to Google Cloud Platform. Based on the application requirements, the **estimated monthly cost ranges from $35-75**, with a recommended configuration costing approximately **$50/month**.

---

## Current Infrastructure Analysis

### Application Components
- **Web Server:** Node.js/Express application (server.js)
- **Runtime:** Node.js 20.x
- **Process Manager:** PM2 for uptime management
- **Storage:** ~200MB application data + file uploads (closing duties photos, feedback uploads, Excel files)
- **Scheduled Jobs:** 
  - Looker data sync (daily at 6:30 AM)
  - UPS tracking sync (periodic)
- **Email Integration:** Gmail/Microsoft Graph API for data fetching
- **Traffic:** Low (internal team usage, ~5-20 concurrent users)

### Resource Requirements
- **CPU:** Low to moderate (1-2 vCPUs sufficient)
- **Memory:** 1-2 GB RAM
- **Storage:** 10-20 GB (application + data + growth)
- **Network:** Minimal bandwidth (<100 GB/month estimated)

---

## Recommended Google Cloud Architecture

### Option 1: App Engine (Recommended) - ~$35-50/month

**Service:** Google App Engine (Flexible Environment)

**Pros:**
- Fully managed, auto-scaling platform
- No server management required
- Built-in logging and monitoring
- Automatic SSL certificates
- Easy deployment with `gcloud app deploy`

**Configuration:**
```yaml
runtime: nodejs20
env: flex
automatic_scaling:
  min_num_instances: 1
  max_num_instances: 2
  cpu_utilization:
    target_utilization: 0.8

resources:
  cpu: 1
  memory_gb: 1
  disk_size_gb: 10
```

**Cost Breakdown:**
- App Engine F1 instance (1 vCPU, 1GB RAM): ~$35/month (730 hours)
- Cloud Storage (20GB): $0.40/month
- Network egress (50GB): $6/month (first 1GB free, then $0.12/GB)
- Cloud Scheduler (for cron jobs): $0.10/month per job = $0.20/month
- **Total: ~$41.60/month**

---

### Option 2: Compute Engine VM - ~$25-40/month

**Service:** Google Compute Engine (e2-micro or e2-small)

**Pros:**
- Lower cost for always-on workloads
- More control over the environment
- Can use preemptible/spot instances for even lower cost

**Configuration:**
- Instance type: e2-small (2 vCPUs, 2GB RAM)
- Boot disk: 20GB SSD persistent disk
- Region: us-west1 (closest to San Francisco)

**Cost Breakdown:**
- e2-small instance (730 hours): $12.41/month
- 20GB SSD persistent disk: $3.40/month
- Static external IP: $3.00/month
- Network egress (50GB): $6/month
- Cloud Scheduler: $0.20/month
- **Total: ~$25.01/month**

**With e2-medium (2 vCPUs, 4GB RAM) for better performance:**
- e2-medium instance: $24.82/month
- Other costs: ~$12.60/month
- **Total: ~$37.42/month**

---

### Option 3: Cloud Run - ~$15-30/month

**Service:** Google Cloud Run (Serverless containers)

**Pros:**
- Extremely cost-effective for low-traffic apps
- Pay only for actual usage (request processing time)
- Auto-scales to zero when not in use
- Fully managed, no infrastructure

**Cons:**
- Requires containerization (Docker)
- Cold starts possible (though minimal with min instances)
- Scheduled jobs need Cloud Scheduler to trigger

**Configuration:**
- Container: 1 vCPU, 1GB memory
- Min instances: 1 (to avoid cold starts)
- Max instances: 2

**Cost Breakdown:**
- Cloud Run (min 1 instance always on): ~$15/month
- Cloud Storage (20GB): $0.40/month
- Network egress (50GB): $6/month
- Cloud Scheduler: $0.20/month
- Container Registry storage: $0.50/month
- **Total: ~$22.10/month**

---

## Additional Services & Costs

### Required Supporting Services

1. **Cloud Storage** (File uploads, backups)
   - Standard storage: $0.020/GB/month
   - 20GB = $0.40/month
   - 100GB = $2.00/month

2. **Cloud Scheduler** (Cron jobs)
   - $0.10/job/month
   - 2 jobs = $0.20/month

3. **Cloud Logging** (Application logs)
   - First 50GB free per month
   - Likely within free tier
   - Additional: $0.50/GB if exceeded

4. **Cloud Monitoring** (Performance monitoring)
   - Basic monitoring: Free
   - Advanced metrics: ~$2-5/month (optional)

### Optional Enhanced Services

1. **Cloud SQL** (If you want managed database instead of JSON files)
   - MySQL/PostgreSQL db-f1-micro: ~$7.67/month
   - 10GB storage: $1.70/month
   - **Total: ~$9.37/month**

2. **Cloud CDN** (If serving static assets globally)
   - Likely unnecessary for internal tool
   - ~$0.08/GB cache fill + $0.04/GB egress

3. **Load Balancer** (For high availability)
   - Not needed for this scale
   - ~$18/month if implemented

4. **Cloud Backup** (Automated backups)
   - Cloud Storage Nearline: $0.010/GB/month
   - 20GB backups: $0.20/month

---

## Cost Comparison Summary

| Option | Monthly Cost | Best For | Ease of Migration |
|--------|-------------|----------|-------------------|
| **App Engine** | **$35-50** | **Recommended for this app** | ⭐⭐⭐⭐ Easy |
| Compute Engine (e2-small) | $25-40 | Cost-conscious, full control | ⭐⭐⭐ Moderate |
| Cloud Run | $15-30 | Lowest cost, containerized apps | ⭐⭐ Complex |

### Comparison with On-Premise Costs

**Current On-Premise Costs (estimated):**
- Server hardware depreciation: ~$30-50/month (assuming $2000 server / 3-year lifespan)
- Electricity: ~$10-20/month (24/7 operation)
- Network/Internet: Variable (may be bundled)
- Maintenance/Admin time: ~2-4 hours/month
- **Estimated Total: $40-70/month + time investment**

**Benefits of Cloud Migration:**
- No hardware maintenance
- Automatic backups
- Better uptime/reliability (99.95% SLA)
- Easier scaling if needed
- Access from anywhere (not dependent on office network)
- Professional monitoring and logging
- Automatic security patches

---

## Recommended Solution

### **App Engine Flexible Environment - $41.60/month**

**Justification:**
1. **Easiest migration** - Minimal code changes required
2. **Managed infrastructure** - No server management
3. **Built-in features** - Logging, monitoring, auto-scaling included
4. **Cron job support** - Native support for scheduled tasks
5. **Reliability** - 99.95% uptime SLA
6. **Cost-effective** - Sweet spot between features and price

### Migration Steps:
1. Create Google Cloud project
2. Add `app.yaml` configuration file
3. Migrate environment variables to GCP Secret Manager
4. Deploy with `gcloud app deploy`
5. Configure custom domain (if needed)
6. Set up Cloud Scheduler for cron jobs
7. Migrate file storage to Cloud Storage
8. Test and validate

### Estimated Migration Time:
- Initial setup: 4-6 hours
- Testing and validation: 2-4 hours
- **Total: 1-2 days of work**

---

## Cost Optimization Opportunities

### Immediate Savings:
1. **Use committed use discounts** - Save 37% with 1-year commitment (~$25/month instead of $40)
2. **Rightsize instances** - Start with smaller instance, scale up if needed
3. **Free tier benefits** - First-time GCP users get $300 free credits (3-12 months free hosting)
4. **Regional selection** - us-central1 is slightly cheaper than us-west1

### Long-term Optimizations:
1. **Cloud Storage lifecycle policies** - Move old files to cheaper storage tiers
2. **Network optimization** - Use Cloud CDN for static assets if traffic grows
3. **Monitoring alerts** - Set budget alerts to prevent cost overruns
4. **Scheduled instance scaling** - Scale down during off-hours (nights/weekends)

---

## Free Tier Coverage

**Google Cloud Free Tier (Always Free):**
- Compute: e2-micro instance in us-central1/us-west1/us-east1 (0.25 vCPU, 1GB RAM) - **Free**
- Storage: 5GB Cloud Storage - **Free**
- Network: 1GB egress per month - **Free**
- Cloud Scheduler: First 3 jobs - **Free**

**Possible Free/Near-Free Setup (e2-micro):**
- e2-micro instance (always free): $0
- Additional 15GB storage: $0.30/month
- Network egress (50GB): $6/month
- **Total: ~$6.30/month**

**Trade-offs:**
- e2-micro is less powerful (0.25 vCPU, 1GB RAM)
- May experience slower performance during peak loads
- Worth testing for a low-traffic internal tool

---

## Risks and Considerations

### Technical Risks:
1. **Email API access** - Ensure Gmail/Microsoft APIs work from GCP
2. **Scheduled jobs** - Verify cron timing with Cloud Scheduler
3. **File uploads** - Migrate file storage to Cloud Storage
4. **Session management** - Ensure cookies/sessions work across instances

### Cost Risks:
1. **Unexpected traffic spikes** - Set spending limits
2. **Data egress costs** - Monitor bandwidth usage
3. **Storage growth** - Implement retention policies

### Mitigation:
1. Set up billing alerts at $30, $50, and $75
2. Use staging environment for testing
3. Implement monitoring and logging from day one
4. Document all configurations for easy rollback

---

## Conclusion

**Recommended Action:** Migrate to Google App Engine at an estimated cost of **$35-50/month**.

**ROI Benefits:**
- ✅ Similar or lower cost than on-premise
- ✅ No hardware maintenance
- ✅ Better reliability and uptime
- ✅ Professional monitoring and security
- ✅ Easy scaling if business grows
- ✅ Access from anywhere
- ✅ Automatic backups and disaster recovery

**Next Steps:**
1. Obtain approval for $50/month cloud hosting budget
2. Create Google Cloud account (or use existing organization account)
3. Claim $300 free trial credits (3-12 months free hosting)
4. Schedule migration during low-usage period
5. Maintain on-premise backup during transition period

**Contact:** For questions or to proceed with migration, consult with IT/DevOps team.

---

*Report prepared for: Suitsupply San Francisco Stockroom Dashboard*  
*All prices are in USD and based on January 2026 GCP pricing.*  
*Actual costs may vary based on usage patterns.*
