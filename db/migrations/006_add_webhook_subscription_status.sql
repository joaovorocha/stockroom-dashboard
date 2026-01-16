-- ============================================================================
-- MIGRATION 006: ADD WEBHOOK SUBSCRIPTION STATUS
-- ============================================================================
-- Purpose: Add columns to track the status of webhook subscriptions for shipments.
-- Developer: GitHub Copilot
-- ============================================================================

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS webhook_subscribed_at TIMESTAMP;

COMMENT ON COLUMN shipments.webhook_subscribed_at IS 'Timestamp when the shipment was successfully subscribed to the UPS Track Alert webhook.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
