/**
 * Rate Limiting Middleware
 * Protects login endpoints from brute force attacks
 */

const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'suit'
});

/**
 * In-memory store for rate limiting (for single-server deployment)
 * For production with multiple servers, use Redis store
 */
const loginAttempts = new Map();

/**
 * Clean up old entries every 15 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginAttempts.entries()) {
    if (now - data.firstAttempt > 15 * 60 * 1000) {
      loginAttempts.delete(key);
    }
  }
}, 15 * 60 * 1000);

/**
 * Login rate limiter configuration
 * - 5 failed attempts per 15 minutes per IP
 * - 10 failed attempts per email per hour
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use IP + email combination for more precise limiting
    const email = req.body?.email || 'unknown';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${ip}:${email}`;
  },
  skip: (req) => {
    // Skip rate limiting for successful logins
    return false;
  },
  handler: async (req, res) => {
    // Log blocked attempt
    const ip = req.ip || req.connection?.remoteAddress;
    const email = req.body?.email || 'unknown';
    
    try {
      await pool.query(`
        INSERT INTO admin_audit_log (action, details, ip_address, created_at)
        VALUES ('LOGIN_RATE_LIMITED', $1, $2, NOW())
      `, [
        JSON.stringify({ email, reason: 'Too many attempts' }),
        ip
      ]);
    } catch (err) {
      console.error('Failed to log rate limit:', err.message);
    }
    
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: 15 * 60
    });
  }
});

/**
 * Track failed login attempts per email (more granular control)
 */
async function trackFailedLogin(email, ip) {
  const key = email.toLowerCase();
  const now = Date.now();
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
      ips: [ip]
    });
  } else {
    const data = loginAttempts.get(key);
    data.count++;
    data.lastAttempt = now;
    if (!data.ips.includes(ip)) {
      data.ips.push(ip);
    }
  }
  
  const attempts = loginAttempts.get(key);
  
  // If more than 10 attempts in an hour, lock the account temporarily
  if (attempts.count >= 10 && (now - attempts.firstAttempt) < 60 * 60 * 1000) {
    return {
      blocked: true,
      message: 'Account temporarily locked due to too many failed attempts. Try again in 1 hour.',
      attempts: attempts.count
    };
  }
  
  // Warn after 5 attempts
  if (attempts.count >= 5) {
    return {
      blocked: false,
      warning: true,
      message: `Warning: ${10 - attempts.count} attempts remaining before account lock.`,
      attempts: attempts.count
    };
  }
  
  return { blocked: false, attempts: attempts.count };
}

/**
 * Clear failed attempts on successful login
 */
function clearFailedAttempts(email) {
  loginAttempts.delete(email.toLowerCase());
}

/**
 * Check if email is currently blocked
 */
function isEmailBlocked(email) {
  const key = email.toLowerCase();
  const data = loginAttempts.get(key);
  
  if (!data) return { blocked: false };
  
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  
  // Reset if first attempt was more than an hour ago
  if (data.firstAttempt < hourAgo) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  
  // Block if 10+ attempts in the last hour
  if (data.count >= 10) {
    const remainingMs = (data.firstAttempt + 60 * 60 * 1000) - now;
    const remainingMins = Math.ceil(remainingMs / 60000);
    return {
      blocked: true,
      message: `Account temporarily locked. Try again in ${remainingMins} minutes.`,
      remainingMs
    };
  }
  
  return { blocked: false, attempts: data.count };
}

/**
 * General API rate limiter (less strict)
 */
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Admin API rate limiter (moderate)
 */
const adminRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    success: false,
    error: 'Too many admin requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginRateLimiter,
  trackFailedLogin,
  clearFailedAttempts,
  isEmailBlocked,
  apiRateLimiter,
  adminRateLimiter
};
