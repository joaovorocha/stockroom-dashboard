# Gmail Push Notifications Setup Guide

This guide walks you through setting up real-time Gmail notifications using Google Cloud Pub/Sub.

## Why Push Notifications?

**Before (Polling):**
- ❌ 30-minute delay between email arrival and processing
- ❌ Constant Gmail API usage (every 30 min)
- ❌ Missed emails if scheduler crashes

**After (Push Notifications):**
- ✅ Instant processing when email arrives
- ✅ Less Gmail API quota usage
- ✅ More reliable and efficient

---

## Prerequisites

- Google Cloud account
- Gmail account with API access
- Server with public HTTPS endpoint

---

## Step-by-Step Setup

### 1. Google Cloud Console Setup

#### A. Create/Select Project
```
1. Go to: https://console.cloud.google.com/
2. Create new project or select existing one
3. Note your PROJECT_ID
```

#### B. Enable Gmail API
```
1. Go to: APIs & Services > Library
2. Search for "Gmail API"
3. Click "Enable"
```

#### C. Create OAuth 2.0 Credentials
```
1. Go to: APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: "Desktop app"
4. Name: "Gmail Webhook App"
5. Download the JSON file
6. Save as: /var/www/stockroom-dashboard/data/gmail-credentials.json
```

#### D. Create Pub/Sub Topic
```bash
# Install gcloud CLI if not already installed
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Create topic
gcloud pubsub topics create gmail-notifications

# Grant Gmail permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

#### E. Create Pub/Sub Subscription
```bash
# Your webhook URL (must be HTTPS and publicly accessible)
WEBHOOK_URL="https://suitserver.tail39e95f.ts.net/api/webhooks/gmail"

gcloud pubsub subscriptions create gmail-webhook-sub \
  --topic=gmail-notifications \
  --push-endpoint=$WEBHOOK_URL \
  --ack-deadline=10
```

---

### 2. Server Configuration

#### A. Add Environment Variables

Edit `/var/www/stockroom-dashboard/.env`:

```bash
# Gmail API Configuration
GMAIL_USER=your-email@gmail.com
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications

# Existing IMAP credentials (keep for fallback)
GMAIL_APP_PASSWORD=your-app-password
```

#### B. Install Dependencies

```bash
cd /var/www/stockroom-dashboard
npm install googleapis
```

---

### 3. Authorize the Application

```bash
cd /var/www/stockroom-dashboard

# Step 1: Start authorization
node utils/gmail-watch-setup.js setup

# This will output a URL like:
# https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=...

# Step 2: Visit the URL in your browser
# - Sign in with your Gmail account
# - Grant permissions
# - Copy the authorization code from the redirect URL

# Step 3: Save the authorization code
node utils/gmail-watch-setup.js auth YOUR_AUTH_CODE

# Step 4: Enable the watch
node utils/gmail-watch-setup.js setup
```

---

### 4. Start the Watch Renewal Cron

Gmail watch expires every 7 days, so we need to renew it automatically:

```bash
# Add to PM2
pm2 start utils/gmail-watch-cron.js --name gmail-watch-renewal
pm2 save
```

---

### 5. Test the Setup

#### A. Send a Test Email
```
Send an email to your Gmail account from any other address
```

#### B. Check Logs
```bash
# Check webhook received notification
pm2 logs stockroom-dashboard --lines 50 | grep "Gmail Webhook"

# Check if processing triggered
pm2 logs stockroom-dashboard --lines 50 | grep "Processing completed"
```

#### C. Check Watch Status
```bash
node utils/gmail-watch-setup.js status
```

---

## Troubleshooting

### Issue: "Authorization required" error
**Solution:** Run the authorization steps in section 3

### Issue: "Topic not found" error
**Solution:** 
- Verify topic name in .env matches Google Cloud
- Format: `projects/PROJECT_ID/topics/TOPIC_NAME`

### Issue: Webhook not receiving notifications
**Solution:**
- Check Pub/Sub subscription is active: `gcloud pubsub subscriptions list`
- Verify webhook URL is publicly accessible (HTTPS required)
- Check server firewall allows incoming requests

### Issue: "Permission denied" on topic
**Solution:**
```bash
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

---

## Monitoring

### Check Watch Expiration
```bash
node utils/gmail-watch-setup.js status
```

### View Recent Notifications
```bash
pm2 logs stockroom-dashboard --lines 100 | grep "Gmail Webhook"
```

### Manual Watch Renewal
```bash
node utils/gmail-watch-setup.js setup
```

---

## Fallback Mode

If push notifications fail, the system automatically falls back to:
- IMAP polling (existing unified-gmail-processor)
- You can run it manually: `npm run sync-looker`

---

## Cost Estimate

Gmail API + Pub/Sub costs (approximate):
- Gmail API: **FREE** (1 billion quota/day)
- Pub/Sub: ~**$0.40/month** (assuming 1000 emails/month)
- Total: **< $1/month**

Much cheaper than running a cron every 30 minutes!

---

## Next Steps

After setup is complete:
1. ✅ Stop the old polling cron (if running)
2. ✅ Monitor for 24 hours to ensure notifications work
3. ✅ Update documentation for your team

---

## Support

If you encounter issues:
1. Check logs: `pm2 logs stockroom-dashboard`
2. Verify Google Cloud setup
3. Test webhook manually: `curl -X POST https://your-server/api/webhooks/gmail`
