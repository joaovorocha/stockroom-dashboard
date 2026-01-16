const nodemailer = require('nodemailer');
const { google } = require('googleapis');

function getAppBaseUrl() {
  const env = (process.env.APP_BASE_URL || '').toString().trim();
  if (env) return env.replace(/\/+$/, '');
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function createTransporter() {
  const host = (process.env.SMTP_HOST || '').toString().trim();
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || '').toString().trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').toString();
  const clientId = (process.env.GMAIL_CLIENT_ID || '').toString().trim();
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').toString().trim();
  const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || '').toString().trim();

  if (!user) {
    throw new Error('Email user not configured (set SMTP_USER or GMAIL_USER)');
  }

  if (host) {
    // Custom SMTP
    if (!pass) {
      throw new Error('SMTP_PASS not configured for custom SMTP');
    }
    const port = Number.parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = (process.env.SMTP_SECURE || '').toString().trim()
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  }

  // Gmail
  if (clientId && clientSecret && refreshToken) {
    // OAuth2
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user,
        clientId,
        clientSecret,
        refreshToken
      }
    });
  } else if (pass) {
    // Fallback to app password
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  } else {
    throw new Error('Gmail credentials not configured (set GMAIL_APP_PASSWORD or OAuth2 vars)');
  }
}

async function sendPasswordResetEmail({ to, name, token }) {
  const transporter = createTransporter();
  const from = (process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || '').toString().trim();
  if (!from) throw new Error('MAIL_FROM/SMTP_FROM not configured');

  const baseUrl = getAppBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const safeName = (name || '').toString().trim() || 'there';
  const subject = 'Reset your Stockroom Dashboard password';
  const text =
    `Hi ${safeName},\n\n` +
    `We received a request to reset your password.\n\n` +
    `Reset link (expires in 30 minutes):\n${resetUrl}\n\n` +
    `If you did not request this, you can ignore this email.\n`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });

  return { resetUrl };
}

async function sendReportEmail({ to, subject, text, html, attachments }) {
  const transporter = createTransporter();
  const from = (process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || '').toString().trim();
  if (!from) throw new Error('MAIL_FROM/SMTP_FROM not configured');

  const mailOptions = {
    from,
    to,
    subject: subject || 'Stockroom Dashboard Report',
    text,
    html,
    attachments
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
}

module.exports = {
  sendPasswordResetEmail,
  sendReportEmail,
  getAppBaseUrl
};
