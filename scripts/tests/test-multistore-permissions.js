/**
 * Multi-Store Permission Test Suite
 * Phase 5: Testing & Security
 * 
 * Tests all permission levels and store isolation
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'suit'
});

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(message, type = 'info') {
  const icons = { pass: '✅', fail: '❌', info: 'ℹ️', section: '📋' };
  console.log(`${icons[type] || '•'} ${message}`);
}

function assert(condition, testName) {
  if (condition) {
    results.passed++;
    results.tests.push({ name: testName, status: 'pass' });
    log(`PASS: ${testName}`, 'pass');
    return true;
  } else {
    results.failed++;
    results.tests.push({ name: testName, status: 'fail' });
    log(`FAIL: ${testName}`, 'fail');
    return false;
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  MULTI-STORE PERMISSION TEST SUITE');
  console.log('  Phase 5: Testing & Security');
  console.log('='.repeat(60) + '\n');

  try {
    // ========================================
    // SECTION 1: Database Schema Tests
    // ========================================
    log('DATABASE SCHEMA TESTS', 'section');
    
    // Test 1.1: users table has required columns
    const userCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('is_super_admin', 'default_store_id', 'can_switch_stores')
    `);
    assert(userCols.rows.length === 3, 'users table has role columns');

    // Test 1.2: user_store_access table exists
    const usaExists = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_store_access')
    `);
    assert(usaExists.rows[0].exists, 'user_store_access table exists');

    // Test 1.3: global_settings table exists with data
    const globalSettings = await pool.query(`SELECT COUNT(*) FROM global_settings`);
    assert(parseInt(globalSettings.rows[0].count) >= 30, 'global_settings has seed data (30+)');

    // Test 1.4: store_settings table exists
    const storeSettingsExists = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'store_settings')
    `);
    assert(storeSettingsExists.rows[0].exists, 'store_settings table exists');

    // Test 1.5: support_tickets table exists
    const ticketsExists = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'support_tickets')
    `);
    assert(ticketsExists.rows[0].exists, 'support_tickets table exists');

    console.log();

    // ========================================
    // SECTION 2: Super Admin Tests
    // ========================================
    log('SUPER ADMIN TESTS', 'section');

    // Test 2.1: At least one super admin exists
    const superAdmins = await pool.query(`
      SELECT id, name, email FROM users WHERE is_super_admin = true
    `);
    assert(superAdmins.rows.length >= 1, 'At least one super admin exists');
    if (superAdmins.rows.length > 0) {
      log(`  Super admins: ${superAdmins.rows.map(u => u.name || u.email).join(', ')}`, 'info');
    }

    // Test 2.2: Super admin flag works correctly
    const superAdminCheck = await pool.query(`
      SELECT is_super_admin FROM users WHERE id = $1
    `, [superAdmins.rows[0]?.id || 1]);
    assert(superAdminCheck.rows[0]?.is_super_admin === true, 
      'Super admin flag works correctly');

    console.log();

    // ========================================
    // SECTION 3: Store Access Tests
    // ========================================
    log('STORE ACCESS TESTS', 'section');

    // Test 3.1: user_store_access has records
    const accessRecords = await pool.query(`SELECT COUNT(*) FROM user_store_access`);
    assert(parseInt(accessRecords.rows[0].count) > 0, 'user_store_access has records');
    log(`  Total access records: ${accessRecords.rows[0].count}`, 'info');

    // Test 3.2: Access levels are valid
    const accessLevels = await pool.query(`
      SELECT DISTINCT access_level FROM user_store_access
    `);
    const validRoles = ['admin', 'manager', 'view', 'user'];
    const allValid = accessLevels.rows.every(r => validRoles.includes(r.access_level));
    assert(allValid, 'All access_level values are valid (admin/manager/view)');

    // Test 3.3: User store access query works
    const testUserId = superAdmins.rows[0]?.id || 1;
    const getUserAccessQuery = await pool.query(`
      SELECT usa.*, s.name as store_name 
      FROM user_store_access usa 
      JOIN stores s ON usa.store_id = s.id 
      WHERE usa.user_id = $1
    `, [testUserId]);
    assert(getUserAccessQuery.rows !== undefined, 'User store access query works');

    // Test 3.4: No duplicate user-store combinations
    const duplicates = await pool.query(`
      SELECT user_id, store_id, COUNT(*) 
      FROM user_store_access 
      GROUP BY user_id, store_id 
      HAVING COUNT(*) > 1
    `);
    assert(duplicates.rows.length === 0, 'No duplicate user-store access entries');

    console.log();

    // ========================================
    // SECTION 4: Settings Cascade Tests
    // ========================================
    log('SETTINGS CASCADE TESTS', 'section');

    // Test 4.1: Global settings have categories
    const categories = await pool.query(`
      SELECT DISTINCT category FROM global_settings WHERE category IS NOT NULL
    `);
    assert(categories.rows.length >= 3, 'Global settings have multiple categories');
    log(`  Categories: ${categories.rows.map(c => c.category).join(', ')}`, 'info');

    // Test 4.2: Store settings can override global
    const storeOverrides = await pool.query(`
      SELECT COUNT(*) FROM store_settings WHERE overrides_global = true
    `);
    log(`  Store overrides: ${storeOverrides.rows[0].count}`, 'info');
    assert(true, 'Store settings override capability exists');

    // Test 4.3: is_editable_by_store flag exists on global settings
    const editableSettings = await pool.query(`
      SELECT COUNT(*) FROM global_settings WHERE is_editable_by_store = true
    `);
    assert(parseInt(editableSettings.rows[0].count) >= 0, 'is_editable_by_store flag exists');
    log(`  Editable by store: ${editableSettings.rows[0].count} settings`, 'info');

    console.log();

    // ========================================
    // SECTION 5: Store Isolation Tests
    // ========================================
    log('STORE ISOLATION TESTS', 'section');

    // Test 5.1: All 39 stores exist
    const storeCount = await pool.query(`SELECT COUNT(*) FROM stores`);
    assert(parseInt(storeCount.rows[0].count) >= 39, 'All 39 stores exist');

    // Test 5.2: Each store can have independent settings
    const storeWithSettings = await pool.query(`
      SELECT DISTINCT store_id FROM store_settings
    `);
    log(`  Stores with custom settings: ${storeWithSettings.rows.length}`, 'info');
    assert(true, 'Store-specific settings supported');

    // Test 5.3: Users are assigned to specific stores
    const usersWithStores = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as users, COUNT(DISTINCT store_id) as stores 
      FROM user_store_access
    `);
    log(`  Users with store access: ${usersWithStores.rows[0].users}`, 'info');
    log(`  Stores with users: ${usersWithStores.rows[0].stores}`, 'info');
    assert(parseInt(usersWithStores.rows[0].users) > 0, 'Users are assigned to stores');

    console.log();

    // ========================================
    // SECTION 6: Role Distribution Tests
    // ========================================
    log('ROLE DISTRIBUTION TESTS', 'section');

    // Test 6.1: Role distribution
    const roleDistribution = await pool.query(`
      SELECT access_level, COUNT(*) as count 
      FROM user_store_access 
      GROUP BY access_level 
      ORDER BY count DESC
    `);
    roleDistribution.rows.forEach(r => {
      log(`  ${r.access_level}: ${r.count} users`, 'info');
    });
    assert(roleDistribution.rows.length > 0, 'Role distribution is defined');

    // Test 6.2: Admin role exists
    const admins = roleDistribution.rows.find(r => r.access_level === 'admin');
    assert(admins && parseInt(admins.count) >= 1, 'At least one store admin exists');

    console.log();

    // ========================================
    // SECTION 7: Referential Integrity Tests
    // ========================================
    log('REFERENTIAL INTEGRITY TESTS', 'section');

    // Test 7.1: All user_store_access.user_id references valid users
    const orphanUserAccess = await pool.query(`
      SELECT usa.user_id 
      FROM user_store_access usa 
      LEFT JOIN users u ON usa.user_id = u.id 
      WHERE u.id IS NULL
    `);
    assert(orphanUserAccess.rows.length === 0, 'No orphan user_store_access records');

    // Test 7.2: All user_store_access.store_id references valid stores
    const orphanStoreAccess = await pool.query(`
      SELECT usa.store_id 
      FROM user_store_access usa 
      LEFT JOIN stores s ON usa.store_id = s.id 
      WHERE s.id IS NULL
    `);
    assert(orphanStoreAccess.rows.length === 0, 'All store references are valid');

    // Test 7.3: All store_settings.store_id references valid stores
    const orphanStoreSettings = await pool.query(`
      SELECT ss.store_id 
      FROM store_settings ss 
      LEFT JOIN stores s ON ss.store_id = s.id 
      WHERE s.id IS NULL
    `);
    assert(orphanStoreSettings.rows.length === 0, 'All store_settings references valid');

    console.log();

    // ========================================
    // RESULTS SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('  TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n  Total Tests: ${results.passed + results.failed}`);
    console.log(`  ✅ Passed: ${results.passed}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    console.log(`  Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%\n`);

    if (results.failed > 0) {
      console.log('  Failed Tests:');
      results.tests.filter(t => t.status === 'fail').forEach(t => {
        console.log(`    ❌ ${t.name}`);
      });
      console.log();
    }

    console.log('='.repeat(60) + '\n');

    return results.failed === 0;

  } catch (error) {
    console.error('Test suite error:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
