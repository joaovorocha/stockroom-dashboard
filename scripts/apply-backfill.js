const fs = require('fs');
const path = require('path');
const pgDal = require('../utils/dal/pg');

async function main() {
  const base = path.join(__dirname, '..', 'data', 'ups-emails');
  const verPath = path.join(base, 'verification-report.json');
  if (!fs.existsSync(verPath)) {
    console.error('Missing verification report:', verPath);
    process.exit(1);
  }

  const ver = JSON.parse(fs.readFileSync(verPath, 'utf8'));
  const items = ver.items || [];

  pgDal.initPool();

  const applied = [];

  for (const it of items) {
    if (!it.safeToApply) continue;
    try {
      const existing = it.existingId ? await pgDal.getShipmentById(it.existingId) : null;
      // Re-check safety: require incoming status_updated_at to be newer if present
      const newTs = it.proposed.status_updated_at || it.proposed.statusUpdatedAt || null;
      const existingTs = existing ? (existing.status_updated_at || null) : null;
      if (newTs && existingTs && new Date(newTs) <= new Date(existingTs)) {
        console.log('Skipping (no longer newer):', it.tracking);
        continue;
      }

      const updates = {};
      for (const [k, v] of Object.entries(it.proposed)) {
        // map camelCase to snake_case for DB columns
        const dbKey = k.includes('_') ? k : k.replace(/([A-Z])/g, '_$1').toLowerCase();
        // normalize timestamp-like fields to ISO strings to avoid formatting diffs
        if (dbKey.endsWith('_at') || dbKey === 'status_updated_at' || dbKey === 'estimated_delivery_at') {
          updates[dbKey] = v ? new Date(v).toISOString() : null;
          continue;
        }
        // preserve ups_raw_response as JSON object when possible
        if (dbKey === 'ups_raw_response') {
          if (!v) {
            updates[dbKey] = null;
          } else if (typeof v === 'string') {
            try {
              updates[dbKey] = JSON.parse(v);
            } catch (e) {
              updates[dbKey] = { html: v };
            }
          } else {
            updates[dbKey] = v;
          }
          continue;
        }
        updates[dbKey] = v;
      }

      // log what we will write for audit
      console.log('Applying to', it.tracking, 'id=', it.existingId || 'new', 'updates=', Object.keys(updates));

      if (it.existingId) {
        const before = existing;
        const after = await pgDal.updateShipment(it.existingId, updates);
        applied.push({ action: 'update', tracking: it.tracking, id: it.existingId, before, after });
      } else {
        // create path (unlikely in current dry-run) — build minimal shipment
        const created = await pgDal.createShipment(Object.assign({ tracking_number: it.tracking }, it.proposed));
        applied.push({ action: 'create', tracking: it.tracking, id: created.id, created });
      }
    } catch (err) {
      console.error('Error applying', it.tracking, err && err.message);
    }
  }

  const out = path.join(base, 'applied-backfill.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), applied }, null, 2));
  console.log('Wrote applied changes to', out);
}

main().catch(err => { console.error(err); process.exit(2); });
