#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function usage() {
  console.log(`\nUsage:\n  node scripts/compare-stores-performance.js [--import]\n\nCompares Looker CSVs between:\n  - docs/dashboard-stores_performance (your manual download)\n  - files/dashboard-stores_performance (what the dashboard uses)\n\nIf --import is passed, it will copy docs/* into files/* (backup first).\n`);
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function parseSingleRowCsv(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const values = splitCsvLine(lines[1]);
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = values[i] ?? '';
  }
  return obj;
}

function splitCsvLine(line) {
  // Simple CSV splitter that handles quoted fields.
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

function parseSalesByRetailWeeks(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = values[j] ?? '';
    rows.push(obj);
  }
  return rows;
}

function statTime(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

function formatDiff(label, docsVal, filesVal) {
  const same = docsVal === filesVal;
  return {
    label,
    docsVal: docsVal ?? '(missing)',
    filesVal: filesVal ?? '(missing)',
    same,
  };
}

function printSection(title, diffs) {
  console.log(`\n== ${title} ==`);
  for (const d of diffs) {
    const marker = d.same ? 'OK ' : 'DIFF';
    console.log(`${marker}  ${d.label}: docs=${d.docsVal} | files=${d.filesVal}`);
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyWithBackup(srcDir, dstDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dstDir, `..`, `dashboard-stores_performance.backup-${stamp}`);
  ensureDir(backupDir);

  const srcFiles = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.csv'));
  for (const f of srcFiles) {
    const src = path.join(srcDir, f);
    const dst = path.join(dstDir, f);
    if (fs.existsSync(dst)) {
      fs.copyFileSync(dst, path.join(backupDir, f));
    }
    fs.copyFileSync(src, dst);
  }
  return { backupDir, copied: srcFiles.length };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(0);
  }

  const doImport = args.includes('--import');

  const repoRoot = path.join(__dirname, '..');
  const docsDir = path.join(repoRoot, 'docs', 'dashboard-stores_performance');
  const filesDir = path.join(repoRoot, 'files', 'dashboard-stores_performance');

  const keyFiles = [
    'sales.csv',
    'sales_target.csv',
    'sph.csv',
    'ipc.csv',
    'drop-offs.csv',
    'sales_by_retail_weeks.csv',
  ];

  console.log('Comparing Looker exports:');
  console.log(`- docs : ${docsDir}`);
  console.log(`- files: ${filesDir}`);

  for (const f of keyFiles) {
    const docsPath = path.join(docsDir, f);
    const filesPath = path.join(filesDir, f);
    const docsTime = statTime(docsPath);
    const filesTime = statTime(filesPath);
    console.log(`\n${f}`);
    console.log(`  docs : ${docsTime ?? '(missing)'} `);
    console.log(`  files: ${filesTime ?? '(missing)'} `);
  }

  const salesDocs = parseSingleRowCsv(readTextIfExists(path.join(docsDir, 'sales.csv')));
  const salesFiles = parseSingleRowCsv(readTextIfExists(path.join(filesDir, 'sales.csv')));
  printSection('WTD Sales card', [
    formatDiff('Sales Amount', salesDocs?.['Retail Management - Metrics Sales Amount'], salesFiles?.['Retail Management - Metrics Sales Amount']),
    formatDiff('% vs PY', salesDocs?.['Retail Management - Metrics % Sales vs PY'], salesFiles?.['Retail Management - Metrics % Sales vs PY']),
  ]);

  const targetDocs = parseSingleRowCsv(readTextIfExists(path.join(docsDir, 'sales_target.csv')));
  const targetFiles = parseSingleRowCsv(readTextIfExists(path.join(filesDir, 'sales_target.csv')));
  printSection('Target card', [
    formatDiff('Sales Amount Target', targetDocs?.['Retail Management - Metrics Sales Amount Target'], targetFiles?.['Retail Management - Metrics Sales Amount Target']),
    formatDiff('% Sales vs Target', targetDocs?.['Retail Management - Metrics % Sales vs Target'], targetFiles?.['Retail Management - Metrics % Sales vs Target']),
  ]);

  const sphDocs = parseSingleRowCsv(readTextIfExists(path.join(docsDir, 'sph.csv')));
  const sphFiles = parseSingleRowCsv(readTextIfExists(path.join(filesDir, 'sph.csv')));
  printSection('SPH card', [
    formatDiff('Sales per Hour', sphDocs?.['Retail Management - Metrics Sales per Hour'], sphFiles?.['Retail Management - Metrics Sales per Hour']),
    formatDiff('% SPH vs PY', sphDocs?.['Retail Management - Metrics % SPH vs PY'], sphFiles?.['Retail Management - Metrics % SPH vs PY']),
  ]);

  const ipcDocs = parseSingleRowCsv(readTextIfExists(path.join(docsDir, 'ipc.csv')));
  const ipcFiles = parseSingleRowCsv(readTextIfExists(path.join(filesDir, 'ipc.csv')));
  printSection('IPC card', [
    formatDiff('# Items Per Customer', ipcDocs?.['Retail Management - Metrics # Items Per Customer'], ipcFiles?.['Retail Management - Metrics # Items Per Customer']),
    formatDiff('% IPC vs PY', ipcDocs?.['Retail Management - Metrics % IPC vs PY'], ipcFiles?.['Retail Management - Metrics % IPC vs PY']),
  ]);

  const dropDocs = parseSingleRowCsv(readTextIfExists(path.join(docsDir, 'drop-offs.csv')));
  const dropFiles = parseSingleRowCsv(readTextIfExists(path.join(filesDir, 'drop-offs.csv')));
  printSection('Drop-offs card', [
    formatDiff('% Drop-Off', dropDocs?.['Retail Management - Metrics % Drop-Off'], dropFiles?.['Retail Management - Metrics % Drop-Off']),
    formatDiff('% Drop-Off vs PY', dropDocs?.['Retail Management - Metrics % Drop-Off vs PY'], dropFiles?.['Retail Management - Metrics % Drop-Off vs PY']),
  ]);

  const weeksDocs = parseSalesByRetailWeeks(readTextIfExists(path.join(docsDir, 'sales_by_retail_weeks.csv')));
  const weeksFiles = parseSalesByRetailWeeks(readTextIfExists(path.join(filesDir, 'sales_by_retail_weeks.csv')));

  const week1Docs = weeksDocs?.find((r) => String(r['Retail Week Number']).trim() === '1');
  const week1Files = weeksFiles?.find((r) => String(r['Retail Week Number']).trim() === '1');
  printSection('Retail Week 1 row (sales_by_retail_weeks.csv)', [
    formatDiff('Sales', week1Docs?.['Sales'], week1Files?.['Sales']),
    formatDiff('Sales Amount PY', week1Docs?.['Sales Amount PY'], week1Files?.['Sales Amount PY']),
    formatDiff('Target', week1Docs?.['Target'], week1Files?.['Target']),
  ]);

  if (doImport) {
    if (!fs.existsSync(docsDir)) {
      console.error(`\nCannot import: missing ${docsDir}`);
      process.exit(1);
    }
    if (!fs.existsSync(filesDir)) {
      console.error(`\nCannot import: missing ${filesDir}`);
      process.exit(1);
    }

    const { backupDir, copied } = copyWithBackup(docsDir, filesDir);
    console.log(`\nImported ${copied} CSVs from docs -> files`);
    console.log(`Backup of overwritten files: ${backupDir}`);
  }

  console.log('\nDone.');
}

main();
