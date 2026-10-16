-- ============================================================================
-- DEMO-INSTANCE SEED  ·  run ONLY against the DEMO D1 database
-- ============================================================================
--   Apply with:
--     npx wrangler d1 execute <demo-db-name> --remote --file=seeds/demo-data.sql
--
--   What it does:
--     1. Wipes the demo's user + inventory + threshold rows (NOT categories or
--        units — those are reference data and are left alone).
--     2. Re-creates a single demo login:  username=demo  password=Demo@2026!
--        (role=admin, so every feature is explorable; it is an ISOLATED demo
--        database, so admin-on-demo can never reach production data.)
--     3. Seeds a small, realistic sample dataset that deliberately shows off
--        every state the dashboard reports:
--          · Expired items        (expiry in the past — red "Expired")
--          · Expiring soon        (expiry within 30 days — amber)
--          · Low / Out of stock   (qty vs min threshold)
--          · Multi-lot SKUs       (same SKU, different bins/expiries — FEFO)
--
--   DATES are relative to seed time (date('now', …)) so the demo always shows
--   a live mix of expired / expiring / adequate — it never goes stale.
--
--   ⚠️  DO NOT run this against your production database. It deletes users.
--       For the demo instance it resets to a clean, known state.
--
--   The demo user's password hash below is a fixed PBKDF2-SHA256 (100k iters,
--   16-byte salt) value for "Demo@2026!" in the app's base64url(salt):hash format.
-- ============================================================================

BEGIN TRANSACTION;

-- ── Wipe demo data (idempotent reset) ───────────────────────────────────────
DELETE FROM consumable_item;
DELETE FROM sku;
DELETE FROM refresh_tokens;
DELETE FROM login_attempts;
DELETE FROM users;

-- ── Demo user ────────────────────────────────────────────────────────────────
-- id aeb094fe-…c43d is fixed so item rows can reference a stable creator_id.
INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES
  ('aeb094fe-211a-4c62-ad5c-352b8c10c43d',
   'demo',
   '1Yg0v-onsAfBoMj-5eCOPA:t9zCIifPOua2HQdrOeOIwTWKuZO4EGjYublEla_T8Xk',
   'admin',
   datetime('now'),
   datetime('now'));

-- ── Sample inventory ─────────────────────────────────────────────────────────
-- facility_id  = the default facility from wrangler.toml (FACILITY_ID)
-- creator/updater = the demo user above
INSERT INTO consumable_item
  (id, facility_id, sku, name, description, category, unit, quantity,
   min_threshold, max_threshold, bin_location, specification,
   production_date, expiry_date, image_url, creator_id, updater_id)
