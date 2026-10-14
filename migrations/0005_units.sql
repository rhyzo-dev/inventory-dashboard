-- Migration 0005: Units of measure
-- Adds a managed "units" reference table (strict dropdown in the item form) and a
-- unit column on consumable_item so quantities can be identified (pc, kg, L, ...).
--
-- The unit value is stored on the item as the unit NAME (TEXT), mirroring how
-- categories are referenced by name. Existing items keep whatever text is stored
-- if a unit is later renamed; units in use cannot be deleted (see /api/units).

-- ── Units reference table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Unit column on consumable_item ───────────────────────────────────────────
ALTER TABLE consumable_item ADD COLUMN unit TEXT;
CREATE INDEX idx_consumable_item_unit ON consumable_item(unit);

-- ── Seed default units ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO units (id, name) VALUES
  ('unit-pc',     'pc'),
  ('unit-kg',     'kg'),
  ('unit-l',      'L'),
  ('unit-drum',   'drum'),
  ('unit-box',    'box'),
  ('unit-pallet', 'pallet');
