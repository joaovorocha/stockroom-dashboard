const fs = require('fs');
const path = require('path');

const INPUT = path.resolve(__dirname, '../data/ups-emails/front-vs-db-deep-diff.json');
const OUT_DIR = path.resolve(__dirname, '../data/ups-emails');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function toCsv(arr) {
  return arr.join('\n') + '\n';
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Input file not found:', INPUT);
    process.exit(2);
  }

  const data = readJson(INPUT);
  const extras = data.extraInApi || [];

  const is1z = extras.filter(t => /^1Z/i.test(t));
  const non1z = extras.filter(t => !/^1Z/i.test(t));

  const out1z = path.join(OUT_DIR, 'extra-api-only-1z.json');
  const outNon = path.join(OUT_DIR, 'extra-api-only-non1z.json');
  const out1zCsv = path.join(OUT_DIR, 'extra-api-only-1z.csv');
  const outNonCsv = path.join(OUT_DIR, 'extra-api-only-non1z.csv');

  writeJson(out1z, { count: is1z.length, values: is1z });
  writeJson(outNon, { count: non1z.length, values: non1z });
  fs.writeFileSync(out1zCsv, toCsv(is1z));
  fs.writeFileSync(outNonCsv, toCsv(non1z));

  console.log('Wrote:', out1z, `(${is1z.length})`, out1zCsv);
  console.log('Wrote:', outNon, `(${non1z.length})`, outNonCsv);
}

main();
