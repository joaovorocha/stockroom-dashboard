const { getScanPerformance } = require('./utils/scan-performance-db');

async function recheckScanData() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0];
    
    console.log('\n=== Checking Scan Performance Data ===\n');
    
    // Check today's data
    console.log(`Checking ${today}...`);
    const todayData = await getScanPerformance(today);
    
    if (todayData) {
      console.log(`Found ${todayData.employees.length} employees for ${today}`);
      console.log('\nFirst 5 employees:');
      todayData.employees.slice(0, 5).forEach(emp => {
        console.log(`  - ${emp.name}: ${emp.countsDone} counts, ${emp.accuracy.toFixed(2)}% accuracy`);
        console.log(`    Image URL: ${emp.imageUrl || 'MISSING'}`);
        console.log(`    User ID: ${emp.id || 'MISSING'}`);
      });
    } else {
      console.log(`No data found for ${today}`);
    }
    
    // Check yesterday's data
    console.log(`\nChecking ${yesterday}...`);
    const yesterdayData = await getScanPerformance(yesterday);
    
    if (yesterdayData) {
      console.log(`Found ${yesterdayData.employees.length} employees for ${yesterday}`);
      console.log('\nFirst 5 employees:');
      yesterdayData.employees.slice(0, 5).forEach(emp => {
        console.log(`  - ${emp.name}: ${emp.countsDone} counts, ${emp.accuracy.toFixed(2)}% accuracy`);
        console.log(`    Image URL: ${emp.imageUrl || 'MISSING'}`);
        console.log(`    User ID: ${emp.id || 'MISSING'}`);
      });
    } else {
      console.log(`No data found for ${yesterday}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

recheckScanData();
