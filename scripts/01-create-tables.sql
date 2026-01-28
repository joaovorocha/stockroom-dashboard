-- Complete PostgreSQL Migration Schema
-- Run this first to create all tables

-- ======================
-- STORES TABLE (Multi-store support)
-- ======================
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  phone VARCHAR(50),
  timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert San Francisco store
INSERT INTO stores (name, code, city, state, timezone)
VALUES ('San Francisco', 'SF', 'San Francisco', 'CA', 'America/Los_Angeles')
ON CONFLICT (code) DO NOTHING;

-- ======================
-- USERS TABLE (replaces data/users.json)
-- ======================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50),
  login_alias VARCHAR(100),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'SA',
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  image_url TEXT,
  is_manager BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  can_edit_gameplan BOOLEAN DEFAULT false,
  can_manage_lost_punch BOOLEAN DEFAULT false,
  can_access_admin BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ======================
-- USER SESSIONS (replaces cookie-only sessions)
-- ======================
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(200) UNIQUE NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ======================
-- PASSWORD RESET TOKENS
-- ======================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(200) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token);

-- ======================
-- USER AUDIT LOG
-- ======================
CREATE TABLE IF NOT EXISTS user_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON user_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_date ON user_audit_log(created_at);

-- ======================
-- TIME OFF REQUESTS (replaces data/timeoff.json)
-- ======================
CREATE TABLE IF NOT EXISTS timeoff_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested DECIMAL(4,2) NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'PENDING',
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  denial_reason TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeoff_user ON timeoff_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_timeoff_status ON timeoff_requests(status);
CREATE INDEX IF NOT EXISTS idx_timeoff_date ON timeoff_requests(start_date);

-- ======================
-- TIME OFF BALANCES
-- ======================
CREATE TABLE IF NOT EXISTS timeoff_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  vacation_hours DECIMAL(6,2) DEFAULT 0,
  sick_hours DECIMAL(6,2) DEFAULT 0,
  personal_hours DECIMAL(6,2) DEFAULT 0,
  vacation_used DECIMAL(6,2) DEFAULT 0,
  sick_used DECIMAL(6,2) DEFAULT 0,
  personal_used DECIMAL(6,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- ======================
-- TIME OFF AUDIT LOG
-- ======================
CREATE TABLE IF NOT EXISTS timeoff_audit_log (
  id SERIAL PRIMARY KEY,
  request_id INTEGER REFERENCES timeoff_requests(id) ON DELETE CASCADE,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ======================
-- FEEDBACK (replaces data/feedback.json)
-- ======================
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  status VARCHAR(50) DEFAULT 'NEW',
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(category);

-- ======================
-- LOST PUNCH REQUESTS (replaces data/lost-punch.json)
-- ======================
CREATE TABLE IF NOT EXISTS lost_punch_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  total_hours DECIMAL(4,2),
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  denial_reason TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lostpunch_user ON lost_punch_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_lostpunch_status ON lost_punch_requests(status);
CREATE INDEX IF NOT EXISTS idx_lostpunch_date ON lost_punch_requests(date);

-- ======================
-- CLOSING DUTIES (replaces data/closing-duties.json)
-- ======================
CREATE TABLE IF NOT EXISTS closing_duties (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  completed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closing_user ON closing_duties(user_id);
CREATE INDEX IF NOT EXISTS idx_closing_date ON closing_duties(date);

CREATE TABLE IF NOT EXISTS closing_duty_tasks (
  id SERIAL PRIMARY KEY,
  closing_duty_id INTEGER REFERENCES closing_duties(id) ON DELETE CASCADE,
  task_name VARCHAR(200) NOT NULL,
  completed BOOLEAN DEFAULT false,
  photo_url TEXT,
  notes TEXT,
  completed_at TIMESTAMP
);

-- ======================
-- SUCCESS MESSAGE
-- ======================
DO $$
BEGIN
  RAISE NOTICE '✅ All tables created successfully!';
  RAISE NOTICE 'Next: Run scripts/02-migrate-auth.js';
END $$;
