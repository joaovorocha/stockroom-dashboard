#!/usr/bin/env node
/**
 * Time-Off Migration Script
 * Migrates time-off requests from data/time-off.json to PostgreSQL
 * 
 * Run: node scripts/03-migrate-timeoff.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { getPool, getClient } = require('../utils/dal/pg');

const TIMEOFF_JSON_PATH = path.join(__dirname, '../data/time-off.json');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

async function migrateTimeOff() {
  console.log('🚀 Starting time-off migration...\n');
  
  const pool = getPool();
  const client = await getClient();
  
  try {
    // 1. Create backup directory if needed
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // 2. Load time-off.json
    console.log('📖 Reading time-off.json...');
    const timeoffData = JSON.parse(fs.readFileSync(TIMEOFF_JSON_PATH, 'utf8'));
    const entries = timeoffData.entries || [];
    console.log(`   Found ${entries.length} time-off requests\n`);
    
    if (entries.length === 0) {
      console.log('⚠️  No entries to migrate. Exiting.\n');
      process.exit(0);
    }
    
    // 3. Start transaction
    await client.query('BEGIN');
    console.log('💾 Starting database transaction...\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    let userNotFoundCount = 0;
    
    // 4. Migrate each entry
    for (const entry of entries) {
      try {
        // Find user by employee_id
        const userResult = await client.query(
          'SELECT id FROM users WHERE employee_id = $1 AND is_active = true LIMIT 1',
          [entry.employeeId]
        );
        
        if (userResult.rows.length === 0) {
          console.log(`⚠️  User not found for employee ${entry.employeeId} (${entry.employeeName}) - skipping request ${entry.id}`);
          userNotFoundCount++;
          continue;
        }
        
        const userId = userResult.rows[0].id;
        
        // Check if request already exists (by id or duplicate dates for same user)
        const existingRequest = await client.query(
          'SELECT id FROM timeoff_requests WHERE id = $1 OR (user_id = $2 AND start_date = $3 AND end_date = $4) LIMIT 1',
          [entry.id, userId, entry.startDate, entry.endDate]
        );
        
        if (existingRequest.rows.length > 0) {
          console.log(`⚠️  Skipping ${entry.employeeName} (${entry.startDate} to ${entry.endDate}) - already exists`);
          skippedCount++;
          continue;
        }
        
        // Lookup decider user if decidedBy exists
        let decidedByUserId = null;
        if (entry.decidedBy) {
          const deciderResult = await client.query(
            'SELECT id FROM users WHERE employee_id = $1 OR name = $2 LIMIT 1',
            [entry.decidedBy, entry.decidedBy]
          );
          if (deciderResult.rows.length > 0) {
            decidedByUserId = deciderResult.rows[0].id;
          }
        }
        
        // Lookup processor user if processedBy exists
        let processedByUserId = null;
        if (entry.processedBy) {
          const processorResult = await client.query(
            'SELECT id FROM users WHERE employee_id = $1 OR name = $2 LIMIT 1',
            [entry.processedBy, entry.processedBy]
          );
          if (processorResult.rows.length > 0) {
            processedByUserId = processorResult.rows[0].id;
          }
        }
        
        // Map status to our enum (pending, approved, denied, cancelled)
        let status = 'approved'; // Default to approved since legacy data is "published"
        if (entry.status === 'denied') status = 'denied';
        if (entry.status === 'cancelled') status = 'cancelled';
        if (entry.status === 'pending') status = 'pending';
        
        // Insert time-off request
        await client.query(`
          INSERT INTO timeoff_requests (
            id, user_id, start_date, end_date, reason, notes, status,
            submitted_at, decided_at, decided_by_user_id,
            workday_status, processed_at, processed_by_user_id,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
        `, [
          entry.id,
          userId,
          entry.startDate || null,
          entry.endDate || null,
          entry.reason || 'vacation',
          entry.notes || '',
          status,
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          entry.decidedAt ? new Date(entry.decidedAt) : null,
          decidedByUserId,
          entry.workdayStatus || null,
          entry.processedAt ? new Date(entry.processedAt) : null,
          processedByUserId,
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          entry.submittedAt ? new Date(entry.submittedAt) : new Date()
        ]);
        
        console.log(`✅ Migrated: ${entry.employeeName} - ${entry.startDate} to ${entry.endDate} (${entry.reason})`);
        migratedCount++;
        
      } catch (entryErr) {
        console.error(`❌ Error migrating request ${entry.id}:`, entryErr.message);
        throw entryErr; // Rollback on any error
      }
    }
    
    // 5. Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!\n');
    
    // 6. Backup old JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `time-off-${timestamp}.json`);
    fs.copyFileSync(TIMEOFF_JSON_PATH, backupPath);
    console.log(`💾 Backup created: ${backupPath}\n`);
    
    // 7. Verification
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM timeoff_requests');
    const dbCount = parseInt(verifyResult.rows[0].count);
    
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} requests`);
    console.log(`   ⚠️  Skipped: ${skippedCount} requests (already existed)`);
    console.log(`   ⚠️  User not found: ${userNotFoundCount} requests`);
    console.log(`   📁 Total in PostgreSQL: ${dbCount}`);
    console.log(`   🔍 Database verification: ${dbCount} requests\n`);
    
    console.log('✅ Time-off migration complete!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    try {
      await client.query('ROLLBACK');
      console.log('🔄 Transaction rolled back\n');
    } catch (rollbackErr) {
      console.error('❌ Rollback failed:', rollbackErr);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateTimeOff();
