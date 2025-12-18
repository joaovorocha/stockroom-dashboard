const XLSX = require('xlsx');

// Read the workbook
const workbook = XLSX.readFile('./data/gameplan.xlsx');

console.log('=== GAME PLAN FILE STRUCTURE ===\n');

// Show sheet names
console.log('Sheet Names:', workbook.SheetNames);
console.log('');

// Examine each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log(`--- Sheet: "${sheetName}" ---`);
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON to see the data
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  console.log(`Total rows: ${data.length}`);

  // Show first 5 rows
  console.log('First 5 rows:');
  data.slice(0, 5).forEach((row, idx) => {
    console.log(`Row ${idx}:`, row);
  });
  console.log('');
});
