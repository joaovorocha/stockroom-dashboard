const { query } = require('./utils/dal/pg');

async function checkImages() {
  try {
    // Check users with images
    const result = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(image_url) as users_with_images
      FROM users 
      WHERE role IN ('BOH', 'Sales Associate', 'Manager', 'Tailor')
    `);
    
    console.log('User image statistics:');
    console.log(result.rows[0]);
    
    // Check recent scan_performance_metrics
    const scanResult = await query(`
      SELECT 
        spm.employee_name,
        spm.user_id,
        u.image_url,
        u.name as user_name
      FROM scan_performance_metrics spm
      LEFT JOIN users u ON spm.user_id = u.id
      WHERE spm.scan_date = CURRENT_DATE - INTERVAL '1 day'
      ORDER BY spm.counts_done DESC
      LIMIT 10
    `);
    
    console.log('\nRecent scan performance with images:');
    scanResult.rows.forEach(row => {
      console.log(`${row.employee_name} (user_id: ${row.user_id}, image: ${row.image_url ? 'YES' : 'NO'})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkImages();
