#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query } = require('../utils/dal/pg');

async function checkData() {
  try {
    // Check sessions
    const sessions = await query(`
      SELECT s.id, u.name, s.created_at, s.expires_at 
      FROM user_sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC 
      LIMIT 5
    `);
    
    console.log(`\n📊 Active Sessions: ${sessions.rows.length}`);
    sessions.rows.forEach(s => {
      console.log(`   ${s.name} - Created: ${s.created_at}`);
    });
    
    // Check audit logs
    const audits = await query(`
      SELECT a.action, u.name, a.created_at 
      FROM user_audit_log a 
      JOIN users u ON a.user_id = u.id 
      ORDER BY a.created_at DESC 
      LIMIT 10
    `);
    
    console.log(`\n📝 Recent Audit Logs: ${audits.rows.length}`);
    audits.rows.forEach(a => {
      console.log(`   ${a.name}: ${a.action} at ${a.created_at}`);
    });
    
    console.log('\n✅ Done\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkData();
