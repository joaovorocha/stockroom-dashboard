#!/usr/bin/env node
const { query } = require('../utils/dal/pg');
const fs = require('fs');
const path = require('path');

async function importSettings() {
  try {
    console.log('Importing full settings from settings.json...\n');
    
    // Read the settings.json file
    const settingsPath = '/var/lib/stockroom-dashboard/data/settings.json';
    const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    // Clear existing settings
    await query('DELETE FROM gameplan_settings WHERE store_id = 1');
    console.log('✓ Cleared existing settings\n');
    
    let totalInserted = 0;
    
    // Import zones
    if (settingsData.zones) {
      for (let i = 0; i < settingsData.zones.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'zone', settingsData.zones[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.zones.length} zones`);
    }
    
    // Import fitting rooms
    if (settingsData.fittingRooms) {
      for (let i = 0; i < settingsData.fittingRooms.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'fitting_room', settingsData.fittingRooms[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.fittingRooms.length} fitting rooms`);
    }
    
    // Import shifts
    if (settingsData.shifts) {
      for (let i = 0; i < settingsData.shifts.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'shift', settingsData.shifts[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.shifts.length} shifts`);
    }
    
    // Import closing sections
    if (settingsData.closingSections) {
      for (let i = 0; i < settingsData.closingSections.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'closing_section', settingsData.closingSections[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.closingSections.length} closing sections`);
    }
    
    // Import management roles
    if (settingsData.managementRoles) {
      for (let i = 0; i < settingsData.managementRoles.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'management_role', settingsData.managementRoles[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.managementRoles.length} management roles`);
    }
    
    // Import tailor stations
    if (settingsData.tailorStations) {
      for (let i = 0; i < settingsData.tailorStations.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'tailor_station', settingsData.tailorStations[i].name, i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.tailorStations.length} tailor stations`);
    }
    
    // Import lunch times
    if (settingsData.lunchTimes) {
      for (let i = 0; i < settingsData.lunchTimes.length; i++) {
        await query(
          'INSERT INTO gameplan_settings (store_id, setting_type, value, display_order) VALUES ($1, $2, $3, $4)',
          [1, 'lunch_time', settingsData.lunchTimes[i], i + 1]
        );
        totalInserted++;
      }
      console.log(`✓ Imported ${settingsData.lunchTimes.length} lunch times`);
    }
    
    console.log(`\n✅ Total settings imported: ${totalInserted}`);
    
    // Verify
    const count = await query('SELECT COUNT(*) FROM gameplan_settings WHERE store_id = 1');
    console.log(`✅ Database count: ${count.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error importing settings:', error);
    process.exit(1);
  }
}

importSettings();
