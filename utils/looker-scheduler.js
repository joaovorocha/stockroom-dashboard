require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
/**
 * Looker Data Scheduler
 * 
 * Automatically fetches Looker data from Gmail and processes it daily.
 * Designed to run at 6:30 AM (after Looker emails arrive at 6:00 AM).
 */

const cron = require('node-cron');
const { GmailLookerFetcher } = require('./gmail-looker-fetcher');
const { LookerDataProcessor } = require('./looker-data-processor');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'data', 'scheduler-logs');

class LookerScheduler {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.cronJob = null;
  }

  // Log scheduler activity
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    // Write to daily log file
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logFile = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = data 
      ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n`
      : `${logMessage}\n`;
    
    fs.appendFileSync(logFile, logEntry);
  }

  // Run the full sync process
  async runSync() {
    if (this.isRunning) {
      this.log('Sync already in progress, skipping...');
      return { skipped: true, reason: 'Already running' };
    }

    this.isRunning = true;
    this.lastRun = new Date();
    
    const results = {
      startTime: this.lastRun.toISOString(),
      endTime: null,
      fetch: null,
      process: null,
      success: false,
      errors: []
    };

    this.log('Starting scheduled Looker data sync');

    try {
      // Step 1: Fetch emails from Gmail
      this.log('Fetching Looker emails from Gmail...');
      const fetcher = new GmailLookerFetcher();
      results.fetch = await fetcher.fetchLookerData(1);
      
      this.log(`Emails processed: ${results.fetch.emailsProcessed}`);
      this.log(`Files extracted: ${results.fetch.filesExtracted.length}`);

      if (results.fetch.errors.length > 0) {
        results.errors.push(...results.fetch.errors);
        this.log('Fetch errors:', results.fetch.errors);
      }

      // Step 2: Process CSV files
      this.log('Processing CSV files...');
      const processor = new LookerDataProcessor();
      const emailDate = results.fetch?.latestEmailDate || null;
      results.process = await processor.processAll({
        syncBy: 'scheduler',
        emailDate,
        importStats: {
          recordsImported: results.fetch?.filesExtracted?.length || 0,
          files: Array.isArray(results.fetch?.filesExtracted) ? results.fetch.filesExtracted : []
        }
      });

      if (results.process.errors.length > 0) {
        results.errors.push(...results.process.errors);
        this.log('Process errors:', results.process.errors);
      }

      // Dashboard data is saved as part of processAll()
      results.dashboardDataSaved = true;
      results.hasNewData = results.process?.hasNewData || false;

      results.success = results.errors.length === 0;
      results.endTime = new Date().toISOString();

      this.log('Sync completed', {
        success: results.success,
        hasNewData: results.hasNewData,
        filesProcessed: results.process?.filesProcessed?.length || 0,
        employeesUpdated: results.process?.employeeMetrics?.employeesUpdated || 0
      });

    } catch (error) {
      results.errors.push(error.message);
      results.endTime = new Date().toISOString();
      this.log('Sync failed with error:', error.message);
    } finally {
      this.isRunning = false;
    }

    // Save results to JSON
    this.saveResults(results);

    return results;
  }

  // Save sync results to JSON file
  saveResults(results) {
    const resultsDir = path.join(__dirname, '..', 'data', 'sync-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const resultsFile = path.join(resultsDir, `${new Date().toISOString().split('T')[0]}.json`);
    
    let allResults = [];
    if (fs.existsSync(resultsFile)) {
      try {
        allResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      } catch (e) {
        allResults = [];
      }
    }

    allResults.push(results);
    fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  }

  // Start the scheduler
  start(cronExpression = '30 6 * * *') {
    // Default: 6:30 AM every day
    // Cron format: minute hour day-of-month month day-of-week
    
    this.log(`Starting scheduler with cron: ${cronExpression}`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      this.log('Cron job triggered');
      await this.runSync();
    }, {
      scheduled: true,
      timezone: 'America/Los_Angeles' // Adjust to your timezone
    });

    this.log('Scheduler started');
    return this;
  }

  // Stop the scheduler
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.log('Scheduler stopped');
    }
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      scheduled: this.cronJob ? this.cronJob.running : false
    };
  }
}

// Singleton instance
let schedulerInstance = null;

function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new LookerScheduler();
  }
  return schedulerInstance;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const scheduler = getScheduler();

  switch (command) {
    case 'run':
      // Run sync immediately
      console.log('Running sync now...');
      scheduler.runSync().then(results => {
        console.log('\nResults:', JSON.stringify(results, null, 2));
        process.exit(results.success ? 0 : 1);
      });
      break;

    case 'start':
      // Start scheduler daemon
      const cronExpr = args[1] || '30 6 * * *';
      console.log(`Starting scheduler with cron expression: ${cronExpr}`);
      scheduler.start(cronExpr);
      console.log('Scheduler running. Press Ctrl+C to stop.');
      break;

    case 'status':
      console.log('Scheduler status:', scheduler.getStatus());
      break;

    default:
      console.log(`
Looker Data Scheduler

Usage:
  node looker-scheduler.js run      - Run sync immediately
  node looker-scheduler.js start    - Start scheduled daemon (6:30 AM daily)
  node looker-scheduler.js start "0 7 * * *"  - Start with custom cron
  node looker-scheduler.js status   - Check scheduler status

Cron Format: minute hour day-of-month month day-of-week
Examples:
  "30 6 * * *"    - 6:30 AM every day
  "0 7 * * 1-5"   - 7:00 AM weekdays only
  "*/15 * * * *"  - Every 15 minutes (for testing)
      `);
  }
}

module.exports = { LookerScheduler, getScheduler };
