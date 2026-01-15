#!/usr/bin/env node

const http = require('http');
const fs = require('fs');

const sessionCookie = 'connect.sid=s%3AH6VJxGRz5FnHOmGWXKgIbOJTdyT4CfSZ.XQTF2gn5MrHANGKaUWh%2Bv8Hj6gDX5Y4cVzsPqLmN7tA';
const appliedPath = './data/ups-emails/applied-backfill.json';

function fetchApi(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
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
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    if (!fs.existsSync(appliedPath)) {
      console.error('applied-backfill.json not found at', appliedPath);
      process.exit(2);
    }

    const appliedRaw = JSON.parse(fs.readFileSync(appliedPath, 'utf-8'));
    const appliedArray = Array.isArray(appliedRaw) ? appliedRaw : (appliedRaw && appliedRaw.applied ? appliedRaw.applied : null);
    if (!appliedArray) {
      console.error('Unexpected format in applied-backfill.json');
      process.exit(2);
    }

    // Each applied entry has `tracking` and `after` object
    const appliedTrackings = new Set(appliedArray.map(r => r.tracking));

    console.log('Applied backfill entries:', appliedArray.length);

    const apiResp = await fetchApi('/api/shipments?all=true');
    const apiShipments = apiResp && apiResp.shipments ? apiResp.shipments : [];

    console.log('API shipments fetched:', apiShipments.length);

    const apiTrackSet = new Set(apiShipments.map(s => s.trackingNumber || s.tracking_number));

    const missingInApi = [...appliedTrackings].filter(t => !apiTrackSet.has(t));
    const presentCount = appliedArray.length - missingInApi.length;

    console.log('Applied present in API:', presentCount);
    console.log('Applied missing in API:', missingInApi.length);
    if (missingInApi.length > 0) {
      console.log('\nMissing tracking numbers sample (up to 50):');
      missingInApi.slice(0,50).forEach(t => console.log('-', t));
    }

    // Also report shipments in API that were updated by backfill
    const inApiAndApplied = apiShipments.filter(s => appliedTrackings.has(s.trackingNumber || s.tracking_number));
    console.log('\nShipments in API that match backfill (sample up to 20):', inApiAndApplied.slice(0,20).map(s => s.trackingNumber || s.tracking_number));

  } catch (err) {
    console.error('Error comparing front vs DB:', err);
    process.exit(1);
  }
})();