VALUES
  -- Lubricants (HYD-ISO-VG68 has TWO lots → exercises the FEFO / multi-lot view)
  ('bbe55055-8296-49c0-81ab-34d5c064f99f','00000000-0000-0000-0000-000000000001',
   'HYD-ISO-VG68','Hydraulic Oil ISO VG 68','Bulk hydraulic oil','Lubricants','drum',8,
   4,12,'A1-01','ISO 6743-52 · new lot',
   date('now','-400 days'),date('now','+400 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('18429856-17ae-4ae5-b468-15b71cecec1d','00000000-0000-0000-0000-000000000001',
   'HYD-ISO-VG68','Hydraulic Oil ISO VG 68','Aged lot — issue first (FEFO)','Lubricants','drum',5,
   4,12,'A1-02','ISO 6743-52 · older lot',
   date('now','-500 days'),date('now','+20 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  ('482dcc11-d160-4ce4-b9ef-6460ddf4b7ef','00000000-0000-0000-0000-000000000001',
   'GRS-EP2','Gear Oil EP 2','','Lubricants','drum',3,
   5,10,'A2-03',NULL,
   date('now','-300 days'),date('now','+15 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  -- Cleaning
  ('b57742eb-2d5e-441f-a2ee-3da9468eae6d','00000000-0000-0000-0000-000000000001',
   'CLN-ANTIST-5L','Anti-Static Wipe (5 L)','','Cleaning Supplies','box',40,
   10,60,'C1-01','Dissipative · Type 5L',
   date('now','-90 days'),date('now','+200 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('37815135-83ea-426c-8b47-5059a01ee9cd','00000000-0000-0000-0000-000000000001',
   'CLN-WOOL-DOT','Wool Degreasing Solvent','','Cleaning Supplies','drum',0,
   2,8,'C2-04',NULL,
   date('now','-120 days'),date('now','+300 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  -- Safety
  ('734d024c-1ae7-4d15-8cb4-3bebef0e0345','00000000-0000-0000-0000-000000000001',
   'SAF-NIT-GLOVE-L','Nitrile Gloves, L (100 pk)','','Safety Equipment','box',12,
   6,40,'S1-01','Powder-free · L',
   date('now','-60 days'),date('now','+90 days'),NULL,
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('8b2bda33-f5a1-4bba-8406-35daf7b118f8','00000000-0000-0000-0000-000000000001',
   'SAF-RESK-MASK','Respirator Cartridge, P100','','Safety Equipment','box',5,
   6,20,'S2-02','P100 · 20 pk',
   date('now','-500 days'),date('now','-60 days'),NULL,   -- EXPIRED → red
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  -- Electrical
  ('faa60266-3986-40ea-8f0c-bd09746d449b','00000000-0000-0000-0000-000000000001',
   'ELE-FUSE-32A','Fuse, 32 A 5×20','','Electrical','pc',25,
   10,100,'E1-01',NULL,
   date('now','-100 days'),NULL,NULL,                       -- no expiry
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('4f839ca1-9295-4763-9993-da3e7c846991','00000000-0000-0000-0000-000000000001',
   'ELE-TERM-JUMPER','Terminal Jumper, 10 mm²','','Electrical','box',4,
   5,30,'E2-02',NULL,
   date('now','-200 days'),date('now','+15 days'),NULL,    -- expiring soon + low
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  -- Mechanical
  ('7029784c-3e6f-408b-9fdd-b7bf1d5c1aaa','00000000-0000-0000-0000-000000000001',
   'MEC-BOLT-M10','Hex Bolt M10×40 Gr 8.8','','Mechanical','box',500,
   100,2000,'M1-01','DIN 933',
   date('now','-80 days'),NULL,NULL,                         -- no expiry
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('1c98f682-e8cc-4ca4-936e-690681583e79','00000000-0000-0000-0000-000000000001',
   'MEC-BEARING-608','Bearing 608ZZ','','Mechanical','pc',7,
   10,30,'M2-03','Sealed · zinc',
   date('now','-240 days'),NULL,NULL,                        -- low, no expiry
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),
  ('dc0ef1cd-4db2-4540-89e3-dea0b48c81e2','00000000-0000-0000-0000-000000000001',
   'MEC-ADH-EPX','Metal Adhesive (Epoxy)','Two-part epoxy','Mechanical','pc',2,
   4,12,'M3-02','2:1 mix · 10 ml',
   date('now','-700 days'),date('now','-309 days'),NULL,     -- EXPIRED −309 days
   'aeb094fe-211a-4c62-ad5c-352b8c10c43d','aeb094fe-211a-4c62-ad5c-352b8c10c43d'),

  -- Other
  ('4c0f5e7d-e84c-449f-bffe-bec99fe92a2b','00000000-0000-0000-0000-000000000001',
   'OTH-PAK-TAPE','Packaging Tape, 48 mm','','Other','pc',30,
   10,80,'Z1-01',NULL,
   date('now','-40 days'),NULL,NULL);

-- ── Per-SKU thresholds (optional, thin — most SKUs carry none) ───────────────
INSERT OR REPLACE INTO sku (sku, min_threshold, max_threshold, updated_at) VALUES
  ('HYD-ISO-VG68',  4,  12,  datetime('now')),
  ('SAF-RESK-MASK', 6,  20,  datetime('now')),
  ('MEC-BEARING-608',10, 30,  datetime('now'));

-- ── Demo company name (neutral so a public demo does not expose the real plant)
INSERT OR REPLACE INTO app_settings (key, value, updated_at)
  VALUES ('company_name','Demo Plant', datetime('now'));

COMMIT;

-- ============================================================================
-- Done. Log in to the demo instance with:   demo / Demo@2026!
-- Re-running this file at any time resets the demo to this known state.
-- ============================================================================
