-- Migration 0003: App Settings
-- Allows admins to configure app-wide settings like company name.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default company name (same as current hardcoded value)
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('company_name', 'Arctech TT Plant');
