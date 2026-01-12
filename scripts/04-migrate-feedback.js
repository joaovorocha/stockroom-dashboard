#!/usr/bin/env node
/**
 * Feedback Migration Script
 * Migrates feedback from data/feedback.json to PostgreSQL
 * 
 * Run: node scripts/04-migrate-feedback.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { getPool, getClient } = require('../utils/dal/pg');
const dal = require('../utils/dal');

const FEEDBACK_JSON_PATH = dal.paths.feedbackFile;
const BACKUP_DIR = path.join(__dirname, '../data/backups');

async function migrateFeedback() {
  console.log('🚀 Starting feedback migration...\n');
  
  const pool = getPool();
  const client = await getClient();
  
  try {
    // 1. Create backup directory if needed
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // 2. Load feedback.json
    console.log('📖 Reading feedback.json...');
    let feedbackData = [];
    
    if (fs.existsSync(FEEDBACK_JSON_PATH)) {
      const content = fs.readFileSync(FEEDBACK_JSON_PATH, 'utf8');
      const parsed = JSON.parse(content);
      feedbackData = Array.isArray(parsed) ? parsed : [];
    } else {
      console.log('   ⚠️  No feedback.json file found. Creating empty structure.\n');
      feedbackData = [];
    }
    
    console.log(`   Found ${feedbackData.length} feedback entries\n`);
    
    if (feedbackData.length === 0) {
      console.log('✅ No feedback to migrate. Migration complete!\n');
      process.exit(0);
    }
    
    // 3. Start transaction
    await client.query('BEGIN');
    console.log('💾 Starting database transaction...\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    let userNotFoundCount = 0;
    
    // 4. Migrate each feedback entry
    for (const entry of feedbackData) {
      try {
        // Find user by employee_id (optional, feedback can be anonymous)
        let userId = null;
        if (entry.employeeId) {
          const userResult = await client.query(
            'SELECT id FROM users WHERE employee_id = $1 AND is_active = true LIMIT 1',
            [entry.employeeId]
          );
          
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
          } else {
            console.log(`⚠️  User not found for employee ${entry.employeeId} - feedback will be anonymous`);
            userNotFoundCount++;
          }
        }
        
        // Check if feedback already exists
        const existingFeedback = await client.query(
          'SELECT id FROM feedback WHERE id = $1 LIMIT 1',
          [entry.id]
        );
        
        if (existingFeedback.rows.length > 0) {
          console.log(`⚠️  Skipping feedback ${entry.id} - already exists`);
          skippedCount++;
          continue;
        }
        
        // Insert feedback
        await client.query(`
          INSERT INTO feedback (
            id, user_id, employee_name, employee_id, category, 
            text, images, status, submitted_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
          )
        `, [
          entry.id,
          userId,
          entry.employeeName || 'Anonymous',
          entry.employeeId || null,
          entry.category || 'general',
          entry.text || '',
          JSON.stringify(entry.images || []),
          entry.status || 'new',
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
          entry.submittedAt ? new Date(entry.submittedAt) : new Date()
        ]);
        
        console.log(`✅ Migrated: ${entry.employeeName} - ${entry.category} (${entry.status})`);
        migratedCount++;
        
      } catch (entryErr) {
        console.error(`❌ Error migrating feedback ${entry.id}:`, entryErr.message);
        throw entryErr; // Rollback on any error
      }
    }
    
    // 5. Commit transaction
    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!\n');
    
    // 6. Backup old JSON file if it exists
    if (fs.existsSync(FEEDBACK_JSON_PATH)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `feedback-${timestamp}.json`);
      fs.copyFileSync(FEEDBACK_JSON_PATH, backupPath);
      console.log(`💾 Backup created: ${backupPath}\n`);
    }
    
    // 7. Verification
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM feedback');
    const dbCount = parseInt(verifyResult.rows[0].count);
    
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} entries`);
    console.log(`   ⚠️  Skipped: ${skippedCount} entries (already existed)`);
    console.log(`   ⚠️  User not found: ${userNotFoundCount} entries (feedback anonymous)`);
    console.log(`   📁 Total in PostgreSQL: ${dbCount}`);
    console.log(`   🔍 Database verification: ${dbCount} entries\n`);
    
    console.log('✅ Feedback migration complete!\n');
    
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

migrateFeedback();
