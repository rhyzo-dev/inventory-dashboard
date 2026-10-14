# Inventory Dashboard (Cloudflare Pages + D1 + Tigris)

A role-based inventory dashboard built with React, TypeScript, and Vite, deployed to
Cloudflare Pages. Data is stored in Cloudflare D1 (SQLite, UUID primary keys) and
images in Tigris Data (S3-compatible object storage).

> 📘 **Full team documentation** (architecture, data model, API reference, UX flow,
> security & data policy, operations) — English + Chinese:
> [`docs/Inventory-Dashboard.md`](docs/Inventory-Dashboard.md).
> This README is a quick start; the doc is the source of truth.

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
| POST | /api/inventory | editor+ | Create item |
| PUT | /api/inventory/:id | editor+ | Update item |
| DELETE | /api/inventory/:id | admin | Delete item |
| POST | /api/upload | editor+ | Upload image to Tigris |
| GET | /api/images/:key | public | Serve an image from Tigris (proxied; Tigris has no public ACLs) |
| GET | /api/stats | required | Aggregate statistics |
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
│   └── 0005_units.sql            # units table + item.unit column + default units
└── docs/Inventory-Dashboard.md    # Full bilingual team documentation
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

- **No default admin account is shipped in the repository.** The first admin user is
  created out-of-band (a one-time seeded user or created via a trusted bootstrap), and
  all accounts are then managed in the app's **Users** panel.
- The initial credentials are **not** stored in this repo, the docs, or anywhere they
  can leak. Anyone with an admin account can create further users (editor / viewer).
- Passwords are hashed with PBKDF2-SHA256 (100k iterations, 16-byte salt) and checked
  against a breach list (HIBP) on creation; rotation of `AUTH_SECRET` invalidates all
  existing sessions.

---

Deployed with Cloudflare Pages, D1, and Tigris Data.
