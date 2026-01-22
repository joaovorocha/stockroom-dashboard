/**
 * Gmail Watch Setup Utility
 * 
 * Sets up Gmail Push Notifications using Google Cloud Pub/Sub
 * Run this script to enable real-time email notifications
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, '../data/gmail-token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');

/**
 * Get Gmail API client with service account or OAuth2 authentication
 */
async function getGmailClient() {
  // Load credentials
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Gmail credentials not found at ${CREDENTIALS_PATH}`);
  }
  
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  
  // Check if this is a service account
  if (credentials.type === 'service_account') {
    console.log('📋 Using service account with domain-wide delegation');
    
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: SCOPES,
      clientOptions: {
        subject: process.env.GMAIL_USER // Impersonate the user
      }
    });
    
    const authClient = await auth.getClient();
    return google.gmail({ version: 'v1', auth: authClient });
  }
  
  // OAuth 2.0 Desktop flow
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  // Load or create token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    // Need to authorize - this will only run once
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    
    console.log('\n⚠️  Authorization Required!\n');
    console.log('Visit this URL to authorize:');
    console.log(authUrl);
    console.log('\nAfter authorizing, you will get a code. Run:');
    console.log('node gmail-watch-setup.js <CODE>\n');
    throw new Error('Authorization required');
  }
  
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

/**
 * Save OAuth token
 */
async function saveToken(code) {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('✅ Token saved to', TOKEN_PATH);
}

/**
 * Set up Gmail watch for push notifications
 */
async function setupWatch() {
  try {
    const gmail = await getGmailClient();
    const userEmail = process.env.GMAIL_USER;
    
    if (!userEmail) {
      throw new Error('GMAIL_USER not set in .env');
    }
    
    // Topic should match: projects/YOUR_PROJECT_ID/topics/gmail-notifications
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    
    if (!topicName) {
      throw new Error('GMAIL_PUBSUB_TOPIC not set in .env (format: projects/PROJECT_ID/topics/TOPIC_NAME)');
    }
    
    console.log('\n🔔 Setting up Gmail Watch...');
    console.log('Email:', userEmail);
    console.log('Topic:', topicName);
    
    const request = {
      userId: 'me',
      requestBody: {
        topicName: topicName,
        labelIds: ['INBOX'], // Watch INBOX only
        labelFilterAction: 'include'
      }
    };
    
    const response = await gmail.users.watch(request);
    
    console.log('\n✅ Gmail Watch enabled successfully!');
    console.log('History ID:', response.data.historyId);
    console.log('Expiration:', new Date(parseInt(response.data.expiration)).toISOString());
    console.log('\n⏰ Watch expires in ~7 days. Set up a cron to renew it automatically.\n');
    
    // Save the watch info
    const watchInfo = {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
      setupAt: new Date().toISOString()
    };
    
    const watchInfoPath = path.join(__dirname, '../data/gmail-watch-info.json');
    fs.writeFileSync(watchInfoPath, JSON.stringify(watchInfo, null, 2));
    
    return response.data;
    
  } catch (error) {
    if (error.message === 'Authorization required') {
      // Already handled above
      return;
    }
    console.error('❌ Error setting up watch:', error.message);
    
    if (error.code === 400) {
      console.log('\n💡 Common issues:');
      console.log('   - Make sure the Pub/Sub topic exists');
      console.log('   - Grant gmail-api-push@system.gserviceaccount.com permission to publish to the topic');
      console.log('   - Check that Gmail API is enabled in Google Cloud Console\n');
    }
    
    throw error;
  }
}

/**
 * Stop Gmail watch
 */
async function stopWatch() {
  try {
    const gmail = await getGmailClient();
    
    console.log('🛑 Stopping Gmail Watch...');
    await gmail.users.stop({ userId: 'me' });
    console.log('✅ Gmail Watch stopped');
    
  } catch (error) {
    console.error('❌ Error stopping watch:', error.message);
    throw error;
  }
}

/**
 * Check current watch status
 */
async function checkStatus() {
  try {
    const watchInfoPath = path.join(__dirname, '../data/gmail-watch-info.json');
    
    if (!fs.existsSync(watchInfoPath)) {
      console.log('❌ No watch configured');
      return;
    }
    
    const watchInfo = JSON.parse(fs.readFileSync(watchInfoPath));
    const expirationDate = new Date(parseInt(watchInfo.expiration));
    const now = new Date();
    const hoursRemaining = (expirationDate - now) / (1000 * 60 * 60);
    
    console.log('\n📊 Gmail Watch Status:');
    console.log('Setup at:', watchInfo.setupAt);
    console.log('History ID:', watchInfo.historyId);
    console.log('Expires at:', expirationDate.toISOString());
    console.log('Time remaining:', hoursRemaining.toFixed(1), 'hours');
    
    if (hoursRemaining < 24) {
      console.log('⚠️  Watch expires soon! Run "node gmail-watch-setup.js setup" to renew\n');
    } else {
      console.log('✅ Watch is active\n');
    }
    
  } catch (error) {
    console.error('❌ Error checking status:', error.message);
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  (async () => {
    try {
      switch (command) {
        case 'auth':
          // Save authorization code
          const code = args[1];
          if (!code) {
            console.log('Usage: node gmail-watch-setup.js auth <CODE>');
            process.exit(1);
          }
          await saveToken(code);
          break;
          
        case 'setup':
          await setupWatch();
          break;
          
        case 'stop':
          await stopWatch();
          break;
          
        case 'status':
          await checkStatus();
          break;
          
        default:
          console.log(`
Gmail Watch Setup Utility

Usage:
  node gmail-watch-setup.js setup   - Set up Gmail push notifications
  node gmail-watch-setup.js stop    - Stop Gmail watch
  node gmail-watch-setup.js status  - Check watch status
  node gmail-watch-setup.js auth <CODE> - Save authorization code

First-time setup:
  1. Run: node gmail-watch-setup.js setup
  2. Visit the authorization URL and get the code
  3. Run: node gmail-watch-setup.js auth <CODE>
  4. Run: node gmail-watch-setup.js setup again
          `);
      }
    } catch (error) {
      if (!error.message.includes('Authorization required')) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
      }
    }
  })();
}

module.exports = { setupWatch, stopWatch, checkStatus };
