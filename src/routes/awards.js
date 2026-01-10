const express = require('express');
const fs = require('fs');
const path = require('path');
const dal = require('../utils/dal');

const router = express.Router();

const DATA_DIR = dal.paths.dataDir;
const GAMEPLAN_DAILY_DIR = dal.paths.gameplanDailyDir;
const USERS_FILE = dal.paths.usersFile;
const EMPLOYEES_FILE = dal.paths.employeesFile;
const SETTINGS_FILE = dal.paths.settingsFile;
const LOST_PUNCH_LOG_FILE = dal.paths.lostPunchLogFile;
const CLOSING_DUTIES_LOG_FILE = dal.paths.closingDutiesLogFile;
const AWARDS_CONFIG_FILE = path.join(DATA_DIR, 'awards-config.json');

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return defaultValue;
  }
}

function toISODate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildUserMaps() {
  const usersData = readJsonFile(USERS_FILE, { users: [] });
  const users = Array.isArray(usersData.users) ? usersData.users : [];

  const userById = new Map();
  const userByEmployeeId = new Map();
  const userByName = new Map();

  users.forEach(u => {
    if (!u || !u.id) return;
    userById.set(u.id, u);
    if (u.employeeId) userByEmployeeId.set(String(u.employeeId), u);
    if (u.name) userByName.set(String(u.name).toLowerCase(), u);
  });

  return { userById, userByEmployeeId, userByName };
}

function buildRosterMap() {
  const rosterData = readJsonFile(EMPLOYEES_FILE, { employees: {} });
  const all = []
    .concat(rosterData.employees?.SA || [])
    .concat(rosterData.employees?.BOH || [])
    .concat(rosterData.employees?.MANAGEMENT || [])
    .concat(rosterData.employees?.TAILOR || []);

  const rosterByInternalId = new Map();
  all.forEach(e => {
    if (e?.id) rosterByInternalId.set(e.id, e);
  });
  return rosterByInternalId;
}

function topNFromCountMap(countByKey, resolve, limit = 5) {
  return Array.from(countByKey.entries())
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, limit)
    .map(([key, count]) => ({ ...resolve(key), count }));
}

function readTomatoStartDate() {
  const today = dal.getBusinessDate();
  const tomorrow = dal.addDaysToIsoDate(today, 1);
  const cfg = readJsonFile(AWARDS_CONFIG_FILE, null) || {};
  const raw = (cfg.tomatoStartDate || '').toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return tomorrow;
}

