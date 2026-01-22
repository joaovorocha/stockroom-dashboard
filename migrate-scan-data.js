#!/usr/bin/env node
// Migrate existing scan performance JSON files to database

require('dotenv').config();
const scanPerfDB = require('./utils/scan-performance-db');
const path = require('path');

async function migrate() {
  try {
    const scanHistoryDir = path.join(__dirname, 'data/scan-performance-history');
    
    console.log('🔄 Migrating RFID scan performance files to database...');
    console.log(`📁 Source: ${scanHistoryDir}`);
    
    const success = await scanPerfDB.migrateJsonFiles(scanHistoryDir);
    
    if (success) {
      console.log('✅ All scan performance data migrated to database!');
      console.log('💡 Tip: JSON files are kept as cache for faster access');
      process.exit(0);
    } else {
      console.log('❌ Migration had errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
