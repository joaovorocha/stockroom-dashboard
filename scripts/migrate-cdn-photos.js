#!/usr/bin/env node

/**
 * Migrate Employee Photos from CDN to Local Storage
 * 
 * This script:
 * 1. Finds all users with CDN image URLs
 * 2. Downloads photos from cdn.suitsupply.com
 * 3. Saves them to /public/user-uploads/
 * 4. Updates database with local paths
 * 5. Creates backups before changes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { query: pgQuery } = require('../utils/dal/pg');

const UPLOAD_DIR = path.join(__dirname, '../public/user-uploads');
const BACKUP_DIR = path.join(__dirname, '../data/photo-migration-backup');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Download image from URL
 */
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`  Downloading: ${url}`);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        const redirectUrl = response.headers.location;
        console.log(`  Redirect to: ${redirectUrl}`);
        return downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`  ✓ Saved to: ${filepath}`);
        resolve(filepath);
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    });
    
    request.on('error', (err) => {
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Create backup of current state
 */
async function createBackup() {
  console.log('\n📦 Creating backup...');
  
  const result = await pgQuery(
    "SELECT id, name, employee_id, image_url FROM users WHERE image_url IS NOT NULL ORDER BY name"
  );
  
  const backupFile = path.join(BACKUP_DIR, `pre-migration-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(result.rows, null, 2));
  
  console.log(`✓ Backup saved: ${backupFile}`);
  console.log(`  ${result.rows.length} users with images backed up`);
  
  return result.rows;
}

/**
 * Get file extension from URL
 */
function getExtensionFromUrl(url) {
  // Check for .jpg, .jpeg, .png, .webp in URL
  const match = url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  if (match) return match[1].toLowerCase();
  
  // Default to jpg for Suitsupply CDN
  return 'jpg';
}

/**
 * Migrate a single user's photo
 */
async function migrateUserPhoto(user) {
  const { id, name, employee_id, image_url } = user;
  
  // Skip if already local
  if (!image_url || image_url.startsWith('/user-uploads/')) {
    console.log(`  ⏭️  Skipping ${name} - already local`);
    return { success: true, skipped: true };
  }
  
  // Only process CDN URLs
  if (!image_url.startsWith('https://')) {
    console.log(`  ⏭️  Skipping ${name} - not a CDN URL`);
    return { success: true, skipped: true };
  }
  
  try {
    const ext = getExtensionFromUrl(image_url);
    const sanitizedName = (employee_id || id).toString().replace(/[^a-zA-Z0-9]/g, '');
    const filename = `employee-${sanitizedName}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    // Download image
    await downloadImage(image_url, filepath);
    
    // Verify file exists and has size > 0
    const stats = fs.statSync(filepath);
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty');
    }
    
    const localUrl = `/user-uploads/${filename}`;
    
    // Update database
    await pgQuery(
      'UPDATE users SET image_url = $1, updated_at = NOW() WHERE id = $2',
      [localUrl, id]
    );
    
    console.log(`  ✓ Updated database: ${name}`);
    
    return {
      success: true,
      user: name,
      oldUrl: image_url,
      newUrl: localUrl,
      fileSize: stats.size
    };
    
  } catch (error) {
    console.error(`  ✗ Error migrating ${name}:`, error.message);
    return {
      success: false,
      user: name,
      error: error.message
    };
  }
}

/**
 * Main migration process
 */
async function migrate() {
  console.log('🚀 Starting Employee Photo Migration\n');
  console.log('================================\n');
  
  try {
    // Create backup first
    const users = await createBackup();
    
    console.log('\n📥 Starting migration...\n');
    
    const results = {
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      details: []
    };
    
    // Get users with CDN images
    const cdnUsers = users.filter(u => 
      u.image_url && 
      u.image_url.startsWith('https://')
    );
    
    console.log(`Found ${cdnUsers.length} users with CDN images\n`);
    
    for (const user of cdnUsers) {
      results.total++;
      console.log(`\n[${results.total}/${cdnUsers.length}] ${user.name}`);
      
      const result = await migrateUserPhoto(user);
      results.details.push(result);
      
      if (result.skipped) {
        results.skipped++;
      } else if (result.success) {
        results.migrated++;
      } else {
        results.failed++;
      }
      
      // Small delay to avoid overwhelming the CDN
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Save migration report
    const reportFile = path.join(BACKUP_DIR, `migration-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        total: results.total,
        migrated: results.migrated,
        skipped: results.skipped,
        failed: results.failed
      },
      details: results.details
    }, null, 2));
    
    console.log('\n\n================================');
    console.log('✅ Migration Complete!\n');
    console.log(`Total processed: ${results.total}`);
    console.log(`✓ Migrated: ${results.migrated}`);
    console.log(`⏭  Skipped: ${results.skipped}`);
    console.log(`✗ Failed: ${results.failed}`);
    console.log(`\n📄 Report saved: ${reportFile}`);
    
    if (results.failed > 0) {
      console.log('\n⚠️  Some migrations failed. Check the report for details.');
      const failures = results.details.filter(d => !d.success && !d.skipped);
      failures.forEach(f => {
        console.log(`  - ${f.user}: ${f.error}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('\n✨ Done!\n');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { migrate, downloadImage };
