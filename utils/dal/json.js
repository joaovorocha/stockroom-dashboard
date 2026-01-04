const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadDir(dirPath) {
  try {
    return fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
  } catch (_) {
    return [];
  }
}

function readJson(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return defaultValue;
  }
}

function writeJsonAtomic(filePath, data, { pretty = true } = {}) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  fs.writeFileSync(tmpPath, payload);
  fs.renameSync(tmpPath, filePath);
}

function writeJsonWithBackups(
  filePath,
  data,
  { backupDir = null, backupsToKeep = 20, pretty = true } = {}
) {
  try {
    if (backupDir) {
      ensureDir(backupDir);
      if (fs.existsSync(filePath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path.basename(filePath);
        fs.copyFileSync(filePath, path.join(backupDir, `${base}.${stamp}.json`));

        const backups = safeReadDir(backupDir)
          .filter(f => f.startsWith(`${base}.`) && f.endsWith('.json'))
          .sort()
          .reverse();
        for (const old of backups.slice(backupsToKeep)) {
          try { fs.unlinkSync(path.join(backupDir, old)); } catch (_) {}
        }
      }
    }
  } catch (_) {
    // Never block writes due to backup issues.
  }
  writeJsonAtomic(filePath, data, { pretty });
}

function parseDayStartMinutes(value) {
  const raw = (value || '').toString().trim();
  const m = raw.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!m) return 0;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return hh * 60 + mm;
}

function formatInTimeZoneParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const byType = {};
  parts.forEach(p => {
    if (p.type && p.value) byType[p.type] = p.value;
  });
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute
  };
}

function addDaysToIsoDate(isoDate, deltaDays) {
  const safe = (isoDate || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return safe;
  const d = new Date(`${safe}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function createJsonDAL({ dataDir }) {
  const paths = {
    dataDir,
    storeConfigFile: path.join(dataDir, 'store-config.json'),
    usersFile: path.join(dataDir, 'users.json'),
    employeesFile: path.join(dataDir, 'employees-v2.json'),
    activityLogFile: path.join(dataDir, 'activity-log.json'),
    userUploadsDir: path.join(dataDir, 'user-uploads'),
    feedbackUploadsDir: path.join(dataDir, 'feedback-uploads'),
    gameplanDailyDir: path.join(dataDir, 'gameplan-daily'),
    storeMetricsDir: path.join(dataDir, 'store-metrics'),
    productImagesCacheFile: path.join(dataDir, 'product-images-cache.json'),
	    scanPerformanceHistoryDir: path.join(dataDir, 'scan-performance-history'),
	    gameplanSettingsFile: path.join(dataDir, 'gameplan-settings.json'),
	    weeklyGoalDistributionsFile: path.join(dataDir, 'weekly-goal-distributions.json'),
      notesTemplatesFile: path.join(dataDir, 'notes-templates.json'),
	    shipmentsFile: path.join(dataDir, 'shipments.json'),
    shipmentsBackupDir: path.join(dataDir, 'shipments-backups'),
    timeoffFile: path.join(dataDir, 'time-off.json'),
    lostPunchLogFile: path.join(dataDir, 'lost-punch-log.json'),
    closingDutiesDir: path.join(dataDir, 'closing-duties'),
    closingDutiesLogFile: path.join(dataDir, 'closing-duties-log.json'),
    storeRecoveryScanLogFile: path.join(dataDir, 'store-recovery-scan-log.json'),
    storeRecoveryConfigFile: path.join(dataDir, 'store-recovery-config.json'),
    dashboardDataFile: path.join(dataDir, 'dashboard-data.json'),
    settingsFile: path.join(dataDir, 'settings.json')
  };

	  const defaults = {
	    storeId: 'sf',
	    storeName: 'San Francisco',
	    timeZone: 'America/Los_Angeles',
	    currency: 'USD',
	    dayStart: '00:00',
	    requireSaShift: false,
	    useStoreFolders: false
	  };

	  function getStoreConfig() {
	    const cfg = readJson(paths.storeConfigFile, null) || {};
	    const timeZone = (cfg.timeZone || cfg.timezone || defaults.timeZone).toString().trim() || defaults.timeZone;
	    const currency = (cfg.currency || defaults.currency).toString().trim() || defaults.currency;
	    const dayStart = (cfg.dayStart || defaults.dayStart).toString().trim() || defaults.dayStart;
	    const storeId = (cfg.storeId || defaults.storeId).toString().trim() || defaults.storeId;
	    const storeName = (cfg.storeName || defaults.storeName).toString().trim() || defaults.storeName;
	    const requireSaShift = cfg.requireSaShift === true || cfg.requireSaShift === 'true';
	    const useStoreFolders = cfg.useStoreFolders === true;

	    return {
	      ...defaults,
	      ...cfg,
	      storeId,
	      storeName,
	      timeZone,
	      currency,
	      dayStart,
	      requireSaShift,
	      useStoreFolders
	    };
	  }

  function updateStoreConfig(patch, actor = null) {
    const current = getStoreConfig();
    const next = { ...current, ...(patch || {}) };
    next.updatedAt = new Date().toISOString();
    if (actor) next.updatedBy = actor;
    writeJsonAtomic(paths.storeConfigFile, next, { pretty: true });
    return next;
  }

  function getBusinessDate(now = new Date()) {
    const cfg = getStoreConfig();
    const tz = cfg.timeZone || defaults.timeZone;
    const startMinutes = parseDayStartMinutes(cfg.dayStart);

    const parts = formatInTimeZoneParts(now, tz);
    const isoLocal = `${parts.year}-${parts.month}-${parts.day}`;
    const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);

    if (localMinutes < startMinutes) return addDaysToIsoDate(isoLocal, -1);
    return isoLocal;
  }

  function getYesterdayBusinessDate(now = new Date()) {
    return addDaysToIsoDate(getBusinessDate(now), -1);
  }

  function getBusinessDayInfo(now = new Date()) {
    const cfg = getStoreConfig();
    const tz = cfg.timeZone || defaults.timeZone;
    const startMinutes = parseDayStartMinutes(cfg.dayStart);

    const parts = formatInTimeZoneParts(now, tz);
    const isoLocal = `${parts.year}-${parts.month}-${parts.day}`;
    const localMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const nowWeekdayIndex = Object.prototype.hasOwnProperty.call(weekdayMap, weekdayShort) ? weekdayMap[weekdayShort] : 0;

    if (localMinutes < startMinutes) {
      return { date: addDaysToIsoDate(isoLocal, -1), weekdayIndex: (nowWeekdayIndex + 6) % 7 };
    }
    return { date: isoLocal, weekdayIndex: nowWeekdayIndex };
  }

  return {
    backend: 'json',
    paths,
    readJson,
    writeJsonAtomic,
    writeJsonWithBackups,
    safeReadDir,
    ensureDir,
    getStoreConfig,
    updateStoreConfig,
    getBusinessDate,
    getYesterdayBusinessDate,
    getBusinessDayInfo,
    addDaysToIsoDate
  };
}

module.exports = { createJsonDAL };
