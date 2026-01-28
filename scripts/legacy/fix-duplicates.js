const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

async function checkAndFix() {
  try {
    // Check for Jan 23 duplicates
    const result = await pool.query(`
      SELECT count_id, scan_date, counted_by, expected_units, counted_units, id
      FROM daily_scan_results 
      WHERE scan_date = '2026-01-23' 
      ORDER BY id
    `);
    
    console.log(`Found ${result.rows.length} entries for Jan 23, 2026:`);
    result.rows.forEach(r => {
      console.log(`  ID: ${r.id}, Count ID: ${r.count_id}, ${r.counted_by}: ${r.counted_units}/${r.expected_units}`);
    });
    
    // Find and delete the old duplicate (the one with count_id starting with 06618e8b)
    if (result.rows.length > 1) {
      const toDelete = result.rows.find(r => r.count_id.startsWith('06618e8b-af5b-5003'));
      const toKeep = result.rows.find(r => r.count_id.startsWith('06618efb-5003'));
      
      if (toDelete && toKeep && toDelete.id !== toKeep.id) {
        console.log(`\nDeleting duplicate entry ID ${toDelete.id} (Count ID: ${toDelete.count_id})`);
        await pool.query('DELETE FROM daily_scan_results WHERE id = $1', [toDelete.id]);
        console.log('✅ Deleted duplicate');
      }
    }
    
    // Show final state
    const finalResult = await pool.query(`
      SELECT scan_date, counted_by, expected_units, counted_units 
      FROM daily_scan_results 
      WHERE scan_date >= '2026-01-17' AND status = 'COMPLETED'
      ORDER BY scan_date DESC
    `);
    
    console.log('\n✅ Final state (Jan 17-23):');
    finalResult.rows.forEach(r => {
      console.log(`  ${r.scan_date.toISOString().split('T')[0]} - ${r.counted_by}: ${r.counted_units}/${r.expected_units}`);
    });
    
  } finally {
    await pool.end();
  }
}

checkAndFix().catch(console.error);
