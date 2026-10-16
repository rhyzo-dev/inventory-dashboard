# Demo instance seed

This seeds the **public demo instance** of the dashboard — a fully isolated
environment so a visitor of the public repo can explore the whole app (add,
import, delete) without ever touching your plant's live data.

## The two-instance model

Everything below applies to the **demo** resources only. Production keeps its
own, separate set. Same code, different bindings:

|                 | Production (your plant)      | Public demo (showcase)              |
|-----------------|------------------------------|-------------------------------------|
| Pages project   | `inventory-dashboard`       | `inventory-dashboard-demo`          |
| D1 database     | your real `inventory` DB    | `inventory-demo` (seeded sample)    |
| Tigris bucket   | your real image bucket      | a demo image bucket                 |
| `AUTH_SECRET`   | strong, private             | separate, demo-only value           |
| Tigris keys     | your real keys              | demo keys                           |

All secrets (Tigris keys, `AUTH_SECRET`) are set **per project in the Cloudflare
dashboard / `wrangler pages secret`** — they are never committed to this repo.

## Set up the demo database

1. Create the demo D1 database in the same Cloudflare account:
   ```bash
   npx wrangler d1 create inventory-demo
   ```
2. Apply the schema (all migrations, in order):
   ```bash
   for f in migrations/*.sql; do
     npx wrangler d1 execute inventory-demo --remote --file="$f"
   done
   ```
3. Seed the demo data (wipes demo rows + recreates the demo user + sample items):
   ```bash
   npx wrangler d1 execute inventory-demo --remote --file=seeds/demo-data.sql
   ```

## Log in to the demo

- **username:** `demo`
- **password:** `Demo@2026!`
- role: `admin` (on the isolated demo DB, so every feature is explorable)

The sample dataset intentionally shows every state the app reports — expired
items (including a −309 day one), expiring-soon, low / out of stock, and a
multi-lot SKU for the FEFO (By-SKU) view. Dates are relative to seed time, so
the mix stays live.

## Reset the demo to a clean state

Re-run the seed any time — it is idempotent and restores the known demo state:

```bash
npx wrangler d1 execute inventory-demo --remote --file=seeds/demo-data.sql
```

> ⚠️ **Never run `seeds/demo-data.sql` against the production database.** It
> deletes user rows. It is only meant for the isolated demo database.
