const XLSX = require('xlsx');
const path = require('path');

// Get game plan data for a specific date
function getGamePlanForDate(date) {
  try {
    const gamePlanPath = path.join(__dirname, '../data/gameplan.xlsx');
    const workbook = XLSX.readFile(gamePlanPath);

    // Determine day of week from date
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

    // Check if sheet exists
    if (!workbook.SheetNames.includes(dayOfWeek)) {
      return null;
    }

    // Get the worksheet for that day
    const worksheet = workbook.Sheets[dayOfWeek];

    // Convert to array of arrays
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false
    });

    // Extract relevant information
    // Row 1 contains the date
    const dateRow = data[1] || [];
    const dateText = dateRow.find(cell => cell && cell.includes(',')) || '';

    // Rows 2-3 contain targets/metrics
    const metrics = {
      row1: data[2] || [],
      row2: data[3] || []
    };

    // Row 4 is headers
    const headers = data[4] || [];

    // Rows 5+ are employee data
    const employees = [];
    for (let i = 5; i < data.length; i++) {
      const row = data[i];
      if (row && row.length > 0 && row[0]) {
        // Only include rows that have a name
        employees.push(row);
      }
    }

    return {
      dayOfWeek,
      dateText,
      metrics,
      headers,
      employees,
      rawData: data
    };
  } catch (error) {
    console.error('Error reading game plan:', error);
    throw error;
  }
}

// Get all shipments
function getAllShipments() {
  try {
    const shipmentsPath = path.join(__dirname, '../data/shipments.xlsx');
    const workbook = XLSX.readFile(shipmentsPath);

    // Assume first sheet contains shipments
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON (first row as headers)
    const shipments = XLSX.utils.sheet_to_json(worksheet);

    return shipments;
  } catch (error) {
    console.error('Error reading shipments:', error);
    throw error;
  }
}

// Add a new shipment
function addShipment(shipmentData) {
  try {
    const shipmentsPath = path.join(__dirname, '../data/shipments.xlsx');
    let workbook;
    let worksheet;

    try {
      // Try to read existing file
      workbook = XLSX.readFile(shipmentsPath);
      const sheetName = workbook.SheetNames[0];
      worksheet = workbook.Sheets[sheetName];
    } catch (err) {
      // File doesn't exist, create new workbook
      workbook = XLSX.utils.book_new();
      const headers = [['Date', 'Tracking Number', 'Recipient', 'Details']];
      worksheet = XLSX.utils.aoa_to_sheet(headers);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');
    }

    // Convert existing data to array
    const existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Add new shipment row
    const newRow = [
      shipmentData.date || new Date().toISOString().split('T')[0],
      shipmentData.trackingNumber || '',
      shipmentData.recipient || '',
      shipmentData.details || ''
    ];

    existingData.push(newRow);

    // Create new worksheet with updated data
    const newWorksheet = XLSX.utils.aoa_to_sheet(existingData);

    // Replace the worksheet
    workbook.Sheets[workbook.SheetNames[0]] = newWorksheet;

    // Write back to file
    XLSX.writeFile(workbook, shipmentsPath);

    return true;
  } catch (error) {
    console.error('Error adding shipment:', error);
    throw error;
  }
}

module.exports = {
  getGamePlanForDate,
  getAllShipments,
  addShipment
};
