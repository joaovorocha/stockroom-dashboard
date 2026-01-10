#!/usr/bin/env node

/**
 * Employee Sync Script
 * 
 * Syncs employee data from users.json (admin system) to PostgreSQL database.
 * Maps user roles to employee roles and creates employee records.
 * 
 * Usage:
 *   node scripts/sync-employees.js
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pgDal = require('../utils/dal/pg');

// Path to users.json (from DAL)
const USERS_FILE = path.join('/var/lib/stockroom-dashboard/data', 'users.json');

/**
 * Map user data to employee role
 */
function mapUserToEmployee(user) {
  // Determine role based on user properties
  let role = 'SA';  // Default to Style Advisor
  let department = 'Style Advisor';
  let specialty = null;
  
  if (user.isAdmin) {
    role = 'Admin';
    department = 'Management';
  } else if (user.isManager) {
    role = 'Manager';
    department = 'Management';
  } else if (user.department) {
    // Check department for role hints
    const dept = user.department.toLowerCase();
    
    if (dept.includes('tailor') || dept.includes('alteration')) {
      role = 'Tailor';
      department = 'Alterations';
      
      // Determine specialty based on name or other hints
      if (user.name.toLowerCase().includes('suit')) {
        specialty = 'Suits & Jackets';
      } else if (user.name.toLowerCase().includes('custom')) {
        specialty = 'Custom & Complex';
      } else {
        specialty = 'General Alterations';
      }
    } else if (dept.includes('boh') || dept.includes('back of house') || dept.includes('warehouse')) {
      role = 'BOH';
      department = 'Back of House';
    } else if (dept.includes('sa') || dept.includes('style advisor') || dept.includes('sales')) {
      role = 'SA';
      department = 'Style Advisor';
    }
  }
  
  return {
    user_id: user.id,
    email: user.email,
    name: user.name || user.username || user.email.split('@')[0],
    role: role,
    department: department,
    specialty: specialty,
    active: user.active !== false,
    hire_date: user.createdAt ? new Date(user.createdAt) : null,
    phone: user.phone || null
  };
}

async function syncEmployees() {
  try {
    console.log('🔄 Syncing employees from users.json to database...\n');
    
    // Check if users file exists
    if (!fs.existsSync(USERS_FILE)) {
      console.error('❌ Users file not found:', USERS_FILE);
      console.error('   Make sure the stockroom-dashboard is set up correctly.');
      process.exit(1);
    }
    
    // Read users.json
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const users = usersData.users || [];
    
    console.log(`📖 Found ${users.length} users in users.json`);
    
    if (users.length === 0) {
      console.log('⚠️  No users to sync');
      process.exit(0);
    }
    
    // Initialize database connection
    pgDal.initPool();
    
    let synced = 0;
    let failed = 0;
    const errors = [];
    
    // Sync each user
    for (const user of users) {
      try {
        if (!user.email) {
          console.log(`⚠️  Skipping user without email: ${user.name || user.username}`);
          continue;
        }
        
        const employee = mapUserToEmployee(user);
        
        await pgDal.upsertEmployee(employee);
        
        console.log(`✅ ${employee.name} (${employee.role}) - ${employee.email}`);
        synced++;
      } catch (error) {
        console.error(`❌ Failed to sync ${user.email}:`, error.message);
        errors.push({ user: user.email, error: error.message });
        failed++;
      }
    }
    
    console.log('\n📊 Sync Summary:');
    console.log(`   ✅ Synced: ${synced}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️  Errors:');
      errors.forEach(e => {
        console.log(`   - ${e.user}: ${e.error}`);
      });
    }
    
    // Show role distribution
    const roleResult = await pgDal.query(`
      SELECT role, COUNT(*) as count
      FROM employees
      WHERE active = true
      GROUP BY role
      ORDER BY role
    `);
    
    console.log('\n👥 Employee Distribution:');
    roleResult.rows.forEach(row => {
      console.log(`   ${row.role}: ${row.count}`);
    });
    
    console.log('\n✅ Employee sync complete!');
    
  } catch (error) {
    console.error('\n❌ Error syncing employees:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    const pool = pgDal.getPool();
    if (pool) {
      await pool.end();
    }
  }
}

// Run sync
if (require.main === module) {
  syncEmployees()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { syncEmployees, mapUserToEmployee };
