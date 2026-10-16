# 09 · Changelog & Testing

> Client-handover pack · [index](../README.md).

## 1. Changelog (recent)

| Area | Change |
|------|--------|
| Import | Bulk **Excel/CSV import** with a downloadable template; atomic commit; duplicates **skipped & reported**, never overwritten (cap 1000 rows). |
| Dedup | **Duplicate guard** on the add form — six-field lot key; live pre-check warning + authoritative `409`; "add anyway" override. |
| Expiry | **Expired** separated from **Expiring soon** across stats, filters, views, and the table (day-boundary via `date('now')`). |
| Categories | Filter dropdown driven by **live** user-created categories (no longer hardcoded). |
| By-SKU | **By-SKU / FEFO** view (total on hand + issue order) with optional **per-SKU thresholds** (thin `sku` table). |
| Units | Managed **units of measure** (strict dropdown), seeded defaults. |
| Auth | JWT access + stored refresh tokens, PBKDF2-100k, roles, HIBP checks, per-IP rate limiting + lockout, self-service password change. |
| Images | Client-side compression, upload to Tigris, hover-only remove, proxy access. |
| Security | Secrets moved out of git; CSP/HSTS/nosniff/frame-deny headers; per-IP rate limiting. |

## 2. Testing & quality

- **Build gate:** `npm run build` (Vite) must pass before any deploy; `npm run deploy` runs
  build then `wrangler pages deploy`.
- **Type check:** the project's `tsconfig.json` has a stale `include` (points at
  `frontend/**`, but the app is in `src/`), so run a scoped check instead:
  `npx tsc -p tsconfig.srccheck.json` (or temporarily point `include` at `src/**/*`).
  Pre-existing unused-import noise elsewhere is ignored by the Vite build.
- **Server transpile gate:** Cloudflare's build transpiles each function file; verify touched
  `functions/api/**` files compile (e.g. `npx esbuild functions/api/<file>.ts` as a smoke test).
- **E2E:** an end-to-end test suite is included for the auth + inventory flows; run it against
  a seeded local/demo database, never production.
- **Manual smoke test after a deploy:** log in → the five stat cards render → add an item →
  re-import the same lot (should skip) → flip an item to Expired and confirm it moves out of
  "Expiring soon."

## 3. Rollout checklist (before making the repo public)

- [ ] Secret-scan the tree and confirm **no historical secrets ship** (publish a clean snapshot).
- [ ] `AUTH_SECRET` rotated; old Tigris keys confirmed dead.
- [ ] Demo instance seeded (`seeds/demo-data.sql`) and reachable with the demo login.
- [ ] License in place (all-rights-reserved statement).
