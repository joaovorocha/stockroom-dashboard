/**
 * Input Sanitization Utilities
 * 
 * Functions to sanitize user input to prevent XSS and injection attacks
 */

/**
 * Sanitize HTML input to prevent XSS
 * Escapes HTML special characters
 */
function sanitizeHtml(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize SQL input (for use with LIKE queries)
 * Escapes SQL wildcard characters
 */
function sanitizeSql(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Sanitize email address
 * Validates and normalizes email format
 */
function sanitizeEmail(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  const email = input.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(email) ? email : null;
}

/**
 * Sanitize phone number
 * Removes non-numeric characters
 */
function sanitizePhone(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  // Remove all non-numeric characters
  const cleaned = input.replace(/\D/g, '');
  
  // Must be 10 digits (US phone) or 11 digits (with country code)
  if (cleaned.length === 10 || cleaned.length === 11) {
    return cleaned;
  }
  
  return null;
}

/**
 * Sanitize employee ID
 * Must be alphanumeric, 3-20 characters
 */
function sanitizeEmployeeId(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  const cleaned = input.trim();
  const regex = /^[a-zA-Z0-9]{3,20}$/;
  
  return regex.test(cleaned) ? cleaned : null;
}

/**
 * Sanitize name (person, company, etc.)
 * Allows letters, spaces, hyphens, apostrophes
 */
function sanitizeName(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  const cleaned = input.trim();
  const regex = /^[a-zA-Z\s\-']{1,100}$/;
  
  return regex.test(cleaned) ? cleaned : null;
}

/**
 * Sanitize URL
 * Validates URL format and protocol
 */
function sanitizeUrl(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  try {
    const url = new URL(input);
    // Only allow http and https protocols
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sanitize file path
 * Prevents directory traversal attacks
 */
function sanitizeFilePath(input) {
  if (typeof input !== 'string') {
    return null;
  }
  
  // Remove any path traversal attempts
  const cleaned = input.replace(/\.\./g, '').replace(/\/\//g, '/');
  
  // Must not start with / or contain backslashes
  if (cleaned.startsWith('/') || cleaned.includes('\\')) {
    return null;
  }
  
  // Only allow alphanumeric, hyphens, underscores, periods, and single forward slashes
  const regex = /^[a-zA-Z0-9\-_./]+$/;
  
  return regex.test(cleaned) ? cleaned : null;
}

/**
 * Sanitize integer
 * Converts to integer or returns null
 */
function sanitizeInteger(input, options = {}) {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  } = options;
  
  const num = parseInt(input, 10);
  
  if (isNaN(num)) {
    return null;
  }
  
  if (num < min || num > max) {
    return null;
  }
  
  return num;
}

/**
 * Sanitize float
 * Converts to float or returns null
 */
function sanitizeFloat(input, options = {}) {
  const {
    min = -Number.MAX_VALUE,
    max = Number.MAX_VALUE,
    decimals = null
  } = options;
  
  const num = parseFloat(input);
  
  if (isNaN(num)) {
    return null;
  }
  
  if (num < min || num > max) {
    return null;
  }
  
  if (decimals !== null) {
    return parseFloat(num.toFixed(decimals));
  }
  
  return num;
}

/**
 * Sanitize boolean
 * Converts to boolean or returns null
 */
function sanitizeBoolean(input) {
  if (typeof input === 'boolean') {
    return input;
  }
  
  if (typeof input === 'string') {
    const lower = input.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }
  
  if (typeof input === 'number') {
    return input !== 0;
  }
  
  return null;
}

/**
 * Sanitize array of strings
 * Filters out invalid entries
 */
function sanitizeStringArray(input, options = {}) {
  const {
    maxLength = 100,
    maxItems = 100,
    allowEmpty = false
  } = options;
  
  if (!Array.isArray(input)) {
    return [];
  }
  
  return input
    .filter(item => typeof item === 'string')
    .filter(item => allowEmpty || item.trim().length > 0)
    .map(item => item.trim().substring(0, maxLength))
    .slice(0, maxItems);
}

/**
 * Sanitize object keys
 * Ensures only allowed keys are present
 */
function sanitizeObjectKeys(input, allowedKeys) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }
  
  const result = {};
  
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      result[key] = input[key];
    }
  }
  
  return result;
}

/**
 * Sanitize date string
 * Returns ISO date string or null
 */
function sanitizeDate(input) {
  if (!input) {
    return null;
  }
  
  const date = new Date(input);
  
  if (isNaN(date.getTime())) {
    return null;
  }
  
  return date.toISOString();
}

/**
 * Sanitize JSON string
 * Parses and validates JSON or returns null
 */
function sanitizeJson(input, options = {}) {
  const { maxDepth = 10 } = options;
  
  if (typeof input !== 'string') {
    return null;
  }
  
  try {
    const parsed = JSON.parse(input);
    
    // Check depth to prevent DoS
    const checkDepth = (obj, depth = 0) => {
      if (depth > maxDepth) {
        throw new Error('JSON too deep');
      }
      
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          checkDepth(obj[key], depth + 1);
        }
      }
    };
    
    checkDepth(parsed);
    
    return parsed;
  } catch {
    return null;
  }
}

module.exports = {
  sanitizeHtml,
  sanitizeSql,
  sanitizeEmail,
  sanitizePhone,
  sanitizeEmployeeId,
  sanitizeName,
  sanitizeUrl,
  sanitizeFilePath,
  sanitizeInteger,
  sanitizeFloat,
  sanitizeBoolean,
  sanitizeStringArray,
  sanitizeObjectKeys,
  sanitizeDate,
  sanitizeJson
};
