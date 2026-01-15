#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { initPool, getShipmentById } = require('../utils/dal/pg');

function envOr(name, fallback) {
  return process.env[name] || fallback;
}

async function main() {
  const dbConfig = {
    host: envOr('DB_HOST', 'localhost'),
    port: envOr('DB_PORT', '5432'),
    database: envOr('DB_NAME', 'stockroom_dashboard'),
    user: envOr('DB_USER', ''),
    password: envOr('DB_PASSWORD', ''),
    ssl: envOr('DB_SSL', 'false') === 'true'
  };

  initPool(dbConfig);

  const appliedPath = path.join(__dirname, '..', 'data', 'ups-emails', 'applied-backfill.json');
  if (!fs.existsSync(appliedPath)) {
    console.error('applied-backfill.json not found at', appliedPath);
    process.exit(2);
  }

  const applied = JSON.parse(fs.readFileSync(appliedPath, 'utf8'));
  const results = [];

  for (const item of applied.applied || []) {
    const id = item.id;
    if (!id) continue;
    try {
      console.log('Checking id', id);
      // `getShipmentById` returns the row object (or null), not a pg Result
      const db = await getShipmentById(id);

      const before = item.before || {};
      const after = item.after || {};

      const diffs = [];

      // helper for safe date comparison
      function datesEqualSafe(a, b) {
        if (a === null && b === null) return true;
        if (!a || !b) return false;
        const da = new Date(a);
        const db = new Date(b);
        if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
        return da.toISOString() === db.toISOString();
      }

      // Check key fields
      const keys = ['status_from_ups', 'status_updated_at', 'estimated_delivery_at', 'ups_raw_response', 'returned'];
      for (const k of keys) {
        const want = after[k] === undefined ? null : after[k];
        const have = db ? db[k] : null;
        let equal = false;
        if (k === 'ups_raw_response') {
          equal = !!want === !!have; // presence check
        } else if (k && (k.toLowerCase().includes('date') || k.toLowerCase().includes('at') || k.endsWith('_at'))) {
          equal = datesEqualSafe(want, have);
        } else {
          equal = String(want) === String(have);
        }
        if (!equal) diffs.push({ field: k, expected: want, found: have });
      }

      results.push({ id, tracking: item.tracking || after.tracking_number || after.tracking, diffs, ok: diffs.length === 0 });
    } catch (err) {
      results.push({ id, tracking: item.tracking || (item.after && item.after.tracking_number), error: (err && err.stack) ? err.stack : String(err) });
    }
  }

  const out = { checkedAt: new Date().toISOString(), results };
  const outPath = path.join(__dirname, '..', 'data', 'ups-emails', 'verification-db-check.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote verification DB check to', outPath);
  const failures = results.filter(r => !r.ok);
  console.log(`Total checked: ${results.length}, failures: ${failures.length}`);
  if (failures.length > 0) process.exitCode = 3;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
