-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION: add a configurable per-item low-stock limit.
-- Run this ONCE in your Neon SQL editor if your `inventory` table already exists.
-- (New databases created from schema.sql already include this column.)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS low_stock_limit INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_limit >= 0);
