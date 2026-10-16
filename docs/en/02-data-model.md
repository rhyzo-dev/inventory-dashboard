# 02 · Data model

> Client-handover pack · [index](../README.md). Companion to [01 Architecture](01-architecture.md).

The database is **Cloudflare D1** (SQLite). Primary keys are **UUIDs generated on the
server** (D1 UUID-PK tables have no auto-increment). Dates are stored as `TEXT`
(`YYYY-MM-DD`). There is **no auto-migration runner** — migrations are applied manually,
in order, with `wrangler d1 execute`.

## 1. Entity overview

```
   users 1 ──< consumable_item >── 1 facility (single default, id constant)
                          │
                          │ category stored BY NAME (denormalized)
                          ▼
                       categories            units          sku
                  (managed list)        (managed list)   (thin: per-SKU min/max)
                     ▲                          ▲            ▲
                     └── items reference by name ────────────┘

   login_attempts / refresh_tokens  ── session + rate-limit state
   app_settings                     ── key/value (e.g. company_name)
```

Core idea: **`consumable_item` is a lot, not a product.** Several rows can share a SKU
(different bins, different expiry dates). The product is the SKU; the row is one physical
lot of it.

## 2. Tables

### `consumable_item` (a lot)
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PK | server-generated UUID |
| `facility_id` | TEXT | single default facility (constant UUID) |
| `sku` | TEXT | catalog identity — **not unique** (many lots per SKU) |
| `name` | TEXT | human name |
| `description` | TEXT? | free text |
| `category` | TEXT? | **name** of a `categories` row (denormalized by name) |
| `unit` | TEXT? | **name** of a `units` row (denormalized by name) |
| `quantity` | INTEGER | on hand for this lot |
| `min_threshold` / `max_threshold` | INTEGER | row-level low-stock cutoffs (default 0) |
| `bin_location` | TEXT? | where this lot physically sits |
| `specification` | TEXT? | detail string (size, grade, mix ratio…) |
| `production_date` | TEXT? | `YYYY-MM-DD` |
| `expiry_date` | TEXT? | `YYYY-MM-DD`; drives Expired / Expiring-soon |
| `image_url` | TEXT? | Tigris object key (fetched via proxy, not public) |
| `creator_id` / `updater_id` | TEXT | user UUIDs |
| `created_at` / `updated_at` | TEXT | timestamps |

**The lot key (dedup / import)** = `sku + name + bin_location + specification +
production_date + expiry_date`. Matching is NULL-safe via
`COALESCE(col,'') = ?` so an empty field matches an empty field.

### `users`
`id, username (UNIQUE), password_hash` — PBKDF2-SHA256, `base64url(salt):base64url(key)`,
100k iters · `role` (`admin|editor|viewer`) · `is_locked`, `failed_attempts`,
`locked_until` (lockout state) · timestamps.

### `categories` / `units`
Managed reference lists. `categories(id, name UNIQUE, color, description, …)`.
`units(id, name UNIQUE, …)` seeded with pc, kg, L, drum, box, pallet. Items reference both
**by name**, so deleting a name is blocked while any item still uses it.

### `sku` (thin, optional thresholds)
`sku (PK), min_threshold?, max_threshold?, updated_at`. A SKU with **no** row here simply
has no per-SKU threshold. The By-SKU view SUMs lot quantities on the fly and joins this
table for the optional min/max.

### `app_settings`
`key (PK), value, updated_at`. Currently holds `company_name`.

### Session / rate-limit state
- `refresh_tokens(token PK, user_id, expires_at)` — opaque refresh tokens, revocable.
- `login_attempts(ip, attempted_at, success, PK(ip, attempted_at))` — feeds the 5/min lockout.

## 3. Migrations (apply in order)

| # | file | what it does |
|---|------|--------------|
| 0001 | `0001_initial_schema.sql` | `consumable_item` + indexes |
| 0002 | `0002_auth_tables.sql` | `users`, `refresh_tokens`, `login_attempts`, `categories` (+ seed 6 default categories) |
| 0003 | `0003_app_settings.sql` | `app_settings` (+ default company name) |
| 0004 | `0004_remove_sku_unique.sql` | drops the UNIQUE constraint on `sku` → multiple lots per SKU |
| 0005 | `0005_units.sql` | `units` table + `unit` column on `consumable_item` + seed default units |
| 0006 | `0006_sku.sql` | thin `sku` table for optional per-SKU thresholds |

Apply to a database:
```bash
for f in migrations/*.sql; do
  npx wrangler d1 execute <db-name> --remote --file="$f"
done
```
For the demo database, finish with the seed:
```bash
npx wrangler d1 execute inventory-demo --remote --file=seeds/demo-data.sql
```

## 4. Design notes worth knowing

- **NULL semantics:** optional fields are nullable and *empty means "not set."* Queries
  that compare them use `COALESCE(col,'')` so NULL and `''` match the same way.
- **Day-boundary expiry:** "expired" vs "expiring soon" is decided server-side with
  `date('now')`, so there is a single source of truth. Expiring-soon is `now .. now+30d`;
  anything older is Expired.
- **Denormalized by name** (category, unit): a cheap, readable design at this scale;
  the trade-off is that renaming a category/unit does not rewrite history (old items keep
  the old name until re-saved).
- **Thresholds in two places:** row-level `min/max_threshold` drive per-lot Low/Out status;
  the thin `sku` table drives the optional per-SKU min/max in the By-SKU view. They are
  independent on purpose.
