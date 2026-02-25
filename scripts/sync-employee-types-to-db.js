#!/usr/bin/env node
/**
 * Sync employee types from employees-v2.json to database access_role column
 * This ensures database has proper role values for gameplan grouping
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../utils/dal/pg');

const EMPLOYEES_FILE = path.join(__dirname, '../data/employees-v2.json');

async function syncEmployeeTypes() {
  console.log('Starting employee type sync to database...\n');

  // Read employees-v2.json
  const employeesData = JSON.parse(fs.readFileSync(EMPLOYEES_FILE, 'utf8'));
  const employees = employeesData.employees || {};

  // Build map of employee_id -> type
  const employeeTypeMap = new Map();
  
  Object.entries(employees).forEach(([type, empList]) => {
    console.log(`Found ${empList.length} ${type} employees in JSON`);
    empList.forEach(emp => {
      const empId = emp.employeeId || emp.id;
      if (empId) {
        employeeTypeMap.set(empId.toString(), type);
      }
    });
  });

  console.log(`\nTotal unique employees in JSON: ${employeeTypeMap.size}\n`);

  // Get current database users
  const result = await query('SELECT id, employee_id, name, access_role FROM users WHERE is_active = true ORDER BY name');
  const dbUsers = result.rows;

  console.log(`Database has ${dbUsers.length} active users\n`);

  // Update each user's access_role based on employees-v2.json
  let updated = 0;
  let notFound = 0;
  let alreadyCorrect = 0;

  for (const user of dbUsers) {
    const empId = user.employee_id;
    const currentRole = user.access_role;
    const correctType = employeeTypeMap.get(empId?.toString());

    if (!correctType) {
      console.log(`⚠️  ${user.name} (ID: ${empId}) - NOT FOUND in employees-v2.json, keeping current role: ${currentRole || 'NULL'}`);
      notFound++;
      
      // Set default to SA if no role exists
      if (!currentRole) {
        await query('UPDATE users SET access_role = $1 WHERE id = $2', ['SA', user.id]);
        console.log(`   → Set to default: SA`);
        updated++;
      }
      continue;
    }

    if (currentRole === correctType) {
      console.log(`✓  ${user.name} - Already correct: ${correctType}`);
      alreadyCorrect++;
      continue;
    }

    // Update the role
    await query('UPDATE users SET access_role = $1 WHERE id = $2', [correctType, user.id]);
    console.log(`✏️  ${user.name} - Updated: ${currentRole || 'NULL'} → ${correctType}`);
    updated++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`✓ Already correct: ${alreadyCorrect}`);
  console.log(`✏️  Updated: ${updated}`);
  console.log(`⚠️  Not found in JSON: ${notFound}`);
  console.log('='.repeat(60));

  // Show final distribution
  const finalResult = await query(`
    SELECT access_role, COUNT(*) as count 
    FROM users 
    WHERE is_active = true 
    GROUP BY access_role 
    ORDER BY access_role
  `);
  
  console.log('\nFinal role distribution in database:');
  finalResult.rows.forEach(row => {
    console.log(`  ${row.access_role || 'NULL'}: ${row.count} users`);
  });
}

syncEmployeeTypes()
  .then(() => {
    console.log('\n✅ Sync completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Sync failed:', err);
    process.exit(1);
  });
