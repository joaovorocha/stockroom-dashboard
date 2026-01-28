-- Migration: Create admin_audit_log table
-- Phase 5: Testing & Security
-- Date: January 28, 2026

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_log_action ON admin_audit_log(action);
CREATE INDEX idx_audit_log_user ON admin_audit_log(user_id);
CREATE INDEX idx_audit_log_store ON admin_audit_log(store_id);
CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_details ON admin_audit_log USING GIN (details);

-- Add comment
COMMENT ON TABLE admin_audit_log IS 'Tracks all admin actions for compliance and debugging';
