-- ============================================================================
-- MIGRATION 005: GENERALIZE CARRIER TRACKING FIELDS
-- ============================================================================
-- Purpose: Modify shipment fields to be carrier-agnostic (not just UPS)
-- Developer: GitHub Copilot
-- ============================================================================

-- Step 1: Rename UPS-specific columns in the `shipments` table
ALTER TABLE shipments
RENAME COLUMN last_ups_status TO last_carrier_status;

ALTER TABLE shipments
RENAME COLUMN last_ups_status_updated_at TO last_carrier_status_updated_at;

ALTER TABLE shipments
RENAME COLUMN ups_raw_response TO carrier_raw_response;

-- Step 2: Update comments to reflect the change
COMMENT ON COLUMN shipments.last_carrier_status IS 'The most recent tracking status from the carrier API (e.g., "In Transit", "Delivered")';
COMMENT ON COLUMN shipments.last_carrier_status_updated_at IS 'Timestamp when the last_carrier_status was updated from the API';
COMMENT ON COLUMN shipments.carrier_raw_response IS 'Raw API response from the carrier (e.g., UPS, FedEx)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
