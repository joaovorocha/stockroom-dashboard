const { query: pgQuery } = require('./utils/dal/pg');

async function analyzeAndClean() {
  try {
    console.log('\n=== STEP 1: Analyzing Database ===\n');
    
    // Check daily_scan_results for invalid employees
    const invalidScansResult = await pgQuery(`
      SELECT 
        dsr.counted_by,
        COUNT(*) as scan_count,
        MIN(dsr.scan_date) as first_scan,
        MAX(dsr.scan_date) as last_scan
      FROM daily_scan_results dsr
      LEFT JOIN users u ON LOWER(dsr.counted_by) = LOWER(u.email)
      WHERE u.id IS NULL
      GROUP BY dsr.counted_by
      ORDER BY scan_count DESC
    `);
    
    if (invalidScansResult.rows.length > 0) {
      console.log(`❌ Found ${invalidScansResult.rows.length} invalid employees in daily_scan_results:`);
      invalidScansResult.rows.forEach(row => {
        console.log(`  - ${row.counted_by}: ${row.scan_count} scans (${row.first_scan} to ${row.last_scan})`);
      });
    } else {
      console.log('✅ No invalid employees in daily_scan_results');
    }
    
    // Check scan_performance_metrics for invalid entries
    const invalidMetricsResult = await pgQuery(`
      SELECT 
        spm.employee_name,
        spm.scan_date,
        spm.user_id
      FROM scan_performance_metrics spm
      WHERE spm.user_id IS NULL
      ORDER BY spm.scan_date DESC
    `);
    
    if (invalidMetricsResult.rows.length > 0) {
      console.log(`\n❌ Found ${invalidMetricsResult.rows.length} invalid entries in scan_performance_metrics:`);
      invalidMetricsResult.rows.forEach(row => {
        console.log(`  - ${row.employee_name} on ${row.scan_date}`);
      });
    } else {
      console.log('\n✅ No invalid entries in scan_performance_metrics');
    }
    
    console.log('\n=== STEP 2: Cleaning Database ===\n');
    
    // Delete invalid scans from daily_scan_results
    const deletedScansResult = await pgQuery(`
      DELETE FROM daily_scan_results dsr
      WHERE NOT EXISTS (
        SELECT 1 FROM users u 
        WHERE LOWER(dsr.counted_by) = LOWER(u.email) 
        AND u.is_active = true
      )
      RETURNING counted_by, scan_date
    `);
    
    if (deletedScansResult.rows.length > 0) {
      console.log(`✅ Deleted ${deletedScansResult.rows.length} invalid scans from daily_scan_results`);
      // Group by counted_by
      const byEmployee = {};
      deletedScansResult.rows.forEach(row => {
        if (!byEmployee[row.counted_by]) byEmployee[row.counted_by] = 0;
        byEmployee[row.counted_by]++;
      });
      Object.entries(byEmployee).forEach(([name, count]) => {
        console.log(`  - ${name}: ${count} scans`);
      });
    } else {
      console.log('✅ No invalid scans to delete from daily_scan_results');
    }
    
    // Delete invalid entries from scan_performance_metrics
    const deletedMetricsResult = await pgQuery(`
      DELETE FROM scan_performance_metrics
      WHERE user_id IS NULL
      OR user_id NOT IN (SELECT id FROM users WHERE is_active = true)
      RETURNING employee_name, scan_date
    `);
    
    if (deletedMetricsResult.rows.length > 0) {
      console.log(`\n✅ Deleted ${deletedMetricsResult.rows.length} invalid entries from scan_performance_metrics`);
    } else {
      console.log('\n✅ No invalid entries to delete from scan_performance_metrics');
    }
    
    console.log('\n=== STEP 3: Current Database Status ===\n');
    
    // Show valid employees with scans
    const validEmployeesResult = await pgQuery(`
      SELECT 
        u.name,
        u.email,
        u.role,
        COUNT(DISTINCT dsr.scan_date) as days_scanned,
        COUNT(dsr.count_id) as total_scans,
        MIN(dsr.scan_date) as first_scan,
        MAX(dsr.scan_date) as last_scan
      FROM users u
      LEFT JOIN daily_scan_results dsr ON LOWER(u.email) = LOWER(dsr.counted_by)
      WHERE u.is_active = true AND u.role IN ('BOH', 'Sales Associate', 'Manager', 'Tailor')
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY total_scans DESC
    `);
    
    console.log(`Valid employees (${validEmployeesResult.rows.length}):\n`);
    validEmployeesResult.rows.forEach(row => {
      if (row.total_scans > 0) {
        console.log(`✅ ${row.name} (${row.email})`);
        console.log(`   Role: ${row.role}`);
        console.log(`   Total scans: ${row.total_scans} across ${row.days_scanned} days`);
        console.log(`   Date range: ${row.first_scan} to ${row.last_scan}`);
      } else {
        console.log(`⚪ ${row.name} (${row.email}) - No scans yet`);
      }
    });
    
    // Show date coverage
    const dateRangeResult = await pgQuery(`
      SELECT 
        scan_date,
        COUNT(DISTINCT counted_by) as employees,
        COUNT(*) as scans
      FROM daily_scan_results
      WHERE EXISTS (
        SELECT 1 FROM users u 
        WHERE LOWER(counted_by) = LOWER(u.email) 
        AND u.is_active = true
      )
      GROUP BY scan_date
      ORDER BY scan_date DESC
      LIMIT 10
    `);
    
    console.log(`\n\nRecent scan dates (last 10):\n`);
    dateRangeResult.rows.forEach(row => {
      console.log(`${row.scan_date}: ${row.employees} employees, ${row.scans} scans`);
    });
    
    console.log('\n✅ Database analysis and cleanup complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeAndClean();
