/**
 * Multi-Store Email Subject Parser
 * 
 * Detects if Looker email contains data for:
 * - Single store (e.g., "San Francisco - Stores Performance")
 * - All stores (e.g., "Stores Performance (ALL)" or "Store Ops Overdue Audit (ALL)")
 * 
 * Usage:
 *   const info = parseEmailSubject("Stores Performance (ALL)");
 *   // { isAllStores: true, storeName: null, storeCode: null }
 * 
 *   const info2 = parseEmailSubject("San Francisco - Daily Metrics");
 *   // { isAllStores: false, storeName: "San Francisco", storeCode: "SF" }
 */

// Store name to store code mapping
const STORE_NAME_TO_CODE = {
  // US Stores
  'atlanta': 'ATL',
  'austin': 'AUS',
  'boston': 'BOS',
  'chicago': 'CHI',
  'dallas': 'DAL',
  'denver': 'DEN',
  'edina': 'EDI',
  'greenwich': 'GRN',
  'houston': 'HOU',
  'king of prussia': 'KOP',
  'la abbot kinney': 'LAK',
  'los angeles abbot kinney': 'LAK',
  'la century city': 'LAC',
  'los angeles century city': 'LAC',
  'las vegas': 'LV',
  'miami beach': 'MIA',
  'miami brickell': 'MIB',
  'newport beach': 'NPB',
  'ny brookfield': 'NYB',
  'new york brookfield': 'NYB',
  'brookfield place': 'NYB',
  'ny hudson yards': 'NYH',
  'new york hudson yards': 'NYH',
  'hudson yards': 'NYH',
  'ny madison': 'NYM',
  'new york madison': 'NYM',
  'madison ave': 'NYM',
  'ny soho': 'NYS',
  'new york soho': 'NYS',
  'soho': 'NYS',
  'ny williamsburg': 'NYW',
  'new york williamsburg': 'NYW',
  'williamsburg': 'NYW',
  'philadelphia': 'PHL',
  'plano': 'PLN',
  'roosevelt field': 'ROF',
  'san diego': 'SD',
  'san francisco': 'SF',
  'san jose': 'SJ',
  'scottsdale': 'SCO',
  'seattle bellevue': 'SEA',
  'seattle downtown': 'SED',
  'short hills': 'SHO',
  'st louis': 'STL',
  'saint louis': 'STL',
  'tampa': 'TPA',
  'tysons': 'TYS',
  'tysons galleria': 'TYS',
  'washington': 'DC',
  'washington dc': 'DC',
  'woodlands': 'WOO',
  'the woodlands': 'WOO',
  
  // Canadian Stores
  'montreal': 'MTL',
  'toronto': 'TOR',
  
  // Australia
  'sydney': 'SYD'
};

/**
 * Parse email subject to determine store scope
 * @param {string} subject - Email subject line
 * @returns {object} { isAllStores, storeName, storeCode }
 */
function parseEmailSubject(subject) {
  if (!subject) {
    return { isAllStores: true, storeName: null, storeCode: null };
  }

  const subjectLower = subject.toLowerCase().trim();

  // Check for (ALL) indicator
  if (subjectLower.includes('(all)') || subjectLower.includes('[all]') || subjectLower.includes('- all ')) {
    return {
      isAllStores: true,
      storeName: null,
      storeCode: null,
      emailSubject: subject
    };
  }

  // Try to extract store name from subject
  // Common patterns:
  // - "San Francisco - Stores Performance"
  // - "Store Ops: Chicago"
  // - "Dallas Daily Metrics"
  
  for (const [storeName, storeCode] of Object.entries(STORE_NAME_TO_CODE)) {
    if (subjectLower.includes(storeName)) {
      return {
        isAllStores: false,
        storeName: storeName.charAt(0).toUpperCase() + storeName.slice(1),
        storeCode: storeCode,
        emailSubject: subject
      };
    }
  }

  // If no store detected, assume it's for ALL stores
  // This is safer - better to import data for all stores than to miss it
  return {
    isAllStores: true,
    storeName: null,
    storeCode: null,
    emailSubject: subject
  };
}

/**
 * Get store ID from database by code
 * @param {string} storeCode - Store code (e.g., 'SF', 'NYC')
 * @returns {Promise<number|null>} Store ID or null
 */
async function getStoreIdByCode(storeCode) {
  if (!storeCode) return null;

  try {
    const { query } = require('./dal/pg');
    const result = await query(
      'SELECT id FROM stores WHERE store_code = $1 AND active = true',
      [storeCode.toUpperCase()]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    console.error(`Error fetching store ID for ${storeCode}:`, error);
    return null;
  }
}

/**
 * Get all active store IDs
 * @returns {Promise<number[]>} Array of store IDs
 */
async function getAllStoreIds() {
  try {
    const { query } = require('./dal/pg');
    const result = await query(
      'SELECT id FROM stores WHERE active = true ORDER BY id'
    );
    return result.rows.map(r => r.id);
  } catch (error) {
    console.error('Error fetching all store IDs:', error);
    return [1]; // Default to SF
  }
}

/**
 * Detect if CSV file contains multi-store data
 * Checks for "Location Name" column which indicates multi-store data
 * @param {Array} csvData - Parsed CSV data
 * @returns {boolean} True if multi-store data
 */
function isMultiStoreCSV(csvData) {
  if (!Array.isArray(csvData) || csvData.length === 0) return false;
  
  const firstRow = csvData[0];
  const headers = Object.keys(firstRow);
  
  // Check for location/store columns
  return headers.some(h => 
    h.toLowerCase().includes('location name') ||
    h.toLowerCase().includes('store name') ||
    h.toLowerCase() === 'location' ||
    h.toLowerCase() === 'store'
  );
}

/**
 * Extract store code from location name in CSV
 * @param {string} locationName - Location name from CSV
 * @returns {string|null} Store code or null
 */
function extractStoreCodeFromLocation(locationName) {
  if (!locationName) return null;
  
  const locationLower = locationName.toLowerCase().trim();
  
  for (const [storeName, storeCode] of Object.entries(STORE_NAME_TO_CODE)) {
    if (locationLower.includes(storeName)) {
      return storeCode;
    }
  }
  
  return null;
}

module.exports = {
  parseEmailSubject,
  getStoreIdByCode,
  getAllStoreIds,
  isMultiStoreCSV,
  extractStoreCodeFromLocation,
  STORE_NAME_TO_CODE
};
