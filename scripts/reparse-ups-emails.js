#!/usr/bin/env node
/**
 * Re-parse saved UPS email snapshots and produce a dry-run report of extracted fields.
 * Does NOT write to DB. Output: data/ups-emails/reparse-report.json
 */

const fs = require('fs');
const path = require('path');
const { UPSEmailParser } = require('../utils/ups-email-parser');

const DATA_DIR = path.join(__dirname, '..', 'data', 'ups-emails');
const OUT_FILE = path.join(__dirname, '..', 'data', 'ups-emails', 'reparse-report.json');

function readSnapshots(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const mailboxes = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  // include files at top-level too
  const filesAtRoot = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of filesAtRoot) {
    try { results.push({ mailbox: 'root', file: f, path: path.join(dir, f) }); } catch(_){}
  }
  for (const m of mailboxes) {
    const mdir = path.join(dir, m);
    const files = fs.readdirSync(mdir).filter(f => f.endsWith('.json'));
    for (const f of files) results.push({ mailbox: m, file: f, path: path.join(mdir, f) });
  }
  return results;
}

async function run() {
  const parser = new UPSEmailParser();
  const snaps = readSnapshots(DATA_DIR);
  console.log(`Found ${snaps.length} snapshot files under ${DATA_DIR}`);

  const report = { total: snaps.length, processed: 0, withTracking: 0, missingAddress: 0, missingEstimatedDelivery: 0, returns: 0, items: [] };

  for (const s of snaps) {
    try {
      const raw = JSON.parse(fs.readFileSync(s.path, 'utf8'));
      // Construct an email-like object compatible with parser
      const email = {
        subject: raw.subject || '',
        date: raw.date || null,
        from: { value: raw.from || [] },
        to: { value: raw.to || [] },
        headers: raw.headers || {},
        text: raw.text || '',
        html: raw.html || '',
        attachments: []
      };

      const details = parser.parseShipmentDetails(email);
      const status = parser.parseStatusUpdate(email);

      const item = {
        mailbox: s.mailbox,
        file: s.file,
        uid: raw.uid || null,
        subject: raw.subject || '',
        date: raw.date || null,
        trackingNumbers: details.trackingNumbers || [],
        customerName: details.customerName || '',
        address: details.address || null,
        estimatedDelivery: details.estimatedDelivery ? details.estimatedDelivery.toString() : null,
        packages: details.packages || null,
        weight: details.weight || null,
        reference1: details.reference1 || '',
        reference2: details.reference2 || '',
        orderNumber: details.orderNumber || '',
        serviceType: details.serviceType || '',
        statusFromParser: status ? status.statusText : null,
        internalStatus: status ? status.internalStatus : null
      };

      report.processed++;
      if (item.trackingNumbers.length) report.withTracking++;
      if (!item.address || !item.address.line1 || !item.address.city) report.missingAddress++;
      if (!item.estimatedDelivery) report.missingEstimatedDelivery++;
      if (item.internalStatus === 'RETURNED') report.returns++;

      report.items.push(item);
    } catch (e) {
      // record error item
      report.items.push({ mailbox: s.mailbox, file: s.file, error: e.message || String(e) });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote report to ${OUT_FILE}`);
  console.log(JSON.stringify({ total: report.total, processed: report.processed, withTracking: report.withTracking, missingAddress: report.missingAddress, missingEstimatedDelivery: report.missingEstimatedDelivery, returns: report.returns }, null, 2));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
