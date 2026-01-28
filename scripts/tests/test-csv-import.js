require('dotenv').config();
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testImport() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('/tmp/test-import.csv'));
    
    console.log('Testing CSV import...');
    const response = await fetch('http://localhost:3000/api/gameplan/daily-scan/import', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✓ Import successful!');
    } else {
      console.log('✗ Import failed:', data.error);
    }
  } catch (error) {
    console.error('✗ Test failed:', error.message);
  }
}

testImport();
