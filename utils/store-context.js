const path = require('path');
const { getDataDir } = require('./paths');

function getStoreId(req) {
  // v1: single-store instance: env var; later can derive from hostname/subdomain.
  const envStore = process.env.STORE_ID;
  if (envStore) return String(envStore);
  // Default for current deployment
  return 'sr-us-sf-maiden';
}

function getStoreDataDir(storeId) {
  return path.join(getDataDir(), 'stores', storeId);
}

module.exports = {
  getStoreId,
  getStoreDataDir,
};

