const path = require('path');
const { createJsonDAL } = require('./json');
const { createSqlDAL } = require('./sql');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function createDAL() {
  const backend = (process.env.DATA_BACKEND || 'json').toLowerCase();
  if (backend === 'sql') {
    return createSqlDAL();
  }
  return createJsonDAL({ dataDir: DATA_DIR });
}

module.exports = createDAL();

