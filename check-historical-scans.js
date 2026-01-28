const { query: pgQuery } = require('./utils/dal/pg');

async function checkHistoricalScans() {
  try {
    console.log('\n=== Checking Historical Scan Data ===\n');
    
    // Check what dates have scan data
    const datesResult = await pgQuery(`
      SELECT 
        scan_date,
        COUNT(DISTINCT counted_by) as unique_employees,
        COUNT(*) as total_scans,
        AVG((counted_units::FLOAT / NULLIF(expected_units, 0)) * 100) as avg_accuracy
      FROM daily_scan_results
      WHERE status = 'COMPLETED'
      GROUP BY scan_date
      ORDER BY scan_date DESC
      LIMIT 10
    `);
    
    console.log('Recent scan dates:');
    datesResult.rows.forEach(row => {
      console.log(`  ${row.scan_date}: ${row.unique_employees} employees, ${row.total_scans} scans, ${parseFloat(row.avg_accuracy).toFixed(2)}% avg accuracy`);
    });
    
    // Check which dates have been processed into scan_performance_metrics
    const processedResult = await pgQuery(`
      SELECT 
        scan_date,
        COUNT(*) as employee_count,
        AVG(accuracy) as avg_accuracy,
        SUM(counts_done) as total_counts
      FROM scan_performance_metrics
      GROUP BY scan_date
      ORDER BY scan_date DESC
      LIMIT 10
    `);
    
    console.log('\nProcessed into scan_performance_metrics:');
    processedResult.rows.forEach(row => {
      console.log(`  ${row.scan_date}: ${row.employee_count} employees, ${row.total_counts} counts, ${parseFloat(row.avg_accuracy).toFixed(2)}% avg accuracy`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkHistoricalScans();
