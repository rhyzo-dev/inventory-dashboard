# 05 · Deployment & Operations runbook

> Client-handover pack · [index](../README.md). Assume a Cloudflare account, Node 18+, and
> `wrangler` logged in.

## 1. One-time setup (production)

```bash
# 1. Database
npx wrangler d1 create inventory-dashboard            # note the database_id
#    → set that id as the D1 binding in wrangler.toml [[d1_databases]]

# 2. Apply schema (manual, in order)
for f in migrations/*.sql; do
  npx wrangler d1 execute inventory-dashboard --remote --file="$f"
done

# 3. Object storage for images
#    create a Tigris bucket; note its access + secret key and endpoint

# 4. Secrets (never committed)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → AUTH_SECRET
npx wrangler pages secret put AUTH_SECRET            --project-name=inventory-dashboard
npx wrangler pages secret put TIGRIS_ACCESS_KEY_ID   --project-name=inventory-dashboard
npx wrangler pages secret put TIGRIS_SECRET_ACCESS_KEY --project-name=inventory-dashboard

# 5. Non-secret vars already in wrangler.toml: FACILITY_ID, TIGRIS_BUCKET, TIGRIS_ENDPOINT
```

## 2. Deploy

```bash
npm run deploy        # = vite build  +  wrangler pages deploy dist --project-name=inventory-dashboard
```
Every code change ships with a new deploy. Applying a **new D1 migration** is a separate,
manual step (there is no auto-runner): run the migration file against the remote DB
**before or with** the deploy that depends on it.

```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/NNNN_new.sql
```

## 3. The public demo instance

Same code, separate resources (see [01 §6](01-architecture.md)). In the same account:

```bash
# separate D1 + Tigris bucket + secrets, bound to a second Pages project
npx wrangler d1 create inventory-demo
for f in migrations/*.sql; do npx wrangler d1 execute inventory-demo --remote --file="$f"; done
npx wrangler d1 execute inventory-demo --remote --file=seeds/demo-data.sql   # demo user + sample data
# set demo project's secrets: a distinct AUTH_SECRET + demo Tigris keys
npx wrangler pages deploy dist --project-name=inventory-dashboard-demo
```

## 4. Backups & recovery

- **D1:** `npx wrangler d1 execute <db> --remote --command="SELECT …"` for spot checks;
  export critical tables periodically to keep an off-site copy. Define your retention in
  advance — a lost lot record is cheap to recreate, a lost audit trail is not.
- **Tigris:** object storage is highly durable; keep a manifest of item → object keys if
  you want fast bulk recovery.
- **Disaster recovery:** recreate DB → apply `migrations/` in order → restore the latest
  D1 export → re-set secrets → redeploy.

## 5. Monitoring & logging

- Cloudflare **Logs** surface worker errors; the API logs auth failures and 5xxs.
- The `/` image proxy and 409 duplicate responses are normal — they are not errors.
- Watch the `RATE_LIMIT` 429s and login lockouts as signals of either abuse or a
  misbehaving client.

## 6. Routine operations

| Task | How |
|------|-----|
| Change a user's password / role / lock | Users panel (admin), or `PUT /api/users/:id` |
| Add a category / unit | Categories / Units panels (editor+) |
| Set per-SKU min/max | By-SKU view → "Thresholds" → save (writes the thin `sku` table) |
| Bulk add items | **Import Items** button → download template → fill `Rows` → upload (skip-duplicates) |
| Reset the demo to a clean state | `npx wrangler d1 execute inventory-demo --remote --file=seeds/demo-data.sql` |
| Rotate `AUTH_SECRET` | `wrangler pages secret put AUTH_SECRET` — **all sessions invalidated** |

## 7. Publishing the public showcase cleanly

Because the private history contains past-committed secrets (see [04 §2](04-security-policy.md)),
**do not** make the private repo public as-is. Two clean options:

- **Option A (recommended):** create a new public repo and push a **clean snapshot** of the
  current tree (single "Initial public snapshot" commit). No private history, no secrets.
- **Option B:** scrub this repo's history with `git filter-repo` / BFG (remove the secret
  lines from every commit), force-push, then publish or mirror.

Whichever you choose: verify the tree with a secret scan (`gitleaks` / `trufflehog`) before
it is reachable, and finish by **rotating `AUTH_SECRET`** and **confirming the old Tigris keys are revoked**.
