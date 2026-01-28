const { query: pgQuery } = require('./utils/dal/pg');
const { saveScanPerformance } = require('./utils/scan-performance-db');

async function reaggregateScanData() {
  try {
    console.log(`\n=== Re-aggregating all scan data ===\n`);
    
    // Get all unique scan dates
    const datesResult = await pgQuery(`
      SELECT DISTINCT scan_date
      FROM daily_scan_results
      WHERE status = 'COMPLETED'
      ORDER BY scan_date DESC
      LIMIT 30
    `);
    
    console.log(`Found ${datesResult.rows.length} dates with scan data\n`);
    
    for (const dateRow of datesResult.rows) {
      const scanDate = dateRow.scan_date.toISOString().split('T')[0];
      
      console.log(`Processing ${scanDate}...`);
      
      // Get all scans for this date
      const scansResult = await pgQuery(`
        SELECT 
          counted_by,
          COUNT(*) as total_scans,
          AVG((counted_units::FLOAT / NULLIF(expected_units, 0)) * 100) as avg_accuracy,
          SUM(missed_units_available + missed_units_reserved) as total_missed,
          SUM(counted_units) as total_counted
        FROM daily_scan_results
        WHERE scan_date = $1 AND status = 'COMPLETED'
        GROUP BY counted_by
        ORDER BY total_scans DESC
      `, [scanDate]);
      
      if (scansResult.rows.length === 0) {
        console.log(`  No scans found, skipping`);
        continue;
      }
      
      // Build employee data
      const employees = scansResult.rows.map(row => ({
        name: row.counted_by,
        accuracy: parseFloat(row.avg_accuracy) || 0,
        countsDone: parseInt(row.total_scans) || 0,
        missedReserved: parseInt(row.total_missed) || 0,
        location: 'San Francisco'
      }));
      
      const scanData = {
        date: scanDate,
        savedAt: new Date().toISOString(),
        source: 'reaggregation-script',
        summary: {
          avgAccuracy: employees.reduce((sum, e) => sum + e.accuracy, 0) / employees.length,
          totalCounts: employees.reduce((sum, e) => sum + e.countsDone, 0)
        },
        employees
      };
      
      // Save using the improved matching logic
      await saveScanPerformance(scanDate, scanData);
      
      console.log(`  ✅ ${employees.length} employees, ${scanData.summary.totalCounts} scans, ${scanData.summary.avgAccuracy.toFixed(2)}% avg accuracy`);
    }
    
    console.log('\n✅ Successfully re-aggregated all scan data');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

reaggregateScanData();
