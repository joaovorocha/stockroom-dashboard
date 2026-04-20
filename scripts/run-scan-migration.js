#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://suit:suit2024@localhost:5432/stockroom_dashboard'
});

async function runMigration() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'db/migrations/011_add_scan_performance_tracking.sql'),
      'utf8'
    );
    
    console.log('Running scan performance migration...');
    await pool.query(sql);
    console.log('✅ Migration complete!');
    
    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name IN ('scan_performance_metrics', 'cache_metadata')
    `);
    
    console.log('Created tables:', result.rows.map(r => r.table_name).join(', '));
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
