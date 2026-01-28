/**
 * Audit Log Monitoring & Alerts
 * Monitors admin_audit_log for suspicious activity
 */

const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const pool = new Pool({
  host: 'localhost',
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'suit'
});

// Alert thresholds
const THRESHOLDS = {
  FAILED_LOGINS_PER_HOUR: 10,      // Alert if > 10 failed logins per hour
  RATE_LIMITED_PER_HOUR: 5,        // Alert if > 5 rate limited attempts
  ADMIN_ACTIONS_PER_HOUR: 50,      // Alert if > 50 admin actions per hour
  SUSPICIOUS_IP_COUNTRIES: ['RU', 'CN', 'KP'], // Countries to flag (optional, needs GeoIP)
};

// Email configuration (update with your SMTP settings)
const EMAIL_CONFIG = {
  enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
  from: process.env.ALERT_EMAIL_FROM || 'alerts@suitsupply.com',
  to: process.env.ALERT_EMAIL_TO || 'security@suitsupply.com',
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  }
};

/**
 * Check for suspicious activity in the last hour
 */
async function checkAuditLogs() {
  const alerts = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    // Check 1: Failed login attempts
    const failedLogins = await pool.query(`
      SELECT COUNT(*) as count, 
             COUNT(DISTINCT ip_address) as unique_ips
      FROM admin_audit_log 
      WHERE action IN ('LOGIN_FAILED', 'LOGIN_FAILED_BAD_PASSWORD', 'LOGIN_FAILED_USER_NOT_FOUND')
        AND created_at > $1
    `, [oneHourAgo]);

    if (parseInt(failedLogins.rows[0].count) > THRESHOLDS.FAILED_LOGINS_PER_HOUR) {
      alerts.push({
        severity: 'high',
        type: 'EXCESSIVE_FAILED_LOGINS',
        message: `${failedLogins.rows[0].count} failed login attempts in the last hour from ${failedLogins.rows[0].unique_ips} unique IPs`,
        count: parseInt(failedLogins.rows[0].count)
      });
    }

    // Check 2: Rate limited attempts
    const rateLimited = await pool.query(`
      SELECT COUNT(*) as count
      FROM admin_audit_log 
      WHERE action = 'LOGIN_RATE_LIMITED'
        AND created_at > $1
    `, [oneHourAgo]);

    if (parseInt(rateLimited.rows[0].count) > THRESHOLDS.RATE_LIMITED_PER_HOUR) {
      alerts.push({
        severity: 'high',
        type: 'EXCESSIVE_RATE_LIMITS',
        message: `${rateLimited.rows[0].count} rate-limited login attempts in the last hour`,
        count: parseInt(rateLimited.rows[0].count)
      });
    }

    // Check 3: Unusual admin activity
    const adminActions = await pool.query(`
      SELECT COUNT(*) as count, user_id
      FROM admin_audit_log 
      WHERE action IN ('UPDATE_GLOBAL_SETTING', 'DELETE_USER', 'GRANT_STORE_ACCESS', 'UPDATE_USER')
        AND created_at > $1
      GROUP BY user_id
      HAVING COUNT(*) > $2
    `, [oneHourAgo, THRESHOLDS.ADMIN_ACTIONS_PER_HOUR]);

    if (adminActions.rows.length > 0) {
      alerts.push({
        severity: 'medium',
        type: 'HIGH_ADMIN_ACTIVITY',
        message: `High admin activity detected: ${adminActions.rows.map(r => `User ${r.user_id}: ${r.count} actions`).join(', ')}`,
        users: adminActions.rows
      });
    }

    // Check 4: Login from new IPs for admin users
    const newAdminIps = await pool.query(`
      SELECT DISTINCT a.ip_address, u.email, u.name
      FROM admin_audit_log a
      JOIN users u ON a.user_id = u.id
      WHERE a.action = 'LOGIN'
        AND u.is_super_admin = true
        AND a.created_at > $1
        AND a.ip_address NOT IN (
          SELECT DISTINCT ip_address 
          FROM admin_audit_log 
          WHERE user_id = a.user_id 
            AND action = 'LOGIN'
            AND created_at < $1
        )
    `, [oneHourAgo]);

    if (newAdminIps.rows.length > 0) {
      alerts.push({
        severity: 'medium',
        type: 'NEW_ADMIN_IP',
        message: `Super admin login from new IP: ${newAdminIps.rows.map(r => `${r.name} from ${r.ip_address}`).join(', ')}`,
        logins: newAdminIps.rows
      });
    }

    return alerts;

  } catch (error) {
    console.error('Audit check error:', error);
    return [{
      severity: 'low',
      type: 'MONITORING_ERROR',
      message: `Audit monitoring error: ${error.message}`
    }];
  }
}

