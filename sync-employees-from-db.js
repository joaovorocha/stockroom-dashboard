#!/usr/bin/env node
require('dotenv').config();
const { query } = require('./utils/dal/pg');
const fs = require('fs');
const path = require('path');

async function syncEmployeesFromDB() {
  try {
    console.log('📊 Fetching users from PostgreSQL database...');
    
    const result = await query(`
      SELECT id, employee_id, name, email, role, image_url, is_active 
      FROM users 
      WHERE is_active = true 
      ORDER BY role, name
    `);
    
    
    console.log(`✅ Found ${result.rows.length} active users`);
    
    // Group employees by role
    const grouped = {
      SA: [],
      BOH: [],
      MANAGEMENT: [],
      TAILOR: []
    };
    
    const roleMapping = {
      'SA': 'SA',
      'BOH': 'BOH',
      'MANAGEMENT': 'MANAGEMENT',
      'ADMIN': 'MANAGEMENT',
      'TAILOR': 'TAILOR'
    };
    
    for (const user of result.rows) {
      const employeeType = roleMapping[user.role?.toUpperCase()] || 'SA';
      const employeeData = {
        employeeId: user.employee_id,
        name: user.name,
        imageUrl: user.image_url || '',
        type: employeeType,
        // Default fields for game plan
        isOff: true,
        zones: [],
        fittingRoom: '',
        scheduledLunch: '',
        closingSections: [],
        shift: '',
        lunch: '',
        taskOfTheDay: '',
        role: '',
        station: ''
      };
      
      grouped[employeeType].push(employeeData);
    }
    
    const employeesData = {
      employees: grouped,
      lastUpdated: new Date().toISOString(),
      lastSyncedFromDB: new Date().toISOString(),
      syncedUserCount: result.rows.length
    };
    
    const employeesFile = path.join(__dirname, 'data', 'employees.json');
    fs.writeFileSync(employeesFile, JSON.stringify(employeesData, null, 2), 'utf8');
    
    console.log('✅ Employees file synced:');
    console.log(`   - SA: ${grouped.SA.length}`);
    console.log(`   - BOH: ${grouped.BOH.length}`);
    console.log(`   - MANAGEMENT: ${grouped.MANAGEMENT.length}`);
    console.log(`   - TAILOR: ${grouped.TAILOR.length}`);
    console.log(`   - Total: ${result.rows.length}`);
    console.log(`\n📁 File saved to: ${employeesFile}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing employees:', error);
    process.exit(1);
  }
}

syncEmployeesFromDB();
