const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const GAMEPLAN_DIR = path.join(DATA_DIR, 'gameplan-daily');

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function todayLocalIso() {
  return new Date().toLocaleDateString('en-CA');
}

function main() {
  const date = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayLocalIso();
  const outFile = path.join(GAMEPLAN_DIR, `${date}.json`);

  const plan = {
    date,
    published: false,
    notes: '',
    assignments: {},
    clearedAt: new Date().toISOString(),
    lastEditedBy: 'clear-gameplan-date'
  };

  writeJson(outFile, plan);
  console.log(`Cleared ${outFile}`);
}

main();

