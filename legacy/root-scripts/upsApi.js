const axios = require('axios');

// UPS API Configuration
// TODO: Add real UPS API credentials when available
const UPS_API_URL = 'https://onlinetools.ups.com/track/v1/details';
const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID || '';
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET || '';

/**
 * Fetch tracking status from UPS API
 * @param {string} trackingNumber - The UPS tracking number
 * @returns {Promise<string>} - Status string
 */
async function getTrackingStatus(trackingNumber) {
  // If no API credentials, return mock status
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
    return getMockStatus(trackingNumber);
  }

  try {
    // Real UPS API call would go here
    // const response = await axios.get(`${UPS_API_URL}/${trackingNumber}`, {
    //   headers: {
    //     'Authorization': `Bearer ${accessToken}`,
    //     'Content-Type': 'application/json'
    //   }
    //});

    // For now, return mock status
    return getMockStatus(trackingNumber);
  } catch (error) {
    console.error('Error fetching UPS status:', error.message);
    return 'Status Unavailable';
  }
}

/**
 * Get mock tracking status for development
 * @param {string} trackingNumber - The tracking number
 * @returns {string} - Mock status
 */
function getMockStatus(trackingNumber) {
  // Generate deterministic but varied mock statuses based on tracking number
  const lastDigit = trackingNumber.slice(-1);
  const statuses = [
    'Delivered',
    'In Transit',
    'Out for Delivery',
    'Processing at Facility',
    'Label Created',
    'In Transit',
    'Delivered',
    'Out for Delivery',
    'In Transit',
    'Delivered'
  ];

  const index = isNaN(lastDigit) ? 0 : parseInt(lastDigit);
  return statuses[index] || 'In Transit';
}

/**
 * Fetch statuses for multiple tracking numbers in parallel
 * @param {string[]} trackingNumbers - Array of tracking numbers
 * @returns {Promise<Object>} - Map of tracking number to status
 */
async function getMultipleTrackingStatuses(trackingNumbers) {
  const statusPromises = trackingNumbers.map(async (trackingNumber) => {
    const status = await getTrackingStatus(trackingNumber);
    return { trackingNumber, status };
  });

  const results = await Promise.all(statusPromises);

  // Convert array to map
  const statusMap = {};
  results.forEach(({ trackingNumber, status }) => {
    statusMap[trackingNumber] = status;
  });

  return statusMap;
}

module.exports = {
  getTrackingStatus,
  getMultipleTrackingStatuses
};
