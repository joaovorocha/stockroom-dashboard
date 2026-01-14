#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dal = require('../utils/dal/pg');

const TOLERANCE_MS = parseInt(process.env.TOL_MS || '2000', 10);
const LIMIT = parseInt(process.env.SAMPLE_N || '20', 10);
const APPLIED_PATH = path.resolve(__dirname, '../data/ups-emails/applied-backfill.json');
const OUT_PATH = path.resolve(__dirname, '../data/ups-emails/diff-report.json');

function parseDate(v){
  if(!v) return null;
  const d = new Date(v);
  if(isNaN(d.getTime())) return null;
  return d;
}

function dateDiffMs(a,b){
  if(!a || !b) return Infinity;
  return Math.abs(a.getTime() - b.getTime());
}

function jsonEqual(a,b){
  try{
    return JSON.stringify(a) === JSON.stringify(b);
  }catch(e){
    return false;
  }
}

(async ()=>{
  const cfg = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT,10) : undefined,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true'
  };
  await dal.initPool(cfg);
  const raw = fs.readFileSync(APPLIED_PATH,'utf8');
  const obj = JSON.parse(raw);
  const entries = obj.applied || [];
  // dedupe by id keeping the last applied snapshot for each id
  const seen = new Set();
  const dedupedReversed = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const id = e.id || (e.after && e.after.id);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    dedupedReversed.push(e);
  }
  const deduped = dedupedReversed.reverse();
  const sample = deduped.slice(0, LIMIT);
  const results = [];
  for(const e of sample){
    const id = e.id || (e.after && e.after.id);
    const after = e.after || {};
    const db = await dal.getShipmentById(id);
    const row = {id, tracking: e.tracking, diffs: []};
    // status_from_ups
    if((after.status_from_ups || null) !== (db && db.status_from_ups || null)){
      row.diffs.push({field:'status_from_ups', expected: after.status_from_ups||null, found: db?db.status_from_ups:null});
    }
    // status_updated_at
    const aDate = parseDate(after.status_updated_at);
    const bDate = parseDate(db && db.status_updated_at);
    if(aDate === null && bDate === null){
      // ok
    } else if(aDate === null || bDate === null){
      row.diffs.push({field:'status_updated_at', expected: after.status_updated_at||null, found: db && db.status_updated_at||null});
    } else {
      const diff = dateDiffMs(aDate,bDate);
      if(diff > TOLERANCE_MS){
        row.diffs.push({field:'status_updated_at', expected: after.status_updated_at, found: db.status_updated_at, msDiff: diff});
      }
    }
    // estimated_delivery_at
    const aEst = parseDate(after.estimated_delivery_at);
    const bEst = parseDate(db && db.estimated_delivery_at);
    if((aEst===null && bEst===null)===false){
      if(aEst===null || bEst===null){
        row.diffs.push({field:'estimated_delivery_at', expected: after.estimated_delivery_at||null, found: db && db.estimated_delivery_at||null});
      } else {
        const diff = dateDiffMs(aEst,bEst);
        if(diff > TOLERANCE_MS){
          row.diffs.push({field:'estimated_delivery_at', expected: after.estimated_delivery_at, found: db.estimated_delivery_at, msDiff: diff});
        }
      }
    }
    // returned
    if((after.returned === undefined ? null : !!after.returned) !== (db ? !!db.returned : null)){
      row.diffs.push({field:'returned', expected: after.returned===undefined?null:after.returned, found: db?db.returned:null});
    }
    // ups_raw_response presence and rough equality
    const aUps = after.ups_raw_response || null;
    const bUps = db && db.ups_raw_response ? db.ups_raw_response : null;
    if(aUps === null && bUps === null){
      // ok
    } else if(aUps === null || bUps === null){
      row.diffs.push({field:'ups_raw_response', expectedPresent: !!aUps, foundPresent: !!bUps});
    } else {
      // try deep equal; if large HTML compare presence of date string
      if(jsonEqual(aUps,bUps)===false){
        // if after has date field, check it's present in DB string
        if(aUps.date && typeof bUps === 'object'){
          if(String(bUps.date || '').indexOf(String(aUps.date))===-1){
            row.diffs.push({field:'ups_raw_response', note:'mismatch', expectedSample: aUps.date, foundSample: bUps.date || null});
          }
        } else if(typeof aUps.html === 'string' && typeof bUps.html === 'string'){
          if(!bUps.html.includes(aUps.html.slice(0,50))){
            row.diffs.push({field:'ups_raw_response', note:'html-mismatch-sample'});
          }
        } else {
          row.diffs.push({field:'ups_raw_response', note:'json-unequal'});
        }
      }
    }
    results.push({id, tracking: e.tracking, diffs: row.diffs});
  }
  const summary = {generatedAt: new Date().toISOString(), totalChecked: sample.length, failures: results.filter(r=>r.diffs && r.diffs.length>0).length, details: results};
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2),'utf8');
  console.log('Wrote', OUT_PATH, 'checked', sample.length, 'failures', summary.failures);
  process.exit(0);
})();
