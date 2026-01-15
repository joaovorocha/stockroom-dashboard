#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pgDal = require('../utils/dal/pg');

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes; continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => (s || '').toString().trim());
}

function findValue(row, candidates) {
  for (const k of candidates) {
    for (const hk of Object.keys(row)) {
      if (hk.includes(k)) return row[hk];
    }
  }
  return '';
}

async function run(csvPath) {
  const abs = path.resolve(csvPath);
  if (!fs.existsSync(abs)) {
    console.error('CSV not found:', abs);
    process.exit(2);
  }
  const csvText = fs.readFileSync(abs, 'utf8');
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    console.error('CSV too short'); process.exit(2);
  }
  const headers = parseLine(lines[0]).map(h => (h || '').toString().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j] || `c${j}`] = cols[j] || '';
    rows.push(obj);
  }

  const trackingCandidates = ['tracking', 'tracking_number', 'tracking#', 'trackingno', 'trackingnumber', 'tracking_no', 'url'];
  const dateCandidates = ['date', 'status_date', 'delivered_date', 'ship_date', 'scandate', 'scan_date', 'updated_at', 'request end time'];
  const statusCandidates = ['status', 'status_text', 'statusfromups'];
  const nameCandidates = ['customer', 'recipient', 'ship_to', 'shipto', 'name'];
  const shipperCandidates = ['shipper', 'from', 'sender'];

  let inserted = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const rawTracking = findValue(row, trackingCandidates) || '';
      
      let tracking = '';
      if (rawTracking.includes('track?tracknum=')) {
        tracking = new URL(rawTracking).searchParams.get('tracknum');
      } else {
        // Fallback for URLs where it might be in the path
        const parts = rawTracking.split('/');
        const lastPart = parts[parts.length - 1] || parts[parts.length - 2] || '';
        if (lastPart.length > 10 && lastPart.startsWith('1Z')) { // Looks like a UPS number
          tracking = lastPart;
        }
      }
      tracking = (tracking || '').toString().trim().toUpperCase();

      console.log(`[Importer] Processing URL:"${rawTracking}", Found Tracking #: "${tracking}"`); // DEBUG LOG
      if (!tracking) { skipped++; continue; }

      const rawDate = findValue(row, dateCandidates) || '';
      let csvDate = null;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) csvDate = d;
      }

      const existing = await pgDal.getShipmentByTracking(tracking);

      if (!existing) {
        const shipmentData = {
          tracking_number: tracking,
          carrier: 'UPS',
          status: (findValue(row, statusCandidates) || 'label-created').toString().toLowerCase(),
          status_from_ups: findValue(row, statusCandidates) || '',
          status_updated_at: csvDate ? csvDate.toISOString() : new Date().toISOString(),
          status_updated_source: 'csv-import',
          source: 'csv-import',
          imported_at: new Date().toISOString(),
          shipped_at: csvDate ? csvDate.toISOString() : null,
          customer_name: findValue(row, nameCandidates) || '',
          customer_address: null,
          order_number: findValue(row, ['order', 'order_number']) || '',
          service_type: findValue(row, ['service', 'service_type']) || '',
          package_count: Number(findValue(row, ['packages', 'package_count'])) || null,
          package_weight_lbs: Number((findValue(row, ['weight', 'package_weight']) || '').replace(/[a-zA-Z]/g, '')) || null,
          reference_1: findValue(row, ['reference', 'reference_1']) || '',
          reference_2: findValue(row, ['reference2', 'reference_2']) || '',
          processed_by_id: null,
          processed_by_name: null,
          shipper: findValue(row, shipperCandidates) || '',
          origin_location: findValue(row, ['origin']) || '',
          destination_location: findValue(row, ['destination']) || '',
          estimated_delivery_at: csvDate ? csvDate.toISOString() : null,
          notes: 'Imported from CSV via admin-csv-importer script'
        };
        await pgDal.createShipment(shipmentData);
        inserted++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push(e && e.message ? e.message : String(e));
    }
  }

  console.log('done', { inserted, updated, skipped, errors });
}

const csv = process.argv[2] || 'docs/printlabel.suitapi.com_01-09-2026-17-34-37.csv';
run(csv).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(2); });
