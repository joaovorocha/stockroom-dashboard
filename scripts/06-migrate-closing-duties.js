require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrateClosingDuties() {
  console.log('🚀 Starting closing-duties migration...\n');

  // Read closing-duties-log.json
  const closingDutiesPath = path.join(__dirname, '../data/closing-duties-log.json');
  
  if (!fs.existsSync(closingDutiesPath)) {
    console.log('⚠️  No closing-duties-log.json file found');
    console.log('✅ Migration complete (no data to migrate)');
    process.exit(0);
  }

  console.log('📖 Reading closing-duties-log.json...');
  const closingDutiesData = JSON.parse(fs.readFileSync(closingDutiesPath, 'utf8'));
  console.log(`   Found ${closingDutiesData.length} closing duty submissions\n`);

  const client = await pool.connect();
  
  try {
    console.log('💾 Starting database transaction...\n');
    await client.query('BEGIN');

    let migratedCount = 0;
    let skippedCount = 0;

    for (const duty of closingDutiesData) {
      try {
        // Find user by userId (which is like "user-001")
        let userId = null;
        
        if (duty.userId) {
          // Extract numeric part from userId (e.g., "user-001" -> 1)
          const userIdNum = parseInt(duty.userId.replace('user-', ''));
          const userResult = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [userIdNum]
          );
          
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
          }
        }

        // If we still don't have a user_id, try to find by name
        if (!userId && duty.userName) {
          const userResult = await client.query(
            'SELECT id FROM users WHERE name ILIKE $1 LIMIT 1',
            [duty.userName]
          );
          
          if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
          }
        }

        // Insert closing duty
        await client.query(
          `INSERT INTO closing_duties 
           (id, user_id, user_name, date, submitted_at, notes, photo_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            duty.id,
            userId,
            duty.userName,
            duty.date,
            duty.submittedAt,
            duty.notes || '',
            duty.photoCount || 0,
            duty.submittedAt || new Date().toISOString(),
            duty.submittedAt || new Date().toISOString()
          ]
        );

        // Insert photos if they exist
        if (duty.photos && Array.isArray(duty.photos)) {
          for (const photo of duty.photos) {
            await client.query(
              `INSERT INTO closing_duty_photos 
               (duty_id, filename, path, size, uploaded_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                duty.id,
                photo.filename,
                photo.path,
                photo.size || 0,
                photo.uploadedAt || duty.submittedAt
              ]
            );
          }
        }

        console.log(`✅ Migrated: ${duty.userName} - ${duty.date} (${duty.photoCount || 0} photos)`);
        migratedCount++;

      } catch (err) {
        console.error(`❌ Error migrating ${duty.id}:`, err.message);
        skippedCount++;
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Transaction committed successfully!\n');

    // Create backup
    const backupDir = path.join(__dirname, '../data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `closing-duties-log-${timestamp}.json`);
    fs.copyFileSync(closingDutiesPath, backupPath);
    console.log(`💾 Backup created: ${backupPath}\n`);

    // Get final count
    const result = await pool.query('SELECT COUNT(*) as count FROM closing_duties');
    const totalCount = parseInt(result.rows[0].count);

    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} submissions`);
    console.log(`   ⚠️  Skipped: ${skippedCount} submissions`);
    console.log(`   📁 Total in PostgreSQL: ${totalCount}\n`);
    console.log('✅ Closing duties migration complete!\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateClosingDuties().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
