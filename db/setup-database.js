#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * Sets up PostgreSQL database for stockroom-dashboard production system.
 * Run this script once to initialize the database schema.
 * 
 * Usage:
 *   node db/setup-database.js
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
// Override with environment variables:
// - DATABASE_URL for full connection string
// - Or individual: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
const config = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stockroom_dashboard',
  user: process.env.DB_USER || 'stockroom',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

async function setupDatabase() {
  const pool = new Pool(config);
  
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    console.log(`   Database: ${config.database || 'from DATABASE_URL'}`);
    console.log(`   Host: ${config.host || 'from DATABASE_URL'}`);
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`\n📖 Reading schema from: ${schemaPath}`);
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    console.log('🔨 Creating tables...');
    await client.query(schema);
    console.log('✅ Schema created successfully');
    
    // Verify tables were created
    console.log('\n📊 Verifying tables...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`✅ Created ${result.rows.length} tables:`);
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Check views
    const viewsResult = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (viewsResult.rows.length > 0) {
      console.log(`\n✅ Created ${viewsResult.rows.length} views:`);
      viewsResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }
    
    // Display some stats
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM employees) as employees,
        (SELECT COUNT(*) FROM store_zones) as zones,
        (SELECT COUNT(*) FROM pickups) as pickups,
        (SELECT COUNT(*) FROM waitwhile_appointments) as appointments,
        (SELECT COUNT(*) FROM inventory_items) as inventory_items,
        (SELECT COUNT(*) FROM rfid_scans) as rfid_scans
    `);
    
    console.log('\n📈 Initial data counts:');
    console.log(`   Employees: ${stats.rows[0].employees}`);
    console.log(`   Store Zones: ${stats.rows[0].zones}`);
    console.log(`   Pickups: ${stats.rows[0].pickups}`);
    console.log(`   Appointments: ${stats.rows[0].appointments}`);
    console.log(`   Inventory Items: ${stats.rows[0].inventory_items}`);
    console.log(`   RFID Scans: ${stats.rows[0].rfid_scans}`);
    
    client.release();
    
    console.log('\n✅ Database setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run employee sync: node scripts/sync-employees.js');
    console.log('   2. Configure WaitWhile API credentials in .env');
    console.log('   3. Configure Manhattan API credentials in .env');
    console.log('   4. Start sync jobs: node scripts/start-sync-jobs.js');
    console.log('   5. Restart server: pm2 restart stockroom-dashboard');
    
  } catch (error) {
    console.error('\n❌ Error setting up database:');
    console.error(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL connection refused. Make sure:');
      console.error('   1. PostgreSQL is installed and running');
      console.error('   2. Database exists: createdb stockroom_dashboard');
      console.error('   3. User has permissions');
      console.error('   4. Connection details in .env are correct');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist. Create it first:');
      console.error('   createdb stockroom_dashboard');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Check:');
      console.error('   1. Username and password in .env');
      console.error('   2. PostgreSQL pg_hba.conf allows connection');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { setupDatabase };
