#!/bin/bash
require('dotenv').config();
const { query } = require('./utils/dal/pg');
const fs = require('fs');

async function testDB() {
  try {
    const result = await query('SELECT COUNT(*) as count FROM daily_scan_results');
    fs.writeFileSync('/tmp/test-result.txt', `Count: ${result.rows[0].count}\n`);
    console.log('✓ Test complete - check /tmp/test-result.txt');
  } catch (error) {
    fs.writeFileSync('/tmp/test-result.txt', `Error: ${error.message}\n${error.stack}\n`);
    console.log('✗ Error - check /tmp/test-result.txt');
  }
}

testDB();
