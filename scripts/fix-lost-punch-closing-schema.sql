-- Fix Lost-Punch and Closing-Duties Tables
-- Update to match JSON structure with VARCHAR IDs

-- Drop and recreate lost_punch_requests
DROP TABLE IF EXISTS lost_punch_requests CASCADE;

CREATE TABLE lost_punch_requests (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  employee_name VARCHAR(255),
  employee_id VARCHAR(50),
  missed_date DATE,
  clock_in_time VARCHAR(10),
  lunch_out_time VARCHAR(10),
  lunch_in_time VARCHAR(10),
  clock_out_time VARCHAR(10),
  missed_time VARCHAR(10),
  punch_type VARCHAR(50),
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT NOW(),
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lost_punch_user ON lost_punch_requests(user_id);
CREATE INDEX idx_lost_punch_date ON lost_punch_requests(missed_date);
CREATE INDEX idx_lost_punch_status ON lost_punch_requests(status);

-- Drop and recreate closing_duties and closing_duty_tasks
DROP TABLE IF EXISTS closing_duty_tasks CASCADE;
DROP TABLE IF EXISTS closing_duties CASCADE;

CREATE TABLE closing_duties (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  date DATE NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  photo_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_closing_duties_user ON closing_duties(user_id);
CREATE INDEX idx_closing_duties_date ON closing_duties(date);

CREATE TABLE closing_duty_photos (
  id SERIAL PRIMARY KEY,
  duty_id VARCHAR(100) REFERENCES closing_duties(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  size INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_closing_photos_duty ON closing_duty_photos(duty_id);

COMMENT ON TABLE lost_punch_requests IS 'Lost punch requests from data/lost-punch-log.json';
COMMENT ON TABLE closing_duties IS 'Closing duty submissions from data/closing-duties-log.json';
COMMENT ON TABLE closing_duty_photos IS 'Photos attached to closing duty submissions';
