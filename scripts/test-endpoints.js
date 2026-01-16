#!/usr/bin/env node

/**
 * Test API Endpoints
 * Tests all gameplan API endpoints for 200 status using curl
 */

const { execSync } = require('child_process');

const endpoints = [
  '/api/gameplan/metrics',
  '/api/gameplan/today',
  '/api/gameplan/employees',
  '/api/gameplan/best-sellers',
  '/api/gameplan/appointments',
  '/api/gameplan/sync-status',
  '/api/gameplan/settings',
  '/api/gameplan/store-config',
  '/api/gameplan/notes-templates',
  '/api/gameplan/templates'
];

const baseUrl = 'http://localhost:3000';

function testEndpoint(endpoint) {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${baseUrl}${endpoint}`, { encoding: 'utf8' });
    const status = parseInt(result.trim());
    if (status === 200) {
      console.log(`✅ ${endpoint} - ${status}`);
    } else {
      console.log(`❌ ${endpoint} - ${status}`);
    }
  } catch (error) {
    console.log(`❌ ${endpoint} - Error: ${error.message}`);
  }
}

function testAll() {
  console.log('Testing API endpoints...\n');
  for (const endpoint of endpoints) {
    testEndpoint(endpoint);
  }
  console.log('\nDone.');
}

testAll();