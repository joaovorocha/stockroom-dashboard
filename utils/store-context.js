const path = require('path');

function getStoreId(req) {
  // v1: single-store instance: env var; later can derive from hostname/subdomain.
  const envStore = process.env.STORE_ID;
  if (envStore) return String(envStore);
  // Default for current deployment
  return 'sr-us-sf-maiden';
}

function getStoreDataDir(storeId) {
  return path.join(__dirname, '..', 'data', 'stores', storeId);
}

module.exports = {
  getStoreId,
  getStoreDataDir,
};

