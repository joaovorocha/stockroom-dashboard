#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dal = require('../utils/dal');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headerLine = lines.shift();
  const headers = headerLine.match(/(?:"([^"]*)")|([^,]+)/g).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.map(line => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (cols[i] || '').trim();
    }
    return obj;
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv[0]) {
    console.error('Usage: node import-shifts-and-prepopulate.js <csv-file> [weeks]');
    process.exit(2);
  }
  const csvPath = path.resolve(argv[0]);
  const weeks = argv[1] ? Math.max(1, Number(argv[1])) : 2;
  if (!fs.existsSync(csvPath)) {
    console.error('File not found:', csvPath);
    process.exit(2);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw);
  if (!rows.length) { console.error('No rows parsed'); process.exit(2); }

  const DATA_DIR = dal.paths.dataDir;
  const GAMEPLAN_DIR = dal.paths.gameplanDailyDir;

  const today = new Date(); today.setHours(0,0,0,0);
  const endDate = new Date(today); endDate.setDate(endDate.getDate() + (weeks * 7) - 1);

  const map = {};
  rows.forEach(r => {
    const date = (r['Final Shift Date'] || r['Initial Shift Date'] || '').trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date < today.toISOString().split('T')[0] || date > endDate.toISOString().split('T')[0]) return;
    if (!map[date]) map[date] = [];
    map[date].push(r);
  });

  const employeesFile = dal.readJson(dal.paths.employeesFile, { employees: {} });
  const allEmployees = [];
  Object.keys(employeesFile.employees || {}).forEach(t => (employeesFile.employees[t] || []).forEach(e => allEmployees.push(e)));

  for (const dateStr of Object.keys(map)) {
    const gameplanFile = path.join(GAMEPLAN_DIR, `${dateStr}.json`);
    let plan = dal.readJson(gameplanFile, null) || { date: dateStr, notes: '', assignments: {} };
    for (const row of map[dateStr]) {
      const empId = (row['Final TM Employee Id'] || row['Initial TM Employee Id'] || '').trim();
      const first = (row['Final TM First Name'] || row['Initial TM First Name'] || '').trim();
      const last = (row['Final TM Last Name'] || row['Initial TM Last Name'] || '').trim();
      const start = (row['Final Shift Start Time'] || row['Initial Shift Start Time'] || '').trim();
      const end = (row['Final Shift End Time'] || row['Initial Shift End Time'] || '').trim();

      let found = null;
      if (empId) found = allEmployees.find(e => (e.employeeId || e.id || '').toString().trim() === empId.toString().trim());
      if (!found && first && last) {
        const name = `${first} ${last}`.trim().toLowerCase();
        found = allEmployees.find(e => (e.name || '').toLowerCase() === name || ((e.name || '').toLowerCase().includes(first.toLowerCase()) && (e.name || '').toLowerCase().includes(last.toLowerCase())));
      }

      const key = found ? (found.employeeId || found.id || found.id) : (empId || `${first} ${last}`);
      if (!key) continue;
      const shiftText = start && end ? `${start}-${end}` : (start || end || '');

      plan.assignments = plan.assignments || {};
      plan.assignments[key] = plan.assignments[key] || {};
      plan.assignments[key].shift = shiftText;
      plan.assignments[key].isOff = false;
      if (found && found.type) plan.assignments[key].type = found.type;
      plan.assignments[key].prepopulated = true;
    }

    plan.savedAt = new Date().toISOString();
    plan.published = false;
    dal.writeJsonAtomic(gameplanFile, plan, { pretty: true });
    console.log('Wrote prepopulated plan for', dateStr);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
