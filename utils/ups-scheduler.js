/**
 * UPS Email Import Scheduler
 * Runs the UPS email importer on a cron to auto-create shipments.
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { UPSEmailParser } = require('./ups-email-parser');

const LOG_DIR = path.join(__dirname, '..', 'data', 'scheduler-logs');

class UPSScheduler {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.cronJob = null;
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logFile = path.join(LOG_DIR, `ups-import-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n` : `${logMessage}\n`;
    fs.appendFileSync(logFile, logEntry);
  }

  async runImport(daysBack = 2, deleteAfterImport = true) {
    if (this.isRunning) {
      this.log('UPS import already running, skipping...');
      return { skipped: true, reason: 'Already running' };
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      const msg = 'Gmail credentials not configured; skipping UPS import';
      this.log(msg);
      return { skipped: true, reason: msg };
    }

    this.isRunning = true;
    this.lastRun = new Date();

    const results = {
      startTime: this.lastRun.toISOString(),
      endTime: null,
      success: false,
      emailsProcessed: 0,
      shipmentsCreated: 0,
      trackingNumbers: [],
      createdShipments: [],
      emailsDeleted: 0,
      errors: []
    };

    try {
      this.log(`Starting UPS email import (daysBack=${daysBack}, deleteAfterImport=${deleteAfterImport})`);
      const parser = new UPSEmailParser();
      const fetchResult = await parser.fetchAndImportShipments(daysBack, deleteAfterImport);

      results.emailsProcessed = fetchResult.emailsProcessed || 0;
      results.shipmentsCreated = fetchResult.shipmentsCreated || 0;
      results.trackingNumbers = fetchResult.trackingNumbers || [];
      results.createdShipments = fetchResult.createdShipments || [];
      results.emailsDeleted = fetchResult.emailsDeleted || 0;
      results.errors = fetchResult.errors || [];

      results.success = results.errors.length === 0;
      this.log('UPS import finished', {
        emailsProcessed: results.emailsProcessed,
        shipmentsCreated: results.shipmentsCreated,
        emailsDeleted: results.emailsDeleted,
        trackingNumbers: results.trackingNumbers
      });
    } catch (error) {
      results.errors.push(error.message);
      this.log('UPS import failed', { error: error.message });
    } finally {
      results.endTime = new Date().toISOString();
      this.isRunning = false;
      this.saveResults(results);
    }

    return results;
  }

  saveResults(results) {
    const resultsDir = path.join(__dirname, '..', 'data', 'sync-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const resultsFile = path.join(resultsDir, `ups-import-${new Date().toISOString().split('T')[0]}.json`);

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

  start(cronExpression = '*/10 * * * *', daysBack = 2, deleteAfterImport = true) {
    this.log(`Starting UPS scheduler with cron: ${cronExpression} (daysBack=${daysBack}, deleteAfterImport=${deleteAfterImport})`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      this.log('UPS cron triggered');
      await this.runImport(daysBack, deleteAfterImport);
    }, {
      scheduled: true,
      timezone: 'America/Los_Angeles'
    });

    this.log('UPS scheduler started');
    return this;
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.log('UPS scheduler stopped');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      scheduled: this.cronJob ? this.cronJob.running : false
    };
  }
}

let schedulerInstance = null;
function getUPSScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new UPSScheduler();
  }
  return schedulerInstance;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const cronExpr = args[1] || process.env.UPS_EMAIL_IMPORT_CRON || '*/10 * * * *';
  const daysBack = parseInt(process.env.UPS_EMAIL_IMPORT_DAYS || args[2] || '2', 10);
  const deleteAfterImport = process.env.UPS_EMAIL_DELETE_AFTER_IMPORT !== 'false';
  const scheduler = getUPSScheduler();

  switch (command) {
    case 'run':
      scheduler.runImport(daysBack, deleteAfterImport).then((results) => {
        console.log('\nResults:', JSON.stringify(results, null, 2));
        process.exit(results.success ? 0 : 1);
      });
      break;
    case 'start':
    default:
      scheduler.start(cronExpr, daysBack, deleteAfterImport);
      console.log('UPS scheduler running. Press Ctrl+C to stop.');
  }
}

module.exports = { UPSScheduler, getUPSScheduler };
