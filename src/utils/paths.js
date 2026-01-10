const path = require('path');

function resolveFromProjectRoot(...parts) {
  return path.resolve(__dirname, '..', ...parts);
}

function getDataDir() {
  return (
    process.env.STOCKROOM_DATA_DIR ||
    process.env.STOCKROOM_DASHBOARD_DATA_DIR ||
    process.env.DATA_DIR ||
    resolveFromProjectRoot('data')
  );
}

function getFilesDir() {
  return process.env.STOCKROOM_FILES_DIR || resolveFromProjectRoot('files');
}

function getLogsDir() {
  return process.env.STOCKROOM_LOG_DIR || resolveFromProjectRoot('logs');
}

module.exports = {
  resolveFromProjectRoot,
  getDataDir,
  getFilesDir,
  getLogsDir,
};
