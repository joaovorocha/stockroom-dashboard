/**
 * Unified Gmail Processor
 *
 * Consolidates Gmail email processing for:
 * - UPS shipping notifications (tracking updates)
 * - Looker data exports (dashboard metrics)
 *
 * Runs on a unified schedule to check for new emails and process them.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Import existing processors
const { UPSEmailParser } = require('./ups-email-parser');
const { GmailLookerFetcher } = require('./gmail-looker-fetcher');
const { LookerDataProcessor } = require('./looker-data-processor');

require('dotenv').config();

const dal = require('./dal');

const LOG_DIR = path.join(dal.paths.dataDir, 'scheduler-logs');

// Gmail configuration (shared) - LIGHTWEIGHT VERSION
const GMAIL_CONFIG = {
  user: process.env.GMAIL_USER || '',
  password: process.env.GMAIL_APP_PASSWORD || '',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  authTimeout: 10000, // Reduced timeout
  connTimeout: 10000, // Reduced timeout
  // Rate limiting and limits
  RATE_LIMIT_DELAY: 1000, // 1 second between requests
  MAX_EMAILS_PER_RUN: 50, // Don't process more than 50 emails at once
  MAX_HOURS_BACK: 2 // Only look back 2 hours max
};

// Email sender patterns
const EMAIL_PATTERNS = {
  UPS: [
    'ups@ups.com',
    'pkginfo@ups.com',
    'auto-notify@ups.com',
    'mcinfo@ups.com',
    'no-reply@ups.com',
    'upsemail@ups.com'
  ],
  LOOKER: [
    'noreply@looker.com',
    'looker@company.com' // Add your Looker sender emails
  ]
};

class UnifiedGmailProcessor {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.cronJob = null;
    this.imap = null;
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logFile = path.join(LOG_DIR, `unified-gmail-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n` : `${logMessage}\n`;
    fs.appendFileSync(logFile, logEntry);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap(GMAIL_CONFIG);

      this.imap.once('ready', () => {
        this.log('Connected to Gmail for unified processing');
        resolve();
      });

      this.imap.once('error', (err) => {
        this.log('IMAP error:', err.message);
        reject(err);
      });

      this.imap.once('end', () => {
        this.log('IMAP connection ended');
      });

      this.imap.connect();
    });
  }

  disconnect() {
    if (this.imap) {
      this.imap.end();
    }
  }

  async openMailbox(mailbox = 'INBOX') {
    return new Promise((resolve, reject) => {
      this.imap.openBox(mailbox, false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  // Search for emails from last check (OPTIMIZED: More specific search criteria)
  searchEmails(sinceDate) {
    return new Promise((resolve, reject) => {
      // Limit time window to prevent fetching too many emails
      // But extend the window if we're catching up
      const maxHoursBack = GMAIL_CONFIG.MAX_HOURS_BACK;
      let searchSince = new Date(Math.max(sinceDate.getTime(), Date.now() - (maxHoursBack * 60 * 60 * 1000)));

      // If the search window is very recent, extend it to catch any missed emails
      const timeSinceLastCheck = Date.now() - sinceDate.getTime();
      if (timeSinceLastCheck < (30 * 60 * 1000)) { // If less than 30 minutes since last check
        searchSince = new Date(Date.now() - (4 * 60 * 60 * 1000)); // Look back 4 hours
      }

      // More specific search criteria to reduce results
      // Use OR conditions properly structured for IMAP
      const searchCriteria = [
        ['SINCE', searchSince],
        // OR condition for senders
        ['OR',
          ['OR',
            ['OR', ['FROM', 'noreply@ups.com'], ['FROM', 'pkginfo@ups.com']],
            ['OR', ['FROM', 'auto-notify@ups.com'], ['FROM', 'mcinfo@ups.com']]
          ],
          ['OR',
            ['OR', ['FROM', 'no-reply@ups.com'], ['FROM', 'upsemail@ups.com']],
            ['OR', ['FROM', 'noreply@looker.com'], ['FROM', 'noreply@lookermail.com']]
          ]
        ],
        // OR condition for subjects
        ['OR',
          ['OR',
            ['OR', ['SUBJECT', 'tracking'], ['SUBJECT', 'shipment']],
            ['OR', ['SUBJECT', 'Looker'], ['SUBJECT', 'dashboard']]
          ],
          ['OR',
            ['OR', ['SUBJECT', 'export'], ['SUBJECT', 'Stores Performance']],
            ['OR', ['SUBJECT', 'Daily Performance Report'], ['SUBJECT', 'Weekly Performance Report']]
          ]
        ]
      ];

      const actualHoursBack = (Date.now() - searchSince.getTime()) / (60 * 60 * 1000);
      this.log(`Searching emails since: ${searchSince.toISOString()} (looking back ${actualHoursBack.toFixed(1)} hours)`);

      this.imap.search(searchCriteria, (err, results) => {
        if (err) reject(err);
        else {
          const limitedResults = (results || []).slice(0, GMAIL_CONFIG.MAX_EMAILS_PER_RUN * 2); // Get more than we'll process to account for filtering
          this.log(`Found ${limitedResults.length} potentially relevant emails`);
          resolve(limitedResults);
        }
      });
    });
  }

  // Fetch email content
  async fetchEmail(messageId) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(messageId, { bodies: '' });

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

  // LIGHTWEIGHT: Fetch only email headers first
  async fetchEmailHeaders(messageId) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(messageId, {
        bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)',
        struct: false
      });

      fetch.on('message', (msg) => {
        let headerBuffer = '';

        msg.on('body', (stream, info) => {
          if (info.which === 'HEADER.FIELDS (FROM SUBJECT DATE)') {
            stream.on('data', (chunk) => {
              headerBuffer += chunk.toString('utf8');
            });
          }
        });

        msg.once('end', () => {
          // Parse minimal headers
          const headers = {};
          const lines = headerBuffer.split('\n');
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim().toLowerCase();
              const value = line.substring(colonIndex + 1).trim();
              headers[key] = value;
            }
          }

          resolve({
            messageId,
            from: headers.from,
            subject: headers.subject,
            date: headers.date
          });
        });
      });

      fetch.once('error', reject);
    });
  }

  // Determine email type from headers (LIGHTWEIGHT)
  getEmailTypeFromHeaders(headers) {
    const fromAddr = headers.from || '';
    const subject = (headers.subject || '').toLowerCase();

    // Check UPS senders
    if (EMAIL_PATTERNS.UPS.some(sender => fromAddr.toLowerCase().includes(sender.toLowerCase())) ||
        subject.includes('ups') || subject.includes('tracking') || subject.includes('shipment')) {
      return 'UPS';
    }

    // Check Looker senders
    if (EMAIL_PATTERNS.LOOKER.some(sender => fromAddr.toLowerCase().includes(sender.toLowerCase())) ||
        subject.includes('looker') || subject.includes('dashboard') || subject.includes('export') ||
        subject.includes('data studio') || subject.includes('google') || fromAddr.includes('noreply')) {
      return 'LOOKER';
    }

    return 'UNKNOWN';
  }

  // Determine email type (from full email)
  getEmailType(email) {
    const fromAddr = email.from?.value?.[0]?.address || '';
    const subject = (email.subject || '').toLowerCase();

    // Check UPS senders
    if (EMAIL_PATTERNS.UPS.some(sender => fromAddr.toLowerCase().includes(sender.replace('@ups.com', '').toLowerCase())) ||
        subject.includes('ups') || subject.includes('tracking') || subject.includes('shipment')) {
      return 'UPS';
    }

    // Check Looker senders
    if (EMAIL_PATTERNS.LOOKER.some(sender => fromAddr.toLowerCase().includes(sender.toLowerCase())) ||
        subject.includes('looker') || subject.includes('dashboard') || subject.includes('export')) {
      return 'LOOKER';
    }

    return 'UNKNOWN';
  }

  // Process emails
  async processEmails() {
    if (this.isRunning) {
      this.log('Processing already in progress, skipping...');
      return { skipped: true, reason: 'Already running' };
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      const msg = 'Gmail credentials not configured';
      this.log(msg);
      return { skipped: true, reason: msg };
    }

    this.isRunning = true;
    this.lastRun = new Date();

    const results = {
      startTime: this.lastRun.toISOString(),
      endTime: null,
      emailsProcessed: 0,
      upsEmails: 0,
      lookerEmails: 0,
      unknownEmails: 0,
      upsResults: null,
      lookerResults: null,
      success: false,
      errors: []
    };

    this.log('Starting unified Gmail processing');

    try {
      await this.connect();
      await this.openMailbox('INBOX');

      // Get last processed timestamp from file
      const lastProcessedFile = path.join(LOG_DIR, 'last-processed-timestamp.txt');
      let sinceDate = new Date();
      sinceDate.setHours(sinceDate.getHours() - 1); // Default to last hour

      if (fs.existsSync(lastProcessedFile)) {
        try {
          const timestamp = fs.readFileSync(lastProcessedFile, 'utf8').trim();
          sinceDate = new Date(timestamp);
        } catch (e) {
          this.log('Error reading last processed timestamp, using default');
        }
      }

      this.log(`Searching for emails since: ${sinceDate.toISOString()}`);

      const messageIds = await this.searchEmails(sinceDate);
      this.log(`Found ${messageIds.length} emails to process`);

      // LIGHTWEIGHT PROCESSING: First fetch headers only, then selectively download full content
      const upsEmails = [];
      const lookerEmails = [];

      // Limit processing to prevent overload
      const maxEmails = GMAIL_CONFIG.MAX_EMAILS_PER_RUN;
      const emailsToProcess = messageIds.slice(0, maxEmails);

      this.log(`Processing ${emailsToProcess.length} emails (limited from ${messageIds.length})`);
      this.log(`OPTIMIZATION: Only downloading full content for UPS/Looker emails, skipping others`);

      // Step 1: Fetch headers and categorize
      for (const msgId of emailsToProcess) {
        try {
          // Rate limiting
          if (GMAIL_CONFIG.RATE_LIMIT_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, GMAIL_CONFIG.RATE_LIMIT_DELAY));
          }

          const headers = await this.fetchEmailHeaders(msgId);
          const emailType = this.getEmailTypeFromHeaders(headers);

          results.emailsProcessed++;

          if (emailType === 'UPS') {
            results.upsEmails++;
            this.log(`Found UPS email: ${headers.subject}`);
            // Only download full content for UPS emails
            const fullEmail = await this.fetchEmail(msgId);
            upsEmails.push(fullEmail);
          } else if (emailType === 'LOOKER') {
            results.lookerEmails++;
            this.log(`Found Looker email: ${headers.subject}`);
            // Only download full content for Looker emails
            const fullEmail = await this.fetchEmail(msgId);
            lookerEmails.push(fullEmail);
          } else {
            results.unknownEmails++;
            // Skip full content download for unknown emails
            this.log(`Skipping unknown email: ${headers.subject} (from: ${headers.from})`);
          }
        } catch (err) {
          this.log(`Error processing email ${msgId}:`, err.message);
          results.errors.push(`Email ${msgId}: ${err.message}`);
        }
      }

      // Process UPS emails
      if (upsEmails.length > 0) {
        this.log(`Processing ${upsEmails.length} UPS emails`);
        const upsParser = new UPSEmailParser();

        // Convert emails to the format expected by UPSEmailParser
        // Note: This might need adjustment based on how UPSEmailParser expects data
        results.upsResults = { emailsProcessed: upsEmails.length, shipmentsCreated: 0, shipmentsUpdated: 0 };

        for (const email of upsEmails) {
          try {
            const details = upsParser.parseShipmentDetails(email);
            const statusUpdate = upsParser.parseStatusUpdate(email);

            if (details.trackingNumbers.length > 0) {
              const { created, updated } = await upsParser.createShipmentRecord(details, statusUpdate);
              results.upsResults.shipmentsCreated += created;
              results.upsResults.shipmentsUpdated += updated;
            }
          } catch (err) {
            this.log('Error processing UPS email:', err.message);
            results.errors.push(`UPS processing: ${err.message}`);
          }
        }
      }

      // Process Looker emails
      if (lookerEmails.length > 0) {
        this.log(`Processing ${lookerEmails.length} Looker emails`);
        const lookerFetcher = new GmailLookerFetcher();

        // Extract attachments from Looker emails
        const extractedFiles = [];
        for (const email of lookerEmails) {
          try {
            const files = await lookerFetcher.processAttachments(email);
            extractedFiles.push(...files);
          } catch (err) {
            this.log('Error extracting Looker attachments:', err.message);
            results.errors.push(`Looker extraction: ${err.message}`);
          }
        }

        if (extractedFiles.length > 0) {
          // Process the extracted files
          const processor = new LookerDataProcessor();
          results.lookerResults = await processor.processAll({
            syncBy: 'unified-processor',
            emailDate: new Date().toISOString(),
            importStats: {
              recordsImported: extractedFiles.length,
              files: extractedFiles
            }
          });
        }
      }

      // Update last processed timestamp
      fs.writeFileSync(lastProcessedFile, new Date().toISOString());

      results.success = results.errors.length === 0;
      results.endTime = new Date().toISOString();

      this.log('Unified processing completed', {
        emailsProcessed: results.emailsProcessed,
        upsEmails: results.upsEmails,
        lookerEmails: results.lookerEmails,
        unknownEmails: results.unknownEmails,
        success: results.success
      });

    } catch (error) {
      results.errors.push(error.message);
      results.endTime = new Date().toISOString();
      this.log('Processing failed:', error.message);
    } finally {
      this.disconnect();
      this.isRunning = false;
    }

    return results;
  }

  // Start scheduled processing
  start(cronExpression = '*/30 * * * *') { // Every 30 minutes by default
    this.log(`Starting unified processor with cron: ${cronExpression}`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      this.log('Cron job triggered');
      await this.processEmails();
    }, {
      scheduled: true,
      timezone: 'America/Los_Angeles'
    });

    this.log('Unified processor started');
    return this;
  }

  // Stop the processor
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.log('Unified processor stopped');
    }
  }

  // Get status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      scheduled: this.cronJob ? this.cronJob.running : false
    };
  }
}

