#!/usr/bin/env node
/**
 * Dry-run backfill: parse saved UPS snapshots and propose DB create/update operations.
 * Does NOT write to DB. Output: data/ups-emails/backfill-dryrun.json
 */

const fs = require('fs');
const path = require('path');
const { UPSEmailParser } = require('../utils/ups-email-parser');
const pgDal = require('../utils/dal/pg');

const DATA_DIR = path.join(__dirname, '..', 'data', 'ups-emails');
const OUT_FILE = path.join(DATA_DIR, 'backfill-dryrun.json');

function readSnapshots(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const mailboxes = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const filesAtRoot = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of filesAtRoot) results.push({ mailbox: 'root', file: f, path: path.join(dir, f) });
  for (const m of mailboxes) {
    const mdir = path.join(dir, m);
    const files = fs.readdirSync(mdir).filter(f => f.endsWith('.json'));
    for (const f of files) results.push({ mailbox: m, file: f, path: path.join(mdir, f) });
  }
  return results;
}

function statusRank(status) {
  const order = { UNKNOWN: 0, REQUESTED: 1, PENDING: 1, LABEL_CREATED: 2, IN_TRANSIT: 3, DELIVERED: 4, EXCEPTION: 5, RETURNED: 6 };
  return order[(status || '').toString().toUpperCase()] || 0;
}

async function run() {
  const parser = new UPSEmailParser();
  const snaps = readSnapshots(DATA_DIR);
  console.log(`Found ${snaps.length} snapshots`);

  const report = { totalSnapshots: snaps.length, totalTrackings: 0, creates: 0, updates: 0, items: [] };

  for (const s of snaps) {
    try {
      const raw = JSON.parse(fs.readFileSync(s.path, 'utf8'));
      const email = {
        subject: raw.subject || '',
        date: raw.date || null,
        from: { value: raw.from || [] },
        to: { value: raw.to || [] },
        headers: raw.headers || {},
        text: raw.text || '',
        html: raw.html || '',
        attachments: raw.attachments || []
      };

      const details = parser.parseShipmentDetails(email);
      const status = parser.parseStatusUpdate(email);

      for (const tracking of details.trackingNumbers || []) {
        report.totalTrackings++;

        // build proposed shipment data (same keys used by pgDal.createShipment)
        const shipmentData = {
          tracking_number: tracking,
          carrier: 'UPS',
          status: status?.internalStatus || 'LABEL_CREATED',
          status_from_ups: status?.statusText || '',
          status_updated_at: status?.statusUpdatedAt ? (status.statusUpdatedAt instanceof Date ? status.statusUpdatedAt.toISOString() : null) : null,
          status_updated_source: status ? 'email' : null,
          source: 'email-import',
          imported_at: new Date().toISOString(),
          shipped_at: details.date ? (details.date instanceof Date ? details.date.toISOString() : details.date) : null,
          customer_name: details.customerName || details.destination || details.shipper || 'UPS Shipment',
          customer_address: details.address || null,
          order_number: details.orderNumber || '',
          service_type: details.serviceType || details.service || '',
          package_count: Number.isFinite(details.packages) ? details.packages : null,
          package_weight_lbs: Number.isFinite(details.weight) ? details.weight : null,
          reference_1: details.reference1 || '',
          reference_2: details.reference2 || '',
          processed_by_id: null,
          processed_by_name: '',
          shipper: details.shipper || '',
          origin_location: details.origin || '',
          destination_location: details.destination || '',
          estimated_delivery_at: details.estimatedDelivery ? (details.estimatedDelivery instanceof Date ? details.estimatedDelivery.toISOString() : null) : null,
          notes: details.notes || 'Captured from UPS email',
          ups_raw_response: details.raw || null,
          returned: !!(status && status.internalStatus === 'RETURNED')
        };

        // Find existing (most recent) without modifying DB
        let existing = null;
        try {
          const res = await pgDal.query('SELECT * FROM shipments WHERE tracking_number = $1 ORDER BY COALESCE(status_updated_at, imported_at) DESC', [tracking]);
          if (res && res.rows && res.rows.length) existing = res.rows[0];
        } catch (err) {
          console.warn('DB query error:', err.message);
        }

        if (!existing) {
          report.creates++;
          report.items.push({ action: 'create', tracking, mailbox: s.mailbox, file: s.file, proposed: shipmentData });
          continue;
        }

        const updates = {};
        const setIfEmpty = (key, value) => {
          if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return;
          const existingVal = existing[key];
          const isEmpty = existingVal === undefined || existingVal === null || (typeof existingVal === 'string' && existingVal.trim() === '');
          if (isEmpty) updates[key] = value;
        };

        setIfEmpty('customer_name', shipmentData.customer_name);
        if (!existing.customer_address && shipmentData.customer_address) updates.customer_address = shipmentData.customer_address;
        setIfEmpty('order_number', shipmentData.order_number);
        setIfEmpty('service_type', shipmentData.service_type);
        if (existing.package_count === null && shipmentData.package_count !== null) updates.package_count = shipmentData.package_count;
        if (existing.package_weight_lbs === null && shipmentData.package_weight_lbs !== null) updates.package_weight_lbs = shipmentData.package_weight_lbs;
        setIfEmpty('reference_1', shipmentData.reference_1);
        setIfEmpty('reference_2', shipmentData.reference_2);

        // Always propose saving raw response and returned flag if present
        if (shipmentData.ups_raw_response) updates.ups_raw_response = JSON.stringify(shipmentData.ups_raw_response);
        updates.returned = shipmentData.returned === true;

        // Status logic
        const incomingStatus = shipmentData.status;
        const incomingTime = shipmentData.status_updated_at ? new Date(shipmentData.status_updated_at) : null;
        const existingTime = existing.status_updated_at ? new Date(existing.status_updated_at) : null;

        if (shipmentData.status_from_ups) {
          if (incomingTime && (!existingTime || incomingTime > existingTime)) {
            updates.status = incomingStatus;
            updates.status_from_ups = shipmentData.status_from_ups;
            updates.status_updated_at = incomingTime.toISOString();
            updates.status_updated_source = 'email';
          } else if (!incomingTime) {
            // no timestamp -- only upgrade by rank
            updates.status_from_ups = shipmentData.status_from_ups;
            updates.status_updated_at = new Date().toISOString();
            updates.status_updated_source = 'email';
            if (statusRank(incomingStatus) > statusRank(existing.status)) updates.status = incomingStatus;
          }
        }

        if (Object.keys(updates).length) {
          report.updates++;
          report.items.push({ action: 'update', tracking, mailbox: s.mailbox, file: s.file, existingId: existing.id, updates });
        }
      }
    } catch (e) {
      report.items.push({ mailbox: s.mailbox, file: s.file, error: e.message || String(e) });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote dry-run backfill report to ${OUT_FILE}`);
  console.log(JSON.stringify({ totalSnapshots: report.totalSnapshots, totalTrackings: report.totalTrackings, creates: report.creates, updates: report.updates }, null, 2));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
