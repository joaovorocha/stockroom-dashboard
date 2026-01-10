const nodemailer = require('nodemailer');

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

  if (!user || !pass) {
    throw new Error('Email credentials not configured (set SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD)');
  }

  if (host) {
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

  // Default: Gmail (pairs nicely with existing UPS importer env vars).
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
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

module.exports = {
  sendPasswordResetEmail,
  getAppBaseUrl
};
