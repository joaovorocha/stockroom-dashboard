const { query: pgQuery } = require('./utils/dal/pg');

async function verifyScanData() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`\n=== Verifying scan_performance_metrics for ${today} ===\n`);
    
    const result = await pgQuery(`
      SELECT 
        spm.employee_name,
        spm.user_id,
        spm.counts_done,
        spm.accuracy,
        u.name as user_name,
        u.email as user_email,
        CASE WHEN u.image_url IS NULL THEN 'NO' ELSE 'YES' END as has_image
      FROM scan_performance_metrics spm
      LEFT JOIN users u ON spm.user_id = u.id
      WHERE spm.scan_date = $1
      ORDER BY spm.counts_done DESC
    `, [today]);
    
    console.log(`Found ${result.rows.length} records:\n`);
    result.rows.forEach(row => {
      console.log(`Name: ${row.employee_name}`);
      console.log(`  User ID: ${row.user_id || 'NOT MATCHED'}`);
      console.log(`  User Name: ${row.user_name || 'N/A'}`);
      console.log(`  Email: ${row.user_email || 'N/A'}`);
      console.log(`  Has Image: ${row.has_image}`);
      console.log(`  Counts: ${row.counts_done}, Accuracy: ${parseFloat(row.accuracy).toFixed(2)}%`);
      console.log('');
    });
    
    const withImages = result.rows.filter(r => r.has_image === 'YES').length;
    const withoutImages = result.rows.filter(r => r.has_image === 'NO').length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total records: ${result.rows.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   Without images: ${withoutImages}`);
    console.log(`   Not matched to users: ${result.rows.filter(r => !r.user_id).length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyScanData();
