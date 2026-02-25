// RFID Scan Performance Database Access Layer
const { query: pgQuery } = require('./dal/pg');
const cacheManager = require('./cache-manager');

/**
 * Save scan performance metrics for a specific date
 */
async function saveScanPerformance(date, data) {
  try {
    // Save daily summary
    await pgQuery(
      `INSERT INTO scan_performance_daily_summary (scan_date, avg_accuracy, total_counts, total_employees, source, saved_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scan_date) 
       DO UPDATE SET 
         avg_accuracy = EXCLUDED.avg_accuracy,
         total_counts = EXCLUDED.total_counts,
         total_employees = EXCLUDED.total_employees,
         source = EXCLUDED.source,
         saved_at = EXCLUDED.saved_at,
         updated_at = NOW()`,
      [
        date,
        data.summary?.avgAccuracy || 0,
        data.summary?.totalCounts || 0,
        data.employees?.length || 0,
        data.source || 'unified-processor',
        data.savedAt || new Date().toISOString()
      ]
    );

    // Save individual employee metrics
    if (data.employees && Array.isArray(data.employees)) {
      for (const emp of data.employees) {
        // Get user_id from employee_id, email, or name matching
        let userId = null;
        let empName = emp.name || '';
        
        // Try to match by employee_id first
        if (emp.employeeId) {
          const userResult = await pgQuery(
            'SELECT id, name FROM users WHERE employee_id = $1 LIMIT 1',
            [emp.employeeId]
          );
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            empName = userResult.rows[0].name; // Use canonical name from users table
          }
        }
        
        // If no match, try email format (e.g., "DIraheta@suitsupply.com")
        if (!userId && empName.includes('@')) {
          const email = empName;
          const userResult = await pgQuery(
            'SELECT id, name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
            [email]
          );
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            empName = userResult.rows[0].name; // Use canonical name
          }
        }
        
        // If still no match, try name normalization (remove spaces, case insensitive)
        if (!userId) {
          const normalizedName = empName.replace(/\s+/g, '').toLowerCase();
          const userResult = await pgQuery(
            `SELECT id, name FROM users 
             WHERE LOWER(REPLACE(name, ' ', '')) = $1 
             OR LOWER(REPLACE(SPLIT_PART(email, '@', 1), '.', '')) = $1
             LIMIT 1`,
            [normalizedName]
          );
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
            empName = userResult.rows[0].name; // Use canonical name
          }
        }
        
        // Fallback to id field if provided
        if (!userId && emp.id && emp.id.startsWith('u:')) {
          userId = parseInt(emp.id.replace('u:', ''));
        }

        // Skip if we still don't have a user_id (can't match to users table)
        if (!userId) {
          console.warn(`[SCAN-PERF-DB] Could not match employee: ${emp.name}`);
          continue;
        }

        await pgQuery(
          `INSERT INTO scan_performance_metrics (
            scan_date, user_id, employee_id, employee_name, location,
            accuracy, missed_reserved, counts_done,
            rank_accuracy, rank_counts, rank_missing, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (scan_date, user_id)
          DO UPDATE SET
            employee_id = EXCLUDED.employee_id,
            employee_name = EXCLUDED.employee_name,
            location = EXCLUDED.location,
            accuracy = EXCLUDED.accuracy,
            missed_reserved = EXCLUDED.missed_reserved,
            counts_done = EXCLUDED.counts_done,
            rank_accuracy = EXCLUDED.rank_accuracy,
            rank_counts = EXCLUDED.rank_counts,
            rank_missing = EXCLUDED.rank_missing,
            source = EXCLUDED.source,
            updated_at = NOW()`,
          [
            date,
            userId,
            emp.employeeId || null,
            empName, // Use canonical name from users table
            emp.location || 'San Francisco',
            emp.accuracy || 0,
            emp.missedReserved || 0,
            emp.countsDone || 0,
            emp.rankAccuracy || null,
            emp.rankCounts || null,
            emp.rankMissing || null,
            data.source || 'unified-processor'
          ]
        );
      }
    }

    // Invalidate cache
    await cacheManager.invalidate('scan_performance_daily');

    return true;
  } catch (error) {
    console.error('[SCAN-PERF-DB] Error saving scan performance:', error);
    throw error;
  }
}

/**
 * Get scan performance for a specific date (with caching)
 */
async function getScanPerformance(date) {
  const cacheKey = `scan_performance_daily`;
  
  return await cacheManager.get(cacheKey, async () => {
    try {
      // Get summary
      const summaryResult = await pgQuery(
        'SELECT * FROM scan_performance_daily_summary WHERE scan_date = $1',
        [date]
      );

      // Get employee metrics - ONLY include employees that matched to users table
      // Filter out junk data and generic emails
      const metricsResult = await pgQuery(
        `SELECT DISTINCT ON (spm.user_id)
           spm.*,
           u.image_url,
           u.access_role,
           u.name as user_name
         FROM scan_performance_metrics spm
         INNER JOIN users u ON spm.user_id = u.id AND u.is_active = true
         WHERE spm.scan_date = $1 AND spm.user_id IS NOT NULL
         ORDER BY spm.user_id, spm.rank_accuracy NULLS LAST`,
        [date]
      );

      if (summaryResult.rows.length === 0) {
        return null;
      }

      const summary = summaryResult.rows[0];
      
      return {
        date,
        savedAt: summary.saved_at,
        source: summary.source,
        summary: {
          avgAccuracy: parseFloat(summary.avg_accuracy),
          totalCounts: summary.total_counts
        },
        employees: metricsResult.rows.map(row => ({
          name: row.user_name, // Use the canonical name from users table
          location: row.location,
          accuracy: parseFloat(row.accuracy),
          missedReserved: row.missed_reserved,
          countsDone: row.counts_done,
          rankAccuracy: row.rank_accuracy,
          rankCounts: row.rank_counts,
          rankMissing: row.rank_missing,
          employeeId: row.employee_id,
          id: row.user_id ? `u:${row.user_id}` : null,
          type: row.role || 'BOH',
          imageUrl: row.image_url
        }))
      };
    } catch (error) {
      console.error('[SCAN-PERF-DB] Error getting scan performance:', error);
      return null;
    }
  });
}

/**
 * Get leaderboard for a date range
 */
async function getLeaderboard(startDate, endDate = null) {
  try {
    const end = endDate || startDate;
    
    const result = await pgQuery(
      `SELECT * FROM scan_performance_leaderboard 
       WHERE scan_date BETWEEN $1 AND $2
       ORDER BY scan_date DESC, overall_rank`,
      [startDate, end]
    );

    return result.rows;
  } catch (error) {
    console.error('[SCAN-PERF-DB] Error getting leaderboard:', error);
    return [];
  }
}

/**
 * Migrate existing JSON files to database
 */
async function migrateJsonFiles(scanHistoryDir) {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const files = await fs.readdir(scanHistoryDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`[SCAN-PERF-DB] Migrating ${jsonFiles.length} files...`);
    
    for (const file of jsonFiles) {
      const filePath = path.join(scanHistoryDir, file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      if (data.date) {
        await saveScanPerformance(data.date, data);
        console.log(`[SCAN-PERF-DB] Migrated ${file}`);
      }
    }
    
    console.log('[SCAN-PERF-DB] Migration complete!');
    return true;
  } catch (error) {
    console.error('[SCAN-PERF-DB] Migration error:', error);
    return false;
  }
}

module.exports = {
  saveScanPerformance,
  getScanPerformance,
  getLeaderboard,
  migrateJsonFiles
};
