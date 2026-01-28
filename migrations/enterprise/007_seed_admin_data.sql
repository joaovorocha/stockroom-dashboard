-- Migration: 007_seed_admin_data.sql
-- Description: Seed initial admin data, global settings, and super admin user
-- Date: 2026-01-28
-- Phase: Multi-Store Login & Admin Panel - Phase 1

-- =====================================================
-- CREATE SUPER ADMIN USER (Victor Rocha)
-- =====================================================

-- First, check if Victor exists and promote to super admin
-- Otherwise create a new super admin account

DO $$
DECLARE
  v_victor_id INTEGER;
BEGIN
  -- Try to find Victor by email or username patterns
  SELECT id INTO v_victor_id
  FROM users
  WHERE LOWER(username) LIKE '%victor%' 
     OR LOWER(email) LIKE '%victor%'
     OR LOWER(username) LIKE '%rocha%'
  LIMIT 1;
  
  IF v_victor_id IS NOT NULL THEN
    -- Promote existing Victor to super admin
    UPDATE users
    SET 
      access_role = 'super_admin',
      is_super_admin = true,
      can_switch_stores = true,
      role_updated_at = NOW()
    WHERE id = v_victor_id;
    
    RAISE NOTICE 'Promoted existing user (id=%) to super admin', v_victor_id;
  ELSE
    RAISE NOTICE 'No existing Victor user found - you will need to create super admin manually';
  END IF;
END $$;

-- =====================================================
-- SEED GLOBAL SETTINGS
-- =====================================================

INSERT INTO global_settings (setting_key, setting_value, setting_type, category, description, is_editable_by_store) VALUES
  
  -- System Settings
  ('system.maintenance_mode', 'false', 'boolean', 'system', 'Enable maintenance mode for all stores', false),
  ('system.max_concurrent_users', '1000', 'number', 'system', 'Maximum concurrent users allowed system-wide', false),
  ('system.session_timeout_minutes', '480', 'number', 'system', 'User session timeout in minutes (8 hours default)', true),
  ('system.timezone', 'America/Los_Angeles', 'string', 'system', 'Default system timezone', true),
  ('system.date_format', 'MM/DD/YYYY', 'string', 'system', 'Default date display format', true),
  ('system.app_version', '2.0.0-enterprise', 'string', 'system', 'Current application version', false),
  
  -- Legal & Compliance Settings
  ('legal.privacy_policy_url', 'https://suitsupply.com/privacy', 'url', 'legal', 'Company privacy policy URL', false),
  ('legal.terms_of_service_url', 'https://suitsupply.com/terms', 'url', 'legal', 'Terms of service URL', false),
  ('legal.cookie_policy_url', 'https://suitsupply.com/cookies', 'url', 'legal', 'Cookie policy URL', false),
  ('legal.data_retention_days', '2555', 'number', 'legal', 'Data retention period in days (7 years)', false),
  ('legal.require_gdpr_consent', 'true', 'boolean', 'legal', 'Require GDPR consent for EU stores', false),
  ('legal.require_ccpa_notice', 'true', 'boolean', 'legal', 'Require CCPA notice for California stores', false),
  
  -- Compliance Settings
  ('compliance.audit_log_enabled', 'true', 'boolean', 'compliance', 'Enable audit logging for all actions', false),
  ('compliance.password_min_length', '12', 'number', 'compliance', 'Minimum password length', false),
  ('compliance.password_require_special', 'true', 'boolean', 'compliance', 'Require special characters in passwords', false),
  ('compliance.password_expire_days', '90', 'number', 'compliance', 'Password expiration in days', false),
  ('compliance.mfa_required', 'false', 'boolean', 'compliance', 'Require multi-factor authentication', false),
  ('compliance.failed_login_lockout', '5', 'number', 'compliance', 'Lock account after N failed logins', false),
  
  -- Support Settings
  ('support.helpdesk_email', 'it-support@suitsupply.com', 'email', 'support', 'Helpdesk contact email', false),
  ('support.helpdesk_phone', '+1-555-SUIT-HELP', 'string', 'support', 'Helpdesk phone number', false),
  ('support.max_ticket_age_days', '30', 'number', 'support', 'Auto-close resolved tickets after N days', false),
  ('support.auto_assign_tickets', 'true', 'boolean', 'support', 'Automatically assign tickets to available agents', false),
  ('support.ticket_sla_response_hours', '4', 'number', 'support', 'SLA target for first response (hours)', false),
  ('support.ticket_sla_resolution_hours', '24', 'number', 'support', 'SLA target for resolution (hours)', false),
  
  -- Email Settings
  ('email.from_name', 'Suit Supply Stockroom', 'string', 'email', 'Default email sender name', false),
  ('email.from_address', 'stockroom@suitsupply.com', 'email', 'email', 'Default email sender address', false),
  ('email.reply_to', 'stockroom-support@suitsupply.com', 'email', 'email', 'Reply-to email address', false),
  ('email.daily_digest_enabled', 'true', 'boolean', 'email', 'Send daily digest emails to managers', true),
  ('email.daily_digest_time', '08:00', 'string', 'email', 'Time to send daily digest (HH:MM)', true),
  
  -- Security Settings
  ('security.rate_limit_requests', '100', 'number', 'security', 'Max API requests per minute per user', false),
  ('security.rate_limit_window_minutes', '1', 'number', 'security', 'Rate limit window in minutes', false),
  ('security.allowed_ip_ranges', '[]', 'json', 'security', 'Allowed IP ranges (empty = all)', false),
  ('security.cors_allowed_origins', '["https://suitsupply.com", "https://*.suitsupply.com"]', 'json', 'security', 'CORS allowed origins', false),
  
  -- Display Settings
  ('display.logo_url', '/assets/logo.png', 'url', 'display', 'Company logo URL', false),
  ('display.primary_color', '#1a1a2e', 'string', 'display', 'Primary brand color', false),
  ('display.accent_color', '#e94560', 'string', 'display', 'Accent/highlight color', false),
  ('display.items_per_page', '25', 'number', 'display', 'Default items per page in lists', true),
  ('display.currency', 'USD', 'string', 'display', 'Default display currency', true),
  ('display.language', 'en-US', 'string', 'display', 'Default display language', true)

ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- =====================================================
-- SEED STORE-SPECIFIC SETTINGS (SF as example)
-- =====================================================

