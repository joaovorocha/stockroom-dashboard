const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

async function check() {
  try {
    console.log('=== Checking daily_scan_results ===\n');
    
    // Count
    const count = await pool.query('SELECT COUNT(*) FROM daily_scan_results');
    console.log(`Total rows: ${count.rows[0].count}\n`);
    
    // Date range
    const dateRange = await pool.query(
      'SELECT MIN(scan_date) as earliest, MAX(scan_date) as latest FROM daily_scan_results'
    );
    console.log(`Date range: ${dateRange.rows[0].earliest} to ${dateRange.rows[0].latest}\n`);
    
    // Sample rows
    const samples = await pool.query(
      'SELECT id, scan_date, counted_by, expected_units, counted_units FROM daily_scan_results ORDER BY scan_date DESC LIMIT 5'
    );
    console.log('Recent rows:');
    samples.rows.forEach(r => {
      console.log(`  ${r.scan_date} | ${r.counted_by} | ${r.counted_units}/${r.expected_units}`);
    });
    
    // Test the API query with different day ranges
    console.log('\n=== Testing API query ===\n');
    
    for (const days of [30, 90, 365, 730]) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const dateFilter = startDate.toISOString().split('T')[0];
      
      const result = await pool.query(
        'SELECT COUNT(*) FROM daily_scan_results WHERE scan_date >= $1',
        [dateFilter]
      );
      
      console.log(`${days} days (>= ${dateFilter}): ${result.rows[0].count} rows`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

check();
