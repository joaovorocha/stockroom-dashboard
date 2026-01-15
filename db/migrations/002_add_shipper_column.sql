-- Migration: Add `shipper` column to shipments table (if missing)
-- Safe to run multiple times.
BEGIN;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shipper VARCHAR(255);

COMMIT;

-- End migration
