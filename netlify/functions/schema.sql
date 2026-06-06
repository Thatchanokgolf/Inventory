-- Run this once in your Neon SQL editor to set up both tables.

-- Table 1: Inventory summary — one row per item, always reflects current stock
CREATE TABLE IF NOT EXISTS inventory (
  id          SERIAL PRIMARY KEY,
  item_name   VARCHAR(255) UNIQUE NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Transaction log — every change ever made, never mutated
CREATE TABLE IF NOT EXISTS inventory_log (
  id               SERIAL PRIMARY KEY,
  item_id          INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  item_name        VARCHAR(255) NOT NULL,
  action           VARCHAR(50)  NOT NULL,   -- 'add_item' | 'increment' | 'decrement' | 'set_quantity'
  quantity_change  INTEGER,                 -- signed delta (null for add_item)
  quantity_before  INTEGER NOT NULL,
  quantity_after   INTEGER NOT NULL,
  entered_by       VARCHAR(255) NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Optional index for faster log queries per item
CREATE INDEX IF NOT EXISTS idx_log_item_id ON inventory_log(item_id);
CREATE INDEX IF NOT EXISTS idx_log_created_at ON inventory_log(created_at DESC);
