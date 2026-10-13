-- Migration 0004: Remove UNIQUE constraint on sku
-- Same SKU can have multiple batches (different location, quantity, spec, production/expiry dates)

CREATE TABLE consumable_item_new (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 0,
  max_threshold INTEGER NOT NULL DEFAULT 0,
  bin_location TEXT,
  production_date TEXT,
  expiry_date TEXT,
  image_url TEXT,
  creator_id TEXT NOT NULL,
  updater_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  specification TEXT
);

-- Copy existing data
INSERT INTO consumable_item_new SELECT * FROM consumable_item;

-- Drop old table and rename new
DROP TABLE consumable_item;
ALTER TABLE consumable_item_new RENAME TO consumable_item;

-- Recreate indexes
CREATE INDEX idx_consumable_item_facility ON consumable_item(facility_id);
CREATE INDEX idx_consumable_item_category ON consumable_item(category);
CREATE INDEX idx_consumable_item_sku ON consumable_item(sku);
CREATE INDEX idx_consumable_item_quantity ON consumable_item(quantity);
CREATE INDEX idx_consumable_item_expiry ON consumable_item(expiry_date);
