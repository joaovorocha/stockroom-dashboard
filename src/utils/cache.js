/**
 * Redis Cache Module
 * Provides caching for API responses
 */

const redis = require('redis');

let client = null;

/**
 * Initialize Redis client
 */
function initCache() {
  if (client) return client;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  client = redis.createClient({ url: redisUrl });

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  client.on('connect', () => {
    console.log('Connected to Redis');
  });

  client.connect().catch(console.error);

  return client;
}

/**
 * Get cached value
 */
async function get(key) {
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set cached value with TTL
 */
async function set(key, value, ttlSeconds = 300) {
  if (!client) return;
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Delete cached value
 */
async function del(key) {
  if (!client) return;
  try {
    await client.del(key);
  } catch (error) {
    console.error('Cache del error:', error);
  }
}

/**
 * Clear all cache
 */
async function clear() {
  if (!client) return;
  try {
    await client.flushAll();
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

module.exports = {
  initCache,
  get,
  set,
  del,
  clear
};