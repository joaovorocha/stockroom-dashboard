-- Add ups_raw_response and returned flag to shipments
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ups_raw_response JSONB;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS returned BOOLEAN DEFAULT FALSE;
