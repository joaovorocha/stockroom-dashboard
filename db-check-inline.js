const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

async function check() {
  const result = await pool.query('SELECT COUNT(*), MIN(scan_date), MAX(scan_date) FROM daily_scan_results');
  const row = result.rows[0];
  console.log(JSON.stringify(row));
  await pool.end();
}

check().catch(e => { console.error(e.message); process.exit(1); });
