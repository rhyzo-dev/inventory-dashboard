-- Initial schema for inventory dashboard
CREATE TABLE consumable_item (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_threshold INTEGER NOT NULL DEFAULT 0,
  max_threshold INTEGER NOT NULL DEFAULT 0,
  bin_location TEXT,
  production_date TEXT, -- YYYY-MM-DD
  expiry_date TEXT, -- YYYY-MM-DD
  image_url TEXT,
  creator_id TEXT NOT NULL,
  updater_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  specification TEXT
);

-- Indexes for common queries
CREATE INDEX idx_consumable_item_facility ON consumable_item(facility_id);
CREATE INDEX idx_consumable_item_category ON consumable_item(category);
CREATE INDEX idx_consumable_item_sku ON consumable_item(sku);
CREATE INDEX idx_consumable_item_quantity ON consumable_item(quantity);
CREATE INDEX idx_consumable_item_expiry ON consumable_item(expiry_date);