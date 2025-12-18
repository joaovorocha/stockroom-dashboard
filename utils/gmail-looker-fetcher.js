const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES_DIR = path.join(__dirname, '..', 'files');
const METRICS_DIR = path.join(DATA_DIR, 'store-metrics');
const GMAIL_IMPORTS_DIR = path.join(FILES_DIR, 'gmail-imports');

// Gmail configuration - should be stored in environment variables
const GMAIL_CONFIG = {
  user: process.env.GMAIL_USER || '',
  password: process.env.GMAIL_APP_PASSWORD || '', // Use App Password, not regular password
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

// Looker email subject patterns and their target folders
const LOOKER_EMAIL_PATTERNS = [
  {
    subjectPattern: /store.*ops|stores.*performance/i,
    targetFolder: 'dashboard-stores_performance'
  },
  {
    subjectPattern: /appointment|booking/i,
    targetFolder: 'dashboard-appointment_booking_insights_v2'
  },
  {
    subjectPattern: /loan/i,
    targetFolder: 'dashboard-loan_dashboard'
  },
  {
    subjectPattern: /tailor|myr/i,
    targetFolder: 'dashboard-tailor_myr'
  },
  {
    subjectPattern: /employee.*level|store.*count/i,
    targetFolder: 'dashboard-store_count_performance_-_employee_level'
  }
];

class GmailLookerFetcher {
  constructor(config = GMAIL_CONFIG) {
    this.config = config;
    this.imap = null;
    this.deleteAfterProcess = true; // Delete emails after extracting attachments
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.config.user || !this.config.password) {
        reject(new Error('Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.'));
        return;
      }

      this.imap = new Imap(this.config);

      this.imap.once('ready', () => {
        console.log('Connected to Gmail IMAP');
        resolve();
      });

      this.imap.once('error', (err) => {
        console.error('IMAP error:', err);
        reject(err);
      });

      this.imap.once('end', () => {
        console.log('IMAP connection ended');
      });

      this.imap.connect();
    });
  }

  disconnect() {
    if (this.imap) {
      this.imap.end();
    }
  }

  openMailbox(mailbox = 'INBOX') {
    return new Promise((resolve, reject) => {
      this.imap.openBox(mailbox, false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  // Search for Looker emails
  searchLookerEmails(daysBack = 1) {
    return new Promise((resolve, reject) => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);
      
      // Format date as DD-MMM-YYYY (e.g., "16-Dec-2025")
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;

      // Search criteria for Looker emails - broader search
      // Look for emails from looker OR with subjects containing dashboard/report keywords
      const searchCriteria = [
        ['OR',
          ['OR',
            ['FROM', 'looker'],
            ['FROM', 'noreply@looker']
          ],
          ['OR',
            ['SUBJECT', 'dashboard'],
            ['OR',
              ['SUBJECT', 'stores performance'],
              ['SUBJECT', 'store ops']
            ]
          ]
        ],
        ['SINCE', dateStr],
        ['UNSEEN'] // Only unread emails to avoid reprocessing
      ];

      console.log(`Searching for emails since ${dateStr}`);

      this.imap.search(searchCriteria, (err, results) => {
        if (err) {
          console.error('Search error:', err);
          reject(err);
        } else {
          console.log(`Found ${results?.length || 0} Looker emails`);
          resolve(results || []);
        }
      });
    });
  }

  // Alternative search - all emails with attachments
  searchAllWithAttachments(daysBack = 1) {
    return new Promise((resolve, reject) => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;

      // Search all unread emails since date
      const searchCriteria = [
        ['SINCE', dateStr],
        ['UNSEEN']
      ];

      this.imap.search(searchCriteria, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });
  }

  // Fetch email content with attachments
  fetchEmail(messageId) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(messageId, { 
        bodies: '',
        struct: true 
      });

      fetch.on('message', (msg) => {
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        });
      });

      fetch.once('error', reject);
    });
  }

  // Determine target folder based on email subject
  getTargetFolder(subject) {
    for (const pattern of LOOKER_EMAIL_PATTERNS) {
      if (pattern.subjectPattern.test(subject)) {
        return pattern.targetFolder;
      }
    }
    return 'gmail-imports'; // Default folder
  }

  // Extract and save attachments from email
  async processAttachments(email) {
    const attachments = email.attachments || [];
    const savedFiles = [];
    const targetFolder = this.getTargetFolder(email.subject || '');

    console.log(`Processing email: "${email.subject}"`);
    console.log(`Target folder: ${targetFolder}`);
    console.log(`Attachments found: ${attachments.length}`);

    for (const attachment of attachments) {
      const filename = attachment.filename;
      
      if (!filename) continue;

      // Handle ZIP files (Looker sends CSVs as zip)
      if (filename.endsWith('.zip')) {
        try {
          const extractedFiles = await this.extractZipAttachment(attachment, targetFolder);
          savedFiles.push(...extractedFiles);
        } catch (err) {
          console.error(`Error extracting zip ${filename}:`, err);
        }
      }
      // Handle direct CSV files
      else if (filename.endsWith('.csv')) {
        const destDir = path.join(FILES_DIR, targetFolder);
        const filePath = path.join(destDir, this.sanitizeFilename(filename));

        // Ensure directory exists
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        fs.writeFileSync(filePath, attachment.content);
        savedFiles.push(filePath);
        console.log(`Saved CSV: ${filename}`);
      }
    }

    return savedFiles;
  }

  // Extract CSV files from a ZIP attachment
  async extractZipAttachment(attachment, targetFolder) {
    const extractedFiles = [];
    const destDir = path.join(FILES_DIR, targetFolder);

    // Ensure directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      const zip = new AdmZip(attachment.content);
      const zipEntries = zip.getEntries();

      for (const entry of zipEntries) {
        if (entry.entryName.endsWith('.csv') && !entry.isDirectory) {
          const filename = this.sanitizeFilename(path.basename(entry.entryName));
          const filePath = path.join(destDir, filename);

          // Extract file content
          const content = entry.getData().toString('utf8');
          fs.writeFileSync(filePath, content);
          extractedFiles.push(filePath);
          console.log(`Extracted: ${filename}`);
        }
      }
    } catch (err) {
      console.error('Error processing ZIP:', err);
    }

    return extractedFiles;
  }

  // Sanitize filename for safe storage
  sanitizeFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/__+/g, '_');
  }

  // Delete an email by moving to trash
  deleteEmail(messageId) {
    return new Promise((resolve, reject) => {
      this.imap.addFlags(messageId, ['\\Deleted'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Expunge deleted emails
  expungeDeleted() {
    return new Promise((resolve, reject) => {
      this.imap.expunge((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Main function to fetch and process Looker emails
  async fetchLookerData(daysBack = 1, deleteAfterProcess = true) {
    const results = {
      success: false,
      emailsProcessed: 0,
      emailsDeleted: 0,
      filesExtracted: [],
      errors: [],
      timestamp: new Date().toISOString(),
      latestEmailDate: null  // Track the most recent email received date
    };

    try {
      await this.connect();
      await this.openMailbox('INBOX');

      const messageIds = await this.searchLookerEmails(daysBack);
      console.log(`Found ${messageIds.length} Looker emails from last ${daysBack} day(s)`);

      const processedMsgIds = [];

      for (const msgId of messageIds) {
        try {
          const email = await this.fetchEmail(msgId);
          console.log(`\nProcessing: ${email.subject}`);
          console.log(`Date: ${email.date}`);

          // Track the latest email date (most recent email received)
          if (email.date) {
            const emailDate = new Date(email.date);
            if (!results.latestEmailDate || emailDate > new Date(results.latestEmailDate)) {
              results.latestEmailDate = emailDate.toISOString();
            }
          }

          // Process attachments
          const savedFiles = await this.processAttachments(email);
          results.filesExtracted.push(...savedFiles);
          results.emailsProcessed++;
          
          // Mark for deletion if we extracted files
          if (savedFiles.length > 0 && deleteAfterProcess) {
            processedMsgIds.push(msgId);
          }
        } catch (err) {
          console.error(`Error processing email ${msgId}:`, err);
          results.errors.push(`Email ${msgId}: ${err.message}`);
        }
      }

      // Delete processed emails
      if (deleteAfterProcess && processedMsgIds.length > 0) {
        console.log(`\nDeleting ${processedMsgIds.length} processed emails...`);
        for (const msgId of processedMsgIds) {
          try {
            await this.deleteEmail(msgId);
            results.emailsDeleted++;
          } catch (err) {
            console.error(`Failed to delete email ${msgId}:`, err);
          }
        }
        // Permanently remove deleted emails
        await this.expungeDeleted();
        console.log(`✓ Deleted ${results.emailsDeleted} emails from inbox`);
      }

      results.success = true;
    } catch (err) {
      console.error('Error fetching Looker data:', err);
      results.errors.push(err.message);
    } finally {
      this.disconnect();
    }

    // Log results
    this.logResults(results);

    return results;
  }

  // Log import results
  logResults(results) {
    const logDir = path.join(__dirname, '..', 'data', 'import-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.json`);
    
    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      } catch (e) {
        logs = [];
      }
    }

    logs.push(results);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  }
}

// Utility function for manual testing
async function testGmailConnection() {
  const fetcher = new GmailLookerFetcher();
  const args = process.argv.slice(2);
  const noDelete = args.includes('--no-delete');
  const daysBack = parseInt(args.find(a => !a.startsWith('-')) || '2');

  console.log('=== Gmail Looker Fetcher ===\n');
  console.log('Gmail user:', GMAIL_CONFIG.user || 'NOT SET');
  console.log('App password:', GMAIL_CONFIG.password ? 'SET' : 'NOT SET');
  console.log('Delete after process:', !noDelete);
  console.log('Days back:', daysBack);

  if (!GMAIL_CONFIG.user || !GMAIL_CONFIG.password) {
    console.log('\n⚠️  Please set environment variables:');
    console.log('  export GMAIL_USER="your-email@gmail.com"');
    console.log('  export GMAIL_APP_PASSWORD="your-app-password"');
    console.log('\nNote: Use a Gmail App Password, not your regular password.');
    console.log('Create one at: https://myaccount.google.com/apppasswords');
    return;
  }

  try {
    console.log('\nFetching Looker emails...');
    const result = await fetcher.fetchLookerData(daysBack, !noDelete);
    console.log('\n=== Results ===');
    console.log(`Emails processed: ${result.emailsProcessed}`);
    console.log(`Emails deleted: ${result.emailsDeleted || 0}`);
    console.log(`Files extracted: ${result.filesExtracted.length}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join(', ')}`);
    }
    console.log('\nFiles:', result.filesExtracted);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

// Run test if called directly
if (require.main === module) {
  testGmailConnection();
}

module.exports = { GmailLookerFetcher, testGmailConnection, GMAIL_CONFIG };

/*
Usage:
  node gmail-looker-fetcher.js              # Fetch last 2 days, delete after
  node gmail-looker-fetcher.js 1            # Fetch last 1 day, delete after  
  node gmail-looker-fetcher.js --no-delete  # Fetch but don't delete emails
  node gmail-looker-fetcher.js 7 --no-delete # Fetch last 7 days, keep emails
*/
