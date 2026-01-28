const fs = require('fs');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'stockroom_dashboard',
  user: 'suit',
  password: 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

function parseCSVDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  // Remove quotes and trim
  const cleaned = dateStr.replace(/^["']|["']$/g, '').trim();
  
  // Try "Month DD, YYYY at HH:MM:SS AM PST" format
  const monthNames = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04', 'May': '05', 'June': '06',
    'July': '07', 'August': '08', 'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  const longDate = cleaned.match(/^([A-Za-z]+) (\d{1,2}), (\d{4}) at/);
  if (longDate) {
    const [_, monthName, day, year] = longDate;
    const month = monthNames[monthName];
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }
  
  return null;
}

async function importCSV() {
  const csvPath = path.join(__dirname, 'docs', 'StoreCount (2).csv');
  console.log('Reading CSV:', csvPath);
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  console.log('Headers:', headers);
  console.log(`Total lines: ${lines.length}`);
  
  // Get list of valid employee emails from users table
  const validUsersResult = await pool.query(
    `SELECT LOWER(email) as email FROM users WHERE is_active = true`
  );
  const validEmails = new Set(validUsersResult.rows.map(r => r.email));
  console.log(`Found ${validEmails.size} valid employee emails in database`);
  
  // Get existing scan dates and employees to avoid duplicates
  const existingScansResult = await pool.query(
    `SELECT DISTINCT 
       scan_date::text as scan_date,
       LOWER(counted_by) as counted_by
     FROM daily_scan_results`
  );
  const existingScans = new Set(
    existingScansResult.rows.map(r => `${r.scan_date}|${r.counted_by}`)
  );
  console.log(`Found ${existingScansResult.rows.length} existing scan records`);
  
  let imported = 0;
  let skipped = 0;
  let skippedReasons = { noEmployee: 0, multiPerson: 0, generic: 0, duplicate: 0, other: 0 };
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV properly handling quoted values
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    
    if (values.length < 10) continue;
    
    const status = values[0].replace(/^["']|["']$/g, '').trim();
    const countId = values[1].replace(/^["']|["']$/g, '').trim();
    const createdDate = values[5];
    const countedBy = values[7] ? values[7].replace(/^["']|["']$/g, '').trim() : '';
    
    const scanDate = parseCSVDate(createdDate);
    if (!scanDate) {
      console.log(`Skipping row ${i}: cannot parse date "${createdDate}"`);
      skipped++;
      skippedReasons.other++;
      continue;
    }
    
    // Skip if counted_by has multiple emails (comma-separated)
    if (countedBy.includes(',')) {
      console.log(`Skipping row ${i}: multi-person scan (${countedBy})`);
      skipped++;
      skippedReasons.multiPerson++;
      continue;
    }
    
    // Skip generic store emails
    const lowerCountedBy = countedBy.toLowerCase();
    if (lowerCountedBy === 'sanfrancisco@suitsupply.com' || 
        lowerCountedBy.includes('store@') ||
        lowerCountedBy === 'store' ||
        /^j\d+$/i.test(countedBy)) {  // Skip J21, J22, J23, etc.
      console.log(`Skipping row ${i}: generic/store email (${countedBy})`);
      skipped++;
      skippedReasons.generic++;
      continue;
    }
    
    // Only import if the counted_by email exists in users table
    if (countedBy && !validEmails.has(lowerCountedBy)) {
      console.log(`Skipping row ${i}: employee not in database (${countedBy})`);
      skipped++;
      skippedReasons.noEmployee++;
      continue;
    }
    
    // Check if we already have this scan (same date + employee)
    const scanKey = `${scanDate}|${lowerCountedBy}`;
    if (existingScans.has(scanKey)) {
      console.log(`Skipping row ${i}: already imported (${countedBy} on ${scanDate})`);
      skipped++;
      skippedReasons.duplicate++;
      continue;
    }
    
    const expectedUnits = parseInt(values[9]) || 0;
    const countedUnits = parseInt(values[10]) || 0;
    const missedAvailable = parseInt(values[11]) || 0;
    const missedReserved = parseInt(values[12]) || 0;
    const newUnits = parseInt(values[13]) || 0;
    const foundPreviouslyMissed = parseInt(values[14]) || 0;
    const undecodableUnits = parseInt(values[15]) || 0;
    const unmappedItemUnits = parseInt(values[16]) || 0;
    
    // Skip scans with expected_units = 0 (likely incomplete/test data)
    if (status === 'COMPLETED' && expectedUnits === 0) {
      console.log(`Skipping row ${i}: COMPLETED scan with 0 expected units (likely test data)`);
      skipped++;
      skippedReasons.other++;
      continue;
    }
    
    try {
      await pool.query(
        `INSERT INTO daily_scan_results 
         (count_id, status, scan_date, counted_by, expected_units, counted_units,
          missed_units_available, missed_units_reserved, new_units, 
          found_previously_missed_units, undecodable_units, unmapped_item_units)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (count_id) DO UPDATE SET
          status = EXCLUDED.status,
          scan_date = EXCLUDED.scan_date,
          counted_by = EXCLUDED.counted_by,
          expected_units = EXCLUDED.expected_units,
          counted_units = EXCLUDED.counted_units,
          missed_units_available = EXCLUDED.missed_units_available,
          missed_units_reserved = EXCLUDED.missed_units_reserved,
          new_units = EXCLUDED.new_units,
          found_previously_missed_units = EXCLUDED.found_previously_missed_units,
          undecodable_units = EXCLUDED.undecodable_units,
          unmapped_item_units = EXCLUDED.unmapped_item_units,
          updated_at = CURRENT_TIMESTAMP`,
        [countId, status, scanDate, countedBy, expectedUnits, countedUnits,
         missedAvailable, missedReserved, newUnits, foundPreviouslyMissed,
         undecodableUnits, unmappedItemUnits]
      );
      imported++;
      
      if (imported % 10 === 0) {
        console.log(`Imported ${imported} records...`);
      }
    } catch (error) {
      console.error(`Error importing row ${i}:`, error.message);
      skipped++;
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`  - Already imported: ${skippedReasons.duplicate}`);
  console.log(`  - Not in database: ${skippedReasons.noEmployee}`);
  console.log(`  - Multi-person scans: ${skippedReasons.multiPerson}`);
  console.log(`  - Generic/store emails: ${skippedReasons.generic}`);
  console.log(`  - Other reasons: ${skippedReasons.other}`);
  
  const result = await pool.query('SELECT COUNT(*), MIN(scan_date), MAX(scan_date) FROM daily_scan_results');
  console.log(`\nTotal records in DB: ${result.rows[0].count}`);
  console.log(`Date range: ${result.rows[0].min} to ${result.rows[0].max}`);
  
  await pool.end();
}

importCSV().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
