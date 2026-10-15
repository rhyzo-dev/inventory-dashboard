# Inventory Dashboard — Project Context

## Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS v3
- **Build**: Vite → outputs to `dist/`
- **Backend**: Cloudflare Pages Functions (TypeScript)
- **Database**: Cloudflare D1 (SQLite with UUID primary keys)
- **Storage**: Tigris (S3-compatible object storage for images)

## How to Deploy
```bash
npm run deploy
# Equivalent to: npm run build && npx wrangler pages deploy dist --project-name=inventory-dashboard
```

## Database Migrations (D1)
Schema lives in `migrations/NNNN_name.sql`. There is **no auto-runner** — apply a new
migration to the remote DB manually before/with your deploy:
```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/NNNN_name.sql
```
- **0005_units.sql** adds the `units` reference table, a `unit TEXT` column on
  `consumable_item`, and seeds default units (pc, kg, L, drum, box, pallet).
- `consumable_item.unit` stores the unit **name** (TEXT), the same denormalized-by-name
  pattern as `category`. Deleting a unit is blocked while any item references it.

## Critical Configuration Decisions
1. **Tailwind v3, NOT v4** — v4's `@tailwindcss/postcss` is ESM-only; loading it from CJS silently
   compiles but fails to scan source files, producing CSS missing all colors/spacing/shadows.
   See `postcss.config.cjs` comment for details.

2. **NO `[build]` section in wrangler.toml** — it conflicts with `wrangler pages deploy` and throws
   "Configuration file for Pages projects does not support 'build'".

3. **UUID primary keys** — D1 tables with UUID PKs have no auto-increment and no rowId.
   All IDs are generated server-side with `crypto.randomUUID()` and included in INSERT.
   Never use `parseInt(id)` on these values — they are strings.

4. **Parameterized routes** — `/api/inventory/[id].ts` handles PUT/DELETE for single items.
   The `[id].ts` filename (not just `[id]`) tells Pages Functions this is a parameterized handler.

## API Endpoints
| Method | Path | Handler | Auth | Purpose |
|--------|------|---------|------|---------|
| GET | /api/inventory | functions/api/inventory.ts | required | List items (with filters + pagination) |
| POST | /api/inventory | functions/api/inventory.ts | editor+ | Create item (generates UUID). Duplicate guard: 409 if it matches on all six lot fields (SKU+name+bin+specification+production+expiry) unless body `allow_duplicate` is true |
| GET | /api/inventory/duplicates | functions/api/inventory/duplicates.ts | required | Pre-check: list items matching the six lot fields (powers the Add form's live duplicate warning) |
| PUT | /api/inventory/:id | functions/api/inventory/[id].ts | editor+ | Update item |
| DELETE | /api/inventory/:id | functions/api/inventory/[id].ts | admin only | Delete item |
| POST | /api/upload | functions/api/upload.ts | editor+ | Upload image to Tigris |
| GET | /api/stats | functions/api/stats.ts | required | Aggregate statistics |
| GET | /api/export | functions/api/export.ts | required | CSV/XLSX export |
| POST | /api/import | functions/api/import.ts | editor+ | Bulk import — `{ rows, dry_run }`; dry-run previews, commit inserts in one D1 tx (duplicates skipped, never overwritten; cap 1000 rows). File parsing is client-side (SheetJS). |
| POST | /api/auth/login | functions/api/auth/login.ts | none | Login (rate-limited: 5/min/IP) |
| POST | /api/auth/logout | functions/api/auth/logout.ts | required | Logout (revokes refresh token) |
| GET | /api/users/me | functions/api/users/me.ts | required | Get current user |
| GET | /api/users | functions/api/users.ts | admin only | List all users |
| POST | /api/users | functions/api/users.ts | admin only | Create user (HIBP check) |
| PUT | /api/users/:id | functions/api/users.ts | admin only | Update role/lock/password |
| DELETE | /api/users/:id | functions/api/users.ts | admin only | Delete user |
| GET | /api/categories | functions/api/categories.ts | none | List all categories |
| POST | /api/categories | functions/api/categories.ts | editor+ | Create category |
| PUT | /api/categories/:id | functions/api/categories/[id].ts | editor+ | Update category |
| DELETE | /api/categories/:id | functions/api/categories/[id].ts | admin only | Delete category |
| GET | /api/units | functions/api/units.ts | none | List all units |
| POST | /api/units | functions/api/units.ts | editor+ | Create unit |
| PUT | /api/units/:id | functions/api/units/[id].ts | editor+ | Update unit |
| DELETE | /api/units/:id | functions/api/units/[id].ts | admin only | Delete unit (blocked while in use) |

## Authentication
- JWT in httpOnly, Secure, SameSite=Strict cookie (`auth_token`)
- PBKDF2-SHA256 password hashing (100k iterations, 16-byte salt) via Web Crypto API
- Rate limiting: 5 login attempts/IP/minute → 15-minute lockout
- HIBP breach checking on user creation
- Role-based access: admin > editor > viewer
- Secret: `AUTH_SECRET` in wrangler.toml `[vars]`

## Rate Limiting
- Per-IP, stored in D1 counter table
- Inventory endpoints: 30 req/min
- Upload endpoint: 10 req/min

## Security Headers (applied by functions/_middleware.ts)
- Content-Security-Policy (images restricted to Tigris origin)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera/microphone/geolocation disabled

## Previous Build Issues (for reference)
- **2026-10-12**: POST /api/inventory returned 500 — `result.meta.changes[0].rowId` is undefined for UUID tables. Fixed by generating UUID with `crypto.randomUUID()` and including it in INSERT.
- **2026-10-12**: PUT/DELETE returned 405 — route `/api/inventory` with `end: true` didn't match `/api/inventory/:id`. Fixed by using `[id].ts` parameterized route.
- **2026-10-13**: CSS missing colors/spacing — Tailwind v4 PostCSS plugin loaded from CJS silently failed to scan source files. Fixed by switching to `tailwindcss@3` + `postcss@8`.
- **2026-10-13**: Deploy failed with "does not support build" — `[build]` section in wrangler.toml incompatible with Pages deploy. Removed.
