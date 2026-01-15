#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const APPLIED_PATH = path.join('data', 'ups-emails', 'applied-backfill.json');
const OUT_JSON = path.join('data', 'ups-emails', 'front-vs-db-diff.json');
const OUT_CSV = path.join('data', 'ups-emails', 'front-vs-db-diff.csv');

function fetchApi(pathname) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Dev-User': process.env.DEV_AUTH_USER_EMAIL || 'vrocha@suitsupply.com'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON from API: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getField(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function normalizeStr(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  return d;
}

function tsClose(a, b, secs = 300) {
  if (!a || !b) return a === b;
  const da = parseDate(a), db = parseDate(b);
  if (!da || !db) return false;
  return Math.abs(da.getTime() - db.getTime()) <= secs * 1000;
}

function compareFields(applied, api) {
  const diffs = {};

  const appliedAfter = applied.after || {};

  const aStatus = getField(appliedAfter, 'status', 'shipment_status');
  const aStatusTs = getField(appliedAfter, 'status_update', 'status_update_at', 'statusUpdatedAt');
  const aEst = getField(appliedAfter, 'estimated_delivery', 'estimatedDelivery');
  const aRecipient = getField(appliedAfter, 'recipient_name', 'recipientName', 'customerName');
  const aAddr = getField(appliedAfter, 'customerAddress', 'shipTo', 'address') || {};
  const aService = getField(appliedAfter, 'service', 'ups_service');
  const aWeight = getField(appliedAfter, 'weight');

  const pStatus = getField(api, 'status', 'shipment_status');
  const pStatusTs = getField(api, 'status_update', 'status_update_at', 'statusUpdatedAt');
  const pEst = getField(api, 'estimated_delivery', 'estimatedDelivery');
  const pRecipient = getField(api, 'recipientName', 'customerName');
  const pAddr = getField(api, 'customerAddress', 'shipTo', 'address') || {};
  const pService = getField(api, 'service', 'ups_service');
  const pWeight = getField(api, 'weight');

  if (normalizeStr(aStatus) !== normalizeStr(pStatus)) diffs.status = {applied: aStatus, api: pStatus};
  if (!tsClose(aStatusTs, pStatusTs, 300)) diffs.status_update_ts = {applied: aStatusTs, api: pStatusTs};
  if (!tsClose(aEst, pEst, 24*3600)) diffs.estimated_delivery = {applied: aEst, api: pEst};
  if (normalizeStr(aRecipient) !== normalizeStr(pRecipient)) diffs.recipient = {applied: aRecipient, api: pRecipient};

  // address compare (line1, city, zip)
  const aLine1 = normalizeStr(aAddr.line1 || aAddr.address1 || aAddr.line_1 || aAddr.street);
  const pLine1 = normalizeStr(pAddr.line1 || pAddr.address1 || pAddr.line_1 || pAddr.street);
  if (aLine1 !== pLine1) diffs.address_line1 = {applied: aAddr.line1 || aAddr.address1 || aAddr.line_1 || aAddr.street, api: pAddr.line1 || pAddr.address1 || pAddr.line_1 || pAddr.street};
  const aCity = normalizeStr(aAddr.city || aAddr.town);
  const pCity = normalizeStr(pAddr.city || pAddr.town);
  if (aCity !== pCity) diffs.address_city = {applied: aAddr.city, api: pAddr.city};
  const aZip = normalizeStr(aAddr.zip || aAddr.postal_code || aAddr.postcode);
  const pZip = normalizeStr(pAddr.zip || pAddr.postal_code || pAddr.postcode);
  if (aZip !== pZip) diffs.address_zip = {applied: aAddr.zip, api: pAddr.zip};

  if (normalizeStr(aService) !== normalizeStr(pService)) diffs.service = {applied: aService, api: pService};
  if (String(aWeight || '') !== String(pWeight || '')) diffs.weight = {applied: aWeight, api: pWeight};

  return diffs;
}

(async () => {
  try {
    if (!fs.existsSync(APPLIED_PATH)) {
      console.error('Applied backfill not found at', APPLIED_PATH);
      process.exit(2);
    }

    const appliedRaw = JSON.parse(fs.readFileSync(APPLIED_PATH, 'utf-8'));
    const appliedArr = Array.isArray(appliedRaw) ? appliedRaw : (appliedRaw && appliedRaw.applied ? appliedRaw.applied : null);
    if (!appliedArr) {
      console.error('Unexpected applied-backfill.json format');
      process.exit(2);
    }

    const appliedByTracking = new Map();
    for (const r of appliedArr) {
      if (!r || !r.tracking) continue;
      appliedByTracking.set(String(r.tracking), r);
    }

    console.log('Applied entries:', appliedByTracking.size);

    const apiResp = await fetchApi('/api/shipments?all=true');
    const apiShipments = apiResp && apiResp.shipments ? apiResp.shipments : [];
    console.log('API shipments fetched:', apiShipments.length);

    const apiByTracking = new Map();
    for (const s of apiShipments) {
      const t = String(s.trackingNumber || s.tracking || s.tracking_number || '');
      if (!t) continue;
      apiByTracking.set(t, s);
    }

    const report = {summary: {}, mismatches: [], missingInApi: [], extraInApi: []};

    for (const [tracking, applied] of appliedByTracking.entries()) {
      const api = apiByTracking.get(tracking);
      if (!api) {
        report.missingInApi.push(tracking);
        continue;
      }
      const diffs = compareFields(applied, api);
      if (Object.keys(diffs).length > 0) {
        report.mismatches.push({tracking, diffs, applied: applied.after || {}, api});
      }
    }

    for (const [tracking] of apiByTracking.entries()) {
      if (!appliedByTracking.has(tracking)) report.extraInApi.push(tracking);
    }

    report.summary.appliedCount = appliedByTracking.size;
    report.summary.apiCount = apiByTracking.size;
    report.summary.matching = appliedByTracking.size - report.mismatches.length - report.missingInApi.length;
    report.summary.mismatches = report.mismatches.length;
    report.summary.missingInApi = report.missingInApi.length;
    report.summary.extraInApi = report.extraInApi.length;

    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

    // CSV for mismatches
    const csvLines = ['tracking,field,applied,api'];
    for (const m of report.mismatches) {
      for (const [field, val] of Object.entries(m.diffs)) {
        const a = String(val.applied === undefined ? '' : val.applied).replace(/"/g, '""');
        const p = String(val.api === undefined ? '' : val.api).replace(/"/g, '""');
        csvLines.push(`"${m.tracking}","${field}","${a}","${p}"`);
      }
    }
    fs.writeFileSync(OUT_CSV, csvLines.join('\n'));

    console.log('Report written to', OUT_JSON, 'and', OUT_CSV);
    console.log('Summary:', report.summary);
  } catch (err) {
    console.error('Error during compare:', err.message || err);
    process.exit(1);
  }
})();
