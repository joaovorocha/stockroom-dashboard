const { query: pgQuery } = require('./utils/dal/pg');

async function cleanJunkData() {
  try {
    console.log('\n=== Cleaning up junk scan data ===\n');
    
    // Delete scan_performance_metrics entries that don't have a valid user_id
    const deleteResult = await pgQuery(`
      DELETE FROM scan_performance_metrics 
      WHERE user_id IS NULL
      RETURNING employee_name, scan_date
    `);
    
    console.log(`✅ Deleted ${deleteResult.rows.length} entries with no user match:`);
    deleteResult.rows.forEach(row => console.log(`  - ${row.employee_name} (${row.scan_date})`));
    
    // Also delete entries for generic emails that shouldn't be counted as employees
    const genericResult = await pgQuery(`
      DELETE FROM scan_performance_metrics spm
      WHERE EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = spm.user_id 
        AND (u.email = 'sanfrancisco@suitsupply.com' OR u.is_active = false)
      )
      RETURNING employee_name, scan_date
    `);
    
    if (genericResult.rows.length > 0) {
      console.log(`\n✅ Deleted ${genericResult.rows.length} generic/inactive user entries:`);
      genericResult.rows.forEach(row => console.log(`  - ${row.employee_name} (${row.scan_date})`));
    }
    
    // Show what's left
    const remainingResult = await pgQuery(`
      SELECT 
        spm.scan_date,
        COUNT(DISTINCT spm.user_id) as employee_count,
        COUNT(*) as total_records,
        STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) as employees
      FROM scan_performance_metrics spm
      INNER JOIN users u ON spm.user_id = u.id
      GROUP BY spm.scan_date
      ORDER BY spm.scan_date DESC
      LIMIT 10
    `);
    
    console.log('\n=== Remaining valid data ===\n');
    remainingResult.rows.forEach(row => {
      console.log(`${row.scan_date}: ${row.employee_count} employees (${row.total_records} records)`);
      console.log(`  Employees: ${row.employees}`);
    });
    
    console.log('\n✅ Cleanup complete! Only valid employees from users table will now display.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanJunkData();
