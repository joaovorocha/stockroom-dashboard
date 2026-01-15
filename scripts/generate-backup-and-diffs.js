const fs = require('fs');
const path = require('path');
const pgDal = require('../utils/dal/pg');

function toSnakeCase(s) {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function normalizeVal(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

async function main() {
  const base = path.join(__dirname, '..', 'data', 'ups-emails');
  const dryPath = path.join(base, 'backfill-dryrun.json');
  if (!fs.existsSync(dryPath)) {
    console.error('Missing dry-run file:', dryPath);
    process.exit(1);
  }

  const dry = JSON.parse(fs.readFileSync(dryPath, 'utf8'));
  const items = dry.items || [];

  pgDal.initPool();

  const ids = new Set();
  for (const it of items) {
    if (it.existingId) ids.add(it.existingId);
  }

  const backups = [];
  for (const id of Array.from(ids)) {
    try {
      const row = await pgDal.getShipmentById(id);
      backups.push({ id, row });
    } catch (err) {
      console.error('Error fetching id', id, err && err.message);
    }
  }

  // Write DB backup
  const backupPath = path.join(base, 'db-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: backups.length, backups }, null, 2));
  console.log('Wrote DB backup to', backupPath);

  // Build verification report with per-field diffs and safety heuristic
  const ver = { generatedAt: new Date().toISOString(), items: [] };

  for (const it of items) {
    const existing = it.existingId ? (backups.find(b => b.id === it.existingId) || {}).row || null : null;
    const proposed = it.updates || {};

    const diffs = [];
    for (const key of Object.keys(proposed)) {
      const propVal = proposed[key] === undefined ? null : proposed[key];
      let existingVal = existing ? (existing[key] !== undefined ? existing[key] : undefined) : undefined;
      if (existingVal === undefined && existing) {
        const snake = toSnakeCase(key);
        existingVal = existing[snake] !== undefined ? existing[snake] : existing[snake + '_at'] !== undefined ? existing[snake + '_at'] : existingVal;
      }
      const before = normalizeVal(existingVal);
      const after = normalizeVal(propVal);
      diffs.push({ field: key, before, after, changed: String(before) !== String(after) });
    }

    // Safety heuristic: prefer updates with newer status_updated_at or estimated_delivery_at
    let safe = false;
    try {
      const newTs = proposed.status_updated_at || proposed.statusUpdatedAt || proposed.statusUpdatedAt || proposed.status_updated_at;
      const existingTs = existing ? (existing.status_updated_at || existing.statusUpdatedAt || null) : null;
      if (newTs && (!existingTs || new Date(newTs) > new Date(existingTs))) safe = true;
      if (!newTs && Object.keys(proposed).length > 0) safe = true; // non-status metadata updates allowed
    } catch (e) {
      safe = false;
    }

    ver.items.push({ action: it.action, tracking: it.tracking, existingId: it.existingId || null, file: it.file || null, proposed: proposed, diffs, safeToApply: safe });
  }

  const verPath = path.join(base, 'verification-report.json');
  fs.writeFileSync(verPath, JSON.stringify(ver, null, 2));
  console.log('Wrote verification report to', verPath);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
