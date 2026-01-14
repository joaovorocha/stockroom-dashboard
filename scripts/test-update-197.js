#!/usr/bin/env node
const dal = require('../utils/dal/pg');
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
  try{
    const updates = {
      status_from_ups: 'Delivered',
      status_updated_at: new Date('2026-01-14T22:33:11.980Z'),
      ups_raw_response: {probe: true, note: 'test update via script'},
      returned: false
    };
    console.log('Updating id=197 with:', updates);
    const updated = await dal.updateShipment(197, updates);
    console.log('updateShipment returned:', JSON.stringify(updated, null, 2));
    const found = await dal.getShipmentById(197);
    console.log('SELECT result:', JSON.stringify(found, null, 2));
  }catch(e){
    console.error('Error:', e && e.stack?e.stack:e);
    process.exit(2);
  } finally{
    process.exit(0);
  }
})();
