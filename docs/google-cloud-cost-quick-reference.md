# Google Cloud Hosting - Quick Cost Reference

## TL;DR - Cost Summary

**Recommended: App Engine - $35-50/month**  
**Budget Option: Compute Engine e2-micro - $6-10/month (using free tier)**  
**Premium Option: App Engine with Cloud SQL - $50-65/month**

---

## Monthly Cost Comparison

| Service | Monthly Cost | Pros | Cons |
|---------|-------------|------|------|
| **App Engine (Recommended)** | **$35-50** | Easy deployment, auto-scaling, managed | Slightly higher cost |
| **Compute Engine e2-small** | $25-40 | More control, lower cost | Manual management required |
| **Compute Engine e2-micro (Free Tier)** | $6-10 | Very low cost | Limited performance (0.25 vCPU, 1GB RAM) |
| **Cloud Run** | $15-30 | Lowest cost, serverless | Requires Docker, cold starts |

---

## Detailed Cost Breakdown

### Option 1: App Engine (Flexible) - RECOMMENDED
```
Compute (F1 instance, 1 vCPU, 1GB RAM):  $35.00/month
Cloud Storage (20GB):                     $0.40/month
Network egress (50GB):                    $6.00/month
Cloud Scheduler (2 jobs):                 $0.20/month
Cloud Logging (within free tier):         $0.00/month
                                    ─────────────────
TOTAL:                                   $41.60/month
```

### Option 2: Compute Engine (e2-small)
```
e2-small instance (2 vCPU, 2GB RAM):     $12.41/month
20GB SSD persistent disk:                 $3.40/month
Static external IP:                       $3.00/month
Network egress (50GB):                    $6.00/month
Cloud Scheduler (2 jobs):                 $0.20/month
                                    ─────────────────
TOTAL:                                   $25.01/month
```

### Option 3: Compute Engine (e2-micro) - FREE TIER
```
e2-micro instance (0.25 vCPU, 1GB RAM):   $0.00/month (free tier)
20GB SSD persistent disk (5GB free):      $0.30/month
Static external IP:                       $3.00/month
Network egress (50GB, 1GB free):          $6.00/month
Cloud Scheduler (3 jobs free):            $0.00/month
                                    ─────────────────
TOTAL:                                    $9.30/month
```
*Note: e2-micro free tier only in us-central1, us-west1, us-east1*

### Option 4: Cloud Run - LOWEST COST
```
Cloud Run (1 instance min, always on):   $15.00/month
Cloud Storage (20GB):                     $0.40/month
Network egress (50GB):                    $6.00/month
Cloud Scheduler (2 jobs):                 $0.20/month
Container Registry (5GB):                 $0.50/month
                                    ─────────────────
TOTAL:                                   $22.10/month
```

---

## Cost Optimization Strategies

### 1. Use Free Tier Benefits
- **New users get $300 free credits** (valid for 3-12 months)
- **e2-micro instance always free** in select regions
- **5GB Cloud Storage always free**
- **First 3 Cloud Scheduler jobs free**
- **50GB Cloud Logging free per month**

### 2. Committed Use Discounts
- **1-year commitment:** 37% discount
- **3-year commitment:** 55% discount

Example with 1-year commitment:
```
App Engine $35/month → $22/month (saves $156/year)
Compute Engine e2-small $12.41/month → $7.82/month (saves $55/year)
```

### 3. Right-size Resources
Start small, scale up if needed:
- Begin with e2-micro (free) or e2-small ($12/month)
- Monitor performance for 1-2 weeks
- Upgrade only if performance issues occur

---

## Additional One-Time Costs

### Initial Setup
- **Domain registration:** $12/year (if needed)
- **SSL certificate:** FREE (auto-provisioned by GCP)
- **Migration labor:** 6-10 hours of developer time

### Optional Enhancements
- **Cloud SQL (database):** +$9/month
- **Cloud CDN:** +$5-15/month
- **Load Balancer:** +$18/month
- **VPC with NAT:** +$45/month

---

## On-Premise vs Cloud Cost Comparison

