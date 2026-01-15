#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');

// Force connection as postgres superuser to bypass permissions issues for this script
const pool = new Pool({
  user: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'stockroom_dashboard',
  password: process.env.PG_PASSWORD, // Assumes you have a password set for postgres user if needed
  port: process.env.DB_PORT || 5432,
});

const pgDal = {
  ...require('../utils/dal/pg'),
  query: (text, params) => pool.query(text, params),
};

async function insertTestShipment() {
  console.log('Attempting to insert a test shipment...');

  const testShipment = {
    tracking_number: `1ZTEST${Math.floor(Math.random() * 1000000)}`,
    carrier: 'UPS',
    status: 'in-transit',
    status_from_ups: 'In Transit: On the Way',
    status_updated_at: new Date().toISOString(),
    status_updated_source: 'test-script',
    source: 'test-script',
    imported_at: new Date().toISOString(),
    shipped_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    customer_name: 'Jane Doe',
    customer_address: {
      line1: '123 Test St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US'
    },
    order_number: `PSUS-TEST-${Math.floor(Math.random() * 1000)}`,
    service_type: 'UPS Ground',
    package_count: 1,
    package_weight_lbs: 5.5,
    reference_1: 'Test Shipment',
    reference_2: '',
    processed_by_id: null,
    processed_by_name: 'Test Script',
    shipper: 'Suit Supply SF',
    origin_location: 'San Francisco, CA',
    destination_location: 'San Francisco, CA',
    estimated_delivery_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    notes: 'This is a test shipment record created by a script.'
  };

  try {
    console.log('Creating shipment with tracking:', testShipment.tracking_number);
    const result = await pgDal.createShipment(testShipment);
    console.log('Successfully inserted test shipment:');
    console.log(result);
  } catch (error) {
    console.error('Failed to insert test shipment:', error);
    process.exit(1);
  }
}

insertTestShipment().then(() => {
  console.log('Script finished.');
  // The pg pool can keep the script alive, so we explicitly exit.
  process.exit(0);
});
