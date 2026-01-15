#!/usr/bin/env node
const fs = require('fs');
const IN = 'data/ups-emails/front-vs-db-deep-normalized-diff.json';
if (!fs.existsSync(IN)) { console.error('Missing input:', IN); process.exit(2); }
const R = JSON.parse(fs.readFileSync(IN,'utf8'));

const steps = [
  { name: 'step-0-original', patterns: [] },
  { name: 'step-1-ignore-raw', patterns: [/^ups_raw_response(\.|$)/i] },
  { name: 'step-2-ignore-timestamps', patterns: [/status_updated_at$/i, /imported_at$/i, /requested_at$/i, /shipped_at$/i, /created_at$/i, /updated_at$/i, /ups_raw_response\.date$/i] },
  { name: 'step-3-ignore-internal-meta', patterns: [/processed_by_/, /origin_location$/, /destination_location$/, /label_generated$/i] },
  { name: 'step-4-ignore-address-validated', patterns: [/address_validated$/i, /address_country$/i] }
];

function matchAny(path, patterns){
  return patterns.some(p => p.test(path));
}

function filterReport(report, patterns){
  const out = { summary: {}, diffs: [], missingInApi: [], extraInApi: [] };
  for (const item of report.diffs){
    const keep = item.diffs.filter(d => !matchAny(d.path, patterns));
    if (keep.length) out.diffs.push({ tracking: item.tracking, diffs: keep });
  }
  out.missingInApi = report.missingInApi.filter(t => true); // keep as-is
  out.extraInApi = report.extraInApi.filter(t => true);
  out.summary.appliedCount = report.summary.appliedCount;
  out.summary.apiCount = report.summary.apiCount;
  out.summary.diffs = out.diffs.length;
  out.summary.missingInApi = out.missingInApi.length;
  out.summary.extraInApi = out.extraInApi.length;
  return out;
}

const results = [];
let current = R;
for (const s of steps){
  const filtered = filterReport(current, s.patterns);
  results.push({ step: s.name, patterns: s.patterns.map(p => p.toString()), summary: filtered.summary, remaining: filtered.diffs.length });
  current = filtered;
}

const OUT = 'data/ups-emails/front-vs-db-deep-filter-iterations.json';
fs.writeFileSync(OUT, JSON.stringify({results}, null, 2));
console.log('Wrote', OUT);
console.log(JSON.stringify(results, null, 2));