-- San Francisco store-specific settings
INSERT INTO store_settings (store_id, setting_key, setting_value, setting_type, category, description, overrides_global) VALUES
  (1, 'display.timezone', 'America/Los_Angeles', 'string', 'display', 'Store timezone (Pacific)', true),
  (1, 'display.currency', 'USD', 'string', 'display', 'Store currency', false),
  (1, 'store.operating_hours', '{"mon":"10:00-20:00","tue":"10:00-20:00","wed":"10:00-20:00","thu":"10:00-20:00","fri":"10:00-21:00","sat":"10:00-21:00","sun":"11:00-18:00"}', 'json', 'display', 'Store operating hours', false),
  (1, 'store.manager_email', 'sf-manager@suitsupply.com', 'email', 'display', 'Store manager email', false)
ON CONFLICT (store_id, setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- =====================================================
-- GRANT STORE ADMINS ACCESS TO THEIR STORES
-- =====================================================

-- Find users who should be store admins based on role_title
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT u.id, u.default_store_id, u.role_title
    FROM users u
    WHERE (
      LOWER(u.role_title) LIKE '%manager%' OR
      LOWER(u.role_title) LIKE '%supervisor%' OR
      LOWER(u.role_title) LIKE '%lead%'
    )
    AND u.is_super_admin = false
    AND u.default_store_id IS NOT NULL
  LOOP
    -- Grant admin access to their store
    INSERT INTO user_store_access (user_id, store_id, access_level, notes)
    VALUES (r.id, r.default_store_id, 'admin', 'Auto-granted based on role_title: ' || COALESCE(r.role_title, 'unknown'))
    ON CONFLICT (user_id, store_id) DO UPDATE SET
      access_level = 'admin',
      notes = 'Upgraded to admin based on role_title: ' || COALESCE(r.role_title, 'unknown');
      
    -- Update their role to store_admin
    UPDATE users SET access_role = 'store_admin' WHERE id = r.id;
    
    RAISE NOTICE 'Granted store admin access to user % for store %', r.id, r.default_store_id;
  END LOOP;
END $$;

-- =====================================================
-- CREATE SAMPLE SUPPORT TICKET (for testing)
-- =====================================================

INSERT INTO support_tickets (store_id, subject, description, status, priority, category)
VALUES (
  1, -- San Francisco
  'Welcome to the new ticketing system',
  'This is a sample ticket to verify the support system is working correctly. You can delete this ticket after testing.',
  'open',
  'low',
  'technical'
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Count super admins created
SELECT COUNT(*) as super_admin_count FROM users WHERE is_super_admin = true;

-- Count global settings created
SELECT COUNT(*) as global_settings_count FROM global_settings;

-- Count store settings created
SELECT COUNT(*) as store_settings_count FROM store_settings;

-- Count user store access records
SELECT COUNT(*) as access_records_count FROM user_store_access;

-- Show super admins
SELECT id, username, email, access_role, is_super_admin 
FROM users 
WHERE is_super_admin = true;

-- Show settings by category
SELECT category, COUNT(*) as count 
FROM global_settings 
GROUP BY category 
ORDER BY category;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
DECLARE
  v_super_admins INTEGER;
  v_settings INTEGER;
  v_access INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_super_admins FROM users WHERE is_super_admin = true;
  SELECT COUNT(*) INTO v_settings FROM global_settings;
  SELECT COUNT(*) INTO v_access FROM user_store_access;
  
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Migration 007_seed_admin_data.sql completed successfully';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Super Admins created: %', v_super_admins;
  RAISE NOTICE 'Global Settings seeded: %', v_settings;
  RAISE NOTICE 'User Store Access records: %', v_access;
  RAISE NOTICE '======================================';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Verify super admin user has correct credentials';
  RAISE NOTICE '2. Test login with store selection';
  RAISE NOTICE '3. Access /admin to verify admin panel';
  RAISE NOTICE '======================================';
END $$;
