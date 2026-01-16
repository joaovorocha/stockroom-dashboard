#!/usr/bin/env node

/**
 * Run Database Migration
 * Usage: node scripts/run-migration.js <migration-file>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stockroom_dashboard',
  user: process.env.DB_USER || 'stockroom',
  password: process.env.DB_PASSWORD || '',
};

async function runMigration(migrationFile) {
  const pool = new Pool(config);

  try {
    console.log('🔌 Connecting to database...');
    const client = await pool.connect();

    const migrationPath = path.join(__dirname, '..', 'db', 'migrations', migrationFile);
    console.log(`📖 Reading migration: ${migrationPath}`);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔨 Running migration...');
    await client.query(sql);

    console.log('✅ Migration completed successfully');

    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  process.exit(1);
}

runMigration(migrationFile);