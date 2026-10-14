-- Migration 0006: Per-SKU optional thresholds
--
-- The team tracks a minimum/maximum threshold PER SKU (across all its bins/lots),
-- not per bin/lot. Most SKUs are stable and carry no threshold at all — only
-- fast-moving production items get one. So this thin table holds the optional
-- per-SKU thresholds, keyed by the SKU code.
--
-- This migration is intentionally ADDITIVE and decoupled from consumable_item:
--   * no foreign key, no backfill, no changes to existing item rows
--   * a SKU with no row here simply has no threshold (min/max stay null)
--   * existing items keep their per-row min_threshold/max_threshold untouched
--
-- The per-SKU "total on hand" figure is computed on the fly by
-- GET /api/sku (SUM of consumable_item.quantity grouped by SKU), so this table
-- only stores the two optional thresholds plus an audit timestamp.

CREATE TABLE IF NOT EXISTS sku (
  sku TEXT PRIMARY KEY,
  min_threshold INTEGER,   -- nullable: unset means "no minimum"
  max_threshold INTEGER,   -- nullable: unset means "no maximum"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