/**
 * Send alert email
 */
async function sendAlertEmail(alerts) {
  if (!EMAIL_CONFIG.enabled || alerts.length === 0) {
    return;
  }

  try {
    const transporter = nodemailer.createTransport(EMAIL_CONFIG.smtp);
    
    const highSeverity = alerts.filter(a => a.severity === 'high');
    const subject = highSeverity.length > 0 
      ? `🚨 SECURITY ALERT: ${highSeverity.length} critical issues detected`
      : `⚠️ Security Notice: ${alerts.length} items need attention`;

    const html = `
      <h2>Security Alert - Stockroom Dashboard</h2>
      <p>The following security events were detected in the last hour:</p>
      <table border="1" cellpadding="8" style="border-collapse: collapse;">
        <tr style="background: #f0f0f0;">
          <th>Severity</th>
          <th>Type</th>
          <th>Details</th>
        </tr>
        ${alerts.map(a => `
          <tr style="background: ${a.severity === 'high' ? '#ffe0e0' : '#fff3e0'};">
            <td><strong>${a.severity.toUpperCase()}</strong></td>
            <td>${a.type}</td>
            <td>${a.message}</td>
          </tr>
        `).join('')}
      </table>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        This is an automated security alert from the Stockroom Dashboard monitoring system.
        <br>Time: ${new Date().toISOString()}
      </p>
    `;

    await transporter.sendMail({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject,
      html
    });

    console.log(`Security alert email sent: ${alerts.length} alerts`);
  } catch (error) {
    console.error('Failed to send alert email:', error);
  }
}

/**
 * Log alerts to database for dashboard viewing
 */
async function logAlerts(alerts) {
  if (alerts.length === 0) return;

  try {
    for (const alert of alerts) {
      await pool.query(`
        INSERT INTO security_alerts (severity, type, message, details, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [alert.severity, alert.type, alert.message, JSON.stringify(alert)]);
    }
  } catch (error) {
    // Table might not exist, create it
    if (error.code === '42P01') {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS security_alerts (
          id SERIAL PRIMARY KEY,
          severity VARCHAR(20) NOT NULL,
          type VARCHAR(50) NOT NULL,
          message TEXT,
          details JSONB,
          acknowledged BOOLEAN DEFAULT false,
          acknowledged_by INTEGER REFERENCES users(id),
          acknowledged_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX idx_security_alerts_severity ON security_alerts(severity);
        CREATE INDEX idx_security_alerts_created ON security_alerts(created_at DESC);
      `);
      // Retry logging
      await logAlerts(alerts);
    } else {
      console.error('Failed to log alerts:', error);
    }
  }
}

/**
 * Run monitoring check
 */
async function runMonitoring() {
  console.log(`[${new Date().toISOString()}] Running audit log monitoring...`);
  
  const alerts = await checkAuditLogs();
  
  if (alerts.length > 0) {
    console.log(`Found ${alerts.length} alerts:`);
    alerts.forEach(a => console.log(`  [${a.severity}] ${a.type}: ${a.message}`));
    
    await logAlerts(alerts);
    await sendAlertEmail(alerts);
  } else {
    console.log('No security alerts.');
  }
}

/**
 * Get recent alerts for dashboard
 */
async function getRecentAlerts(limit = 50) {
  try {
    const result = await pool.query(`
      SELECT * FROM security_alerts 
      ORDER BY created_at DESC 
      LIMIT $1
    `, [limit]);
    return result.rows;
  } catch (error) {
    return [];
  }
}

/**
 * Acknowledge an alert
 */
async function acknowledgeAlert(alertId, userId) {
  await pool.query(`
    UPDATE security_alerts 
    SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
    WHERE id = $2
  `, [userId, alertId]);
}

// Run as standalone script
if (require.main === module) {
  runMonitoring()
    .then(() => {
      console.log('Monitoring complete.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Monitoring failed:', err);
      process.exit(1);
    });
}

module.exports = {
  checkAuditLogs,
  runMonitoring,
  getRecentAlerts,
  acknowledgeAlert,
  THRESHOLDS
};
