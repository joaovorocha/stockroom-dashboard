/**
 * Microsoft Email Fetcher
 * 
 * Fetches Looker emails from Microsoft 365/Exchange using Graph API.
 * Uses Device Code Flow for authentication - login once via browser,
 * then the server stays authenticated using refresh tokens.
 * 
 * SETUP: Your IT admin needs to register an app in Azure AD
 * Go to: https://portal.azure.com → Azure Active Directory → App registrations
 */

const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES_DIR = path.join(__dirname, '..', 'files');
const TOKEN_CACHE_FILE = path.join(DATA_DIR, 'ms-token-cache.json');

// Microsoft App Registration Config
// IMPORTANT: Set these environment variables or update values here
// Your IT admin can create an app at: https://portal.azure.com
const MS_CONFIG = {
  // Option 1: Use env variables (recommended)
  clientId: process.env.MS_CLIENT_ID || '',
  tenantId: process.env.MS_TENANT_ID || '', // Your organization's tenant ID
  
  // The email to access
  userEmail: 'sanfrancisco@suitsupply.com'
};

/*
 * ═══════════════════════════════════════════════════════════════════
 *  AZURE AD APP REGISTRATION INSTRUCTIONS
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Ask your IT admin to:
 * 
 * 1. Go to: https://portal.azure.com
 * 2. Navigate to: Azure Active Directory → App registrations → New registration
 * 3. Settings:
 *    - Name: "Stockroom Dashboard Looker Sync"
 *    - Supported account types: "Accounts in this organizational directory only"
 *    - Redirect URI: Select "Public client/native (mobile & desktop)"
 *                    Value: http://localhost
 * 
 * 4. After creating, go to "API permissions":
 *    - Add permission → Microsoft Graph → Delegated permissions
 *    - Select: Mail.Read, User.Read
 *    - Click "Grant admin consent for [organization]"
 * 
 * 5. Go to "Authentication":
 *    - Under "Advanced settings", set "Allow public client flows" to YES
 * 
 * 6. Copy these values to set as environment variables:
 *    - Application (client) ID  →  MS_CLIENT_ID
 *    - Directory (tenant) ID    →  MS_TENANT_ID
 * 
 * Then run:
 *   export MS_CLIENT_ID="your-client-id"
 *   export MS_TENANT_ID="your-tenant-id"
 *   node utils/microsoft-email-fetcher.js login
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

// Looker email patterns
const LOOKER_EMAIL_PATTERNS = [
  { subjectPattern: /store.*ops|stores.*performance/i, targetFolder: 'dashboard-stores_performance' },
  { subjectPattern: /appointment|booking/i, targetFolder: 'dashboard-appointment_booking_insights_v2' },
  { subjectPattern: /loan/i, targetFolder: 'dashboard-loan_dashboard' },
  { subjectPattern: /tailor|myr/i, targetFolder: 'dashboard-tailor_myr' },
  { subjectPattern: /employee.*level|store.*count/i, targetFolder: 'dashboard-store_count_performance_-_employee_level' }
];

class MicrosoftEmailFetcher {
  constructor() {
    // Check for required configuration
    if (!MS_CONFIG.clientId || !MS_CONFIG.tenantId) {
      this.configured = false;
      console.log('\n⚠️  Microsoft credentials not configured!');
      console.log('   Set MS_CLIENT_ID and MS_TENANT_ID environment variables.');
      console.log('   Run: node utils/microsoft-email-fetcher.js');
      console.log('   For setup instructions.\n');
      return;
    }
    
    this.configured = true;
    this.msalConfig = {
      auth: {
        clientId: MS_CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${MS_CONFIG.tenantId}`
      },
      cache: {
        cachePlugin: this.createCachePlugin()
      }
    };
    
    this.pca = new msal.PublicClientApplication(this.msalConfig);
    this.account = null;
  }

  // Token cache plugin - saves tokens to file for persistence
  createCachePlugin() {
    const beforeCacheAccess = async (cacheContext) => {
      if (fs.existsSync(TOKEN_CACHE_FILE)) {
        cacheContext.tokenCache.deserialize(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
      }
    };

    const afterCacheAccess = async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        const dir = path.dirname(TOKEN_CACHE_FILE);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(TOKEN_CACHE_FILE, cacheContext.tokenCache.serialize());
      }
    };

    return { beforeCacheAccess, afterCacheAccess };
  }

  // Get access token - tries silent first, falls back to device code
  async getAccessToken() {
    const scopes = ['Mail.Read', 'User.Read'];

    // Try to get token silently first (using cached refresh token)
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    
    if (accounts.length > 0) {
      this.account = accounts[0];
      try {
        const silentResult = await this.pca.acquireTokenSilent({
          account: this.account,
          scopes: scopes
        });
        console.log('✓ Authenticated silently (using cached token)');
        return silentResult.accessToken;
      } catch (error) {
        console.log('Silent token acquisition failed, will need to re-authenticate');
      }
    }

    // No cached token - need interactive login via device code
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  MICROSOFT LOGIN REQUIRED');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const deviceCodeRequest = {
      scopes: scopes,
      deviceCodeCallback: (response) => {
        console.log('  1. Open this URL in your browser:');
        console.log(`     ${response.verificationUri}\n`);
        console.log(`  2. Enter this code: ${response.userCode}\n`);
        console.log('  3. Sign in with: sanfrancisco@suitsupply.com\n');
        console.log('  Waiting for authentication...\n');
      }
    };

    try {
      const response = await this.pca.acquireTokenByDeviceCode(deviceCodeRequest);
      this.account = response.account;
      console.log('✓ Successfully authenticated!\n');
      console.log('  Token will be cached - no need to login again until it expires.\n');
      return response.accessToken;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Make Graph API request
  async graphRequest(endpoint, accessToken) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.microsoft.com',
        path: `/v1.0${endpoint}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Graph API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  // Download attachment content
  async downloadAttachment(messageId, attachmentId, accessToken) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.microsoft.com',
        path: `/v1.0/me/messages/${messageId}/attachments/${attachmentId}/$value`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  // Get target folder based on email subject
  getTargetFolder(subject) {
    for (const pattern of LOOKER_EMAIL_PATTERNS) {
      if (pattern.subjectPattern.test(subject)) {
        return pattern.targetFolder;
      }
    }
    return 'gmail-imports';
  }

  // Sanitize filename
  sanitizeFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/__+/g, '_');
  }

  // Extract ZIP and save CSV files
  async extractAndSaveZip(buffer, targetFolder) {
    const extractedFiles = [];
    const destDir = path.join(FILES_DIR, targetFolder);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      for (const entry of entries) {
        if (entry.entryName.endsWith('.csv') && !entry.isDirectory) {
          const filename = this.sanitizeFilename(path.basename(entry.entryName));
          const filePath = path.join(destDir, filename);
          const content = entry.getData().toString('utf8');
          fs.writeFileSync(filePath, content);
          extractedFiles.push(filePath);
          console.log(`  Extracted: ${filename}`);
        }
      }
    } catch (err) {
      console.error('Error extracting ZIP:', err);
    }

    return extractedFiles;
  }

  // Fetch Looker emails from the last N hours
  async fetchLookerEmails(hoursBack = 24) {
    const results = {
      success: false,
      emailsProcessed: 0,
      filesExtracted: [],
      errors: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Get access token
      const accessToken = await this.getAccessToken();

      // Calculate date filter
      const sinceDate = new Date();
      sinceDate.setHours(sinceDate.getHours() - hoursBack);
      const dateFilter = sinceDate.toISOString();

      // Search for Looker emails
      const searchQuery = encodeURIComponent(
        `from:looker OR from:noreply@looker.com AND receivedDateTime ge ${dateFilter}`
      );
      
      console.log(`Searching for Looker emails from last ${hoursBack} hours...`);
      
      const messagesResponse = await this.graphRequest(
        `/me/messages?$filter=receivedDateTime ge ${dateFilter}&$search="from:looker"&$select=id,subject,receivedDateTime,hasAttachments&$top=50`,
        accessToken
      );

      const messages = messagesResponse.value || [];
      console.log(`Found ${messages.length} emails`);

      for (const message of messages) {
        if (!message.hasAttachments) continue;

        console.log(`\nProcessing: ${message.subject}`);
        const targetFolder = this.getTargetFolder(message.subject);

        // Get attachments
        const attachmentsResponse = await this.graphRequest(
          `/me/messages/${message.id}/attachments`,
          accessToken
        );

        for (const attachment of attachmentsResponse.value || []) {
          const filename = attachment.name || '';

          if (filename.endsWith('.zip')) {
            console.log(`  Downloading: ${filename}`);
            
            // Get attachment content (base64 in contentBytes)
            const content = Buffer.from(attachment.contentBytes, 'base64');
            const extracted = await this.extractAndSaveZip(content, targetFolder);
            results.filesExtracted.push(...extracted);
          } 
          else if (filename.endsWith('.csv')) {
            const destDir = path.join(FILES_DIR, targetFolder);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            
            const content = Buffer.from(attachment.contentBytes, 'base64');
            const filePath = path.join(destDir, this.sanitizeFilename(filename));
            fs.writeFileSync(filePath, content);
            results.filesExtracted.push(filePath);
            console.log(`  Saved: ${filename}`);
          }
        }

        results.emailsProcessed++;
      }

      results.success = true;
      console.log(`\n✓ Processed ${results.emailsProcessed} emails, extracted ${results.filesExtracted.length} files`);

    } catch (error) {
      console.error('Error:', error.message);
      results.errors.push(error.message);
    }

    return results;
  }

  // Check if we have valid cached credentials
  async hasValidCredentials() {
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    return accounts.length > 0;
  }

  // Clear cached credentials (logout)
  async logout() {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      fs.unlinkSync(TOKEN_CACHE_FILE);
      console.log('Logged out - token cache cleared');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Show setup instructions if no credentials
  if (!MS_CONFIG.clientId || !MS_CONFIG.tenantId) {
    console.log(`
═══════════════════════════════════════════════════════════════════
  MICROSOFT 365 EMAIL FETCHER - SETUP REQUIRED
═══════════════════════════════════════════════════════════════════

Your IT admin needs to register an app in Azure AD.

INSTRUCTIONS FOR IT ADMIN:
─────────────────────────────────────────────────────────────────────
1. Go to: https://portal.azure.com
2. Navigate to: Azure Active Directory → App registrations → New registration

3. Fill in:
   - Name: "Stockroom Dashboard Looker Sync"
   - Account types: "Accounts in this organizational directory only"
   - Redirect URI: Public client → http://localhost

4. After creating, go to "API permissions":
   - Click "Add permission" → Microsoft Graph → Delegated
   - Add: Mail.Read, User.Read
   - Click "Grant admin consent"

5. Go to "Authentication":
   - Set "Allow public client flows" to YES

6. Copy these values:
   - Application (client) ID  
   - Directory (tenant) ID    

THEN RUN:
─────────────────────────────────────────────────────────────────────
  export MS_CLIENT_ID="paste-client-id-here"
  export MS_TENANT_ID="paste-tenant-id-here"
  node utils/microsoft-email-fetcher.js login

The login will show a URL and code. Open the URL in your browser,
enter the code, and sign in with sanfrancisco@suitsupply.com.
After that, the server stays logged in automatically!
═══════════════════════════════════════════════════════════════════
    `);
    return;
  }

  const fetcher = new MicrosoftEmailFetcher();
  
  if (!fetcher.configured) {
    return;
  }

  switch (command) {
    case 'login':
      console.log('Initiating Microsoft login...\n');
      await fetcher.getAccessToken();
      break;

    case 'fetch':
      const hours = parseInt(args[1]) || 24;
      console.log(`Fetching Looker emails from last ${hours} hours...\n`);
      const result = await fetcher.fetchLookerEmails(hours);
      console.log('\nResults:', JSON.stringify(result, null, 2));
      break;

    case 'status':
      const hasCredentials = await fetcher.hasValidCredentials();
      console.log('Login status:', hasCredentials ? 'Logged in' : 'Not logged in');
      break;

    case 'logout':
      await fetcher.logout();
      break;

    default:
      console.log(`
Microsoft Email Fetcher for Looker Data

Usage:
  node microsoft-email-fetcher.js login     - Login to Microsoft (one-time)
  node microsoft-email-fetcher.js fetch     - Fetch Looker emails (last 24h)
  node microsoft-email-fetcher.js fetch 2   - Fetch emails from last 2 hours
  node microsoft-email-fetcher.js status    - Check login status
  node microsoft-email-fetcher.js logout    - Clear saved credentials

First time setup:
  1. Run: node microsoft-email-fetcher.js login
  2. Open the URL shown in your browser
  3. Enter the code and sign in with sanfrancisco@suitsupply.com
  4. After login, tokens are cached - no need to login again!
      `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { MicrosoftEmailFetcher };
