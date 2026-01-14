const fs = require('fs');
const path = require('path');
require('dotenv').config();
const dal = require('../utils/dal');
const { query } = require('../utils/dal/pg');

async function main() {
  try {
    const dataDir = dal.paths.dataDir;
    const employeesFile = dal.paths.employeesFile;

    const res = await query('SELECT id, employee_id, name, email, role, image_url, is_active FROM users WHERE is_active = true ORDER BY role, name');
    const rows = res.rows || [];

    const roleToType = { SA: 'SA', BOH: 'BOH', MANAGEMENT: 'MANAGEMENT', TAILOR: 'TAILOR', ADMIN: 'MANAGEMENT' };
    const canonical = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };

    for (const row of rows) {
      const targetType = roleToType[(row.role || '').toString().toUpperCase()] || 'SA';
      const canonicalEmployeeId = row.employee_id ? row.employee_id.toString().trim() : `u:${row.id}`;
      if (canonicalEmployeeId.toLowerCase() === 'admin') continue;
      canonical[targetType].push({
        id: canonicalEmployeeId,
        employeeId: row.employee_id || canonicalEmployeeId,
        name: row.name || '',
        imageUrl: row.image_url || '',
        type: targetType,
        isOff: true,
        zones: []
      });
    }

    const next = {
      employees: canonical,
      lastUpdated: new Date().toISOString().slice(0, 10),
      lastSyncedFromDB: new Date().toISOString(),
      syncedUserCount: rows.length,
      lastPrunedAt: new Date().toISOString(),
      lastDailyResetAt: new Date().toISOString(),
      lastDailyResetForDate: new Date().toISOString().slice(0,10)
    };

    // ensure dir
    const dir = path.dirname(employeesFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(employeesFile, JSON.stringify(next, null, 2), 'utf8');
    console.log('Wrote', employeesFile, 'with', rows.length, 'users');
  } catch (e) {
    console.error('Failed to populate employees file:', e);
    process.exit(1);
  }
}

main();
