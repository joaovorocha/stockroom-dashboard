#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const conn = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || 'postgresql://suit:suit2024@localhost:5432/stockroom_dashboard';
const pool = new Pool({ connectionString: conn });

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_scan_assignments (
        id serial PRIMARY KEY,
        date text NOT NULL,
        employee_id text NOT NULL,
        assigned_by text,
        assigned_at timestamptz,
        active boolean DEFAULT true,
        UNIQUE(date, employee_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS store_counts (
        id serial PRIMARY KEY,
        status text,
        count_id text,
        store_load boolean,
        location_id text,
        organization_id text,
        created_date text,
        overhead_read_included_from text,
        counted_by text,
        different_location_units integer,
        expected_units bigint,
        counted_units bigint,
        missed_available integer,
        missed_reserved integer,
        new_units bigint,
        found_prev_missed bigint,
        undecodable_units integer,
        unmapped_item_units integer
      )
    `);
  } finally {
    client.release();
  }
}

function parseCsvLine(line, headers) {
  const parts = line.split(',');
  const obj = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = (parts[i] || '').trim();
  return obj;
}

async function importCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.log('CSV not found, skipping import:', csvPath);
    return;
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    console.error('No data in CSV');
    return;
  }
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(l => parseCsvLine(l, headers));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertText = `INSERT INTO store_counts (
      status, count_id, store_load, location_id, organization_id, created_date, overhead_read_included_from, counted_by,
      different_location_units, expected_units, counted_units, missed_available, missed_reserved, new_units, found_prev_missed,
      undecodable_units, unmapped_item_units
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`;

    for (const r of rows) {
      const vals = [
        r.Status || null,
        r['Count ID'] || null,
        r['Store Load'] === 'true',
        r['Location ID'] || null,
        r['Organization ID'] || null,
        r['Created Date'] || null,
        r['Overhead Read Included From'] || null,
        r['Counted By'] || null,
        Number(r['Different Location Units'] || 0) || 0,
        Number((r['Expected Units'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Counted Units'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Missed Units that were in Available status'] || r['Missed (Available)'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Missed Units that were in Reserved status'] || r['Missed (Reserved)'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['New Units'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Found previously Missed Units'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Undecodable Units'] || '').replace(/[^0-9.-]/g, '')) || 0,
        Number((r['Unmapped Item Units'] || '').replace(/[^0-9.-]/g, '')) || 0
      ];
      await client.query(insertText, vals);
    }

    await client.query('COMMIT');
    console.log(`Imported ${rows.length} rows into store_counts`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Import failed:', e);
  } finally {
    client.release();
  }
}

(async () => {
  try {
    await ensureTables();
    const csvPath = path.join(__dirname, '..', 'data', 'StoreCount.csv');
    await importCsv(csvPath);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
