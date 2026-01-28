-- Migration: 005_create_user_store_access.sql
-- Description: Create user_store_access table for many-to-many user-store relationships
-- Date: 2026-01-28
-- Phase: Multi-Store Login & Admin Panel - Phase 1

-- =====================================================
-- CREATE USER_STORE_ACCESS TABLE
-- =====================================================

-- This table defines which stores each user can access
-- Super admins bypass this table (is_super_admin = true)
-- Regular users must have an entry to access a store

CREATE TABLE IF NOT EXISTS user_store_access (
  id SERIAL PRIMARY KEY,
  
  -- Foreign keys
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Access level determines what the user can do in this store
  -- 'admin' - Can manage store settings, users, and data
  -- 'manager' - Can view data and manage team (limited)
  -- 'view' - Read-only access to store data
  access_level VARCHAR(50) DEFAULT 'view' CHECK (access_level IN ('admin', 'manager', 'view')),
  
  -- Audit trail
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMP DEFAULT NOW(),
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMP,
  
  -- Soft delete - set is_active = false instead of deleting
  is_active BOOLEAN DEFAULT true,
  
  -- Optional notes (e.g., "Temporary access for inventory audit")
  notes TEXT,
  
  -- Expiration for temporary access
  expires_at TIMESTAMP,
  
  -- Prevent duplicate user-store combinations
  UNIQUE(user_id, store_id)
);

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Fast lookup: What stores can this user access?
CREATE INDEX IF NOT EXISTS idx_user_store_access_user 
  ON user_store_access(user_id);

-- Fast lookup: What users have access to this store?
CREATE INDEX IF NOT EXISTS idx_user_store_access_store 
  ON user_store_access(store_id);

-- Only query active access records
CREATE INDEX IF NOT EXISTS idx_user_store_access_active 
  ON user_store_access(is_active) WHERE is_active = true;

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_user_store_access_user_active 
  ON user_store_access(user_id, is_active) WHERE is_active = true;

-- Index for expired access cleanup
CREATE INDEX IF NOT EXISTS idx_user_store_access_expires 
  ON user_store_access(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to check if a user has access to a specific store
CREATE OR REPLACE FUNCTION user_has_store_access(
  p_user_id INTEGER,
  p_store_id INTEGER,
  p_required_level VARCHAR DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_access_level VARCHAR(50);
BEGIN
  -- Check if user is super admin (bypasses all checks)
  SELECT is_super_admin INTO v_is_super_admin
  FROM users WHERE id = p_user_id;
  
  IF v_is_super_admin THEN
    RETURN true;
  END IF;
  
  -- Check user_store_access table
  SELECT access_level INTO v_access_level
  FROM user_store_access
  WHERE user_id = p_user_id 
    AND store_id = p_store_id 
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
  
  IF v_access_level IS NULL THEN
    RETURN false;
  END IF;
  
  -- If no specific level required, any access is sufficient
  IF p_required_level IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check access level hierarchy: admin > manager > view
  IF p_required_level = 'view' THEN
    RETURN true; -- Any level can view
  ELSIF p_required_level = 'manager' THEN
    RETURN v_access_level IN ('admin', 'manager');
  ELSIF p_required_level = 'admin' THEN
    RETURN v_access_level = 'admin';
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to get all stores a user can access
CREATE OR REPLACE FUNCTION get_user_accessible_stores(p_user_id INTEGER)
RETURNS TABLE (
  store_id INTEGER,
  store_code VARCHAR,
  store_name VARCHAR,
  access_level VARCHAR
) AS $$
DECLARE
  v_is_super_admin BOOLEAN;
BEGIN
  -- Check if user is super admin
  SELECT u.is_super_admin INTO v_is_super_admin
  FROM users u WHERE u.id = p_user_id;
  
  IF v_is_super_admin THEN
    -- Super admin gets all stores with 'admin' access
    RETURN QUERY
    SELECT s.id, s.code::VARCHAR, s.name::VARCHAR, 'admin'::VARCHAR
    FROM stores s
    WHERE s.is_active = true
    ORDER BY s.name;
  ELSE
    -- Regular user gets their granted stores
    RETURN QUERY
    SELECT s.id, s.code::VARCHAR, s.name::VARCHAR, usa.access_level::VARCHAR
    FROM user_store_access usa
    JOIN stores s ON s.id = usa.store_id
    WHERE usa.user_id = p_user_id 
      AND usa.is_active = true
      AND s.is_active = true
      AND (usa.expires_at IS NULL OR usa.expires_at > NOW())
    ORDER BY s.name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- GRANT EXISTING USERS ACCESS TO THEIR DEFAULT STORE
-- =====================================================

-- Migrate existing users to have access to their default store
-- This maintains backward compatibility
INSERT INTO user_store_access (user_id, store_id, access_level, notes)
SELECT 
  u.id,
  COALESCE(u.default_store_id, 1), -- Default to SF if no store set
  CASE 
    WHEN u.access_role = 'super_admin' THEN 'admin'
    WHEN u.access_role = 'store_admin' THEN 'admin'
    WHEN u.access_role = 'manager' THEN 'manager'
    ELSE 'view'
  END,
  'Migrated from default_store_id during Phase 1 migration'
FROM users u
WHERE u.is_super_admin = false  -- Super admins don't need entries
ON CONFLICT (user_id, store_id) DO NOTHING;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show the new table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_store_access'
ORDER BY ordinal_position;

-- Show indexes created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'user_store_access';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 005_create_user_store_access.sql completed successfully';
  RAISE NOTICE 'Created table: user_store_access';
  RAISE NOTICE 'Created functions: user_has_store_access(), get_user_accessible_stores()';
END $$;