function readTomatoResetAtMs() {
  const cfg = readJsonFile(AWARDS_CONFIG_FILE, null) || {};
  const raw = (cfg.tomatoResetAt || '').toString().trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

router.get('/tomato', (req, res) => {
  const windowDays = clampInt(req.query.days, 1, 180, 30);
  // Use store business day (timezone + dayStart aware) instead of UTC dates.
  const endDate = dal.getBusinessDate();
  const startDate = dal.addDaysToIsoDate(endDate, -(windowDays - 1));
  const tomatoStartDate = readTomatoStartDate();
  const tomatoResetAtMs = readTomatoResetAtMs();
  const effectiveStartDate = tomatoStartDate > startDate ? tomatoStartDate : startDate;

  const { userById, userByEmployeeId, userByName } = buildUserMaps();
  const rosterByInternalId = buildRosterMap();
  const settings = readJsonFile(SETTINGS_FILE, {});
  const storeClosingSections = Array.isArray(settings.closingSections) ? settings.closingSections : [];

  const lostPunchLog = readJsonFile(LOST_PUNCH_LOG_FILE, []);
  const closingDutiesLog = readJsonFile(CLOSING_DUTIES_LOG_FILE, []);

  const inWindow = dateStr => typeof dateStr === 'string' && dateStr >= effectiveStartDate && dateStr <= endDate;
  const isAfterReset = (iso) => {
    if (!tomatoResetAtMs) return true;
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return true;
    return t >= tomatoResetAtMs;
  };

  // 1) Lost punch "offenders" (most submissions)
  const lostPunchCountByUserId = new Map();
  if (Array.isArray(lostPunchLog)) {
    lostPunchLog.forEach(entry => {
      if (!entry || !inWindow(entry.missedDate)) return;
      if (!isAfterReset(entry.submittedAt)) return;
      const userId = (entry.employeeUserId || '').toString();
      if (!userId) return;
      lostPunchCountByUserId.set(userId, (lostPunchCountByUserId.get(userId) || 0) + 1);
    });
  }

  const resolveUser = userId => {
    const u = userById.get(userId);
    return {
      userId,
      name: u?.name || 'Unknown',
      imageUrl: u?.imageUrl || null
    };
  };

  // Index closing duty submissions by date -> byUser -> sections; and date -> any sections
  const submissionsByDate = new Map();
  if (Array.isArray(closingDutiesLog)) {
    closingDutiesLog.forEach(entry => {
      const date = entry?.date;
      const section = entry?.section;
      const userId = entry?.userId;
      if (!inWindow(date)) return;
      // Don't count "missed" closing duties for the current store day (it's still in progress).
      if (date === endDate) return;
      if (!isAfterReset(entry?.submittedAt)) return;
      if (!date || !section) return;

      let bucket = submissionsByDate.get(date);
      if (!bucket) {
        bucket = { byUser: new Map(), any: new Set() };
        submissionsByDate.set(date, bucket);
      }

      bucket.any.add(section);

      if (!userId) return;
      let set = bucket.byUser.get(userId);
      if (!set) {
        set = new Set();
        bucket.byUser.set(userId, set);
      }
      set.add(section);
    });
  }

  // 2) Closing duties missed by employee (assigned in Game Plan, not submitted)
  const closingMissCountByUserId = new Map();

  // 3) Unassigned/open closing duties that were not submitted (manager accountability)
  const unassignedMissCountByManagerKey = new Map();

  // Iterate store days
  for (let i = 0; i < windowDays; i++) {
    const date = dal.addDaysToIsoDate(startDate, i);
    if (date < effectiveStartDate || date > endDate) continue;
    if (date === endDate) continue;
    const gameplanFile = path.join(GAMEPLAN_DAILY_DIR, `${date}.json`);
    if (!fs.existsSync(gameplanFile)) continue;

    const gp = readJsonFile(gameplanFile, null);
    if (!gp?.published || !gp?.assignments) continue;

    const assignedUnion = new Set();
    const assignedByUserId = new Map(); // userId -> Set(section)

    for (const [internalId, assignment] of Object.entries(gp.assignments || {})) {
      const sections = assignment?.closingSections;
      if (!Array.isArray(sections) || sections.length === 0) continue;

      const rosterEmp = rosterByInternalId.get(internalId);
      const employeeId = rosterEmp?.employeeId ? String(rosterEmp.employeeId) : null;
      const user = employeeId ? userByEmployeeId.get(employeeId) : null;
      const userId = user?.id || null;
      if (!userId) continue;

      let set = assignedByUserId.get(userId);
      if (!set) {
        set = new Set();
        assignedByUserId.set(userId, set);
      }

      sections.forEach(s => {
        if (!s) return;
        set.add(s);
        assignedUnion.add(s);
      });
    }

    const bucket = submissionsByDate.get(date);
    for (const [userId, assignedSet] of assignedByUserId.entries()) {
      const submittedSet = bucket?.byUser?.get(userId) || new Set();
      let missed = 0;
      assignedSet.forEach(section => {
        if (!submittedSet.has(section)) missed += 1;
      });
      if (missed > 0) {
        closingMissCountByUserId.set(userId, (closingMissCountByUserId.get(userId) || 0) + missed);
      }
    }

    if (storeClosingSections.length) {
      const unassigned = storeClosingSections.filter(s => !assignedUnion.has(s));
      const submittedAny = bucket?.any || new Set();
      const missedUnassigned = unassigned.filter(section => !submittedAny.has(section)).length;
      if (missedUnassigned > 0) {
        const managerName = (gp.lastEditedBy || '').toString().trim();
        const managerUser = managerName ? userByName.get(managerName.toLowerCase()) : null;
        const managerKey = managerUser?.id || managerName || 'Unknown';
        unassignedMissCountByManagerKey.set(managerKey, (unassignedMissCountByManagerKey.get(managerKey) || 0) + missedUnassigned);
      }
    }
  }

  const lostPunch = topNFromCountMap(lostPunchCountByUserId, resolveUser, 5);
  const closingMissed = topNFromCountMap(closingMissCountByUserId, resolveUser, 5);
  const unassignedMissed = topNFromCountMap(
    unassignedMissCountByManagerKey,
    key => {
      // key can be a userId or a name fallback
      const u = userById.get(key);
      if (u) return { userId: u.id, name: u.name || 'Unknown', imageUrl: u.imageUrl || null };
      return { userId: null, name: key || 'Unknown', imageUrl: null };
    },
    5
  );

  return res.json({
    windowDays,
    startDate: effectiveStartDate,
    endDate,
    tomatoStartDate,
    lostPunch,
    closingMissed,
    unassignedMissed
  });
});

module.exports = router;
