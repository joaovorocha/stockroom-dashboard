-- Migration: 008_add_store_metrics_table.sql
-- Adds table for storing daily store metrics from Looker data

CREATE TABLE store_metrics (
  date DATE PRIMARY KEY,
  sales_amount DECIMAL(10,2),
  sales_vs_py DECIMAL(5,2), -- percentage
  target DECIMAL(10,2),
  vs_target DECIMAL(5,2), -- percentage
  sph DECIMAL(6,2), -- sales per hour
  sph_vs_py DECIMAL(5,2),
  ipc DECIMAL(4,2), -- items per customer
  ipc_vs_py DECIMAL(5,2),
  drop_offs DECIMAL(5,2), -- percentage
  drop_offs_vs_py DECIMAL(5,2),
  apc DECIMAL(8,2), -- average per customer
  apc_vs_py DECIMAL(5,2),
  cpc DECIMAL(4,2), -- categories per customer
  cpc_vs_py DECIMAL(5,2),
  imported_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for date queries
CREATE INDEX idx_store_metrics_date ON store_metrics(date);

-- Index for performance
CREATE INDEX idx_store_metrics_imported_at ON store_metrics(imported_at);