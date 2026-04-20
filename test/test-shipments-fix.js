#!/usr/bin/env node

const http = require('http');

// Session cookie from earlier login
const sessionCookie = 'connect.sid=s%3AH6VJxGRz5FnHOmGWXKgIbOJTdyT4CfSZ.XQTF2gn5MrHANGKaUWh%2Bv8Hj6gDX5Y4cVzsPqLmN7tA';

function testEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Cookie': sessionCookie
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`\n========== ${path} ==========`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log('Response:', JSON.stringify(json, null, 2));
          if (json.shipments && Array.isArray(json.shipments)) {
            console.log(`Found ${json.shipments.length} shipments.`);
          }
        } catch (e) {
          console.log('Response (not JSON):', data);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.log(`\n========== ${path} ==========`);
      console.log(`ERROR: ${e.message}`);
      resolve();
    });

    req.end();
  });
}

(async () => {
  console.log('Testing /api/shipments with multiple statuses...\n');
  
  await testEndpoint('/api/shipments?status=REQUESTED,PICKING,READY_TO_PACK,PACKING');
  
  console.log('\n\nTest complete.');
})();