### Current On-Premise (Estimated)
```
Server hardware (depreciation):          $30-50/month
Electricity (24/7 operation):            $10-20/month
IT admin time (2-4 hours/month):         $50-150/month
Network/cooling:                         $5-10/month
                                    ─────────────────
TOTAL:                                   $95-230/month
```

### Cloud (App Engine)
```
App Engine + storage + network:          $41.60/month
IT admin time (minimal):                 $10-20/month
                                    ─────────────────
TOTAL:                                   $51.60-61.60/month
```

**Savings: $33-168/month**

---

## ROI Analysis

### Hard Cost Savings (Monthly)
- Server electricity: $10-20
- Hardware maintenance: $10-30
- **Subtotal: $20-50/month**

### Soft Cost Savings (Monthly)
- Reduced admin time: $40-130
- No hardware failures/downtime: $50-200 (risk mitigation)
- Improved reliability: Better SLA
- **Subtotal: $90-330/month value**

### Total Value
**$110-380/month in combined savings and value**

### Break-Even
Cloud hosting pays for itself immediately when accounting for:
- No upfront hardware costs ($2000-5000)
- Reduced operational overhead
- Better reliability and uptime
- Professional monitoring and security

---

## Billing Alerts Recommendations

Set up budget alerts at these thresholds:

```bash
# Alert at 50% of budget ($25)
# Alert at 90% of budget ($45)
# Alert at 100% of budget ($50)
# Alert at 120% of budget ($60) - overage warning
```

Configure email notifications to:
- IT admin
- Finance contact
- Project owner

---

## Free Trial Strategy

**Maximize $300 free credits:**

1. **Month 1-2:** Test on e2-micro (free tier) - $0
2. **Month 3-4:** Upgrade to e2-small - $25/month from credits
3. **Month 5-6:** Try App Engine - $40/month from credits
4. **Month 7:** Decide final solution based on performance
5. **Month 8+:** Use committed use discount for 37% savings

**Result:** 6-12 months essentially free while evaluating

---

## Geographic Pricing Differences

Prices vary by region (example for e2-small):

| Region | Location | Monthly Cost |
|--------|----------|-------------|
| us-west1 | Oregon | $12.41 (recommended for SF) |
| us-west2 | Los Angeles | $14.55 |
| us-central1 | Iowa | $12.41 (free tier eligible) |
| us-east1 | South Carolina | $12.41 (free tier eligible) |

**Recommendation:** Use us-west1 (Oregon) for best latency to San Francisco

---

## Quick Decision Matrix

Choose **App Engine** if:
- ✅ You want easiest setup and management
- ✅ Budget allows $35-50/month
- ✅ You value auto-scaling and reliability
- ✅ You want minimal operational overhead

Choose **Compute Engine e2-small** if:
- ✅ You want lowest cost with good performance
- ✅ You're comfortable with server management
- ✅ You need full control over environment
- ✅ Budget is $25-40/month

Choose **Compute Engine e2-micro** if:
- ✅ You want to minimize costs (<$10/month)
- ✅ Low traffic is acceptable initially
- ✅ You can upgrade later if needed
- ✅ You want to test with free tier

Choose **Cloud Run** if:
- ✅ You have Docker experience
- ✅ You want lowest possible cost
- ✅ You can tolerate occasional cold starts
- ✅ You prefer serverless architecture

---

## Next Steps

1. **Review this document** with stakeholders
2. **Get budget approval** for $50/month
3. **Sign up for GCP** and claim $300 credits
4. **Start with free tier** (e2-micro) to test
5. **Monitor costs** for 1-2 weeks
6. **Upgrade** to App Engine or e2-small as needed
7. **Apply committed use discount** after 1 month if stable

---

## Questions to Consider

Before migrating, answer these:

- [ ] What's the approved monthly budget?
- [ ] How important is uptime/reliability?
- [ ] Do we have Docker/container experience (for Cloud Run)?
- [ ] How much admin time can we dedicate?
- [ ] Are we comfortable with cloud vendor lock-in?
- [ ] Do we need the on-premise server for other purposes?

---

*Quick reference prepared for Suitsupply San Francisco*  
*All prices in USD, as of January 2026*  
*Actual costs may vary ±10% based on usage*
