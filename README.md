# Inventory Dashboard (Cloudflare Pages + D1 + Tigris)

A role-based inventory dashboard built with React, TypeScript, and Vite, deployed to
Cloudflare Pages. Data is stored in Cloudflare D1 (SQLite, UUID primary keys) and
images in Tigris Data (S3-compatible object storage).

> 📘 **Documentation pack** (architecture + ADRs, data model, API, security & data
> policy, deployment/ops, UX schematics, operator guide, glossary) — English + 中文:
> [`docs/README.md`](docs/README.md). The legacy single doc [`docs/Inventory-Dashboard.md`](docs/Inventory-Dashboard.md)
> is kept for reference; the new pack is the source of truth. This README is a quick start.

## Features

- **Authentication**: JWT in httpOnly cookies, PBKDF2 password hashing, silent session
  refresh, rate-limited login
- **Role-based access**: Admin (full), Editor (add/edit/delete items, manage categories/units),
  Viewer (read-only)
- **User management**: Create, edit, lock, and delete users (admin only)
- **Category management**: Create, edit, and delete product categories with colors
- **Unit management**: Manage a shared list of units of measure (pc, kg, L, drum, box,
  pallet, …); deletion is blocked while any item still uses the unit
- **Inventory**: View items with photo thumbnails, search/filter, and pagination
- **Export**: Download inventory as CSV or XLSX
- **Responsive design**: Works on desktop and mobile
- **Zero ongoing cost**: All services on free tiers

## Architecture

