const { query: pgQuery } = require('./utils/dal/pg');

async function addMissingUser() {
  try {
    console.log('\n=== Adding Victor Rocha to users table ===\n');
    
    // Check if he already exists
    const existing = await pgQuery(
      `SELECT id, email, is_active FROM users WHERE LOWER(email) = 'vrocha@suitsupply.com'`
    );
    
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.is_active) {
        console.log('Victor Rocha exists but is inactive. Activating...');
        await pgQuery(
          `UPDATE users SET is_active = true WHERE id = $1`,
          [user.id]
        );
        console.log('✅ Activated Victor Rocha');
      } else {
        console.log('✅ Victor Rocha already exists and is active (ID:', user.id, ')');
      }
    } else {
      console.log('Adding Victor Rocha as new user...');
      const result = await pgQuery(
        `INSERT INTO users (name, email, role, is_active, employee_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Victor Rocha', 'vrocha@suitsupply.com', 'MANAGEMENT', true, 'VR-001']
      );
      console.log('✅ Added Victor Rocha (ID:', result.rows[0].id, ')');
    }
    
    // Show all active BOH/Management employees
    const allUsers = await pgQuery(`
      SELECT id, name, email, role, employee_id
      FROM users 
      WHERE is_active = true 
      AND role IN ('BOH', 'Sales Associate', 'Manager', 'MANAGEMENT', 'Tailor')
      ORDER BY role, name
    `);
    
    console.log(`\n✅ All active employees (${allUsers.rows.length}):\n`);
    allUsers.rows.forEach(user => {
      console.log(`${user.name} (${user.email})`);
      console.log(`  Role: ${user.role}, ID: ${user.id}, Employee ID: ${user.employee_id || 'N/A'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addMissingUser();
