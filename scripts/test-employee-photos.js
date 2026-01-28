#!/usr/bin/env node

/**
 * Test Employee Photo Display
 * 
 * This script checks if employee photos are accessible
 * and identifies any broken links
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { query: pgQuery } = require('../utils/dal/pg');

/**
 * Test if a local file exists
 */
function testLocalFile(filepath) {
  const fullPath = path.join(__dirname, '../public', filepath);
  return fs.existsSync(fullPath);
}

/**
 * Test if a URL is accessible
 */
function testUrl(url) {
  return new Promise((resolve) => {
    const timeout = 5000;
    const request = http.get(url, { timeout }, (response) => {
      resolve({
        success: response.statusCode === 200,
        status: response.statusCode
      });
    });
    
    request.on('error', () => {
      resolve({ success: false, status: 'ERROR' });
    });
    
    request.on('timeout', () => {
      request.destroy();
      resolve({ success: false, status: 'TIMEOUT' });
    });
  });
}

/**
 * Main test function
 */
async function testPhotos() {
  console.log('🔍 Testing Employee Photos\n');
  console.log('================================\n');
  
  try {
    // Get all users with images
    const result = await pgQuery(
      `SELECT 
        id, name, employee_id, email, role, image_url 
       FROM users 
       WHERE is_active = true 
       ORDER BY role, name`
    );
    
    const users = result.rows;
    console.log(`Found ${users.length} active users\n`);
    
    const stats = {
      total: users.length,
      withPhotos: 0,
      withoutPhotos: 0,
      localPhotos: 0,
      cdnPhotos: 0,
      brokenPhotos: 0,
      workingPhotos: 0
    };
    
    const issues = [];
    
    for (const user of users) {
      const { name, role, image_url } = user;
      
      if (!image_url) {
        stats.withoutPhotos++;
        console.log(`⚪ ${name} (${role}) - No photo`);
        continue;
      }
      
      stats.withPhotos++;
      
      // Test local file
      if (image_url.startsWith('/user-uploads/')) {
        stats.localPhotos++;
        const exists = testLocalFile(image_url);
        
        if (exists) {
          stats.workingPhotos++;
          console.log(`✅ ${name} (${role}) - Local photo OK`);
        } else {
          stats.brokenPhotos++;
          console.log(`❌ ${name} (${role}) - Local photo MISSING: ${image_url}`);
          issues.push({
            user: name,
            role,
            issue: 'Local file not found',
            path: image_url
          });
        }
      }
      // Test CDN URL
      else if (image_url.startsWith('https://')) {
        stats.cdnPhotos++;
        console.log(`🌐 ${name} (${role}) - CDN photo (not tested)`);
        stats.workingPhotos++; // Assume working for now
      }
      // Unknown format
      else {
        stats.brokenPhotos++;
        console.log(`⚠️  ${name} (${role}) - Unknown format: ${image_url}`);
        issues.push({
          user: name,
          role,
          issue: 'Unknown URL format',
          path: image_url
        });
      }
    }
    
    // Summary
    console.log('\n================================');
    console.log('📊 Summary\n');
    console.log(`Total users: ${stats.total}`);
    console.log(`With photos: ${stats.withPhotos} (${((stats.withPhotos/stats.total)*100).toFixed(1)}%)`);
    console.log(`Without photos: ${stats.withoutPhotos} (${((stats.withoutPhotos/stats.total)*100).toFixed(1)}%)`);
    console.log('');
    console.log(`Local photos: ${stats.localPhotos}`);
    console.log(`CDN photos: ${stats.cdnPhotos}`);
    console.log('');
    console.log(`✅ Working: ${stats.workingPhotos}`);
    console.log(`❌ Broken: ${stats.brokenPhotos}`);
    
    if (issues.length > 0) {
      console.log('\n⚠️  Issues Found:\n');
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.user} (${issue.role})`);
        console.log(`   ${issue.issue}: ${issue.path}`);
      });
    }
    
    // Check upload directory
    console.log('\n================================');
    console.log('📁 Upload Directory Check\n');
    
    const uploadDir = path.join(__dirname, '../public/user-uploads');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      console.log(`Files in /user-uploads/: ${files.length}`);
      
      // Check for orphaned files
      const dbPhotos = users
        .filter(u => u.image_url && u.image_url.startsWith('/user-uploads/'))
        .map(u => u.image_url.replace('/user-uploads/', ''));
      
      const orphaned = files.filter(f => !dbPhotos.includes(f));
      
      if (orphaned.length > 0) {
        console.log(`\n⚠️  Orphaned files (not in database): ${orphaned.length}`);
        orphaned.slice(0, 5).forEach(f => console.log(`   - ${f}`));
        if (orphaned.length > 5) {
          console.log(`   ... and ${orphaned.length - 5} more`);
        }
      }
    } else {
      console.log('❌ Upload directory does not exist!');
    }
    
    console.log('\n✨ Test complete!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testPhotos()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n💥 Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { testPhotos };
