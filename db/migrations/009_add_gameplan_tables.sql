-- Migration: 009_add_gameplan_tables.sql
-- Creates tables for storing daily game plans, assignments, templates, and related data

-- ============================================================================
-- DAILY PLANS - Main table for each day's game plan
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_plans (
  id SERIAL PRIMARY KEY,
  plan_date DATE UNIQUE NOT NULL,
  notes TEXT,
  weather_notes TEXT,
  morning_notes TEXT,
  closing_notes TEXT,
  sales_goal DECIMAL(10,2),
  target_sph DECIMAL(6,2),
  target_ipc DECIMAL(4,2),
  inherited_from_date DATE,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  published_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_daily_plans_date ON daily_plans(plan_date);
CREATE INDEX idx_daily_plans_published ON daily_plans(is_published);

-- ============================================================================
-- PLAN ASSIGNMENTS - Employee assignments for each day
-- ============================================================================
CREATE TABLE IF NOT EXISTS plan_assignments (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES daily_plans(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  employee_id VARCHAR(100),
  employee_name VARCHAR(255),
  employee_type VARCHAR(50), -- 'SA', 'BOH', 'TAILOR', 'MANAGEMENT'
  
  -- Shift information
  is_off BOOLEAN DEFAULT false,
  shift VARCHAR(100),
  scheduled_lunch VARCHAR(50),
  lunch VARCHAR(50),
  role VARCHAR(100),
  station VARCHAR(100),
  task_of_the_day TEXT,
  
  -- Zone assignments
  zones TEXT[], -- ['Main Floor', 'Fitting Room', etc.]
  zone VARCHAR(100), -- Legacy single zone field
  fitting_room VARCHAR(50),
  
  -- Closing duties
  closing_sections TEXT[], -- ['Fitting Rooms', 'Cash Wrap', etc.]
  
  -- Scan assignment
  daily_scan_assignment_id INTEGER REFERENCES daily_scan_assignments(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(plan_id, user_id),
  CHECK (employee_type IN ('SA', 'BOH', 'TAILOR', 'MANAGEMENT'))
);

CREATE INDEX idx_plan_assignments_plan ON plan_assignments(plan_id);
CREATE INDEX idx_plan_assignments_user ON plan_assignments(user_id);
CREATE INDEX idx_plan_assignments_date_user ON plan_assignments(plan_id, user_id);
CREATE INDEX idx_plan_assignments_type ON plan_assignments(employee_type);

-- ============================================================================
-- GAMEPLAN TEMPLATES - Reusable templates for game plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS gameplan_templates (
  id SERIAL PRIMARY KEY,
  template_id VARCHAR(100) UNIQUE NOT NULL, -- 'gpt-123456-abc'
  store_id VARCHAR(50) DEFAULT 'sf',
  name VARCHAR(255) NOT NULL,
  weekday_index INTEGER, -- 0=Sunday, 6=Saturday, NULL=any day
  description TEXT,
  template_data JSONB NOT NULL, -- Full template structure
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (weekday_index IS NULL OR (weekday_index >= 0 AND weekday_index <= 6))
);

CREATE INDEX idx_gameplan_templates_store ON gameplan_templates(store_id);
CREATE INDEX idx_gameplan_templates_weekday ON gameplan_templates(weekday_index);
CREATE INDEX idx_gameplan_templates_name ON gameplan_templates(name);

-- ============================================================================
-- WEEKLY GOAL DISTRIBUTIONS - Weekly sales goal breakdown by day
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_goal_distributions (
  id SERIAL PRIMARY KEY,
  week_key VARCHAR(50) NOT NULL, -- '2026-W03'
  store_id VARCHAR(50) DEFAULT 'sf',
  week_start_date DATE NOT NULL,
  total_goal DECIMAL(10,2),
  daily_goals JSONB, -- {sun: 5000, mon: 8000, ...}
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(week_key, store_id)
);

CREATE INDEX idx_weekly_goals_week ON weekly_goal_distributions(week_key);
CREATE INDEX idx_weekly_goals_store ON weekly_goal_distributions(store_id);
CREATE INDEX idx_weekly_goals_start_date ON weekly_goal_distributions(week_start_date);

-- ============================================================================
-- NOTES TEMPLATES - Quick note templates for game plan
-- ============================================================================
CREATE TABLE IF NOT EXISTS notes_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  template_text TEXT NOT NULL,
  category VARCHAR(100), -- 'morning', 'closing', 'weather', 'general'
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, template_name)
);

CREATE INDEX idx_notes_templates_user ON notes_templates(user_id);
CREATE INDEX idx_notes_templates_category ON notes_templates(category);
CREATE INDEX idx_notes_templates_shared ON notes_templates(is_shared);

-- ============================================================================
-- GAMEPLAN AUDIT LOG - Track changes to game plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS gameplan_audit_log (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES daily_plans(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'published', 'deleted'
  changes JSONB, -- What changed
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gameplan_audit_plan ON gameplan_audit_log(plan_id);
CREATE INDEX idx_gameplan_audit_user ON gameplan_audit_log(user_id);
CREATE INDEX idx_gameplan_audit_action ON gameplan_audit_log(action);
CREATE INDEX idx_gameplan_audit_created ON gameplan_audit_log(created_at);

-- ============================================================================
-- Insert default data
-- ============================================================================

-- Add some default notes templates (if none exist)
INSERT INTO notes_templates (user_id, template_name, template_text, category, is_shared)
SELECT 1, 'Busy Weekend', 'Heavy foot traffic expected. All hands on deck!', 'general', true
WHERE NOT EXISTS (SELECT 1 FROM notes_templates WHERE template_name = 'Busy Weekend');

INSERT INTO notes_templates (user_id, template_name, template_text, category, is_shared)
SELECT 1, 'New Arrivals', 'New collection arrived - highlight to customers!', 'general', true
WHERE NOT EXISTS (SELECT 1 FROM notes_templates WHERE template_name = 'New Arrivals');

INSERT INTO notes_templates (user_id, template_name, template_text, category, is_shared)
SELECT 1, 'Deep Clean', 'Focus on store presentation and organization', 'closing', true
WHERE NOT EXISTS (SELECT 1 FROM notes_templates WHERE template_name = 'Deep Clean');
