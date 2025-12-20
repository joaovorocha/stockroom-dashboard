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
  } catch (e) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function pick(arr, i) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[i % arr.length];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function main() {
  const date = process.argv[2];
  const force = process.argv.includes('--force');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: node utils/seed-gameplan-date.js YYYY-MM-DD [--force]');
    process.exit(1);
  }

  const outFile = path.join(GAMEPLAN_DIR, `${date}.json`);
  if (fs.existsSync(outFile) && !force) {
    console.error(`Refusing to overwrite existing ${outFile}. Use --force to overwrite.`);
    process.exit(1);
  }

  const employeesData = readJson(EMPLOYEES_FILE, { employees: {} });
  const settings = readJson(SETTINGS_FILE, {});

  const zones = (settings.zones || []).map(z => z.name).filter(Boolean);
  const fittingRooms = (settings.fittingRooms || []).map(fr => fr.name).filter(Boolean);
  const closingSections = (settings.closingSections || []).map(cs => cs.name).filter(Boolean);
  const lunchTimes = (settings.lunchTimes || []).filter(Boolean);
  const shifts = (settings.shifts || []).map(s => s.name).filter(Boolean);

  const assignments = {};

  const sa = (employeesData.employees?.SA || []).slice(0, 6);
  const boh = (employeesData.employees?.BOH || []).slice(0, 4);
  const mgmt = (employeesData.employees?.MANAGEMENT || []).slice(0, 3);

  const availableDuties = shuffle(closingSections);
  const availableRooms = shuffle(fittingRooms);

  sa.forEach((emp, idx) => {
    const empId = emp.id;
    if (!empId) return;
    const zone1 = pick(zones, idx);
    const zone2 = pick(zones, idx + 2);
    const zonesPicked = [zone1, zone2].filter(Boolean).slice(0, idx % 2 === 0 ? 2 : 1);
    const duties = availableDuties.splice(0, 2);

    assignments[empId] = {
      type: 'SA',
      zones: zonesPicked,
      zone: zonesPicked[0] || '',
      fittingRoom: availableRooms.shift() || '',
      scheduledLunch: pick(lunchTimes, idx) || '',
      individualTarget: 500 + idx * 150,
      closingSections: duties
    };
  });

  boh.forEach((emp, idx) => {
    const empId = emp.id;
    if (!empId) return;
    const duties = availableDuties.splice(0, 2);
    assignments[empId] = {
      type: 'BOH',
      shift: pick(shifts, idx) || '',
      lunch: pick(lunchTimes, idx + 3) || '',
      taskOfTheDay: `Test task ${idx + 1}`,
      closingSections: duties
    };
  });

  mgmt.forEach((emp, idx) => {
    const empId = emp.id;
    if (!empId) return;
    const duties = availableDuties.splice(0, 1);
    assignments[empId] = {
      type: 'MANAGEMENT',
      role: idx === 0 ? 'MOD' : 'HOST',
      shift: pick(shifts, idx + 2) || '',
      lunch: pick(lunchTimes, idx + 1) || '',
      closingSections: duties
    };
  });

  const plan = {
    date,
    published: true,
    notes: `<p><b>TEST DATA</b> for copy feature (${date}).</p><p>Use Copy from Yesterday with <code>?copyDate=${date}</code>.</p>`,
    assignments,
    savedAt: new Date().toISOString(),
    lastEditedBy: 'seed-script',
    lastEditedAt: new Date().toISOString()
  };

  writeJson(outFile, plan);
  console.log(`Seeded ${outFile} with ${Object.keys(assignments).length} assignments.`);
}

main();

