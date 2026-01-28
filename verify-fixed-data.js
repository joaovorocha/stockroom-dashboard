const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

async function verify() {
  try {
    console.log('=== DATABASE VERIFICATION ===\n');
    
    // Check recent dates
    const recentResult = await pool.query(`
      SELECT scan_date, counted_by, expected_units, counted_units, status 
      FROM daily_scan_results 
      WHERE scan_date >= '2026-01-17' AND status = 'COMPLETED'
      ORDER BY scan_date DESC
    `);
    
    console.log('Recent scan dates (Jan 17-23):');
    recentResult.rows.forEach(r => {
      const accuracy = r.expected_units > 0 ? ((r.counted_units / r.expected_units) * 100).toFixed(2) : 'N/A';
      console.log(`  ${r.scan_date.toISOString().split('T')[0]} - ${r.counted_by}:`);
      console.log(`    Expected: ${r.expected_units}, Counted: ${r.counted_units}, Accuracy: ${accuracy}%`);
    });
    
    // Check for any invalid data
    console.log('\n=== CHECKING FOR INVALID DATA ===\n');
    
    const invalidEmployees = await pool.query(`
      SELECT DISTINCT dsr.counted_by
      FROM daily_scan_results dsr
      LEFT JOIN users u ON LOWER(dsr.counted_by) = LOWER(u.email)
      WHERE dsr.status = 'COMPLETED' AND u.id IS NULL
    `);
    
    if (invalidEmployees.rows.length > 0) {
      console.log('⚠️  Found scans with invalid employees:');
      invalidEmployees.rows.forEach(r => console.log(`  - ${r.counted_by}`));
    } else {
      console.log('✅ No invalid employees found');
    }
    
    const zeroExpected = await pool.query(`
      SELECT scan_date, counted_by, expected_units, counted_units
      FROM daily_scan_results
      WHERE status = 'COMPLETED' AND expected_units = 0
      ORDER BY scan_date DESC
      LIMIT 5
    `);
    
    if (zeroExpected.rows.length > 0) {
      console.log('\n⚠️  Found COMPLETED scans with 0 expected units:');
      zeroExpected.rows.forEach(r => {
        console.log(`  ${r.scan_date.toISOString().split('T')[0]} - ${r.counted_by}: ${r.counted_units}/${r.expected_units}`);
      });
    } else {
      console.log('\n✅ No COMPLETED scans with 0 expected units');
    }
    
    // Summary stats
    console.log('\n=== SUMMARY STATISTICS ===\n');
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(DISTINCT counted_by) as unique_employees,
        MIN(scan_date) as earliest_date,
        MAX(scan_date) as latest_date,
        AVG(CASE WHEN expected_units > 0 THEN (counted_units::float / expected_units) * 100 ELSE NULL END) as avg_accuracy
      FROM daily_scan_results
      WHERE status = 'COMPLETED'
    `);
    
    const s = stats.rows[0];
    console.log(`Total completed scans: ${s.total_scans}`);
    console.log(`Unique employees: ${s.unique_employees}`);
    console.log(`Date range: ${s.earliest_date.toISOString().split('T')[0]} to ${s.latest_date.toISOString().split('T')[0]}`);
    console.log(`Average accuracy: ${parseFloat(s.avg_accuracy).toFixed(2)}%`);
    
  } finally {
    await pool.end();
  }
}

verify().catch(console.error);
