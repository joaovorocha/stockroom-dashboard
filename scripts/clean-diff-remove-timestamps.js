#!/usr/bin/env node
const fs = require('fs');
const IN = 'data/ups-emails/front-vs-db-deep-normalized-diff.json';
const OUT_JSON = 'data/ups-emails/front-vs-db-deep-no-timestamps.json';
const OUT_CSV = 'data/ups-emails/front-vs-db-deep-no-timestamps.csv';
if (!fs.existsSync(IN)) { console.error('Missing input:', IN); process.exit(2); }
const R = JSON.parse(fs.readFileSync(IN,'utf8'));
const tsPatterns = [ /status_updated_at$/i, /imported_at$/i, /requested_at$/i, /shipped_at$/i, /created_at$/i, /updated_at$/i, /ups_raw_response\.date$/i ];
function isTs(p){ return tsPatterns.some(rx=>rx.test(p)); }

const out = { summary:{}, diffs:[], missingInApi:R.missingInApi||[], extraInApi:R.extraInApi||[] };
for (const item of R.diffs || []){
  const keep = (item.diffs || []).filter(d => !isTs(d.path));
  if (keep.length) out.diffs.push({ tracking: item.tracking, diffs: keep });
}
out.summary.appliedCount = R.summary && R.summary.appliedCount || 0;
out.summary.apiCount = R.summary && R.summary.apiCount || 0;
out.summary.diffs = out.diffs.length;
out.summary.missingInApi = (out.missingInApi || []).length;
out.summary.extraInApi = (out.extraInApi || []).length;
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

const csv = ['tracking,path,applied,api'];
for (const item of out.diffs){
  for (const d of item.diffs){
    const aRaw = JSON.stringify(d.applied) || '';
    const bRaw = JSON.stringify(d.api) || '';
    const a = aRaw.replace(/"/g,'""');
    const b = bRaw.replace(/"/g,'""');
    const tEsc = String(item.tracking||'').replace(/"/g,'""');
    const pathEsc = String(d.path||'').replace(/"/g,'""');
    csv.push(`"${tEsc}","${pathEsc}","${a}","${b}"`);
  }
}
fs.writeFileSync(OUT_CSV, csv.join('\n'));
console.log('Wrote cleaned reports:', OUT_JSON, OUT_CSV);
console.log('Summary:', out.summary);
