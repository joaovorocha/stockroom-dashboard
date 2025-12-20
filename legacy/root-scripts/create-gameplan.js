const XLSX = require('xlsx');

// Create a new workbook
const wb = XLSX.utils.book_new();

// Create sample game plan data
const data = [
  ['Date', 'Task', 'Assigned To', 'Priority', 'Status'],
  ['2025-12-11', 'Process incoming shipments', 'Team A', 'High', 'In Progress'],
  ['2025-12-11', 'Organize stock room', 'Team B', 'Medium', 'Pending'],
  ['2025-12-11', 'Update inventory system', 'Team A', 'High', 'Completed'],
  ['2025-12-10', 'Check quality of new items', 'Team B', 'Medium', 'Completed'],
  ['2025-12-10', 'Prepare shipments for pickup', 'Team A', 'High', 'Completed'],
  ['2025-12-12', 'Monthly stock count', 'All Teams', 'High', 'Scheduled']
];

// Convert to worksheet
const ws = XLSX.utils.aoa_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Game Plan');

// Write to file
XLSX.writeFile(wb, './data/gameplan.xlsx');

console.log('gameplan.xlsx created successfully!');
