const { query: pgQuery } = require('./utils/dal/pg');

async function importTodaysScan() {
  try {
    console.log('\n=== Importing Today\'s Scan (Jan 23, 2026) ===\n');
    
    // Data from the screenshot
    const scanData = {
      countId: '06618e8b-af5b-5003-4721-a80a-0370808b3c5b',
      status: 'COMPLETED',
      scanDate: '2026-01-23',
      countedBy: 'DIraheta@suitsupply.com',
      expectedUnits: 7894,
      countedUnits: 7787,
      missedAvailable: 101,
      missedReserved: 6,
      newUnits: 140,
      foundPreviouslyMissed: 12,
      undecodableUnits: 22,
      unmappedItemUnits: 4,
      differentLocationUnits: 2
    };
    
    // Verify employee exists
    const userCheck = await pgQuery(
      `SELECT id, name FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true`,
      [scanData.countedBy]
    );
    
    if (userCheck.rows.length === 0) {
      console.log(`❌ Employee ${scanData.countedBy} not found in users table`);
      process.exit(1);
    }
    
    console.log(`✅ Found employee: ${userCheck.rows[0].name}`);
    
    // Check if scan already exists
    const existingCheck = await pgQuery(
      `SELECT count_id FROM daily_scan_results WHERE scan_date = $1 AND LOWER(counted_by) = LOWER($2)`,
      [scanData.scanDate, scanData.countedBy]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log(`\n⚠️  Scan already exists for ${scanData.countedBy} on ${scanData.scanDate}`);
      console.log('Updating existing scan...');
      
      await pgQuery(
        `UPDATE daily_scan_results SET
          count_id = $1,
          status = $2,
          expected_units = $3,
          counted_units = $4,
          missed_units_available = $5,
          missed_units_reserved = $6,
          new_units = $7,
          found_previously_missed_units = $8,
          undecodable_units = $9,
          unmapped_item_units = $10,
          updated_at = NOW()
         WHERE scan_date = $11 AND LOWER(counted_by) = LOWER($12)`,
        [
          scanData.countId,
          scanData.status,
          scanData.expectedUnits,
          scanData.countedUnits,
          scanData.missedAvailable,
          scanData.missedReserved,
          scanData.newUnits,
          scanData.foundPreviouslyMissed,
          scanData.undecodableUnits,
          scanData.unmappedItemUnits,
          scanData.scanDate,
          scanData.countedBy
        ]
      );
      console.log('✅ Updated scan record');
    } else {
      console.log(`\nInserting new scan...`);
      
      await pgQuery(
        `INSERT INTO daily_scan_results (
          count_id, status, scan_date, counted_by,
          expected_units, counted_units,
          missed_units_available, missed_units_reserved,
          new_units, found_previously_missed_units,
          undecodable_units, unmapped_item_units
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          scanData.countId,
          scanData.status,
          scanData.scanDate,
          scanData.countedBy,
          scanData.expectedUnits,
          scanData.countedUnits,
          scanData.missedAvailable,
          scanData.missedReserved,
          scanData.newUnits,
          scanData.foundPreviouslyMissed,
          scanData.undecodableUnits,
          scanData.unmappedItemUnits
        ]
      );
      console.log('✅ Inserted new scan record');
    }
    
    const accuracy = ((scanData.countedUnits / scanData.expectedUnits) * 100).toFixed(2);
    console.log(`\n📊 Scan Details:`);
    console.log(`   Date: ${scanData.scanDate}`);
    console.log(`   Employee: ${userCheck.rows[0].name}`);
    console.log(`   Expected: ${scanData.expectedUnits}`);
    console.log(`   Counted: ${scanData.countedUnits}`);
    console.log(`   Accuracy: ${accuracy}%`);
    console.log(`   Missed (Available): ${scanData.missedAvailable}`);
    console.log(`   Missed (Reserved): ${scanData.missedReserved}`);
    console.log(`   New Units: ${scanData.newUnits}`);
    console.log(`   Undecodable: ${scanData.undecodableUnits}`);
    
    console.log('\n✅ Scan imported successfully!');
    console.log('\nNext step: Run reaggregate-scans.js to update scan_performance_metrics');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importTodaysScan();
