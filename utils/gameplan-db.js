// Gameplan Database Access Layer
// Helper functions for gameplan database operations

const { query: pgQuery } = require('./dal/pg');

/**
 * Get or create a daily plan for a specific date
 */
async function getOrCreateDailyPlan(planDate) {
  try {
    // Try to get existing plan
    let result = await pgQuery(
      'SELECT * FROM daily_plans WHERE plan_date = $1',
      [planDate]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new plan
    result = await pgQuery(
      `INSERT INTO daily_plans (plan_date, notes) 
       VALUES ($1, '') 
       RETURNING *`,
      [planDate]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error getting/creating daily plan:', error);
    throw error;
  }
}

/**
 * Get daily plan with all assignments
 */
async function getDailyPlanWithAssignments(planDate) {
  try {
    const plan = await getOrCreateDailyPlan(planDate);
    
    const assignmentsResult = await pgQuery(
      `SELECT pa.*, u.name, u.email, u.role, u.image_url
       FROM plan_assignments pa
       LEFT JOIN users u ON pa.user_id = u.id
       WHERE pa.plan_id = $1
       ORDER BY pa.employee_type, pa.employee_name`,
      [plan.id]
    );
    
    return {
      ...plan,
      assignments: assignmentsResult.rows
    };
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error getting plan with assignments:', error);
    throw error;
  }
}

/**
 * Save or update a plan assignment
 */
async function savePlanAssignment(planId, userId, assignmentData) {
  try {
    const {
      employeeId,
      employeeName,
      employeeType,
      isOff = false,
      shift = '',
      scheduledLunch = '',
      lunch = '',
      role = '',
      station = '',
      taskOfTheDay = '',
      zones = [],
      zone = '',
      fittingRoom = '',
      closingSections = []
    } = assignmentData;
    
    const result = await pgQuery(
      `INSERT INTO plan_assignments (
        plan_id, user_id, employee_id, employee_name, employee_type,
        is_off, shift, scheduled_lunch, lunch, role, station, task_of_the_day,
        zones, zone, fitting_room, closing_sections, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
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
        task_of_the_day = EXCLUDED.task_of_the_day,
        zones = EXCLUDED.zones,
        zone = EXCLUDED.zone,
        fitting_room = EXCLUDED.fitting_room,
        closing_sections = EXCLUDED.closing_sections,
        updated_at = NOW()
      RETURNING *`,
      [planId, userId, employeeId, employeeName, employeeType,
       isOff, shift, scheduledLunch, lunch, role, station, taskOfTheDay,
       zones, zone, fittingRoom, closingSections]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error saving plan assignment:', error);
    throw error;
  }
}

/**
 * Update daily plan notes and metadata
 */
async function updateDailyPlan(planDate, updates) {
  try {
    const { notes, weatherNotes, morningNotes, closingNotes, salesGoal, targetSph, targetIpc } = updates;
    
    const result = await pgQuery(
      `UPDATE daily_plans 
       SET notes = COALESCE($2, notes),
           weather_notes = COALESCE($3, weather_notes),
           morning_notes = COALESCE($4, morning_notes),
           closing_notes = COALESCE($5, closing_notes),
           sales_goal = COALESCE($6, sales_goal),
           target_sph = COALESCE($7, target_sph),
           target_ipc = COALESCE($8, target_ipc),
           updated_at = NOW()
       WHERE plan_date = $1
       RETURNING *`,
      [planDate, notes, weatherNotes, morningNotes, closingNotes, salesGoal, targetSph, targetIpc]
    );
    
    if (result.rows.length === 0) {
      // Plan doesn't exist, create it
      return getOrCreateDailyPlan(planDate);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error updating daily plan:', error);
    throw error;
  }
}

/**
 * Publish a daily plan
 */
async function publishDailyPlan(planDate, userId) {
  try {
    const result = await pgQuery(
      `UPDATE daily_plans 
       SET is_published = true,
           published_at = NOW(),
           published_by = $2,
           updated_at = NOW()
       WHERE plan_date = $1
       RETURNING *`,
      [planDate, userId]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error publishing daily plan:', error);
    throw error;
  }
}

/**
 * Delete all assignments for a specific date (for reset)
 */
async function clearPlanAssignments(planDate) {
  try {
    const plan = await getOrCreateDailyPlan(planDate);
    await pgQuery('DELETE FROM plan_assignments WHERE plan_id = $1', [plan.id]);
    return true;
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error clearing plan assignments:', error);
    throw error;
  }
}

/**
 * Get yesterday's plan for inheritance
 */
async function getYesterdayPlan(currentDate) {
  try {
    const yesterday = new Date(currentDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    return await getDailyPlanWithAssignments(yesterdayStr);
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error getting yesterday plan:', error);
    return null;
  }
}

/**
 * Copy yesterday's closing sections to today
 */
async function inheritClosingSections(todayDate, yesterdayDate) {
  try {
    const todayPlan = await getOrCreateDailyPlan(todayDate);
    const yesterdayPlan = await getDailyPlanWithAssignments(yesterdayDate);
    
    if (!yesterdayPlan || !yesterdayPlan.assignments) {
      return [];
    }
    
    const inherited = [];
    for (const assignment of yesterdayPlan.assignments) {
      if (assignment.closing_sections && assignment.closing_sections.length > 0) {
        await savePlanAssignment(todayPlan.id, assignment.user_id, {
          employeeId: assignment.employee_id,
          employeeName: assignment.employee_name,
          employeeType: assignment.employee_type,
          closingSections: assignment.closing_sections
        });
        inherited.push(assignment);
      }
    }
    
    if (inherited.length > 0) {
      await pgQuery(
        'UPDATE daily_plans SET inherited_from_date = $2 WHERE id = $1',
        [todayPlan.id, yesterdayDate]
      );
    }
    
    return inherited;
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error inheriting closing sections:', error);
    throw error;
  }
}

/**
 * Log gameplan action for audit trail
 */
async function logGameplanAction(planId, userId, action, changes = {}, req = null) {
  try {
    const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
    const userAgent = req?.get?.('user-agent') || null;
    
    await pgQuery(
      `INSERT INTO gameplan_audit_log (plan_id, user_id, action, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [planId, userId, action, JSON.stringify(changes), ipAddress, userAgent]
    );
  } catch (error) {
    console.error('[GAMEPLAN-DB] Error logging gameplan action:', error);
    // Don't throw - audit log failures shouldn't break the main operation
  }
}

module.exports = {
  getOrCreateDailyPlan,
  getDailyPlanWithAssignments,
  savePlanAssignment,
  updateDailyPlan,
  publishDailyPlan,
  clearPlanAssignments,
  getYesterdayPlan,
  inheritClosingSections,
  logGameplanAction
};
