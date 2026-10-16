# 01 · Architecture

> Part of the Inventory Dashboard client-handover pack. Read the [pack index](../README.md) first.
> 中文 operator-facing docs: [User Guide / SOP](../zh/07-user-guide-sop.md) · [Glossary](../zh/08-glossary.md)

Inventory Dashboard is a **multi-lot consumable inventory tool** for a manufacturing
plant: track which lots of each SKU are on hand, where they are (bins), when they were
made and when they expire, and issue the soonest-expiring lot first (**FEFO**).

This document is the "why it is built this way" reference: the system picture, the data
flows, and the **Architecture Decision Records (ADRs)** — the judgment calls that make
the system what it is.

---

## 1. What it is, in one paragraph

A React single-page app talks to a thin REST API built from **Cloudflare Pages Functions**,
which reads and writes a **Cloudflare D1** (SQLite) database and stores item photos in
**Tigris** (S3-compatible object storage). There is no Node server, no separate database
host, no cache layer to operate. The whole backend is a folder of TypeScript files that
deploy to the edge; state lives in D1. This keeps it cheap, easy to deploy, and easy to
reason about.

## 2. System diagram

```
                         ┌─────────────────────────────────────────────────────┐
                         │                BROWSER (React SPA)                 │
                         │  Vite + React 18 + TypeScript + Tailwind v3        │
                         │  · login · filters · add/import · by-SKU (FEFO)    │
                         │  · SheetJS (xlsx) parses import files CLIENT-side  │
                         └───────────────┬─────────────────────────────────────┘
                       fetch /api/*       │        (JWT in httpOnly cookie)
                                          ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │              CLOUDFLARE PAGES FUNCTIONS  (TypeScript / Workerd)           │
   │                                                                            │
   │  _middleware.ts ── security headers (CSP/HSTS/…), image proxy, rate caps │
   │   /api/inventory*  /api/import  /api/export  /api/upload  /api/stats     │
   │   /api/sku  /api/categories  /api/units  /api/auth/*  /api/users*       │
   │   /api/inventory/duplicates  (pre-check for the add-form dedup)          │
   │                                                                            │
   │      secrets (env, from the dashboard — NEVER in this repo):              │
   │      AUTH_SECRET · TIGRIS_ACCESS_KEY_ID · TIGRIS_SECRET_ACCESS_KEY        │
   └───────────────┬───────────────────────────────────────┬────────────────────┘
                   │  D1 binding (env.DB)                    │ S3 API (Tigris keys)
                   ▼                                        ▼
   ┌──────────────────────────────┐         ┌──────────────────────────────────┐
   │  CLOUDFLARE D1  (SQLite)      │         │  TIGRIS  (object storage)         │
   │  consumable_item, users, …   │         │  item photos (per-tenant bucket) │
   └──────────────────────────────┘         └──────────────────────────────────┘
```

### The three planes

- **Frontend (SPA).** Built by Vite into static files under `dist/`. It is the only
  thing visitors load; all logic beyond parsing an import spreadsheet is client-side.
- **API (Pages Functions).** `functions/api/**` — one file per route. No framework;
  each handler reads `env.DB` / Tigris and returns JSON. The same folder also carries
  the catch-all image proxy (`functions/api/images/_middleware.ts`).
- **Data (D1 + Tigris).** D1 holds every row. Tigris holds images; the app never
  exposes Tigris URLs directly — images are fetched through the proxy so the bucket
  stays private.

## 3. Key data flows

### Login (stateless-ish, cookie sessions)
1. `POST /api/auth/login` → PBKDF2 verify against the stored `users.password_hash`.
2. On success: sign an **access JWT** (HS256, 8 h) and a **refresh token** (opaque, 7 d,
   stored in `refresh_tokens`). Both are set as `httpOnly` cookies.
3. Every API call sends the cookie; `verifyJwt` re-checks it. The refresh token lets the
   SPA silently renew the access token before it lapses.
4. Failed attempts are rate-limited (5/min/IP → 15-min lockout) via the `login_attempts`
   table and the `RATE_LIMIT` KV namespace.

### Read inventory
`GET /api/inventory` returns a page of rows. "Expiring soon" and "Expired" are computed
**server-side** with a single day-boundary (`date('now')`), so every client agrees:

- **Expired** — `expiry_date < date('now')`
- **Expiring soon** — `date('now') ≤ expiry_date ≤ date('now','+30 days')`
- **Low / Out of stock** — quantity vs the row's `min_threshold`

### Add an item (with duplicate guard)
1. The add form debounces and calls `GET /api/inventory/duplicates` to warn early.
2. On save, `POST /api/inventory` runs the **authoritative** check: if a row already
   matches all six lot fields (below) and the body does not set `allow_duplicate: true`,
   it returns **`409 Duplicate`** with the matching rows. "Add anyway" sends the flag.
3. New rows get a server-generated UUID (`crypto.randomUUID()`).

**The lot identity** — the six fields that define "the same lot of the same thing":

> `SKU` + `name` + `bin_location` + `specification` + `production_date` + `expiry_date`

SKU is intentionally **non-unique** (see ADR-4): one SKU can have many lots in different
bins with different expiry dates. Dedup and bulk-import both use this exact six-field
key, so the two can never disagree.

### Bulk import (the "add many items" flow)
1. The browser parses the `.xlsx`/`.csv` with **SheetJS** (runs locally, nothing uploaded
   yet) and validates the six-field key client-side.
2. `POST /api/import` receives the parsed rows plus `dry_run`. A dry run previews
   create/skip counts; commit inserts in **one atomic D1 transaction** — duplicates are
   **skipped and reported, never overwritten** (cap 1000 rows).

