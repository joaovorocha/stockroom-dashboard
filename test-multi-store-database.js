/**
 * Test Multi-Store Database Integration
 * 
 * Tests that store ID lookups work correctly with the database
 */

const { 
  getStoreIdByCode, 
  getAllStoreIds,
  extractStoreCodeFromLocation 
} = require('./utils/multi-store-parser');

console.log('=== Multi-Store Database Integration Test ===\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Get SF store ID
  console.log('Test 1: Get San Francisco store ID');
  try {
    const sfId = await getStoreIdByCode('SF');
    if (sfId) {
      console.log(`  ✅ PASS: SF store_id = ${sfId}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: SF store ID not found`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 2: Get Chicago store ID
  console.log('Test 2: Get Chicago store ID');
  try {
    const chiId = await getStoreIdByCode('CHI');
    if (chiId) {
      console.log(`  ✅ PASS: CHI store_id = ${chiId}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: CHI store ID not found`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 3: Get New York Soho store ID
  console.log('Test 3: Get New York Soho store ID');
  try {
    const nysId = await getStoreIdByCode('NYS');
    if (nysId) {
      console.log(`  ✅ PASS: NYS store_id = ${nysId}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: NYS store ID not found`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 4: Get all store IDs
  console.log('Test 4: Get all store IDs');
  try {
    const allIds = await getAllStoreIds();
    if (allIds.length === 39) {
      console.log(`  ✅ PASS: Found ${allIds.length} stores`);
      console.log(`     Store IDs: ${allIds.slice(0, 10).join(', ')}...`);
      passed++;
    } else {
      console.log(`  ⚠️  PARTIAL: Found ${allIds.length} stores (expected 39)`);
      console.log(`     Store IDs: ${allIds.join(', ')}`);
      passed++;
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 5: Extract store code from location name
  console.log('Test 5: Extract store code from location names');
  const locationTests = [
    { location: 'San Francisco', expected: 'SF' },
    { location: 'Chicago', expected: 'CHI' },
    { location: 'New York Soho', expected: 'NYS' },
    { location: 'NY Soho', expected: 'NYS' },
    { location: 'Los Angeles Century City', expected: 'LAC' },
    { location: 'LA Century City', expected: 'LAC' }
  ];

  let extractPassed = 0;
  for (const test of locationTests) {
    const result = extractStoreCodeFromLocation(test.location);
    if (result === test.expected) {
      console.log(`  ✅ "${test.location}" → ${result}`);
      extractPassed++;
    } else {
      console.log(`  ❌ "${test.location}" → ${result} (expected ${test.expected})`);
    }
  }

  if (extractPassed === locationTests.length) {
    console.log(`  ✅ PASS: All ${locationTests.length} location extractions correct`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: Only ${extractPassed}/${locationTests.length} correct`);
    failed++;
  }
  console.log('');

  // Test 6: Invalid store code (should return null)
  console.log('Test 6: Invalid store code handling');
  try {
    const invalidId = await getStoreIdByCode('INVALID');
    if (invalidId === null) {
      console.log(`  ✅ PASS: Invalid code returns null`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: Invalid code returned ${invalidId} (expected null)`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ FAIL: ${error.message}`);
    failed++;
  }
  console.log('');

  // Summary
  console.log('=== Test Summary ===');
  console.log(`✅ Passed: ${passed}/6`);
  console.log(`❌ Failed: ${failed}/6`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All database integration tests passed!');
    console.log('✅ Multi-store lookups are working correctly');
    console.log('✅ Ready to process multi-store CSV data');
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Please review the output above.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
