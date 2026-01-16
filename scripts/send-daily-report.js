const { sendReportEmail } = require('../src/utils/mailer');

async function sendDailyReport() {
  try {
    // Example: Send a simple report
    const reportData = {
      to: process.env.REPORT_EMAIL || process.env.GMAIL_USER,
      subject: 'Daily Stockroom Report',
      text: `Daily report generated at ${new Date().toISOString()}\n\nAdd your report content here.`,
      // html: '<h1>Daily Report</h1><p>Report content</p>', // Optional HTML
      // attachments: [{ filename: 'report.csv', content: csvData }] // Optional
    };

    await sendReportEmail(reportData);
    console.log('Report email sent successfully');
  } catch (error) {
    console.error('Failed to send report:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  sendDailyReport();
}

module.exports = { sendDailyReport };