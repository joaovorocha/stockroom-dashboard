#!/usr/bin/env node
/**
 * Auth Migration Script
 * Migrates users from data/users.json to PostgreSQL
 * 
 * Run: node scripts/02-migrate-auth.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { getPool, getClient } = require('../utils/dal/pg');

const USERS_JSON_PATH = path.join(__dirname, '../data/users.json');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

async function migrateAuth() {
  console.log('🚀 Starting auth migration...\n');
  
  const pool = getPool();
  const client = await getClient();
  
  try {
    // 1. Create backup directory if needed
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // 2. Load users.json
    console.log('📖 Reading users.json...');
    const usersData = JSON.parse(fs.readFileSync(USERS_JSON_PATH, 'utf8'));
    const users = usersData.users || [];
    console.log(`   Found ${users.length} users\n`);
    
    // 3. Get San Francisco store ID
    const storeResult = await client.query(
      "SELECT id FROM stores WHERE code = 'SF' LIMIT 1"
    );
    
    if (!storeResult.rows.length) {
      throw new Error('San Francisco store not found! Run 01-create-tables.sql first.');
    }
    
    const sfStoreId = storeResult.rows[0].id;
    console.log(`📍 San Francisco store ID: ${sfStoreId}\n`);
    
    // 4. Start transaction
    await client.query('BEGIN');
    console.log('💾 Starting database transaction...\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    // 5. Migrate each user
    for (const user of users) {
      try {
        // Check if user already exists (by email or employee_id)
        const existingUser = await client.query(
          'SELECT id FROM users WHERE email = $1 OR employee_id = $2 LIMIT 1',
          [user.email, user.employeeId]
        );
        
        if (existingUser.rows.length > 0) {
          console.log(`⚠️  Skipping ${user.name} (${user.email}) - already exists`);
          skippedCount++;
          continue;
        }
        
        // Insert user
        await client.query(`
          INSERT INTO users (
            employee_id, login_alias, name, email, phone, password_hash,
            role, store_id, image_url, is_manager, is_admin,
            can_edit_gameplan, can_config_radio, can_manage_lost_punch,
            can_access_admin, must_change_password, last_login, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
        `, [
          user.employeeId || null,
          user.loginAlias || null,
          user.name,
          user.email,
          user.phone || null,
          user.password, // Already hashed
          user.role || 'SA',
          sfStoreId,
          user.imageUrl || null,
          user.isManager || false,
          user.isAdmin || false,
          user.canEditGameplan || false,
          user.canConfigRadio || false,
          user.canManageLostPunch || false,
          user.canAccessAdmin || false,
          user.mustChangePassword || false,
          user.lastLogin ? new Date(user.lastLogin) : null,
          user.createdAt ? new Date(user.createdAt) : new Date(),
          user.updatedAt ? new Date(user.updatedAt) : new Date()
        ]);
        
        console.log(`✅ Migrated: ${user.name} (${user.role})`);
        migratedCount++;
        
      } catch (userErr) {
        console.error(`❌ Error migrating ${user.name}:`, userErr.message);
        throw userErr; // Rollback on any error
      }
    }
    
    // 6. Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!\n');
    
    // 7. Backup old JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `users-${timestamp}.json`);
    fs.copyFileSync(USERS_JSON_PATH, backupPath);
    console.log(`💾 Backup created: ${backupPath}\n`);
    
    // 8. Summary
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} users`);
    console.log(`   ⚠️  Skipped: ${skippedCount} users (already existed)`);
    console.log(`   📁 Total in PostgreSQL: ${migratedCount + skippedCount}`);
    
    // 9. Verify
    const countResult = await client.query('SELECT COUNT(*) FROM users');
    console.log(`   🔍 Database verification: ${countResult.rows[0].count} users\n`);
    
    console.log('✅ Auth migration complete!');
    console.log('');
    console.log('⚠️  IMPORTANT: DO NOT delete users.json yet!');
    console.log('   Test the system first, then rename it:');
    console.log('   mv data/users.json data/users.json.migrated');
    console.log('');
    console.log('Next: Update routes/auth.js to use PostgreSQL');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed! Transaction rolled back.');
    console.error('Error:', err.message);
    console.error('\nStack trace:');
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run migration
migrateAuth().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
