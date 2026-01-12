#!/usr/bin/env node
/**
 * Test PostgreSQL Auth
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { query } = require('../utils/dal/pg');
const crypto = require('crypto');

// Verify password function (same as auth-pg.js)
function verifyPassword(plain, stored) {
  const password = (plain || '').toString();
  const storedStr = (stored || '').toString();
  if (!storedStr) return false;

  if (storedStr.startsWith('scrypt$')) {
    const parts = storedStr.split('$');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, derived);
  }

  // Legacy plaintext fallback
  return storedStr === password;
}

async function testAuth() {
  try {
    console.log('🔍 Testing PostgreSQL Auth...\n');
    
    // Check users in database
    const usersResult = await query('SELECT employee_id, name, password_hash FROM users ORDER BY employee_id LIMIT 5');
    console.log(`📊 Found ${usersResult.rows.length} users:\n`);
    
    for (const user of usersResult.rows) {
      const pwdType = user.password_hash?.startsWith('scrypt$') ? 'scrypt' : 'plaintext';
      console.log(`   ${user.employee_id}: ${user.name} (${pwdType})`);
      
      // Try password 1234
      const matches = verifyPassword('1234', user.password_hash);
      console.log(`      Password "1234" matches: ${matches}`);
    }
    
    console.log('\n✅ Test complete');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testAuth();
