#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dal = require('../utils/dal/pg');

(async ()=>{
  const base = path.join(__dirname, '..', 'data', 'ups-emails');
  const applied = JSON.parse(fs.readFileSync(path.join(base, 'applied-backfill.json'),'utf8')).applied || [];
  const diff = JSON.parse(fs.readFileSync(path.join(base, 'diff-report.json'),'utf8'));
  const ids = (diff.details || []).map(d=>d.id).filter(Boolean);

  await dal.initPool();

  for(const id of ids){
    try{
      // prefer the last applied snapshot for this id (may have duplicates)
      const entry = (() => {
        for (let i = applied.length - 1; i >= 0; i--) if (applied[i].id === id) return applied[i];
        return null;
      })();
      if(!entry) { console.log('No applied snapshot for id', id); continue; }
      const after = entry.after || {};
      const updates = {};
      if(after.status_from_ups !== undefined) updates.status_from_ups = after.status_from_ups;
      if(after.status_updated_at) updates.status_updated_at = new Date(after.status_updated_at).toISOString();
      if(after.estimated_delivery_at) updates.estimated_delivery_at = new Date(after.estimated_delivery_at).toISOString();
      if(after.ups_raw_response) updates.ups_raw_response = after.ups_raw_response;
      if(after.returned !== undefined) updates.returned = !!after.returned;

      if(Object.keys(updates).length===0){ console.log('Nothing to apply for', id); continue; }
      console.log('Reapplying id', id, 'fields', Object.keys(updates));
      const res = await dal.updateShipment(id, updates);
      console.log('updated', id, '->', !!res);
    }catch(e){
      console.error('Reapply error for', id, e && e.stack?e.stack:e);
    }
  }
  process.exit(0);
})();
