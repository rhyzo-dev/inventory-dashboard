# 03 · API reference

> Client-handover pack · [index](../README.md). All routes live under `functions/api/`.

Base: `https://<project>.pages.dev`. The API is a thin REST layer over D1 + Tigris with
JWT cookie auth.

## 1. Conventions

- **Auth:** a signed `httpOnly` cookie (`auth_token`). `GET /api/categories` and
  `GET /api/units` are public; everything else needs a session.
- **Roles:** `admin` > `editor` > `viewer`. Read-mostly routes need any role; writes
  need `editor`+; user/category management and deletes need `admin`.
- **Errors:** `{ "error": "message" }` with an HTTP status. The duplicate guard returns
  `409` with `duplicate: true` and the matching rows.
- **Rate limits (per IP):** login 5/min → 15-min lockout · inventory 30/min ·
  upload 10/min. Exceeding returns `429`.

## 2. Endpoints

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/inventory` | any | list items (search, category, status, view, sort, paging) |
| POST | `/api/inventory` | editor+ | create a lot (server dedup → `409` unless `allow_duplicate`) |
| GET | `/api/inventory/duplicates` | any | pre-check: list lots matching the six-field key |
| PUT | `/api/inventory/:id` | editor+ | update a lot |
| DELETE | `/api/inventory/:id` | admin | delete a lot |
| POST | `/api/import` | editor+ | bulk import `{ rows, dry_run }` — atomic, skip-duplicates |
| GET | `/api/export` | any | CSV / XLSX download |
| GET | `/api/sku` | any | By-SKU totals + FEFO lots + optional min/max |
| GET | `/api/stats` | any | aggregate counts (incl. `expired_count`, `expiring_soon_count`) |
| POST | `/api/upload` | editor+ | upload an image to Tigris |
| GET | `/api/categories` · `POST` | any · editor+ | list / create categories |
| PUT·DELETE | `/api/categories/:id` | editor+ · admin | update / delete (delete blocked while in use) |
| GET | `/api/units` · `POST` | any · editor+ | list / create units |
| PUT·DELETE | `/api/units/:id` | editor+ · admin | update / delete (delete blocked while in use) |
| POST | `/api/auth/login` | none | login (rate-limited) |
| POST | `/api/auth/logout` | any | revoke refresh token |
| POST | `/api/auth/refresh` | any | renew access token from refresh token |
| POST | `/api/auth/change-password` | any | change own password (HIBP-checked) |
| GET | `/api/users/me` | any | current user |
| GET·POST | `/api/users` | admin | list / create users (HIBP-checked) |
| PUT·DELETE | `/api/users/:id` | admin | update role/lock/password · delete (not self) |

The `company_name` setting is stored in `app_settings` and is admin-managed.

## 3. Notable request / response shapes

### `POST /api/inventory` (create a lot)
```jsonc
{
  "sku": "HYD-ISO-VG68", "name": "Hydraulic Oil ISO VG 68",
  "quantity": 8, "unit": "drum", "category": "Lubricants",
  "bin_location": "A1-01", "specification": "ISO 6743-52",
  "production_date": "2025-11-01", "expiry_date": "2027-11-01"
  // optional: "allow_duplicate": true  → bypass the 409 guard
}
```
On a duplicate (and no `allow_duplicate`): **`409`**
```jsonc
{ "error": "…", "duplicate": true,
  "matches": [ { "id":"…", "sku":"…", "quantity":5, "bin_location":"A1-02",
                 "expiry_date":"2026-11-01", "updated_at":"…" } ] }
```

### `GET /api/inventory/duplicates`
Query params: `sku`, `name` (required) + optional `bin_location`, `specification`,
`production_date`, `expiry_date`, `exclude_id`. Returns `{ "matches": [ … ] }` (top 5 by
recently-updated). This powers the add-form's live warning.

### `POST /api/import`
```jsonc
{ "dry_run": true,
  "rows": [ { "sku":"…", "name":"…", "quantity":10, "unit":"box",
              "bin_location":"C1-01", "production_date":"…", "expiry_date":"…" } ] }
```
- `dry_run: true` → `{ "imported":n, "skipped_duplicated":n, "errors":[…], "would_import":true }`
- commit → inserts in one atomic D1 batch; **duplicates are skipped and reported, never
  overwritten**. Cap: 1000 rows.

### `GET /api/stats`
```jsonc
{ "total": …, "low_stock_count": …, "out_of_stock_count": …,
  "expiring_soon_count": …,   // upcoming only (now .. now+30d)
  "expired_count": … }         // now and older
```

## 4. Rate limiting
Per-IP counters live in the `RATE_LIMIT` KV namespace plus the `login_attempts` table.
Exceeding a cap returns `429` with a `Retry-After`. Login additionally locks the account
for 15 minutes after 5 consecutive failures.
