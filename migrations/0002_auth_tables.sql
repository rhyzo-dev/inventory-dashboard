-- Migration 0002: Authentication & Categories
-- Creates tables for user auth (password hashing, JWT sessions, rate limiting)
-- and a managed categories table (replaces free-text category field).

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- base64(salt):base64(key) from PBKDF2
  role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer')),
  is_locked INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,             -- ISO timestamp when lock expires (NULL = unlocked)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Refresh Tokens ───────────────────────────────────────────────────────────
-- Stored in D1 so they can be revoked on logout without a cache layer
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ── Login Attempts (rate limiting) ──────────────────────────────────────────
-- Tracks recent failed logins per IP. Cleaned up by a cron or on each login.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, attempted_at)
);

-- ── Categories ───────────────────────────────────────────────────────────────
-- Replaces free-text category strings. Existing items keep their values;
-- the UI will migrate them on first load (handled client-side).
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',  -- hex color for badges
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default categories (same as the hardcoded list from EditModal)
INSERT OR IGNORE INTO categories (id, name, color) VALUES
  ('cat-lubricants',       'Lubricants',       '#3b82f6'),
  ('cat-cleaning',         'Cleaning Supplies', '#10b981'),
  ('cat-safety',           'Safety Equipment',  '#ef4444'),
  ('cat-electrical',       'Electrical',        '#f59e0b'),
  ('cat-mechanical',       'Mechanical',        '#8b5cf6'),
  ('cat-other',            'Other',             '#6b7280');
