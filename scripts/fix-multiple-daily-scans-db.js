#!/usr/bin/env node
/**
 * Fix multiple daily scan assignments in database
 * Ensures only ONE employee per date has an active daily scan assignment
 */

require('dotenv').config();
const { Pool } = require('pg');

const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stockroom_dashboard',
  user: process.env.DB_USER || 'stockroom',
  password: process.env.DB_PASSWORD || '',
};

const pool = new Pool(config);

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('Checking for multiple daily scan assignments per date...\n');

    // Find dates with multiple active assignments
    const result = await client.query(`
      SELECT date, COUNT(*) as count
      FROM daily_scan_assignments
      WHERE active = true
      GROUP BY date
      HAVING COUNT(*) > 1
      ORDER BY date DESC
    `);

    if (result.rows.length === 0) {
      console.log('✓ No issues found - all dates have at most one assignment');
      return;
    }

    console.log(`Found ${result.rows.length} dates with multiple assignments:\n`);

    for (const row of result.rows) {
      console.log(`Date: ${row.date} - ${row.count} assignments`);
      
      // Get all assignments for this date
      const assignments = await client.query(`
        SELECT employee_id, assigned_at
        FROM daily_scan_assignments
        WHERE date = $1 AND active = true
        ORDER BY assigned_at ASC
      `, [row.date]);

      // Keep the first one (earliest assigned_at)
      const keepId = assignments.rows[0].employee_id;
      console.log(`  Keeping: ${keepId} (assigned at ${assignments.rows[0].assigned_at})`);

      // Deactivate all others
      for (let i = 1; i < assignments.rows.length; i++) {
        const empId = assignments.rows[i].employee_id;
        console.log(`  Removing: ${empId}`);
        
        await client.query(`
          UPDATE daily_scan_assignments
          SET active = false
          WHERE date = $1 AND employee_id = $2
        `, [row.date, empId]);
      }
      console.log('');
    }

    console.log(`\n✓ Fixed ${result.rows.length} dates`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