```
Browser → Cloudflare Pages (React SPA + Auth)
                    ↓
          Cloudflare Pages Functions (TypeScript API)
                    ↓
   Cloudflare D1 (SQLite) for data  +  Tigris Data (S3) for images
   Cloudflare KV (per-IP rate limiting)  ·  Cloudflare Secrets (AUTH_SECRET, Tigris keys)
```

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com) with a D1 database
2. [Tigris Data account](https://tigrisdata.com) with a bucket and API keys
3. Node.js >= 18

## Secrets & Environment Variables

> ⚠️ **Never commit credentials.** The live values for `AUTH_SECRET`,
> `TIGRIS_ACCESS_KEY_ID`, and `TIGRIS_SECRET_ACCESS_KEY` are stored in Cloudflare
> (Pages secrets / dashboard) and are **not** in this repository or in the docs.

For **production**, set these as Cloudflare Pages **secrets** (dashboard → Secrets, or
`wrangler pages secret put`). The non-secret config lives in `wrangler.toml` `[vars]`:

| Name | Where | Notes |
|------|-------|-------|
| `AUTH_SECRET` | Pages secret | 64-char hex JWT signing secret. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `TIGRIS_ACCESS_KEY_ID` | Pages secret | Tigris data access key |
| `TIGRIS_SECRET_ACCESS_KEY` | Pages secret | Tigris secret access key |
| `TIGRIS_BUCKET` | `wrangler.toml` `[vars]` | e.g. `inventory-dashboard` |
| `TIGRIS_ENDPOINT` | `wrangler.toml` `[vars]` | e.g. `https://t3.storage.dev` |
| `FACILITY_ID` | `wrangler.toml` `[vars]` | facility UUID |

For **local development** only, you may create a gitignored local `.env` (or use
`--vars-file`) with the same names. D1 is bound via `wrangler.toml` — no `D1_URL` needed.

## Local Development

```bash
npm install
npm run dev                 # Vite dev server → http://localhost:5173
```

Functions need `wrangler pages dev` (Vite alone won't serve them). Apply the database
migrations **in order** to the remote D1 before testing against it:

```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0001_initial_schema.sql
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0002_auth_tables.sql
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0003_app_settings.sql
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0004_remove_sku_unique.sql
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0005_units.sql
```

There is **no auto-migration runner** — each file is applied manually and once.

## Deployment

```bash
npm run deploy
# = npm run build && npx wrangler pages deploy dist --project-name=inventory-dashboard
```

### Connect-to-Git alternative

Push this repo to GitHub, then in Cloudflare Dashboard → **Pages** → **Connect to Git**:
Framework preset **Vite**, build command `npm run build`, output directory `dist`.
Set the secrets/vars above, and every push rebuilds.

## API Endpoints (Pages Functions)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/login | none | Login (per-IP: 5 attempts / 15 min; per-account: 5 failures → 15-min lockout) |
| POST | /api/auth/refresh | refresh cookie | Rotate session (silent renewal of an expired access token) |
| POST | /api/auth/logout | required | Logout (revokes refresh token, clears cookies) |
| GET | /api/users/me | required | Current user info |
| GET | /api/users | admin | List all users |
| POST | /api/users | admin | Create user (HIBP breach check + strength policy) |
| PUT | /api/users/:id | admin | Update user (role / lock / password) |
| DELETE | /api/users/:id | admin | Delete user |
| GET | /api/categories | public | List all categories |
| POST | /api/categories | editor+ | Create category |
| PUT | /api/categories/:id | editor+ | Update category |
| DELETE | /api/categories/:id | admin | Delete category (blocked while in use) |
| GET | /api/units | public | List all units |
| POST | /api/units | editor+ | Create unit |
| PUT | /api/units/:id | editor+ | Update unit |
| DELETE | /api/units/:id | admin | Delete unit (blocked while in use) |
| GET | /api/inventory | required | List items (filtered + paginated; includes `unit`) |
| POST | /api/inventory | editor+ | Create item — returns `409` if it matches an existing lot on all six fields (SKU + name + bin + specification + production + expiry) unless `allow_duplicate: true` |
| GET | /api/inventory/duplicates | required | Pre-check: list items matching the six lot fields (drives the Add form's live duplicate warning) |
| PUT | /api/inventory/:id | editor+ | Update item |
| DELETE | /api/inventory/:id | admin | Delete item |
| POST | /api/import | editor+ | Bulk import — `{ rows, dry_run }`; dry-run previews, commit inserts (duplicates skipped, never overwritten) |
| POST | /api/upload | editor+ | Upload image to Tigris |
| GET | /api/images/:key | public | Serve an image from Tigris (proxied; Tigris has no public ACLs) |
| GET | /api/stats | required | Aggregate statistics |
| GET | /api/sku | required | By-SKU totals + FEFO lots + optional min/max |
| GET | /api/settings | required | Get app settings (`company_name`) |
| PUT | /api/settings | admin | Update app settings |
| GET | /api/export | required | CSV / XLSX export |

## Project Structure

```
inventory-dashboard/
├── wrangler.toml          # Cloudflare Pages config + D1 binding + vars
├── functions/             # Pages Functions (TypeScript)
│   ├── _middleware.ts     # Global: JWT decode, secret passthrough, security headers (CSP/HSTS/…)
│   ├── lib/auth.ts        # JWT, PBKDF2, HIBP, roles, password policy
│   ├── api/
│   │   ├── auth/          # login, refresh, logout
│   │   ├── users.ts       # user management (admin) + users/me.ts
│   │   ├── categories.ts, [id].ts
│   │   ├── units.ts, [id].ts
│   │   ├── inventory.ts, [id].ts
│   │   ├── settings.ts    # GET/PUT app settings
│   │   ├── stats.ts, export.ts, upload.ts
│   │   └── images/_middleware.ts   # Tigris image proxy (DOMParser polyfill, cache headers)
│   └── assets/
├── src/                   # React + Vite app
│   ├── main.tsx           # Auth check on mount → login or app
│   ├── App.tsx            # Main dashboard (role-gated UI, header actions, modals)
│   ├── context.tsx        # App + auth/data context (useApp)
│   ├── lib/api.ts         # Typed API client
│   ├── components/        # InventoryTable, EditModal, Filters, StatsCards, admin panels, …
│   └── pages/Login.tsx    # Login screen
├── migrations/            # D1 schema, applied manually in order
│   ├── 0001_initial_schema.sql   # consumable_item, categories (+ seed)
│   ├── 0002_auth_tables.sql      # users, refresh_tokens, login_attempts
│   ├── 0003_app_settings.sql     # app_settings
│   ├── 0004_remove_sku_unique.sql
│   ├── 0005_units.sql            # units table + item.unit column + default units
│   └── 0006_sku.sql             # thin per-SKU thresholds
├── seeds/
│   ├── demo-data.sql           # demo-instance seed: demo user + sample data (idempotent reset)
│   └── README.md               # two-instance (prod + demo) setup & reset
├── docs/
│   ├── README.md               # documentation pack index (EN + 中文)
│   ├── en/                     # 01–09: architecture, data model, API, security, ops, UX, SOP, glossary, changelog
│   └── zh/                     # operator guide + glossary (中文)
└── LICENSE                     # all-rights-reserved (demonstration / portfolio)
```

## Database Migrations (D1)

Schema lives in `migrations/NNNN_name.sql`. There is **no auto-runner** — apply each
new migration to the remote DB manually (in numeric order) before/with your deploy:

```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/NNNN_name.sql
```

- `0005_units.sql` adds the `units` reference table, a `unit TEXT` column on
  `consumable_item`, and seeds the default units (pc, kg, L, drum, box, pallet).
  `consumable_item.unit` stores the unit **name** (the same denormalized-by-name pattern
  as `category`); deleting a unit is blocked while any item references it.

## Cost Estimate

| Service | Free Tier | Your Usage (Est.) | Cost |
|---------|-----------|-------------------|------|
| Cloudflare Pages | Unlimited sites, builds, bandwidth | < 1 GB build/month | $0 |
| Cloudflare D1 | 1 GB storage, 1M reads, 100K writes/day | < 50 MB, < 1K ops | $0 |
| Tigris Data | 5 GB storage, 10K Class A, 100K Class B/month | < 200 MB images, < 5K ops | $0 |
| **Total** | | | **$0/month** |

## Access & Credentials

The system runs as **two isolated instances** that share code but use separate D1
databases, Tigris buckets, and secrets:

- **Public demo (the showcase).** A separate instance (`inventory-dashboard-demo`) is
  seeded with a sample dataset via [`seeds/demo-data.sql`](seeds/demo-data.sql) and has a
  documented, low-risk login so the public repo is explorable:
  - Username: `demo` · Password: `Demo@2026!`
  - It is an admin **of the demo database only** and physically cannot read production
    data. Reset it any time with `npx wrangler d1 execute inventory-demo --remote
    --file=seeds/demo-data.sql`. See [`seeds/README.md`](seeds/README.md).
- **Production (your plant).** Access is **private**. The admin password is set and
  managed by the owner and is **not published** in this repo or docs. A brand-new
  database has no users until one is seeded — bootstrap the first admin out-of-band
  (a `users` row with a strong PBKDF2 hash) before first login, then create further users
  in the app.

> The earlier first-run credential `admin` / `Admin@2024!` is **retired**: it was a
> demo-time convenience, it is not valid on the rotated production instance, and it is no
> longer the public demo login (that is now `demo` / `Demo@2026!` on the isolated demo DB).
- **Roles.** Admin (full control) · Editor (items, categories, units — no deletes/users) ·
  Viewer (read-only). Admins manage further users in the **Users** panel.
- **Passwords** are hashed with PBKDF2-SHA256 (100k iterations, 16-byte salt), validated
  against a strength policy and a breach list (HIBP). Rotating `AUTH_SECRET` invalidates
  all sessions.

## License

All rights reserved — this build is published for **demonstration and portfolio
purposes**. See [`LICENSE`](LICENSE) for the full notice. Do not reuse this code or its
documentation in a product or client work without a separate written license.

---

Deployed with Cloudflare Pages, D1, and Tigris Data.
