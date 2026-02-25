#!/usr/bin/env node
/**
 * Create Sample Gameplan for Testing
 * Populates today's gameplan with sample assignments
 */

const { query } = require('../utils/dal/pg');

async function createSampleGameplan() {
  try {
    console.log('Creating sample gameplan for today...\n');

    const today = new Date().toISOString().split('T')[0];

    // Get or create daily plan
    let plan = await query('SELECT id FROM daily_plans WHERE plan_date = $1', [today]);
    let planId;

    if (plan.rows.length === 0) {
      console.log('Creating daily plan for', today);
      const result = await query(
        `INSERT INTO daily_plans (plan_date, notes, morning_notes, closing_notes, sales_goal, target_sph, target_ipc, is_published, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [
          today,
          'Welcome to our sample game plan! This is a test to verify multi-store functionality.',
          'Morning: Team huddle at 9:45 AM. Focus on customer experience today!',
          'Closing: Complete all section duties by 8:45 PM. Manager approval required.',
          25000,  // $25K sales goal
          120,    // $120 sales per hour
          2.5     // 2.5 items per customer
        ]
      );
      planId = result.rows[0].id;
      console.log('✓ Daily plan created (ID:', planId, ')\n');
    } else {
      planId = plan.rows[0].id;
      console.log('✓ Daily plan exists (ID:', planId, ')\n');
    }

    // Get all active SF employees
    const employees = await query(
      'SELECT id, employee_id, name, access_role FROM users WHERE is_active = true AND store_id = 1 ORDER BY access_role, name'
    );

    console.log(`Found ${employees.rows.length} SF employees:\n`);

    // Sample assignments by role
    const shifts = ['Opening', 'Mid', 'Closing'];
    const zones = ['Floor', 'Fitting Rooms', 'Register', 'Front Door'];
    const lunchTimes = ['12:00-12:30', '12:30-1:00', '1:00-1:30', '1:30-2:00', '2:00-2:30'];

    let assigned = 0;

    for (const emp of employees.rows) {
      const roleUpper = (emp.access_role || 'SA').toUpperCase();
      
      // Determine shift based on role
      let shift = '';
      let zone = [];
      let lunch = '';
      let isOff = false;
      let role = '';
      let station = '';

      if (roleUpper === 'MANAGEMENT') {
        shift = 'All Day';
        zone = ['Floor'];
        lunch = '1:00-1:30';
        role = 'Floor Manager';
      } else if (roleUpper === 'SA') {
        shift = shifts[assigned % 3];
        zone = [zones[assigned % zones.length]];
        lunch = lunchTimes[assigned % lunchTimes.length];
        role = 'Sales';
        station = zone[0];
      } else if (roleUpper === 'BOH') {
        shift = 'All Day';
        zone = ['Back of House'];
        lunch = '12:30-1:00';
        role = 'Operations';
        station = 'Warehouse';
      } else if (roleUpper === 'TAILOR') {
        shift = 'All Day';
        zone = ['Alterations'];
        lunch = '1:30-2:00';
        role = 'Alterations';
        station = 'Tailor Station';
      }

      // Insert or update assignment
      await query(
        `INSERT INTO plan_assignments (
          plan_id, user_id, employee_id, employee_name, employee_type,
          is_off, shift, scheduled_lunch, lunch, role, station, zones, zone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (plan_id, user_id) 
        DO UPDATE SET
          employee_id = EXCLUDED.employee_id,
          employee_name = EXCLUDED.employee_name,
          employee_type = EXCLUDED.employee_type,
          is_off = EXCLUDED.is_off,
          shift = EXCLUDED.shift,
          scheduled_lunch = EXCLUDED.scheduled_lunch,
          lunch = EXCLUDED.lunch,
          role = EXCLUDED.role,
          station = EXCLUDED.station,
          zones = EXCLUDED.zones,
          zone = EXCLUDED.zone,
          updated_at = NOW()`,
        [
          planId,
          emp.id,
          emp.employee_id,
          emp.name,
          roleUpper,
          isOff,
          shift,
          lunch,
          lunch,
          role,
          station,
          zone,
          zone[0] || ''
        ]
      );

      console.log(`  ✓ ${emp.name} (${roleUpper}) - ${shift} | ${zone.join(', ')} | Lunch: ${lunch}`);
      assigned++;
    }

    // Publish the plan
    await query(
      'UPDATE daily_plans SET is_published = true, published_at = NOW() WHERE id = $1',
      [planId]
    );

    console.log('\n✅ Sample gameplan created and PUBLISHED!');
    console.log(`\nAssigned ${assigned} employees to today's gameplan.`);
    console.log('\nRefresh http://localhost:5173/gameplan to see the data!\n');

  } catch (error) {
    console.error('❌ Error creating sample gameplan:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createSampleGameplan();
