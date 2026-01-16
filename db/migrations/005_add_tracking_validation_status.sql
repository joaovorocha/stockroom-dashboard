-- ============================================================================
-- MIGRATION 005: ADD TRACKING VALIDATION STATUS
-- ============================================================================
-- Purpose: Add columns to track the validation status of a shipment's tracking number.
-- Developer: GitHub Copilot
-- ============================================================================

ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS tracking_validated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_validation_status VARCHAR(50);

COMMENT ON COLUMN shipments.tracking_validated_at IS 'Timestamp when the tracking number was last validated against the carrier API.';
COMMENT ON COLUMN shipments.last_validation_status IS 'The result of the last tracking number validation (e.g., VALID, INVALID, PENDING).';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
