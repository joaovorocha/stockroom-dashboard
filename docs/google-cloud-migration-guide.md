# Google Cloud Migration Guide
## Step-by-Step Instructions for Migrating Stockroom Dashboard

This guide provides detailed instructions for migrating the Stockroom Dashboard from an on-premise server to Google Cloud Platform.

---

## Prerequisites

1. Google Cloud account (create at https://console.cloud.google.com)
2. `gcloud` CLI installed locally
3. Billing account set up (can use $300 free trial)
4. Access to current server for data export

---

## Phase 1: Project Setup (30 minutes)

### 1. Create GCP Project

```bash
# Login to Google Cloud
gcloud auth login

# Create new project
gcloud projects create stockroom-dashboard-sf --name="Stockroom Dashboard"

# Set as active project
gcloud config set project stockroom-dashboard-sf

# Enable billing (required for App Engine)
gcloud billing accounts list
gcloud billing projects link stockroom-dashboard-sf --billing-account=BILLING_ACCOUNT_ID

# Enable required APIs
gcloud services enable appengine.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 2. Create App Engine Application

```bash
# Create App Engine app in us-west region (closest to SF)
gcloud app create --region=us-west2
```

---

## Phase 2: Prepare Application (1-2 hours)

### 1. Add App Engine Configuration

Copy the `docs/app.yaml.example` to `app.yaml` in your project root:

```bash
cp docs/app.yaml.example app.yaml
```

### 2. Update package.json

Ensure your `package.json` has the correct start script:

```json
{
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": "20.x"
  }
}
```

### 3. Add Health Check Endpoint

Add to your `server.js`:

```javascript
// Health check endpoint for App Engine
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});
```

### 4. Configure Environment Variables

Store sensitive data in Secret Manager:

```bash
# Create secrets
echo -n "your-gmail-user@gmail.com" | gcloud secrets create GMAIL_USER --data-file=-
echo -n "your-gmail-app-password" | gcloud secrets create GMAIL_APP_PASSWORD --data-file=-
echo -n "your-client-id" | gcloud secrets create MS_CLIENT_ID --data-file=-
echo -n "your-client-secret" | gcloud secrets create MS_CLIENT_SECRET --data-file=-
echo -n "your-tenant-id" | gcloud secrets create MS_TENANT_ID --data-file=-

# Grant App Engine access to secrets
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

gcloud secrets add-iam-policy-binding GMAIL_USER \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets
```

Update `app.yaml` to reference secrets:

```yaml
env_variables:
  NODE_ENV: "production"
  PORT: "8080"

# In production, fetch from Secret Manager
beta_settings:
  cloud_sql_instances: ""
```

---

## Phase 3: Migrate Storage (1 hour)

### 1. Create Cloud Storage Bucket

```bash
# Create bucket for file uploads
gsutil mb -l us-west1 gs://stockroom-dashboard-sf-uploads/

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://stockroom-dashboard-sf-uploads/
```

### 2. Upload Existing Data

```bash
# From your current server, upload data folder
gsutil -m cp -r ./data/* gs://stockroom-dashboard-sf-uploads/data/

# Verify upload
gsutil ls -r gs://stockroom-dashboard-sf-uploads/
```

### 3. Update Application to Use Cloud Storage

Install Cloud Storage library:

```bash
npm install @google-cloud/storage
```

Update file upload handlers to use Cloud Storage (example):

```javascript
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('stockroom-dashboard-sf-uploads');

// Example: Upload closing duties photo
async function uploadPhoto(file) {
  const blob = bucket.file(`closing-duties/${Date.now()}-${file.originalname}`);
  const blobStream = blob.createWriteStream();
  
  return new Promise((resolve, reject) => {
    blobStream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });
    blobStream.on('error', reject);
    blobStream.end(file.buffer);
  });
}
```

---

## Phase 4: Set Up Scheduled Jobs (30 minutes)

### 1. Create Cloud Scheduler Jobs

```bash
# Looker sync job (daily at 6:30 AM PST)
gcloud scheduler jobs create http looker-sync \
  --schedule="30 6 * * *" \
  --time-zone="America/Los_Angeles" \
  --uri="https://stockroom-dashboard-sf.uc.r.appspot.com/api/sync/looker" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# UPS tracking job (every 2 hours)
gcloud scheduler jobs create http ups-sync \
  --schedule="0 */2 * * *" \
  --time-zone="America/Los_Angeles" \
  --uri="https://stockroom-dashboard-sf.uc.r.appspot.com/api/sync/ups" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
