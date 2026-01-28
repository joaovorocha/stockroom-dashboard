-- Migration: 004_add_user_roles.sql
-- Description: Add role-based access control columns to users table
-- Date: 2026-01-28
-- Phase: Multi-Store Login & Admin Panel - Phase 1

-- =====================================================
-- ADD ROLE COLUMNS TO USERS TABLE
-- =====================================================

-- Add role column for user type
-- Values: 'super_admin', 'store_admin', 'manager', 'employee'
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';

-- Super admin flag - bypasses all store-level permission checks
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Default store for user (where they log in by default)
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

-- Whether user can switch between stores (multi-store access)
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_switch_stores BOOLEAN DEFAULT false;

-- Last store the user accessed (for session resumption)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

-- Timestamps for admin tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_updated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_updated_by INTEGER REFERENCES users(id);

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index for super admin lookups (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = true;

-- Index for default store lookups
CREATE INDEX IF NOT EXISTS idx_users_default_store ON users(default_store_id) WHERE default_store_id IS NOT NULL;

-- =====================================================
-- ADD ROLE CHECK CONSTRAINT
-- =====================================================

-- Ensure role values are valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role 
      CHECK (role IN ('super_admin', 'store_admin', 'manager', 'employee'));
  END IF;
END $$;

-- =====================================================
-- SET DEFAULT STORE FOR EXISTING USERS
-- =====================================================

-- Set all existing users to San Francisco store (id=1) as default
-- This maintains backward compatibility
UPDATE users 
SET default_store_id = 1 
WHERE default_store_id IS NULL;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show the updated users table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('role', 'is_super_admin', 'default_store_id', 'can_switch_stores', 'last_store_id')
ORDER BY ordinal_position;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 004_add_user_roles.sql completed successfully';
  RAISE NOTICE 'Added columns: role, is_super_admin, default_store_id, can_switch_stores, last_store_id';
END $$;
