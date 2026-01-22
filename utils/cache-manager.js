// Cache Manager - Smart file-based caching for database queries
// Keeps app responsive by serving from files when cache is fresh

const fs = require('fs').promises;
const path = require('path');
const { query: pgQuery } = require('./dal/pg');

class CacheManager {
  constructor() {
    this.cacheDir = path.join(__dirname, '../data/cache');
    this.ensureCacheDir();
  }

  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (err) {
      console.error('[CACHE] Error creating cache directory:', err);
    }
  }

  /**
   * Get cache metadata from database
   */
  async getCacheConfig(cacheKey) {
    try {
      const result = await pgQuery(
        'SELECT * FROM cache_metadata WHERE cache_key = $1 AND is_enabled = true',
        [cacheKey]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('[CACHE] Error getting cache config:', error);
      return null;
    }
  }

  /**
   * Check if cache is stale
   */
  async isCacheStale(cacheKey) {
    try {
      const result = await pgQuery(
        'SELECT is_cache_stale($1) as is_stale',
        [cacheKey]
      );
      return result.rows[0]?.is_stale !== false;
    } catch (error) {
      console.error('[CACHE] Error checking cache staleness:', error);
      return true; // Assume stale on error
    }
  }

  /**
   * Update cache timestamp
   */
  async updateCacheTimestamp(cacheKey) {
    try {
      await pgQuery('SELECT update_cache_timestamp($1)', [cacheKey]);
    } catch (error) {
      console.error('[CACHE] Error updating cache timestamp:', error);
    }
  }

  /**
   * Get data from cache file
   */
  async getFromFile(filePath) {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(__dirname, '..', filePath);
      
      const data = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[CACHE] Error reading cache file:', error);
      }
      return null;
    }
  }

  /**
   * Write data to cache file
   */
  async writeToFile(filePath, data) {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(__dirname, '..', filePath);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write atomically
      const tmpPath = `${fullPath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmpPath, fullPath);
      
      return true;
    } catch (error) {
      console.error('[CACHE] Error writing cache file:', error);
      return false;
    }
  }

  /**
   * Smart get: Check file cache first, then DB if stale
   */
  async get(cacheKey, dbQueryFn) {
    const config = await this.getCacheConfig(cacheKey);
    
    if (!config) {
      // No cache config, go straight to DB
      return await dbQueryFn();
    }

    // Try to get from file first
    const fileData = await this.getFromFile(config.file_path);
    const isStale = await this.isCacheStale(cacheKey);

    if (fileData && !isStale) {
      // Cache hit and fresh!
      console.log(`[CACHE] Hit: ${cacheKey} (from file)`);
      return fileData;
    }

    // Cache miss or stale, get from DB
    console.log(`[CACHE] Miss: ${cacheKey} (fetching from DB)`);
    const dbData = await dbQueryFn();
    
    // Update file cache asynchronously
    this.writeToFile(config.file_path, dbData).then(() => {
      this.updateCacheTimestamp(cacheKey);
    }).catch(err => {
      console.error('[CACHE] Error updating cache:', err);
    });

    return dbData;
  }

  /**
   * Invalidate cache - forces next request to fetch from DB
   */
  async invalidate(cacheKey) {
    try {
      await pgQuery(
        'UPDATE cache_metadata SET last_db_sync = NULL WHERE cache_key = $1',
        [cacheKey]
      );
      console.log(`[CACHE] Invalidated: ${cacheKey}`);
      return true;
    } catch (error) {
      console.error('[CACHE] Error invalidating cache:', error);
      return false;
    }
  }

  /**
   * Set cache data directly
   */
  async set(cacheKey, data) {
    const config = await this.getCacheConfig(cacheKey);
    
    if (!config) {
      console.warn(`[CACHE] No config for key: ${cacheKey}`);
      return false;
    }

    const written = await this.writeToFile(config.file_path, data);
    if (written) {
      await this.updateCacheTimestamp(cacheKey);
    }
    return written;
  }

  /**
   * Clear all cache files
   */
  async clearAll() {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
      await pgQuery('UPDATE cache_metadata SET last_db_sync = NULL');
      console.log('[CACHE] Cleared all cache files');
      return true;
    } catch (error) {
      console.error('[CACHE] Error clearing cache:', error);
      return false;
    }
  }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
