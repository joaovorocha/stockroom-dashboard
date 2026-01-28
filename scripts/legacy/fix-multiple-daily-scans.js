#!/usr/bin/env node
/**
 * Fix multiple daily scan assignments in gameplans
 * Ensures only ONE employee per gameplan has dailyScanAssigned = true
 */

const fs = require('fs');
const path = require('path');

const GAMEPLAN_DIR = path.join(__dirname, 'data', 'gameplans');

function main() {
  if (!fs.existsSync(GAMEPLAN_DIR)) {
    console.log('Gameplans directory not found');
    return;
  }

  const files = fs.readdirSync(GAMEPLAN_DIR).filter(f => f.endsWith('.json'));
  console.log(`Checking ${files.length} gameplan files...`);

  let fixed = 0;
  let total = 0;

  files.forEach(file => {
    const filePath = path.join(GAMEPLAN_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (!data.assignments) return;

      // Find all employees with daily scan assigned
      const assigned = [];
      Object.keys(data.assignments).forEach(empId => {
        if (data.assignments[empId]?.dailyScanAssigned) {
          assigned.push({
            id: empId,
            assignedAt: data.assignments[empId].dailyScanAssignedAt || '1970-01-01T00:00:00.000Z'
          });
        }
      });

      // If more than one assignment, keep only the first one (by assignedAt)
      if (assigned.length > 1) {
        console.log(`\n${file}: Found ${assigned.length} daily scan assignments`);
        
        // Sort by assignedAt (earliest first)
        assigned.sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
        
        const keepId = assigned[0].id;
        console.log(`  Keeping: ${keepId} (assigned at ${assigned[0].assignedAt})`);
        
        // Remove from all others
        assigned.slice(1).forEach(a => {
          console.log(`  Removing: ${a.id}`);
          delete data.assignments[a.id].dailyScanAssigned;
          delete data.assignments[a.id].dailyScanAssignedBy;
          delete data.assignments[a.id].dailyScanAssignedAt;
        });

        // Write back
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        fixed++;
      }

      total++;
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  });

  console.log(`\nProcessed ${total} gameplans`);
  console.log(`Fixed ${fixed} gameplans with multiple assignments`);
}

main();
