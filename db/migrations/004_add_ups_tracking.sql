-- ============================================================================
-- MIGRATION 004: ADD UPS TRACKING AND EVENT LOGGING
-- ============================================================================
-- Purpose: Enhance shipment tracking with real-time UPS status and history
-- Developer: GitHub Copilot
-- ============================================================================

-- Step 1: Add columns to `shipments` table for caching latest UPS status
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS last_ups_status VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_ups_status_updated_at TIMESTAMP;

COMMENT ON COLUMN shipments.last_ups_status IS 'The most recent tracking status from the UPS API (e.g., "In Transit", "Delivered")';
COMMENT ON COLUMN shipments.last_ups_status_updated_at IS 'Timestamp when the last_ups_status was updated from the API';

-- Step 2: Create `shipment_tracking_events` table for detailed history
CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  
  -- UPS Event Details
  event_timestamp TIMESTAMP NOT NULL,
  status VARCHAR(255) NOT NULL,
  details TEXT,
  
  -- Location
  location_city VARCHAR(255),
  location_state VARCHAR(100),
  location_zip VARCHAR(50),
  location_country VARCHAR(100),
  
  -- Raw data from UPS
  ups_event_raw_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shipment_tracking_events_shipment_id ON shipment_tracking_events(shipment_id);
CREATE INDEX idx_shipment_tracking_events_event_timestamp ON shipment_tracking_events(event_timestamp DESC);

COMMENT ON TABLE shipment_tracking_events IS 'Stores detailed UPS tracking event history for each shipment';
COMMENT ON COLUMN shipment_tracking_events.shipment_id IS 'Foreign key to the shipments table';
COMMENT ON COLUMN shipment_tracking_events.event_timestamp IS 'Timestamp of the tracking event from UPS';
COMMENT ON COLUMN shipment_tracking_events.status IS 'The UPS status for this event (e.g., "Origin Scan", "Departure Scan")';
COMMENT ON COLUMN shipment_tracking_events.details IS 'A description of the tracking event';
COMMENT ON COLUMN shipment_tracking_events.location_city IS 'The city where the event occurred';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
