-- ============================================================================
-- MIGRATION 007: UPDATE SHIPMENTS STATUS CHECK CONSTRAINT
-- ============================================================================
-- Purpose: Add new, standardized statuses from the UPS API to the list of
--          allowed values in the shipments.status column.
-- Developer: GitHub Copilot
-- ============================================================================

-- First, we drop the existing constraint
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;

-- Then, we add a new, more comprehensive constraint
ALTER TABLE shipments
ADD CONSTRAINT shipments_status_check CHECK (status IN (
  'REQUESTED',
  'PICKING',
  'READY_TO_PACK',
  'PACKING',
  'PACKED',
  'LABEL_CREATED',
  'In-Transit', -- Added for UPS API
  'Delivered',  -- Added for UPS API
  'Exception',  -- Added for UPS API
  'Returned',   -- Added for UPS API
  'Unknown',    -- Added for UPS API
  'IN_TRANSIT', -- Legacy value
  'DELIVERED',  -- Legacy value
  'CANCELLED',
  'ON_HOLD',
  'EXCEPTION'   -- Legacy value
));

COMMENT ON CONSTRAINT shipments_status_check ON shipments IS 'Ensures the status is one of the allowed values, including manual workflow and live UPS statuses.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