```

### 2. Add Sync Endpoints

Add to your API routes:

```javascript
// Endpoint for Looker sync (triggered by Cloud Scheduler)
app.post('/api/sync/looker', async (req, res) => {
  try {
    const { runSync } = require('./utils/looker-scheduler');
    const result = await runSync();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for UPS sync
app.post('/api/sync/ups', async (req, res) => {
  try {
    const { runSync } = require('./utils/ups-scheduler');
    const result = await runSync();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Phase 5: Deploy (30 minutes)

### 1. Create .gcloudignore

Create `.gcloudignore` to exclude unnecessary files:

```
.git
.gitignore
node_modules
npm-debug.log
.env
.DS_Store
screenshots/
docs/
README.md
data/
*.log
```

### 2. Deploy to App Engine

```bash
# Deploy application
gcloud app deploy --quiet

# View deployment
gcloud app browse

# Check logs
gcloud app logs tail -s default
```

### 3. Set Up Custom Domain (Optional)

```bash
# Map custom domain
gcloud app domain-mappings create dashboard.suitsupply-sf.com

# Follow instructions to update DNS records
```

---

## Phase 6: Testing (1-2 hours)

### 1. Functional Testing

- [ ] Test login functionality
- [ ] Test file uploads (closing duties photos, feedback)
- [ ] Test shipment tracking
- [ ] Test gameplan viewing/editing
- [ ] Test time-off requests
- [ ] Test admin panel
- [ ] Verify scheduled jobs run correctly

### 2. Performance Testing

```bash
# Monitor application logs
gcloud app logs tail -s default

# Check resource usage
gcloud app instances list
```

### 3. Data Validation

- [ ] Verify all data files migrated correctly
- [ ] Check image uploads display properly
- [ ] Validate Excel file processing
- [ ] Test data persistence

---

## Phase 7: Monitoring & Maintenance

### 1. Set Up Monitoring

```bash
# Create uptime check
gcloud monitoring uptime-check-configs create stockroom-dashboard \
  --display-name="Stockroom Dashboard Uptime" \
  --resource-type=uptime-url \
  --host=stockroom-dashboard-sf.uc.r.appspot.com \
  --path="/"
```

### 2. Configure Billing Alerts

```bash
# Create budget alert
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Stockroom Dashboard Budget" \
  --budget-amount=75 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

### 3. Enable Logging

- Go to Cloud Console > Logging
- Create log-based metrics for errors
- Set up alerts for critical errors

---

## Rollback Plan

If issues occur, rollback to on-premise:

1. Keep on-premise server running for 2 weeks
2. Maintain regular backups to Cloud Storage
3. Document any data changes during migration
4. Have DNS ready to switch back if needed

```bash
# To rollback a deployment
gcloud app versions list
gcloud app services set-traffic default --splits=OLD_VERSION=1
```

---

## Cost Management

### Monitor Spending

```bash
# View current costs
gcloud billing accounts list

# Export billing to BigQuery (optional)
gcloud billing accounts set-export \
  --billing-account=BILLING_ACCOUNT_ID \
  --dataset-id=billing_export
```

### Optimization Tips

1. **Use committed use discounts** after 1 month if stable
2. **Review App Engine logs** to identify optimization opportunities
3. **Set up lifecycle policies** for old Cloud Storage files
4. **Monitor and adjust instance sizes** based on actual usage

---

## Support Resources

- **GCP Documentation:** https://cloud.google.com/appengine/docs/flexible/nodejs
- **Cloud Console:** https://console.cloud.google.com
- **Pricing Calculator:** https://cloud.google.com/products/calculator
- **Support:** https://cloud.google.com/support

---

## Troubleshooting

### Common Issues

**Deployment fails:**
```bash
# Check build logs
gcloud app logs tail -s default

# Verify app.yaml syntax
cat app.yaml
```

**Application won't start:**
```bash
# Check environment variables
gcloud app instances list
gcloud app instances ssh INSTANCE_ID
printenv | grep NODE
```

**Slow performance:**
```bash
# Scale up resources in app.yaml
resources:
  cpu: 2
  memory_gb: 2
```

**Storage issues:**
```bash
# Verify bucket permissions
gsutil iam get gs://stockroom-dashboard-sf-uploads/
```

---

## Post-Migration Checklist

- [ ] All features tested and working
- [ ] Scheduled jobs running on time
- [ ] Monitoring and alerts configured
- [ ] Billing alerts set up
- [ ] Team trained on new URLs
- [ ] Documentation updated
- [ ] On-premise server scheduled for decommission (after 2 weeks)
- [ ] Backup strategy implemented

---

*Migration guide prepared for Suitsupply San Francisco*  
*Estimated total migration time: 6-10 hours*
