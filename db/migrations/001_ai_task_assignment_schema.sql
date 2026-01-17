-- AI Task Assignment System - Database Schema
-- Created: 2026-01-16
-- Purpose: Track task assignments, rotation fairness, and AI agent decisions

-- Task assignment history (for rotation fairness analysis)
CREATE TABLE IF NOT EXISTS task_assignment_history (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(100) NOT NULL,
  assignment_date DATE NOT NULL,
  role_type VARCHAR(50) NOT NULL, -- SA, BOH, MANAGEMENT
  assigned_zones TEXT[], -- e.g., ['Zone A', 'Zone B']
  fitting_room VARCHAR(100),
  shift VARCHAR(100),
  lunch_time VARCHAR(50),
  task_of_day TEXT,
  closing_sections TEXT[],
  assigned_by VARCHAR(100) DEFAULT 'AI_AGENT', -- 'AI_AGENT' or user email
  ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
  manual_override BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_employee_date UNIQUE(employee_id, assignment_date)
);

-- Employee performance metrics (used by AI for fair assignment)
CREATE TABLE IF NOT EXISTS employee_task_metrics (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(100) NOT NULL,
  metric_date DATE NOT NULL,
  
  -- Task completion metrics
  tasks_completed INTEGER DEFAULT 0,
  tasks_assigned INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2), -- percentage
  
  -- Zone/area assignment counts (for rotation fairness)
  zone_assignments JSONB, -- { "Zone A": 5, "Zone B": 3, ... }
  fitting_room_assignments JSONB, -- { "FR1": 2, "FR2": 4, ... }
  shift_assignments JSONB, -- { "Morning": 10, "Evening": 8, ... }
  
  -- Performance indicators
  avg_customer_satisfaction DECIMAL(3,2),
  items_processed INTEGER,
  avg_processing_time_minutes DECIMAL(5,2),
  
  -- Attendance/reliability
  days_worked INTEGER DEFAULT 0,
  days_late INTEGER DEFAULT 0,
  reliability_score DECIMAL(3,2), -- 0.00 to 1.00
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_employee_metric_date UNIQUE(employee_id, metric_date)
);

-- AI agent decisions log (for auditing and improvement)
CREATE TABLE IF NOT EXISTS ai_assignment_decisions (
  id SERIAL PRIMARY KEY,
  decision_date DATE NOT NULL,
  model_version VARCHAR(50), -- e.g., 'openvino-v1.0'
  execution_time_ms INTEGER,
  
  -- Input data snapshot
  available_employees INTEGER,
  required_positions JSONB, -- { "SA": 6, "BOH": 4, "MANAGEMENT": 2 }
  
  -- Assignment output
  assignments_generated JSONB, -- Full assignment object
  fairness_score DECIMAL(3,2), -- How fair is the rotation
  optimization_metrics JSONB, -- { "zone_balance": 0.95, "skill_match": 0.88 }
  
  -- Override tracking
  manager_approved BOOLEAN DEFAULT false,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  modifications JSONB, -- Track what manager changed
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Employee skills and preferences (for better AI matching)
CREATE TABLE IF NOT EXISTS employee_skills_preferences (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(100) UNIQUE NOT NULL,
  
  -- Skills (1-5 rating)
  customer_service_skill INTEGER DEFAULT 3,
  product_knowledge_skill INTEGER DEFAULT 3,
  tailoring_skill INTEGER DEFAULT 0,
  inventory_management_skill INTEGER DEFAULT 3,
  
  -- Preferences (soft constraints)
  preferred_zones TEXT[],
  preferred_shift_times TEXT[],
  avoid_zones TEXT[],
  
  -- Availability
  max_hours_per_week INTEGER DEFAULT 40,
  preferred_days_off TEXT[], -- ['Sunday', 'Monday']
  
  -- AI training data
  learns_quickly BOOLEAN DEFAULT true,
  works_well_in_teams BOOLEAN DEFAULT true,
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Camera event tracking (for Phase 2)
CREATE TABLE IF NOT EXISTS camera_events (
  id SERIAL PRIMARY KEY,
  camera_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'employee_detected', 'stock_issue', 'behavior_alert'
  timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Employee identification
  detected_employee_id VARCHAR(100),
  detection_confidence DECIMAL(3,2),
  
  -- Location
  zone_code VARCHAR(50),
  camera_location VARCHAR(255),
  
  -- Event data
  event_data JSONB, -- Flexible storage for different event types
  image_path TEXT, -- Path to stored image/frame
  
  -- AI analysis
  analyzed_by VARCHAR(50), -- 'local_npu' or 'google_vision'
  analysis_results JSONB,
  
  -- Action tracking
  requires_action BOOLEAN DEFAULT false,
  action_taken TEXT,
  action_by VARCHAR(255),
  action_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI insights and recommendations
CREATE TABLE IF NOT EXISTS ai_insights (
  id SERIAL PRIMARY KEY,
  insight_date DATE NOT NULL,
  insight_type VARCHAR(100) NOT NULL, -- 'task_optimization', 'stock_issue', 'employee_pattern'
  
  -- Insight content
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(50), -- 'info', 'warning', 'critical'
  
  -- Supporting data
  evidence_data JSONB,
  confidence_score DECIMAL(3,2),
  
  -- Recommendations
  recommended_actions TEXT[],
  estimated_impact JSONB, -- { "time_saved": "2h", "cost_reduction": "$50" }
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'reviewed', 'implemented', 'dismissed'
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  implementation_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_task_history_employee ON task_assignment_history(employee_id);
CREATE INDEX idx_task_history_date ON task_assignment_history(assignment_date);
CREATE INDEX idx_employee_metrics_date ON employee_task_metrics(metric_date);
CREATE INDEX idx_camera_events_timestamp ON camera_events(timestamp);
CREATE INDEX idx_camera_events_employee ON camera_events(detected_employee_id);
CREATE INDEX idx_ai_insights_date ON ai_insights(insight_date);
CREATE INDEX idx_ai_insights_status ON ai_insights(status);

-- Comments for documentation
COMMENT ON TABLE task_assignment_history IS 'Tracks all historical task assignments for rotation fairness analysis';
COMMENT ON TABLE employee_task_metrics IS 'Stores employee performance metrics used by AI for fair task distribution';
COMMENT ON TABLE ai_assignment_decisions IS 'Logs AI agent decisions for auditing and continuous improvement';
COMMENT ON TABLE camera_events IS 'Records events detected by camera monitoring system';
COMMENT ON TABLE ai_insights IS 'Stores AI-generated insights and recommendations for operations improvement';
