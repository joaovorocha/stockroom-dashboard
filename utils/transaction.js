/**
 * PostgreSQL Transaction Wrapper Utilities
 * SECURITY PATCH: CRITICAL-03 from SYSTEM_AUDIT_REPORT.md
 * 
 * Provides atomic transaction support for database operations
 * Prevents race conditions and ensures data integrity
 */

const { getPool } = require('../db/setup-database');

// Get existing pool from setup-database
let pool;
try {
  pool = getPool();
} catch (error) {
  console.error('[TRANSACTION] Warning: Could not get database pool. Transactions will fail.', error.message);
}

/**
 * Execute callback within a PostgreSQL transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * 
 * @param {Function} callback - Async function that receives a client
 * @returns {Promise<any>} Result from callback
 * 
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
 *   await client.query('INSERT INTO audit_log (action) VALUES ($1)', ['USER_CREATED']);
 *   return { success: true };
 * });
 */
async function withTransaction(callback) {
  if (!pool) {
    throw new Error('Database pool not available');
  }
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('[TRANSACTION] Started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    console.log('[TRANSACTION] Committed successfully');
    
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[TRANSACTION] Rolled back due to error:', error.message);
    throw error;
    
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction
 * Convenience wrapper for simple transaction cases
 * 
 * @param {Array<{text: string, values: Array}>} queries - Array of query objects
 * @returns {Promise<Array>} Array of query results
 * 
 * @example
 * const results = await executeTransaction([
 *   { text: 'INSERT INTO users (name) VALUES ($1) RETURNING id', values: ['Alice'] },
 *   { text: 'INSERT INTO audit_log (action) VALUES ($1)', values: ['USER_CREATED'] }
 * ]);
 */
async function executeTransaction(queries) {
  return withTransaction(async (client) => {
    const results = [];
    
    for (const query of queries) {
      const result = await client.query(query.text, query.values);
      results.push(result);
    }
    
    return results;
  });
}

/**
 * Lock a file for writing (prevents race conditions on file operations)
 * Uses PostgreSQL advisory locks
 * 
 * @param {Object} client - PostgreSQL client from withTransaction
 * @param {string} lockName - Unique name for the lock
 * @returns {Promise<void>}
 */
async function acquireFileLock(client, lockName) {
  // Convert lockName to a hash for advisory lock
  const lockId = hashStringToInt(lockName);
  const result = await client.query('SELECT pg_try_advisory_xact_lock($1) as acquired', [lockId]);
  
  if (!result.rows[0].acquired) {
    throw new Error(`Failed to acquire lock for: ${lockName}`);
  }
  
  console.log(`[LOCK] Acquired advisory lock for: ${lockName}`);
}

/**
 * Hash string to integer for advisory lock
 * @param {string} str - String to hash
 * @returns {number} Integer hash
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Close the connection pool
 * Call this when shutting down the application
 */
async function closePool() {
  await pool.end();
  console.log('[TRANSACTION] Pool closed');
}

module.exports = {
  withTransaction,
  executeTransaction,
  acquireFileLock,
  closePool,
  pool
};
