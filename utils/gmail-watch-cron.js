/**
 * Gmail Watch Renewal Cron
 * 
 * Automatically renews Gmail watch every 6 days (before the 7-day expiration)
 */

const cron = require('node-cron');
const { setupWatch } = require('./gmail-watch-setup');

console.log('📅 Gmail Watch Renewal Cron Started');
console.log('Will renew Gmail watch every 6 days at midnight\n');

// Run every 6 days at midnight
// Cron format: minute hour day-of-month month day-of-week
cron.schedule('0 0 */6 * *', async () => {
  console.log('🔄 Renewing Gmail watch...');
  
  try {
    await setupWatch();
    console.log('✅ Gmail watch renewed successfully');
  } catch (error) {
    console.error('❌ Failed to renew Gmail watch:', error.message);
    // TODO: Send alert to admin
  }
}, {
  scheduled: true,
  timezone: "America/Los_Angeles" // Adjust to your timezone
});

// Keep the process alive
console.log('Press Ctrl+C to stop\n');
