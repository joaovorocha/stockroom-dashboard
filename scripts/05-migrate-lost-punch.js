#!/usr/bin/env node
/**
 * Lost Punch Migration Script
 * Migrates lost punch requests from data/lost-punch-log.json to PostgreSQL
 * 
 * Run: node scripts/05-migrate-lost-punch.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { getPool, getClient } = require('../utils/dal/pg');
const dal = require('../utils/dal');

const LOST_PUNCH_JSON_PATH = path.join(__dirname, '../data/lost-punch-log.json');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

async function migrateLostPunch() {
  console.log('🚀 Starting lost-punch migration...\n');
  
  const pool = getPool();
  const client = await getClient();
  
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    console.log('📖 Reading lost-punch-log.json...');
    let entries = [];
    
    if (fs.existsSync(LOST_PUNCH_JSON_PATH)) {
      const content = fs.readFileSync(LOST_PUNCH_JSON_PATH, 'utf8');
      const parsed = JSON.parse(content);
      entries = Array.isArray(parsed) ? parsed : [];
    } else {
      console.log('   ⚠️  No lost-punch-log.json file found.\n');
    }
    
    console.log(`   Found ${entries.length} lost punch requests\n`);
    
    if (entries.length === 0) {
      console.log('✅ No lost punch data to migrate. Migration complete!\n');
      process.exit(0);
    }
    
    await client.query('BEGIN');
    console.log('💾 Starting database transaction...\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const entry of entries) {
      try {
        // Find user
        let userId = null;
        if (entry.employeeId) {
          const userResult = await client.query(
            'SELECT id FROM users WHERE employee_id = $1 AND is_active = true LIMIT 1',
            [entry.employeeId]
          );
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
          }
        }
        
        // Check existing
        const existing = await client.query(
          'SELECT id FROM lost_punch_requests WHERE id = $1 LIMIT 1',
          [entry.id]
        );
        
        if (existing.rows.length > 0) {
          console.log(`⚠️  Skipping ${entry.id} - already exists`);
          skippedCount++;
          continue;
        }
        
        // Get reviewer/completer user IDs
        let reviewedByUserId = null;
        let completedByUserId = null;
        
        if (entry.reviewedBy) {
          const reviewer = await client.query(
            'SELECT id FROM users WHERE name = $1 OR employee_id = $2 LIMIT 1',
            [entry.reviewedBy, entry.reviewedBy]
          );
          if (reviewer.rows.length > 0) reviewedByUserId = reviewer.rows[0].id;
        }
        
        if (entry.completedBy) {
          const completer = await client.query(
            'SELECT id FROM users WHERE name = $1 OR employee_id = $2 LIMIT 1',
            [entry.completedBy, entry.completedBy]
          );
          if (completer.rows.length > 0) completedByUserId = completer.rows[0].id;
        }
        
        await client.query(`
          INSERT INTO lost_punch_requests (
            id, user_id, employee_name, employee_id,
            missed_date, clock_in_time, lunch_out_time, lunch_in_time, clock_out_time,
            missed_time, punch_type, reason, status,
            submitted_at, reviewed_by_user_id, reviewed_at,
            completed_by_user_id, completed_at,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
        `, [
          entry.id,
          userId,
          entry.employeeName || '',
          entry.employeeId || null,
          entry.missedDate || null,
          entry.clockInTime || null,
          entry.lunchOutTime || null,
          entry.lunchInTime || null,
          entry.clockOutTime || null,
          entry.missedTime || null,
          entry.punchType || null,
          entry.reason || '',
          entry.status || 'pending',
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          reviewedByUserId,
          entry.reviewedAt ? new Date(entry.reviewedAt) : null,
          completedByUserId,
          entry.completedAt ? new Date(entry.completedAt) : null,
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          entry.completedAt ? new Date(entry.completedAt) : new Date()
        ]);
        
        console.log(`✅ Migrated: ${entry.employeeName} - ${entry.missedDate} (${entry.status})`);
        migratedCount++;
        
      } catch (entryErr) {
        console.error(`❌ Error migrating ${entry.id}:`, entryErr.message);
        throw entryErr;
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!\n');
    
    if (fs.existsSync(LOST_PUNCH_JSON_PATH)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `lost-punch-log-${timestamp}.json`);
      fs.copyFileSync(LOST_PUNCH_JSON_PATH, backupPath);
      console.log(`💾 Backup created: ${backupPath}\n`);
    }
    
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM lost_punch_requests');
    const dbCount = parseInt(verifyResult.rows[0].count);
    
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} requests`);
    console.log(`   ⚠️  Skipped: ${skippedCount} requests`);
    console.log(`   📁 Total in PostgreSQL: ${dbCount}\n`);
    
    console.log('✅ Lost punch migration complete!\n');
    
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

migrateLostPunch();
