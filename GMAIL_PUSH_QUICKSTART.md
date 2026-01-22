# Gmail Push Notifications - Quick Start

## 🚀 What You Need to Do

### 1. Google Cloud Setup (10 minutes)
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Login
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Create Pub/Sub topic
gcloud pubsub topics create gmail-notifications

# Grant Gmail permissions
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher

# Create subscription (replace with your actual Tailscale URL)
gcloud pubsub subscriptions create gmail-webhook-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://suitserver.tail39e95f.ts.net/api/webhooks/gmail \
  --ack-deadline=10
```

### 2. Get OAuth Credentials (5 minutes)
```
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create Credentials > OAuth client ID > Desktop app
3. Download JSON file
4. Save to: /var/www/stockroom-dashboard/data/gmail-credentials.json
```

### 3. Configure Environment Variables
Edit `/var/www/stockroom-dashboard/.env`:
```bash
GMAIL_USER=vrocha@suitsupply.com
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
```

### 4. Authorize & Enable Watch
```bash
cd /var/www/stockroom-dashboard

# Start authorization
npm run gmail-watch-setup

# Visit the URL shown, authorize, copy the code

# Save the code (replace YOUR_CODE)
node utils/gmail-watch-setup.js auth YOUR_CODE

# Enable watch
npm run gmail-watch-setup
```

### 5. Start Auto-Renewal
```bash
pm2 start utils/gmail-watch-cron.js --name gmail-watch-renewal
pm2 save
```

---

## ✅ Test It

Send an email to your Gmail → Check logs:
```bash
pm2 logs stockroom-dashboard --lines 50 | grep "Gmail Webhook"
```

---

## 📊 Monitor

Check watch status:
```bash
npm run gmail-watch-status
```

---

## 📖 Full Documentation

See GMAIL_PUSH_SETUP.md for detailed troubleshooting and explanations.
