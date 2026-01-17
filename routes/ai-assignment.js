/**
 * AI Task Assignment API Routes
 * Provides endpoints for AI-powered fair task assignment generation
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING || 'postgresql://suit@localhost/stockroom_dashboard'
});

// Middleware: Require manager access
function requireManager(req, res, next) {
  const user = req.user;
  if (user?.isManager || user?.isAdmin || user?.canEditGameplan) return next();
  return res.status(403).json({ error: 'Manager access required' });
}

/**
 * POST /api/ai/generate-gameplan
 * Generate AI-powered task assignments for a specific date
 */
router.post('/generate-gameplan', requireManager, async (req, res) => {
  try {
    const { date, employees, settings } = req.body;
    
    if (!date || !employees || !settings) {
      return res.status(400).json({ 
        error: 'Missing required fields: date, employees, settings' 
      });
    }
    
    console.log(`[AI] Generating gameplan for ${date}`);
    
    // Call Python fair rotation agent using venv
    const agentPath = path.join(__dirname, '../ai-services/task-assignment/fair_rotation_agent.py');
    const pythonPath = '/var/www/stockroom-dashboard/ai-services/.venv/bin/python';
    
    const pythonProcess = spawn(pythonPath, [agentPath], {
      cwd: '/var/www/stockroom-dashboard',
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        AI_MODE: 'generate',
        AI_DATE: date,
        AI_EMPLOYEES: JSON.stringify(employees),
        AI_SETTINGS: JSON.stringify(settings),
        PG_CONNECTION_STRING: process.env.PG_CONNECTION_STRING || 'postgresql:///stockroom_dashboard?host=/var/run/postgresql'
      }
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[AI Error]', data.toString());
    });
    
    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error('[AI] Process failed:', errorOutput);
        return res.status(500).json({ 
          error: 'AI agent failed', 
          details: errorOutput 
        });
      }
      
      try {
        // Prefer Python output if available
        let parsed = null;
        try {
          parsed = output ? JSON.parse(output) : null;
        } catch (parseErr) {
          console.warn('[AI] Python output not JSON, falling back to Node wrapper');
        }

        if (parsed && parsed.assignments) {
          return res.json(parsed);
        }

        // Fallback to Node.js wrapper
        const assignments = await generateAssignmentsNode(date, employees, settings);
        return res.json(assignments);
      } catch (err) {
        console.error('[AI] Error:', err);
        return res.status(500).json({ error: err.message });
      }
    });
    
  } catch (error) {
    console.error('[AI] Error generating gameplan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Temporary Node.js wrapper for AI agent
 * (Until Python integration is complete)
 */
async function generateAssignmentsNode(date, employees, settings) {
  // Simple fair rotation logic in Node.js
  // This is a placeholder until Python agent is fully integrated
  
  const assignments = {};
  const allEmployeeIds = [];
  
  // Get historical data from database
  const historyDays = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - historyDays);
  
  // Collect all employee IDs
  for (const role of ['SA', 'BOH', 'MANAGEMENT']) {
    if (employees[role]) {
      for (const emp of employees[role]) {
        allEmployeeIds.push(emp.id);
      }
    }
  }
  
  // Load assignment history
  const historyQuery = `
    SELECT 
      employee_id,
      assigned_zones,
      fitting_room,
      shift,
      lunch_time,
      closing_sections
    FROM task_assignment_history
    WHERE employee_id = ANY($1::text[])
      AND assignment_date >= $2
    ORDER BY assignment_date DESC
  `;
  
  const historyResult = await pool.query(historyQuery, [allEmployeeIds, cutoffDate]);
  
  // Build history counters
  const history = {};
  for (const row of historyResult.rows) {
    const empId = row.employee_id;
    if (!history[empId]) {
      history[empId] = {
        zones: {},
        fittingRooms: {},
        shifts: {},
        lunchTimes: {},
        closingSections: {}
      };
    }
    
    // Count zone assignments
    if (row.assigned_zones) {
      for (const zone of row.assigned_zones) {
        history[empId].zones[zone] = (history[empId].zones[zone] || 0) + 1;
      }
    }
    
    // Count fitting room assignments
    if (row.fitting_room) {
      history[empId].fittingRooms[row.fitting_room] = 
        (history[empId].fittingRooms[row.fitting_room] || 0) + 1;
    }
    
    // Count shift assignments
    if (row.shift) {
      history[empId].shifts[row.shift] = 
        (history[empId].shifts[row.shift] || 0) + 1;
    }
    
    // Count lunch times
    if (row.lunch_time) {
      history[empId].lunchTimes[row.lunch_time] = 
        (history[empId].lunchTimes[row.lunch_time] || 0) + 1;
    }
    
    // Count closing sections
    if (row.closing_sections) {
      for (const section of row.closing_sections) {
        history[empId].closingSections[section] = 
          (history[empId].closingSections[section] || 0) + 1;
      }
    }
  }
  
  // Assign SA employees (fair rotation)
  const saEmployees = employees.SA || [];
  const zones = settings.zones || [];
  const fittingRooms = settings.fittingRooms || [];
  const lunchTimes = settings.lunchTimes || [];
  const closingSections = settings.closingSections || [];
  
  const zoneUsage = {};
  const roomUsage = {};
  
  for (const emp of saEmployees) {
    const empId = emp.id;
    const empHistory = history[empId] || { zones: {}, fittingRooms: {}, lunchTimes: {}, closingSections: {} };
    
    // Find least-assigned zones
    const sortedZones = zones.slice().sort((a, b) => {
      const aCount = (empHistory.zones[a] || 0) + (zoneUsage[a] || 0);
      const bCount = (empHistory.zones[b] || 0) + (zoneUsage[b] || 0);
      return aCount - bCount;
    });
    
    const assignedZones = sortedZones.slice(0, 2);
    assignedZones.forEach(z => zoneUsage[z] = (zoneUsage[z] || 0) + 1);
    
    // Find least-assigned fitting room
    const sortedRooms = fittingRooms.slice().sort((a, b) => {
      const aCount = (empHistory.fittingRooms[a] || 0) + (roomUsage[a] || 0);
      const bCount = (empHistory.fittingRooms[b] || 0) + (roomUsage[b] || 0);
      return aCount - bCount;
    });
    
    const assignedRoom = sortedRooms[0] || '';
    if (assignedRoom) roomUsage[assignedRoom] = (roomUsage[assignedRoom] || 0) + 1;
    
    // Find least-assigned lunch time
    const sortedLunches = lunchTimes.slice().sort((a, b) => {
      const aCount = empHistory.lunchTimes[a] || 0;
      const bCount = empHistory.lunchTimes[b] || 0;
      return aCount - bCount;
    });
    
    // Find least-assigned closing sections
    const sortedSections = closingSections.slice().sort((a, b) => {
      const aCount = empHistory.closingSections[a] || 0;
      const bCount = empHistory.closingSections[b] || 0;
      return aCount - bCount;
    });
    
    assignments[empId] = {
      type: 'SA',
      zones: assignedZones,
      zone: assignedZones[0] || '',
      fittingRoom: assignedRoom,
      scheduledLunch: sortedLunches[0] || '12:00',
      closingSections: sortedSections.slice(0, 2),
      individualTarget: 1000
    };
  }
  
  // Assign BOH employees
  const bohEmployees = employees.BOH || [];
  const shifts = settings.shifts || [];
  
  for (const emp of bohEmployees) {
    const empId = emp.id;
    const empHistory = history[empId] || { shifts: {}, lunchTimes: {}, closingSections: {} };
    
    const sortedShifts = shifts.slice().sort((a, b) => {
      const aCount = empHistory.shifts[a] || 0;
      const bCount = empHistory.shifts[b] || 0;
      return aCount - bCount;
    });
    
    const sortedLunches = lunchTimes.slice().sort((a, b) => {
      const aCount = empHistory.lunchTimes[a] || 0;
      const bCount = empHistory.lunchTimes[b] || 0;
      return aCount - bCount;
    });
    
    const sortedSections = closingSections.slice().sort((a, b) => {
      const aCount = empHistory.closingSections[a] || 0;
      const bCount = empHistory.closingSections[b] || 0;
      return aCount - bCount;
    });
    
    assignments[empId] = {
      type: 'BOH',
      shift: sortedShifts[0] || '',
      lunch: sortedLunches[0] || '12:00',
      taskOfTheDay: '',
      closingSections: sortedSections.slice(0, 2)
    };
  }
  
  // Assign MANAGEMENT employees
  const mgmtEmployees = employees.MANAGEMENT || [];
  
  for (const emp of mgmtEmployees) {
    const empId = emp.id;
    assignments[empId] = {
      type: 'MANAGEMENT',
      shift: 'All Day',
      lunch: '13:00',
      role: 'Management'
    };
  }
  
  // Calculate fairness score (simple variance check)
  const zoneVariance = Object.values(zoneUsage).length > 0 
    ? calculateVariance(Object.values(zoneUsage)) 
    : 0;
  const fairnessScore = Math.max(0, 1 - (zoneVariance / 10));
  
  // Save decision to database
  const decisionQuery = `
    INSERT INTO ai_assignment_decisions (
      decision_date,
      model_version,
      execution_time_ms,
      available_employees,
      required_positions,
      assignments_generated,
      fairness_score,
      optimization_metrics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  
  const employeeCounts = {
    SA: saEmployees.length,
    BOH: bohEmployees.length,
    MANAGEMENT: mgmtEmployees.length
  };
  
  const decisionResult = await pool.query(decisionQuery, [
    date,
    'node_fair_rotation_v1.0',
    50, // execution_time_ms (placeholder)
    Object.keys(assignments).length,
    JSON.stringify(employeeCounts),
    JSON.stringify(assignments),
    fairnessScore.toFixed(2),
    JSON.stringify({ confidence: 0.90, history_days: historyDays })
  ]);
  
  const decisionId = decisionResult.rows[0].id;
  
  return {
    success: true,
    decision_id: decisionId,
    date,
    assignments,
    metadata: {
      fairness_score: parseFloat(fairnessScore.toFixed(2)),
      algorithm_version: 'node_fair_rotation_v1.0',
      execution_time_ms: 50,
      confidence: 0.90,
      employees_assigned: Object.keys(assignments).length,
      history_days_analyzed: historyDays
    }
  };
}

function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * GET /api/ai/assignment-history/:employeeId
 * Get historical assignments for an employee
 */
router.get('/assignment-history/:employeeId', requireManager, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const days = parseInt(req.query.days || '30');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const query = `
      SELECT 
        assignment_date,
        role_type,
        assigned_zones,
        fitting_room,
        shift,
        lunch_time,
        closing_sections,
        assigned_by,
        ai_confidence
      FROM task_assignment_history
      WHERE employee_id = $1
        AND assignment_date >= $2
      ORDER BY assignment_date DESC
    `;
    
    const result = await pool.query(query, [employeeId, cutoffDate]);
    
    const history = result.rows.map(row => ({
      date: row.assignment_date,
      role: row.role_type,
      zones: row.assigned_zones,
      fittingRoom: row.fitting_room,
      shift: row.shift,
      lunchTime: row.lunch_time,
      closingSections: row.closing_sections,
      assignedBy: row.assigned_by,
      aiConfidence: row.ai_confidence
    }));
    
    res.json({
      success: true,
      employeeId,
      daysAnalyzed: days,
      totalAssignments: history.length,
      history
    });
    
  } catch (error) {
    console.error('[AI] Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ai/fairness-metrics
 * Get fairness metrics for all employees
 */
router.get('/fairness-metrics', requireManager, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '90');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const query = `
      SELECT 
        employee_id,
        assigned_zones,
        fitting_room,
        shift
      FROM task_assignment_history
      WHERE assignment_date >= $1
    `;
    
    const result = await pool.query(query, [cutoffDate]);
    
    const metrics = {};
    
    for (const row of result.rows) {
      const empId = row.employee_id;
      if (!metrics[empId]) {
        metrics[empId] = {
          totalAssignments: 0,
          zones: {},
          fittingRooms: {},
          shifts: {}
        };
      }
      
      metrics[empId].totalAssignments++;
      
      if (row.assigned_zones) {
        for (const zone of row.assigned_zones) {
          metrics[empId].zones[zone] = (metrics[empId].zones[zone] || 0) + 1;
        }
      }
      
      if (row.fitting_room) {
        metrics[empId].fittingRooms[row.fitting_room] = 
          (metrics[empId].fittingRooms[row.fitting_room] || 0) + 1;
      }
      
      if (row.shift) {
        metrics[empId].shifts[row.shift] = 
          (metrics[empId].shifts[row.shift] || 0) + 1;
      }
    }
    
    res.json({
      success: true,
      daysAnalyzed: days,
      employeesAnalyzed: Object.keys(metrics).length,
      metrics
    });
    
  } catch (error) {
    console.error('[AI] Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * GET /api/ai/preferences/:employeeId
 * Get AI assignment preferences for a single employee
 */
router.get('/preferences/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        // Ensure current user can only view their own preferences (or if manager)
        if (req.user.employee_id !== employeeId && !req.user.isManager) {
            return res.status(403).json({ error: 'You can only view your own preferences.'});
        }

        const result = await pool.query(
            'SELECT * FROM employee_skills_preferences WHERE employee_id = $1',
            [employeeId]
        );

        if (result.rows.length === 0) {
            // Return a default empty state instead of 404
            return res.json({ 
                employee_id: employeeId,
                preferred_zones: [],
                avoid_zones: [],
                preferred_shift_times: [],
                prefers_closing: false,
                avoids_clopens: true // Default to avoiding clopens
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('[AI] Error fetching preferences:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/ai/preferences
 * Save AI assignment preferences for an employee
 */
router.post('/preferences', async (req, res) => {
    try {
        const {
            employee_id,
            preferred_zones,
            avoid_zones,
            preferred_shift_times,
            prefers_closing,
            avoids_clopens
        } = req.body;

        // Basic validation
        if (!employee_id) {
            return res.status(400).json({ error: 'employee_id is required.' });
        }
        
        // Ensure current user can only edit their own preferences (or if manager)
        if (req.user.employee_id !== employee_id && !req.user.isManager) {
            return res.status(403).json({ error: 'You can only edit your own preferences.'});
        }

        const query = `
            INSERT INTO employee_skills_preferences (
                employee_id, preferred_zones, avoid_zones, preferred_shift_times, 
                prefers_closing, avoids_clopens, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (employee_id) DO UPDATE SET
                preferred_zones = EXCLUDED.preferred_zones,
                avoid_zones = EXCLUDED.avoid_zones,
                preferred_shift_times = EXCLUDED.preferred_shift_times,
                prefers_closing = EXCLUDED.prefers_closing,
                avoids_clopens = EXCLUDED.avoids_clopens,
                updated_at = NOW();
        `;
        
        await pool.query(query, [
            employee_id,
            preferred_zones,
            avoid_zones,
            preferred_shift_times,
            prefers_closing,
            avoids_clopens
        ]);

        res.status(200).json({ success: true, message: 'Preferences saved.' });

    } catch (error) {
        console.error('[AI] Error saving preferences:', error);
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;
