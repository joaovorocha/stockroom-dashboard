const path = require('path');
const { getDataDir } = require('../paths');
const { getStoreDataDir } = require('../store-context');
const { readJsonFile, writeJsonFile } = require('./fs-json');
const { createJsonDAL } = require('./json');

function createStoreDal(storeId) {
  const baseDir = getStoreDataDir(storeId);

  const files = {
    config: path.join(baseDir, 'config.json'),
    users: path.join(baseDir, 'users.json'),
    employees: path.join(baseDir, 'employees.json'),
    timeOff: path.join(baseDir, 'time-off.json'),
  };

  return {
    storeId,
    getConfig: () => readJsonFile(files.config, {}),
    saveConfig: (cfg) => writeJsonFile(files.config, cfg),

    getUsers: () => readJsonFile(files.users, { users: [] }),
    saveUsers: (users) => writeJsonFile(files.users, users),

    getEmployees: () => readJsonFile(files.employees, { employees: {} }),
    saveEmployees: (employees) => writeJsonFile(files.employees, employees),

    getTimeOff: () => readJsonFile(files.timeOff, { entries: [] }),
    saveTimeOff: (timeOff) => writeJsonFile(files.timeOff, timeOff),
  };
}

// Default DAL (single-store) used by the app's existing routes.
const defaultDataDir = getDataDir();
const jsonDal = createJsonDAL({ dataDir: defaultDataDir });

module.exports = {
  ...jsonDal,
  createStoreDal,
};
