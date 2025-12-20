const XLSX = require('xlsx');

// Create a new workbook
const wb = XLSX.utils.book_new();

// Create sample shipments data with headers
const data = [
  ['Date', 'Tracking Number', 'Recipient', 'Details'],
  ['2025-12-10', '1Z999AA10123456784', 'John Smith', 'Customer order #1234'],
  ['2025-12-11', '1Z999AA10123456785', 'Jane Doe', 'Return shipment']
];

// Convert to worksheet
const ws = XLSX.utils.aoa_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Shipments');

// Write to file
XLSX.writeFile(wb, './data/shipments.xlsx');

console.log('shipments.xlsx created successfully!');
