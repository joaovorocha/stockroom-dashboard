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

function getYesterdayDateStrUtc() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function pick(arr, idx) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[idx % arr.length];
}

function main() {
  const date = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
    ? process.argv[2]
    : getYesterdayDateStrUtc();

  const filePath = path.join(GAMEPLAN_DIR, `${date}.json`);
  const existing = readJson(filePath, null);

  const employeesData = readJson(EMPLOYEES_FILE, { employees: {} });
  const settings = readJson(SETTINGS_FILE, {});

  const closingSections = (settings.closingSections || []).map(cs => cs.name).filter(Boolean);
  const zones = (settings.zones || []).map(z => z.name).filter(Boolean);
  const fittingRooms = (settings.fittingRooms || []).map(fr => fr.name).filter(Boolean);
  const lunchTimes = (settings.lunchTimes || []).filter(Boolean);
  const shifts = (settings.shifts || []).map(s => s.name).filter(Boolean);

  const plan = existing && typeof existing === 'object'
    ? existing
    : { date, notes: '', assignments: {}, published: true };

  plan.date = date;
  plan.published = true;
  plan.savedAt = new Date().toISOString();
  plan.lastEditedBy = 'test-seed';
  plan.lastEditedAt = new Date().toISOString();

  const stamp = `<p><b>TEST DATA</b> added automatically (${new Date().toLocaleString()}).</p>`;
  plan.notes = `${stamp}${plan.notes || ''}`;

  if (!plan.assignments || typeof plan.assignments !== 'object') plan.assignments = {};

  const firstSa = (employeesData.employees?.SA || []).find(e => e?.id);
  if (firstSa) {
    plan.assignments[firstSa.id] = {
      ...(plan.assignments[firstSa.id] || {}),
      type: 'SA',
      zones: [pick(zones, 0), pick(zones, 1)].filter(Boolean),
      zone: pick(zones, 0) || '',
      fittingRoom: pick(fittingRooms, 0) || '',
      scheduledLunch: pick(lunchTimes, 0) || '',
      individualTarget: 1234,
      closingSections: [pick(closingSections, 0), pick(closingSections, 1)].filter(Boolean)
    };
  }

  const firstBoh = (employeesData.employees?.BOH || []).find(e => e?.id);
  if (firstBoh) {
    plan.assignments[firstBoh.id] = {
      ...(plan.assignments[firstBoh.id] || {}),
      type: 'BOH',
      shift: pick(shifts, 0) || '',
      lunch: pick(lunchTimes, 1) || '',
      taskOfTheDay: 'TEST: verify copy-from-yesterday',
      closingSections: [pick(closingSections, 2), pick(closingSections, 3)].filter(Boolean)
    };
  }

  writeJson(filePath, plan);
  console.log(`Updated yesterday gameplan: ${filePath}`);
}

main();

