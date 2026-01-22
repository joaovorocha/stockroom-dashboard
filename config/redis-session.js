/**
 * Redis Session Store Configuration
 * SECURITY PATCH: CRITICAL-01 from SYSTEM_AUDIT_REPORT.md
 * 
 * Migrates session management from PostgreSQL to Redis for:
 * - Better performance (in-memory storage)
 * - Industry standard for session management
 * - Automatic expiration handling
 * - Reduced database load
 */

const session = require('express-session');
const { RedisStore } = require('connect-redis'); // v9 uses named export
const redis = require('redis');

// Create Redis client with better error handling
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  legacyMode: false,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[REDIS] Too many retries, giving up');
        return new Error('Redis connection failed after 10 retries');
      }
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
      const delay = Math.min(retries * 100, 3000);
      console.log(`[REDIS] Retry ${retries} in ${delay}ms...`);
      return delay;
    }
  }
});

// Handle Redis connection errors
redisClient.on('error', (err) => {
  console.error('[REDIS] Connection error:', err.message);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Connected successfully');
});

redisClient.on('ready', () => {
  console.log('[REDIS] Ready to accept commands');
});

// Connect to Redis (non-blocking with reconnect strategy)
redisClient.connect().catch((err) => {
  console.error('[REDIS] Failed to connect:', err.message);
  console.warn('[REDIS] Will retry connection automatically...');
});

// Create Redis store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'stockroom:session:',
  ttl: 86400 // 24 hours in seconds (default)
});

/**
 * Get session middleware configuration
 * @param {Object} options - Session options
 * @param {number} options.maxAge - Session max age in milliseconds
 * @returns {Function} Express session middleware
 */
function getSessionMiddleware(options = {}) {
  const maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours default
  
  return session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'stockroom-dashboard-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'userSession',
    cookie: {
      httpOnly: true,
      // Use auto so cookies are sent over HTTPS when available, but still work behind Tailscale/localhost
      secure: 'auto',
      sameSite: 'lax',
      maxAge: maxAge
    }
  });
}

/**
 * Create a new session for user
 * @param {Object} req - Express request object
 * @param {string} userId - User ID
 * @param {number} maxAge - Session max age in milliseconds
 * @returns {Promise<string>} Session ID
 */
async function createSession(req, userId, maxAge = 24 * 60 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    req.session.userId = userId;
    req.session.createdAt = Date.now();
    req.session.expiresAt = Date.now() + maxAge;
    req.session.ipAddress = req.ip || req.connection?.remoteAddress;
    req.session.userAgent = req.get('user-agent');
    
    req.session.save((err) => {
      if (err) {
        console.error('[SESSION] Error creating session:', err);
        return reject(err);
      }
      resolve(req.sessionID);
    });
  });
}

/**
 * Get user from session
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserFromSession(req) {
  if (!req.session || !req.session.userId) {
    return null;
  }
  
  // Check if session is expired
  if (req.session.expiresAt && req.session.expiresAt < Date.now()) {
    await destroySession(req);
    return null;
  }
  
  return {
    userId: req.session.userId,
    createdAt: req.session.createdAt,
    expiresAt: req.session.expiresAt
  };
}

/**
 * Destroy session
 * @param {Object} req - Express request object
 * @returns {Promise<void>}
 */
async function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return resolve();
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('[SESSION] Error destroying session:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Update session expiration
 * @param {Object} req - Express request object
 * @param {number} maxAge - New max age in milliseconds
 * @returns {Promise<void>}
 */
async function updateSessionExpiration(req, maxAge) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return resolve();
    }
    
    req.session.expiresAt = Date.now() + maxAge;
    req.session.cookie.maxAge = maxAge;
    
    req.session.save((err) => {
      if (err) {
        console.error('[SESSION] Error updating session:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

module.exports = {
  redisClient,
  redisStore,
  getSessionMiddleware,
  createSession,
  getUserFromSession,
  destroySession,
  updateSessionExpiration
};
