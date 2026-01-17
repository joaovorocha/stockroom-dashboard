/**
 * Seed AI Assignment History
 * 
 * Populates the `task_assignment_history` table with realistic-looking
 * random data for the last 90 days. This is required for the fair rotation
 * algorithm to have data to analyze.
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { exit } = require('process');
const dal = require('../utils/dal');
const { query: pgQuery } = require('../utils/dal/pg');

// --- Configuration ---
const HISTORY_DAYS = 90;
// Use peer authentication via socket
const pool = new Pool({
  host: '/var/run/postgresql',
  database: 'stockroom_dashboard',
  user: 'suit',
});
const SETTINGS_FILE = path.join(dal.paths.dataDir, 'gameplan-templates.json');
// --------------------

async function main() {
  const client = await pool.connect();

  function readJsonFile(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return fallback;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading JSON from ${filePath}:`, error);
      return fallback;
    }
  }

  function getRandomElement(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getRandomElements(arr, count) {
    if (!arr || arr.length === 0) return [];
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async function getEmployeesFromDb() {
    const users = await pgQuery('SELECT * FROM users WHERE is_active = true');
    const employees = { SA: [], BOH: [], MANAGEMENT: [], TAILOR: [] };
    const roleToType = {
      'SA': 'SA',
      'Tailor': 'TAILOR',
      'BOH': 'BOH',
      'Manager': 'MANAGEMENT',
      'Admin': 'MANAGEMENT'
    };

    for (const user of users) {
      const type = roleToType[user.role];
      if (type) {
        employees[type].push({
          id: user.employee_id,
          name: user.name,
        });
      }
    }
    return employees;
  }


  async function seedHistory() {
    console.log('--- Seeding AI Assignment History ---');
    console.log(`Analyzing ${HISTORY_DAYS} days of history...`);

    const client = await pool.connect();

    try {
      // 1. Load employees from DB and settings from file
      const employees = await getEmployeesFromDb();
      const settingsData = readJsonFile(SETTINGS_FILE);

      if (!employees || !settingsData || !settingsData.templates || !settingsData.templates[0]) {
        throw new Error('Could not load employees from DB or settings data from gameplan-templates.json.');
      }

      const allEmployees = [].concat(...Object.values(employees));
      const defaultTemplate = settingsData.templates[0];

      const settings = {
        zones: defaultTemplate.zones || [],
        fittingRooms: defaultTemplate.fittingRooms || [],
        shifts: (defaultTemplate.shifts || []).map(s => s ? s.name : null).filter(Boolean),
        lunchTimes: defaultTemplate.lunchTimes || [],
        closingSections: defaultTemplate.closingSections || [],
      };

      console.log(`Found ${allEmployees.length} total employees.`);
      console.log(`Found ${settings.zones.length} zones, ${settings.shifts.length} shifts.`);

      // 2. Clear existing history to prevent duplicates
      await client.query('TRUNCATE TABLE task_assignment_history RESTART IDENTITY');
      console.log('Cleared existing assignment history.');

      // 3. Generate and insert data for the last 90 days
      const today = new Date();
      let recordsToInsert = [];

      for (let i = HISTORY_DAYS; i > 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const assignmentDate = date.toISOString().split('T')[0];

        // Simulate some employees being off
        const activeEmployees = allEmployees.filter(() => Math.random() > 0.15);

        for (const employee of activeEmployees) {
          const role = Object.keys(employees).find(r => employees[r].some(e => e.id === employee.id));
          if (!role) continue;

          let record = {
            employee_id: employee.id,
            assignment_date: assignmentDate,
            role_type: role,
            assigned_by: Math.random() > 0.2 ? 'AI_AGENT' : 'manager@suitsupply.com',
            ai_confidence: Math.random() * (0.98 - 0.85) + 0.85,
            manual_override: false,
          };

          if (role === 'SA') {
            const assignedZones = getRandomElements(settings.zones, 2);
            record = {
              ...record,
              assigned_zones: assignedZones,
              fitting_room: getRandomElement(settings.fittingRooms),
              shift: null,
              lunch_time: getRandomElement(settings.lunchTimes),
              closing_sections: getRandomElements(settings.closingSections, 2),
            };
          } else if (role === 'BOH') {
            record = {
              ...record,
              assigned_zones: null,
              fitting_room: null,
              shift: getRandomElement(settings.shifts),
              lunch_time: getRandomElement(settings.lunchTimes),
              closing_sections: getRandomElements(settings.closingSections, 2),
            };
          } else { // MANAGEMENT
             record = {
              ...record,
              shift: 'All Day',
              lunch_time: '13:00',
            };
          }
          
          recordsToInsert.push(record);
        }
      }
      
      // 4. Batch insert records
      if (recordsToInsert.length > 0) {
          const query = `
              INSERT INTO task_assignment_history (
                  employee_id, assignment_date, role_type, assigned_zones, fitting_room,
                  shift, lunch_time, closing_sections, assigned_by, ai_confidence, manual_override
              ) SELECT
                  p.employee_id, p.assignment_date, p.role_type, p.assigned_zones, p.fitting_room,
                  p.shift, p.lunch_time, p.closing_sections, p.assigned_by, p.ai_confidence, p.manual_override
              FROM
                  json_to_recordset($1) AS p (
                      employee_id VARCHAR(100), assignment_date DATE, role_type VARCHAR(50), assigned_zones TEXT[],
                      fitting_room VARCHAR(100), shift VARCHAR(100), lunch_time VARCHAR(50),
                      closing_sections TEXT[], assigned_by VARCHAR(100), ai_confidence DECIMAL(3,2),
                      manual_override BOOLEAN
                  )
          `;
          await client.query(query, [JSON.stringify(recordsToInsert)]);
          console.log(`Successfully inserted ${recordsToInsert.length} historical records.`);
      }


      console.log('--- Seeding complete! ---');

    } catch (err) {
      console.error('Error during seeding:', err);
    } finally {
      client.release();
    }
  }

  main().then(() => {
    console.log('Exiting seed script.');
    pool.end();
    exit(0);
  }).catch(err => {
      console.error("Unhandled error in seed script:", err);
      pool.end();
      exit(1);
  });
}

main().then(() => {
  console.log('Exiting seed script.');
  pool.end();
  exit(0);
}).catch(err => {
    console.error("Unhandled error in seed script:", err);
    pool.end();
    exit(1);
});
