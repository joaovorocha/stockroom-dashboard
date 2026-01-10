const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const GAMEPLAN_DIR = path.join(DATA_DIR, 'gameplan-daily');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees-v2.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'gameplan-settings.json');

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function todayLocalIso() {
  // Store/local date (avoids UTC off-by-one)
  return new Date().toLocaleDateString('en-CA');
}

function ensureList(settings, key, count, factory) {
  if (!settings[key]) settings[key] = [];
  const list = settings[key];
  while (list.length < count) {
    list.push(factory(list.length));
  }
  return list;
}

function names(list) {
  return (list || []).map(x => (x && x.name ? x.name : x)).filter(Boolean);
}

function pick(arr, idx) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[idx % arr.length];
}

function main() {
  const date = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayLocalIso();
  const force = process.argv.includes('--force');

  const outFile = path.join(GAMEPLAN_DIR, `${date}.json`);
  if (fs.existsSync(outFile) && !force) {
    console.error(`Refusing to overwrite existing ${outFile}. Use --force to overwrite.`);
    process.exit(1);
  }

  const employeesData = readJson(EMPLOYEES_FILE, { employees: {} });
  const settings = readJson(SETTINGS_FILE, {});

  const sa = employeesData.employees?.SA || [];
  const boh = employeesData.employees?.BOH || [];
  const mgmt = employeesData.employees?.MANAGEMENT || [];
  const tailors = employeesData.employees?.TAILOR || [];

  const totalPeople = sa.length + boh.length + mgmt.length + tailors.length;

  // Ensure enough options so nothing ends up blank and unique-locked fields can still be unique.
  ensureList(settings, 'zones', Math.max(5, Math.ceil(sa.length / 2)), (i) => ({ name: `TEST Zone ${i + 1}` }));
  ensureList(settings, 'fittingRooms', Math.max(sa.length, 5), (i) => ({ name: `TEST FR ${i + 1}` }));
  ensureList(settings, 'closingSections', Math.max(totalPeople, 12), (i) => ({ name: `TEST Closing Duty ${i + 1}` }));
  ensureList(settings, 'lunchTimes', Math.max(totalPeople, 12), (i) => `12:${String((i * 5) % 60).padStart(2, '0')}`);
  ensureList(settings, 'shifts', Math.max(6, 6), (i) => ({ name: `TEST Shift ${i + 1}` }));
  ensureList(settings, 'tailorStations', Math.max(tailors.length, 4), (i) => ({ name: `TEST Station ${i + 1}` }));

  settings.__seededAt = new Date().toISOString();
  settings.__seedNote = 'Auto-filled by utils/fill-today-gameplan.js for testing.';
  writeJson(SETTINGS_FILE, settings);

  const zoneNames = names(settings.zones);
  const fittingRoomNames = names(settings.fittingRooms);
  const closingDutyNames = names(settings.closingSections);
  const lunchTimes = settings.lunchTimes || [];
  const shiftNames = names(settings.shifts);
  const stationNames = names(settings.tailorStations);

  // Unique pools
  const availableFittingRooms = [...fittingRoomNames];
  const availableDuties = [...closingDutyNames];

  const assignments = {};

  sa.forEach((emp, idx) => {
    if (!emp?.id) return;
    const zones = [pick(zoneNames, idx), pick(zoneNames, idx + 2)].filter(Boolean);
    assignments[emp.id] = {
      type: 'SA',
      zones,
      zone: zones[0] || '',
      fittingRoom: availableFittingRooms.shift() || pick(fittingRoomNames, idx) || 'TEST FR',
      scheduledLunch: pick(lunchTimes, idx) || '12:00',
      individualTarget: 1000 + idx * 100,
      closingSections: [availableDuties.shift()].filter(Boolean)
    };
  });

  boh.forEach((emp, idx) => {
    if (!emp?.id) return;
    assignments[emp.id] = {
      type: 'BOH',
      shift: pick(shiftNames, idx) || 'TEST Shift',
      lunch: pick(lunchTimes, idx + sa.length) || '12:30',
      taskOfTheDay: `TEST Task ${idx + 1}`,
      closingSections: [availableDuties.shift()].filter(Boolean)
    };
  });

  mgmt.forEach((emp, idx) => {
    if (!emp?.id) return;
    assignments[emp.id] = {
      type: 'MANAGEMENT',
      role: idx === 0 ? 'MOD' : 'HOST',
      shift: pick(shiftNames, idx + 2) || 'TEST Shift',
      lunch: pick(lunchTimes, idx + sa.length + boh.length) || '13:00',
      closingSections: [availableDuties.shift()].filter(Boolean)
    };
  });

  tailors.forEach((emp, idx) => {
    if (!emp?.id) return;
    assignments[emp.id] = {
      type: 'TAILOR',
      station: pick(stationNames, idx) || 'TEST Station',
      lunch: pick(lunchTimes, idx + sa.length + boh.length + mgmt.length) || '13:30',
      closingSections: [availableDuties.shift()].filter(Boolean)
    };
  });

  // Ensure no blanks in closingSections arrays
  Object.keys(assignments).forEach((id, idx) => {
    if (!assignments[id].closingSections || assignments[id].closingSections.length === 0) {
      assignments[id].closingSections = [pick(closingDutyNames, idx) || 'TEST Closing Duty'];
    }
  });

  const plan = {
    date,
    published: true,
    notes: `<p><b>TEST DATA</b> full auto-fill for ${date}.</p><p>Everything is filled (zones, lunches, shifts, roles, stations, closing duties).</p>`,
    assignments,
    savedAt: new Date().toISOString(),
    lastEditedBy: 'fill-today-gameplan',
    lastEditedAt: new Date().toISOString()
  };

  writeJson(outFile, plan);
  console.log(`Wrote ${outFile} with ${Object.keys(assignments).length} filled assignments.`);
  console.log(`Updated ${SETTINGS_FILE} with TEST options if needed.`);
}

main();