// Singleton instance
let processorInstance = null;

function getUnifiedProcessor() {
  if (!processorInstance) {
    processorInstance = new UnifiedGmailProcessor();
  }
  return processorInstance;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const processor = getUnifiedProcessor();

  switch (command) {
    case 'run':
      console.log('Running unified processing now...');
      processor.processEmails().then(results => {
        console.log('\nResults:', JSON.stringify(results, null, 2));
        process.exit(results.success ? 0 : 1);
      });
      break;

    case 'start':
      const cronExpr = args[1] || '*/30 * * * *';
      console.log(`Starting unified processor with cron: ${cronExpr}`);
      processor.start(cronExpr);
      console.log('Processor running. Press Ctrl+C to stop.');
      break;

    case 'status':
      console.log('Processor status:', processor.getStatus());
      break;

    default:
      console.log(`
Unified Gmail Processor

Usage:
  node unified-gmail-processor.js run     - Process emails now
  node unified-gmail-processor.js start   - Start scheduled processing (every 30 min)
  node unified-gmail-processor.js start "0 */2 * * *"  - Start with custom cron
  node unified-gmail-processor.js status  - Check processor status

Cron Format: minute hour day-of-month month day-of-week
Examples:
  "*/30 * * * *"   - Every 30 minutes
  "0 */2 * * *"    - Every 2 hours
  "0 8-18 * * *"   - Every hour from 8 AM to 6 PM
      `);
  }
}

module.exports = { UnifiedGmailProcessor, getUnifiedProcessor };