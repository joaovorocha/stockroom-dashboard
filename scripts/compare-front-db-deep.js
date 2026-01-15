#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const APPLIED_PATH = path.join('data', 'ups-emails', 'applied-backfill.json');
const OUT_JSON = path.join('data', 'ups-emails', 'front-vs-db-deep-diff.json');
const OUT_CSV = path.join('data', 'ups-emails', 'front-vs-db-deep-diff.csv');

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
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON from API: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function parseDate(v) {
  if (!v) return null;
  try { const d = new Date(v); return isNaN(d) ? null : d; } catch { return null; }
}

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function normalizeEmpty(v) {
  if (v === null || v === undefined) return null;
  if (isObject(v) && Object.keys(v).length === 0) return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return v;
}

function tsClose(a, b, secs = 300) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const da = parseDate(a), db = parseDate(b);
  if (!da || !db) return false;
  return Math.abs(da.getTime() - db.getTime()) <= secs*1000;
}

function deepDiff(applied, api, path = '') {
  const diffs = [];
  const aVal = normalizeEmpty(applied);
  const bVal = normalizeEmpty(api);

  if (aVal === null && bVal === null) return diffs;

  // If both are dates or date-like, compare with tolerance
  const aDate = parseDate(aVal);
  const bDate = parseDate(bVal);
  if (aDate || bDate) {
    if (!tsClose(aVal, bVal, 300)) diffs.push({path, applied: applied, api: api});
    return diffs;
  }

  // Arrays: compare lengths and elements shallowly (by index)
  if (Array.isArray(aVal) || Array.isArray(bVal)) {
    const A = Array.isArray(aVal) ? aVal : [];
    const B = Array.isArray(bVal) ? bVal : [];
    if (A.length !== B.length) { diffs.push({path, applied: applied, api: api}); return diffs; }
    for (let i=0;i<A.length;i++) {
      const sub = deepDiff(A[i], B[i], `${path}[${i}]`);
      diffs.push(...sub);
    }
    return diffs;
  }

  // Objects: recurse on union of keys
  if (isObject(aVal) || isObject(bVal)) {
    const keys = new Set([...(isObject(aVal)?Object.keys(aVal):[]), ...(isObject(bVal)?Object.keys(bVal):[])]);
    for (const k of keys) {
      diffs.push(...deepDiff(aVal?.[k], bVal?.[k], path ? `${path}.${k}` : k));
    }
    return diffs;
  }

  // Primitives: strict equality after string-normalize for strings
  const aPrim = typeof aVal === 'string' ? aVal.trim() : aVal;
  const bPrim = typeof bVal === 'string' ? bVal.trim() : bVal;
  if (aPrim !== bPrim) diffs.push({path, applied: applied, api: api});
  return diffs;
}

(async () => {
  try {
    if (!fs.existsSync(APPLIED_PATH)) { console.error('Applied file missing:', APPLIED_PATH); process.exit(2); }
    const raw = JSON.parse(fs.readFileSync(APPLIED_PATH, 'utf-8'));
    const appliedArr = Array.isArray(raw) ? raw : (raw && raw.applied ? raw.applied : []);
    const appliedByTracking = new Map();
    for (const r of appliedArr) if (r && r.tracking) appliedByTracking.set(String(r.tracking), r.after || r);

    const apiResp = await fetchApi('/api/shipments?all=true');
    const apiShipments = apiResp && apiResp.shipments ? apiResp.shipments : [];
    const apiByTracking = new Map();
    for (const s of apiShipments) {
      const t = String(s.trackingNumber || s.tracking || s.tracking_number || ''); if (t) apiByTracking.set(t, s);
    }

    const report = {summary:{}, diffs:[], missingInApi:[], extraInApi:[]};

    for (const [tracking, applied] of appliedByTracking.entries()) {
      const api = apiByTracking.get(tracking);
      if (!api) { report.missingInApi.push(tracking); continue; }
      const diffs = deepDiff(applied, api, '');
      if (diffs.length) report.diffs.push({tracking, diffs});
    }

    for (const t of apiByTracking.keys()) if (!appliedByTracking.has(t)) report.extraInApi.push(t);

    report.summary.appliedCount = appliedByTracking.size;
    report.summary.apiCount = apiByTracking.size;
    report.summary.diffs = report.diffs.length;
    report.summary.missingInApi = report.missingInApi.length;
    report.summary.extraInApi = report.extraInApi.length;

    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

    // CSV: each row = tracking,path,applied,api (applied/api as JSON string)
    const csv = ['tracking,path,applied,api'];
    for (const item of report.diffs) {
      for (const d of item.diffs) {
        const aRaw = JSON.stringify(d.applied);
        const bRaw = JSON.stringify(d.api);
        const a = (aRaw === undefined || aRaw === null) ? '' : aRaw.replace(/"/g,'""');
        const b = (bRaw === undefined || bRaw === null) ? '' : bRaw.replace(/"/g,'""');
        const tEsc = String(item.tracking || '').replace(/"/g,'""');
        const pathEsc = String(d.path || '').replace(/"/g,'""');
        csv.push(`"${tEsc}","${pathEsc}","${a}","${b}"`);
      }
    }
    fs.writeFileSync(OUT_CSV, csv.join('\n'));

    console.log('Deep diff written:', OUT_JSON, OUT_CSV);
    console.log('Summary:', report.summary);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
