const { query: pgQuery } = require('./utils/dal/pg');

async function test() {
  console.log('Testing users query...');
  
  try {
    const result = await pgQuery(`
      SELECT id, employee_id, name, email, image_url, role
      FROM users
      WHERE is_active = true
      LIMIT 3
    `);
    
    console.log('Query result:');
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
  
  process.exit(0);
}

test();
