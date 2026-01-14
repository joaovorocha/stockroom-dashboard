#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dal = require('../utils/dal/pg');
(async ()=>{
  const base = path.join(__dirname, '..', 'data', 'ups-emails');
  const diff = JSON.parse(fs.readFileSync(path.join(base, 'diff-report.json'),'utf8'));
  const applied = JSON.parse(fs.readFileSync(path.join(base, 'applied-backfill.json'),'utf8')).applied || [];
  await dal.initPool();
  for(const d of diff.details){
    if(!d.diffs || d.diffs.length===0) continue;
    const id = d.id;
    const updates = {};
    for(const f of d.diffs){
      if(f.field === 'status_updated_at' && f.expected){
        updates.status_updated_at = new Date(f.expected).toISOString();
      }
      if(f.field === 'ups_raw_response'){
        // prefer applied 'after' snapshot if available
        const snaps = applied.filter(a=>a.id===id).slice(-1);
        if(snaps.length>0 && snaps[0].after && snaps[0].after.ups_raw_response){
          updates.ups_raw_response = snaps[0].after.ups_raw_response;
        } else if(f.expectedSample){
          updates.ups_raw_response = { date: f.expectedSample };
        }
      }
    }
    if(Object.keys(updates).length===0) continue;
    try{
      console.log('Fixing', id, updates);
      await dal.updateShipment(id, updates);
      console.log('Fixed', id);
    }catch(e){
      console.error('Error fixing', id, e && e.stack?e.stack:e);
    }
  }
  process.exit(0);
})();
