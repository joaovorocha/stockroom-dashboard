const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const { getDataDir } = require('./paths');

const DATA_DIR = getDataDir();
const FILES_DIR = path.join(__dirname, '..', 'files');
const METRICS_DIR = path.join(DATA_DIR, 'store-metrics');

// Gmail configuration - should be stored in environment variables
const GMAIL_CONFIG = {
  user: process.env.GMAIL_USER || '',
  password: process.env.GMAIL_APP_PASSWORD || '', // Use App Password, not regular password
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  authTimeout: 30000,  // 30 seconds for auth (default is too short)
  connTimeout: 30000   // 30 seconds for connection
};

class GmailFetcher {
  constructor(config = GMAIL_CONFIG) {
    this.config = config;
    this.imap = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
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
      const dateStr = sinceDate.toISOString().split('T')[0];

      // Search criteria for Looker emails
      const searchCriteria = [
        ['FROM', 'looker'],
        ['SINCE', dateStr]
      ];

      this.imap.search(searchCriteria, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  // Fetch email content
  fetchEmail(messageId) {
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

  // Extract and save CSV attachments
  async processAttachments(email) {
    const attachments = email.attachments || [];
    const savedFiles = [];

    for (const attachment of attachments) {
      if (attachment.filename && attachment.filename.endsWith('.csv')) {
        const filePath = path.join(FILES_DIR, 'gmail-imports', attachment.filename);

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Save the file
        fs.writeFileSync(filePath, attachment.content);
        savedFiles.push(filePath);
        console.log(`Saved attachment: ${attachment.filename}`);
      }
    }

    return savedFiles;
  }

  // Parse CSV content from email body or attachments
  parseCSVContent(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      data.push(row);
    }

    return data;
  }

  // Main function to fetch and process Looker emails
  async fetchLookerData() {
    const results = {
      success: false,
      emailsProcessed: 0,
      filesProcessed: [],
      errors: []
    };

    try {
      await this.connect();
      await this.openMailbox('INBOX');

      const messageIds = await this.searchLookerEmails(1);
      console.log(`Found ${messageIds.length} Looker emails`);

      for (const msgId of messageIds) {
        try {
          const email = await this.fetchEmail(msgId);
          console.log(`Processing email: ${email.subject}`);

          // Process attachments
          const savedFiles = await this.processAttachments(email);
          results.filesProcessed.push(...savedFiles);
          results.emailsProcessed++;
        } catch (err) {
          console.error(`Error processing email ${msgId}:`, err);
          results.errors.push(err.message);
        }
      }

      results.success = true;
    } catch (err) {
      console.error('Error fetching Looker data:', err);
      results.errors.push(err.message);
    } finally {
      this.disconnect();
    }

    return results;
  }
}

// Utility function for manual testing
async function testGmailConnection() {
  const fetcher = new GmailFetcher();

  console.log('Testing Gmail connection...');
  console.log('Gmail user:', GMAIL_CONFIG.user || 'NOT SET');
  console.log('App password:', GMAIL_CONFIG.password ? 'SET' : 'NOT SET');

  if (!GMAIL_CONFIG.user || !GMAIL_CONFIG.password) {
    console.log('\nPlease set environment variables:');
    console.log('  export GMAIL_USER="your-email@gmail.com"');
    console.log('  export GMAIL_APP_PASSWORD="your-app-password"');
    console.log('\nNote: Use a Gmail App Password, not your regular password.');
    console.log('Create one at: https://myaccount.google.com/apppasswords');
    return;
  }

  try {
    const result = await fetcher.fetchLookerData();
    console.log('Result:', result);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

module.exports = { GmailFetcher, testGmailConnection, GMAIL_CONFIG };
