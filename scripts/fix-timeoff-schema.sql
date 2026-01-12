-- Fix Time-Off Tables to Match JSON Structure
-- Drop and recreate with correct schema

-- Drop existing tables (cascade to audit log)
DROP TABLE IF EXISTS timeoff_audit_log CASCADE;
DROP TABLE IF EXISTS timeoff_balances CASCADE;
DROP TABLE IF EXISTS timeoff_requests CASCADE;

-- Create timeoff_requests with VARCHAR id (matches JSON)
CREATE TABLE timeoff_requests (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(50) DEFAULT 'vacation',
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP,
  decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  workday_status VARCHAR(50),
  processed_at TIMESTAMP,
  processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_timeoff_user ON timeoff_requests(user_id);
CREATE INDEX idx_timeoff_status ON timeoff_requests(status);
CREATE INDEX idx_timeoff_dates ON timeoff_requests(start_date, end_date);

-- Create timeoff_balances (for future use)
CREATE TABLE timeoff_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  vacation_days DECIMAL(5,2) DEFAULT 0,
  sick_days DECIMAL(5,2) DEFAULT 0,
  personal_days DECIMAL(5,2) DEFAULT 0,
  used_vacation DECIMAL(5,2) DEFAULT 0,
  used_sick DECIMAL(5,2) DEFAULT 0,
  used_personal DECIMAL(5,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year)
);

CREATE INDEX idx_balance_user ON timeoff_balances(user_id);
CREATE INDEX idx_balance_year ON timeoff_balances(year);

-- Create audit log
CREATE TABLE timeoff_audit_log (
  id SERIAL PRIMARY KEY,
  request_id VARCHAR(100) REFERENCES timeoff_requests(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_timeoff_audit_request ON timeoff_audit_log(request_id);
CREATE INDEX idx_timeoff_audit_date ON timeoff_audit_log(created_at);

COMMENT ON TABLE timeoff_requests IS 'Time-off requests from data/time-off.json';
COMMENT ON TABLE timeoff_balances IS 'Time-off balance tracking per user per year';
COMMENT ON TABLE timeoff_audit_log IS 'Audit trail for time-off request changes';
