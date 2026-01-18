const axios = require('axios');

// UPS API Configuration
// When credentials are not configured, we return "" (unknown) rather than guessing.
// To enable real tracking statuses, set:
//   UPS_CLIENT_ID=...
//   UPS_CLIENT_SECRET=...
const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID || process.env.UPS_OAUTH_CLIENT_ID || '';
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET || process.env.UPS_OAUTH_CLIENT_SECRET || '';
const UPS_MERCHANT_ID = process.env.UPS_MERCHANT_ID || process.env.UPS_ACCOUNT_NUMBER || '';
const UPS_TRANSACTION_SRC = process.env.UPS_TRANSACTION_SRC || 'stockroom-dashboard';
const UPS_ENV = (process.env.UPS_ENV || 'prod').toString().toLowerCase(); // 'prod' | 'cie'

// UPS OAuth + Track endpoints
const UPS_BASE = UPS_ENV === 'cie' ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com';
const UPS_OAUTH_URL = `${UPS_BASE}/security/v1/oauth/token`;
const UPS_TRACK_URL = `${UPS_BASE}/api/track/v1/details`;

const TOKEN_SKEW_MS = 30_000; // refresh 30s early
const STATUS_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

let cachedToken = { token: '', expiresAt: 0 };
const statusCache = new Map(); // trackingNumber -> { status, at }

function nowMs() {
  return Date.now();
}

function normalizeTracking(trackingNumber) {
  return (trackingNumber || '').toString().trim().toUpperCase();
}

async function getAccessToken() {
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) return '';
  if (cachedToken.token && cachedToken.expiresAt - TOKEN_SKEW_MS > nowMs()) return cachedToken.token;

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const auth = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');

  const resp = await axios.post(UPS_OAUTH_URL, body.toString(), {
    headers: {
      'Authorization': `Basic ${auth}`,
      ...(UPS_MERCHANT_ID ? { 'x-merchant-id': UPS_MERCHANT_ID } : {}),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 15_000
  });

  const token = resp?.data?.access_token || '';
  const expiresInSec = Number(resp?.data?.expires_in || 0);
  cachedToken = {
    token,
    expiresAt: token && expiresInSec ? nowMs() + expiresInSec * 1000 : nowMs()
  };
  return token;
}

function extractStatusFromUpsTrackResponse(data) {
  // UPS Track API responses vary by account/settings; this is a best-effort extractor.
  const shipment = data?.trackResponse?.shipment?.[0] || data?.shipment?.[0] || null;
  const pkg = shipment?.package?.[0] || shipment?.packages?.[0] || null;
  const activity = pkg?.activity?.[0] || shipment?.activity?.[0] || null;

  const description =
    activity?.status?.description ||
    activity?.status?.type ||
    pkg?.currentStatus?.description ||
    shipment?.currentStatus?.description ||
    shipment?.status?.description ||
    '';

  return (description || '').toString().trim();
}

/**
 * Fetch tracking status from UPS API
 * @param {string} trackingNumber - The UPS tracking number
 * @returns {Promise<string>} - Status string
 */
async function getTrackingStatus(trackingNumber) {
  const tn = normalizeTracking(trackingNumber);
  if (!tn) return '';

  // If no API credentials, do not guess.
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) return '';

  const cached = statusCache.get(tn);
  if (cached && cached.at + STATUS_CACHE_TTL_MS > nowMs()) return cached.status || '';

  try {
    const token = await getAccessToken();
    if (!token) return '';

    const url = `${UPS_TRACK_URL}/${encodeURIComponent(tn)}`;
    const resp = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        // Required by UPS Track API
        'transId': `sr-${nowMs()}-${Math.random().toString(36).slice(2, 10)}`,
        'transactionSrc': UPS_TRANSACTION_SRC
      },
      params: { locale: 'en_US' },
      timeout: 15_000
    });

    const status = extractStatusFromUpsTrackResponse(resp?.data);
    statusCache.set(tn, { status, at: nowMs() });
    return status;
  } catch (error) {
    // If token expired or was revoked, clear token once and let next call retry.
    const code = error?.response?.status;
    if (code === 401 || code === 403) cachedToken = { token: '', expiresAt: 0 };
    console.error('Error fetching UPS status:', error.message);
    return '';
  }
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
