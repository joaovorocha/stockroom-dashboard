#!/usr/bin/env node
const fs = require('fs');
const IN = 'data/ups-emails/front-vs-db-deep-diff.json';
const OUT = 'data/ups-emails/front-vs-db-deep-summary.json';
if (!fs.existsSync(IN)) {
  console.error('Input missing:', IN); process.exit(2);
}
const R = JSON.parse(fs.readFileSync(IN, 'utf8'));
const counts = new Map();
const samples = new Map();
let totalDiffs = 0;
for (const item of R.diffs || []) {
  for (const d of item.diffs || []) {
    const p = d.path || '(root)';
    counts.set(p, (counts.get(p) || 0) + 1);
    if (!samples.has(p)) samples.set(p, []);
    if (samples.get(p).length < 3) samples.get(p).push(item.tracking);
    totalDiffs++;
  }
}
const entries = [...counts.entries()].map(([k, v]) => ({ path: k, count: v, examples: samples.get(k) }));
entries.sort((a, b) => b.count - a.count);
const top = entries.slice(0, 15);
const summary = { appliedCount: R.summary && R.summary.appliedCount || 0, apiCount: R.summary && R.summary.apiCount || 0, totalDiffs, top };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('Wrote summary to', OUT);
