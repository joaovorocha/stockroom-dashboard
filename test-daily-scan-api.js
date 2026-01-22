#!/usr/bin/env node

const http = require('http');

console.log('Testing Daily Scan API Endpoints...\n');

// Test 1: Check database directly
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'stockroom_dashboard',
  user: process.env.PGUSER || 'suit',
  password: process.env.PGPASSWORD || 'VEzaGREma8xKYgbsB7fXWyqA3X'
});

async function testDatabase() {
  console.log('=== DATABASE TESTS ===');
  try {
    // Count total rows
    const countResult = await pool.query('SELECT COUNT(*) FROM daily_scan_results');
    console.log(`Total rows in daily_scan_results: ${countResult.rows[0].count}`);
    
    // Get date range
    const dateResult = await pool.query(
      'SELECT MIN(scan_date) as earliest, MAX(scan_date) as latest FROM daily_scan_results'
    );
    console.log(`Date range: ${dateResult.rows[0].earliest} to ${dateResult.rows[0].latest}`);
    
    // Sample data
    const sampleResult = await pool.query(
      'SELECT id, scan_date, counted_by, expected_units, counted_units FROM daily_scan_results ORDER BY scan_date DESC LIMIT 3'
    );
    console.log('\nSample records:');
    sampleResult.rows.forEach(row => {
      console.log(`  ${row.scan_date} - ${row.counted_by}: ${row.counted_units}/${row.expected_units}`);
    });
    
    // Test the actual query used by the API
    console.log('\n=== API QUERY TEST (last 30 days) ===');
    const days = 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const apiQueryResult = await pool.query(
      `SELECT 
        id, count_id, status, scan_date, counted_by,
        expected_units, counted_units,
        missed_units_available AS missed_available,
        missed_units_reserved AS missed_reserved,
        new_units,
        found_previously_missed_units AS found_previously_missed,
        undecodable_units, unmapped_item_units,
        imported_at AS created_at
       FROM daily_scan_results
       WHERE scan_date >= $1
       ORDER BY scan_date DESC`,
      [startDate.toISOString().split('T')[0]]
    );
    console.log(`Query returned ${apiQueryResult.rows.length} rows`);
    if (apiQueryResult.rows.length > 0) {
      console.log('First row:', JSON.stringify(apiQueryResult.rows[0], null, 2));
    }
    
    // Test with 365 days
    console.log('\n=== API QUERY TEST (last 365 days) ===');
    const startDate365 = new Date();
    startDate365.setDate(startDate365.getDate() - 365);
    
    const apiQueryResult365 = await pool.query(
      `SELECT 
        id, count_id, status, scan_date, counted_by,
        expected_units, counted_units,
        missed_units_available AS missed_available,
        missed_units_reserved AS missed_reserved,
        new_units,
        found_previously_missed_units AS found_previously_missed,
        undecodable_units, unmapped_item_units,
        imported_at AS created_at
       FROM daily_scan_results
       WHERE scan_date >= $1
       ORDER BY scan_date DESC`,
      [startDate365.toISOString().split('T')[0]]
    );
    console.log(`Query returned ${apiQueryResult365.rows.length} rows`);
    
  } catch (error) {
    console.error('Database test error:', error.message);
  }
}

async function testAPI(endpoint, params = '') {
  return new Promise((resolve) => {
    const url = `http://localhost:3000${endpoint}${params}`;
    console.log(`\nTesting: ${url}`);
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          if (Array.isArray(json)) {
            console.log(`Response: Array with ${json.length} items`);
            if (json.length > 0) {
              console.log('First item:', JSON.stringify(json[0], null, 2));
            }
          } else {
            console.log('Response:', JSON.stringify(json, null, 2).substring(0, 500));
          }
        } catch (e) {
          console.log('Response (not JSON):', data.substring(0, 200));
        }
        resolve();
      });
    }).on('error', (e) => {
      console.error(`Error: ${e.message}`);
      resolve();
    });
  });
}

async function main() {
  await testDatabase();
  
  console.log('\n\n=== API ENDPOINT TESTS ===');
  await testAPI('/api/gameplan/daily-scan/results', '?days=30');
  await testAPI('/api/gameplan/daily-scan/results', '?days=365');
  await testAPI('/api/gameplan/daily-scan/performance', '?days=365');
  await testAPI('/api/gameplan/daily-scan/import-history');
  
  await pool.end();
  console.log('\nDone!');
}

main();
