-- Migration: 006_create_settings_tables.sql
-- Description: Create global_settings, store_settings, and support_tickets tables
-- Date: 2026-01-28
-- Phase: Multi-Store Login & Admin Panel - Phase 1

-- =====================================================
-- CREATE GLOBAL_SETTINGS TABLE
-- =====================================================

-- Global settings apply to all stores unless overridden
-- Only super admins can modify these settings

CREATE TABLE IF NOT EXISTS global_settings (
  id SERIAL PRIMARY KEY,
  
  -- Setting identification
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  
  -- Type information for proper parsing
  -- 'string', 'number', 'boolean', 'json', 'url', 'email'
  setting_type VARCHAR(50) DEFAULT 'string' 
    CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'url', 'email')),
  
  -- Categorization for UI grouping
  -- 'system', 'legal', 'compliance', 'support', 'email', 'security'
  category VARCHAR(50) 
    CHECK (category IN ('system', 'legal', 'compliance', 'support', 'email', 'security', 'display')),
  
  -- Human-readable description
  description TEXT,
  
  -- Can stores override this setting?
  is_editable_by_store BOOLEAN DEFAULT false,
  
  -- Is this a sensitive setting (hide value in logs)?
  is_sensitive BOOLEAN DEFAULT false,
  
  -- Validation rules (JSON format)
  -- e.g., {"min": 0, "max": 100} for numbers
  -- e.g., {"pattern": "^https?://"} for URLs
  validation_rules JSONB,
  
  -- Audit trail
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for category-based queries (settings UI)
CREATE INDEX IF NOT EXISTS idx_global_settings_category 
  ON global_settings(category);

-- =====================================================
-- CREATE STORE_SETTINGS TABLE
-- =====================================================

-- Store-specific settings that can override global settings
-- Store admins can modify these (where allowed by global setting)

CREATE TABLE IF NOT EXISTS store_settings (
  id SERIAL PRIMARY KEY,
  
  -- Which store this setting belongs to
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Setting identification (must match global_settings.setting_key to override)
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  
  -- Type should match global setting type
  setting_type VARCHAR(50) DEFAULT 'string'
    CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'url', 'email')),
  
  -- Categorization
  category VARCHAR(50),
  
  -- Description (optional, inherits from global)
  description TEXT,
  
  -- Does this override a global setting?
  overrides_global BOOLEAN DEFAULT false,
  
  -- Audit trail
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- One setting per store
  UNIQUE(store_id, setting_key)
);

-- Indexes for store_settings
CREATE INDEX IF NOT EXISTS idx_store_settings_store 
  ON store_settings(store_id);

CREATE INDEX IF NOT EXISTS idx_store_settings_category 
  ON store_settings(category);

CREATE INDEX IF NOT EXISTS idx_store_settings_key 
  ON store_settings(setting_key);

-- =====================================================
-- CREATE SUPPORT_TICKETS TABLE
-- =====================================================

-- Helpdesk ticket system for store support requests

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  
  -- Human-readable ticket number (e.g., TKT-2026-0001)
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  
  -- Which store is this ticket for? (NULL = system-wide)
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  
  -- Who created and who's assigned
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Ticket content
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'waiting_response', 'resolved', 'closed')),
  
  -- Priority levels
  priority VARCHAR(50) DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Category for routing
  category VARCHAR(50)
    CHECK (category IN ('technical', 'legal', 'hr', 'operations', 'data', 'access', 'other')),
  
  -- Resolution details
  resolution TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  
  -- SLA tracking (minutes)
  response_time_minutes INTEGER,
  resolution_time_minutes INTEGER
);

-- Indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_store 
  ON support_tickets(store_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status 
  ON support_tickets(status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned 
  ON support_tickets(assigned_to);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by 
  ON support_tickets(created_by);

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority 
  ON support_tickets(priority);

CREATE INDEX IF NOT EXISTS idx_support_tickets_category 
  ON support_tickets(category);

-- Composite index for common query: open high-priority tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_open_priority 
  ON support_tickets(status, priority) 
  WHERE status IN ('open', 'in_progress');

-- =====================================================
-- CREATE TICKET_COMMENTS TABLE
-- =====================================================

-- Comments/replies on support tickets

CREATE TABLE IF NOT EXISTS ticket_comments (
  id SERIAL PRIMARY KEY,
  
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Comment content
  comment TEXT NOT NULL,
  
  -- Is this an internal note (not visible to requester)?
  is_internal BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket 
  ON ticket_comments(ticket_id);

-- =====================================================
-- CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to get effective setting value (store override or global)
CREATE OR REPLACE FUNCTION get_setting_value(
  p_store_id INTEGER,
  p_setting_key VARCHAR
) RETURNS TEXT AS $$
DECLARE
  v_store_value TEXT;
  v_global_value TEXT;
BEGIN
  -- Try to get store-specific value first
  IF p_store_id IS NOT NULL THEN
    SELECT setting_value INTO v_store_value
    FROM store_settings
    WHERE store_id = p_store_id AND setting_key = p_setting_key;
    
    IF v_store_value IS NOT NULL THEN
      RETURN v_store_value;
    END IF;
  END IF;
  
  -- Fall back to global value
  SELECT setting_value INTO v_global_value
  FROM global_settings
  WHERE setting_key = p_setting_key;
  
  RETURN v_global_value;
END;
$$ LANGUAGE plpgsql;

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number() 
RETURNS VARCHAR(20) AS $$
DECLARE
  v_year VARCHAR(4);
  v_count INTEGER;
  v_number VARCHAR(20);
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM support_tickets
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  v_number := 'TKT-' || v_year || '-' || LPAD(v_count::VARCHAR, 4, '0');
  
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_ticket_number ON support_tickets;
CREATE TRIGGER trigger_set_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_number();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_tickets_updated ON support_tickets;
CREATE TRIGGER trigger_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS trigger_global_settings_updated ON global_settings;
CREATE TRIGGER trigger_global_settings_updated
  BEFORE UPDATE ON global_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS trigger_store_settings_updated ON store_settings;
CREATE TRIGGER trigger_store_settings_updated
  BEFORE UPDATE ON store_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show created tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('global_settings', 'store_settings', 'support_tickets', 'ticket_comments')
ORDER BY table_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 006_create_settings_tables.sql completed successfully';
  RAISE NOTICE 'Created tables: global_settings, store_settings, support_tickets, ticket_comments';
  RAISE NOTICE 'Created functions: get_setting_value(), generate_ticket_number()';
END $$;