### Images
`POST /api/upload` streams to Tigris and stores the object key on the item. Reading goes
through the proxy route so the bucket can stay non-public and the browser never holds Tigris
credentials.

## 4. Architecture Decision Records

Short form: **Decision → Why → Consequence.** These are the calls worth showing off.

**ADR-1 · Cloudflare Pages Functions + D1, not a Node server + Postgres.**
Serverless functions keep the API a flat set of files that deploy in one command; D1 is
managed SQLite with no connection pool to babysit. *Consequence:* SQLite, not Postgres —
we rely on `COALESCE` for NULL-safe matching and `date('now')` for day boundaries;
transactional bulk writes go through `db.batch()`.

**ADR-2 · Images in Tigris, read through a proxy, bucket kept private.**
Direct public object URLs would expose the bucket and defeat per-tenant keys. A
client-side image proxy (`/api/images/*`) streams on demand. *Consequence:* one extra
hop for images, but the bucket and its keys never reach the browser.

**ADR-3 · UUID primary keys, generated on the server.** D1 tables with UUID PKs have no
auto-increment / rowId. We generate `crypto.randomUUID()` on INSERT instead of reading
`meta.changes[0].rowId` (which is undefined for these tables). *Consequence:* all IDs are
strings; never `parseInt(id)`.

**ADR-4 · `sku` is non-unique on purpose.** A SKU is a *catalog* identity; the *lot* is
SKU + where + when. Removing the UNIQUE constraint (migration 0004) is what lets one SKU
carry several FEFO lots. *Consequence:* the six-field lot key (above) is the dedup rule;
"one row per SKU" assumptions are wrong.

**ADR-5 · Import is parsed in the browser; the endpoint stays thin.** SheetJS in the SPA
means the API receives plain rows, not bytes to parse. *Consequence:* the import endpoint
is a small, atomic batch insert with a skip-duplicates policy; file-format concerns never
reach the edge.

**ADR-6 · Dual-layer dedup: UI pre-check + authoritative 409.** The UI pre-checks for a
fast warning; the server 409 is the real guard so it cannot be bypassed (e.g. two tabs, or
a direct API call). *Consequence:* "add anyway" is a deliberate override, not a bug.

**ADR-7 · Expired and Expiring-soon are separate states.** "Expiring soon" previously
swallowed already-expired dates (a −309 day item showed as "expiring soon"). Now an
item is **Expired** when its date is in the past, and Expiring-soon only when it lands in
the next 30 days. Computed with one `date('now')` boundary. *Consequence:* stats, filters,
views, and the table all render the same two states, in the same colors.

**ADR-8 · Tailwind v3, not v4 (in this stack).** v4's PostCSS plugin is ESM-only and
silently fails to scan source when loaded via CJS, producing a CSS file with no
colors/spacing. v3 + PostCSS 8 is stable here. *Consequence:* pinned v3; do not "upgrade"
to v4 without re-verifying the CSS output.

**ADR-9 · Per-SKU thresholds live in a thin `sku` table (migration 0006).** Most SKUs
carry no threshold; only fast movers do. The By-SKU view computes "total on hand" on the
fly (SUM over the lots) and reads optional min/max from this table. *Consequence:* adding
a threshold is a 2-field row, not a schema change to `consumable_item`.

**ADR-10 · Two instances: production + public demo.** Same code, separate D1 database,
Tigris bucket, and secrets. The demo instance is seeded from `seeds/demo-data.sql` and
cannot reach production data. *Consequence:* the public repo can showcase a live app with
zero risk of exposing the plant's real records.

## 5. Repository layout

```
functions/            Pages Functions (the API + image proxy + middleware)
  _middleware.ts      security headers, image proxy, rate-limit glue
  api/inventory.ts    GET list + POST create (with the 409 duplicate guard)
  api/inventory/[id].ts          PUT / DELETE single row
  api/inventory/duplicates.ts    GET six-field lot pre-check
  api/import.ts       POST bulk import (atomic batch, skip-duplicates)
  api/export.ts       GET CSV / XLSX
  api/sku.ts          GET By-SKU totals + FEFO lots + optional thresholds
  api/stats.ts        GET aggregate counts (incl. expired vs expiring-soon)
  api/upload.ts       POST image → Tigris
  api/categories.ts   categories CRUD   ·   api/units.ts  units CRUD
  api/users.ts       users admin CRUD   ·   api/users/me.ts
  api/auth/{login,logout,refresh,change-password}.ts
migrations/           D1 schema (0001–0006), applied manually — see ops doc
seeds/demo-data.sql   demo-instance seed (user + sample dataset) + reset
src/                  React app
  components/         UI (tables, modals, filters, stats, by-SKU view)
  lib/api.ts          typed API client (throws typed errors, e.g. DuplicateItemError)
  lib/import.ts       SheetJS parse helpers
wrangler.toml         Pages project; non-secret vars only (secrets live in the dashboard)
```

## 6. Environments

| | Production | Public demo |
|---|---|---|
| Pages project | `inventory-dashboard` | `inventory-dashboard-demo` |
| D1 | your real inventory DB | `inventory-demo` (seeded) |
| Tigris | your image bucket | demo bucket |
| Secrets | private, strong | separate, demo-only |
| Data | real plant records | `seeds/demo-data.sql` sample |

See [Deployment & Ops](05-deployment-ops.md) for the runbook and [Security & Access
Policy](04-security-policy.md) for how secrets are kept out of the repo.
