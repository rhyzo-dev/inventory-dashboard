# 04 · Security & Access Policy

> Client-handover pack · [index](../README.md). This is the "how we stay safe" document —
> especially important because the code is public but the plant's data is not.

## 1. Threat model

- **Public code, private data.** The repo is public for showcase. Your plant's real
  inventory records, supplier info, and any PII live **only** in the production D1
  database and Tigris bucket — never in the repo, the docs, or the demo.
- **Two isolated instances.** Production and the public demo run the same code but point
  at **different D1 databases, Tigris buckets, and secrets** (see [01 §6](01-architecture.md)).
  The demo user is admin *of the demo DB only* — it physically cannot read production data.
- **The browser never holds secrets.** Tigris keys and `AUTH_SECRET` live in Cloudflare
  Pages Secrets. Images are fetched through a proxy so the bucket stays private and its
  keys never reach the client.

## 2. Secrets — kept out of the repository

- **Committed (non-secret, in `wrangler.toml [vars]`):** `FACILITY_ID`, `TIGRIS_BUCKET`,
  `TIGRIS_ENDPOINT` — identifiers/config only.
- **Never committed (Cloudflare Pages Secrets, per project):** `AUTH_SECRET`,
  `TIGRIS_ACCESS_KEY_ID`, `TIGRIS_SECRET_ACCESS_KEY`.
- **`.gitignore` guards:** `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `secrets/`, local D1/KV
  state (`.wrangler/`, `wrangler-state/`), and `*.db` / `*.sqlite`.

### ⚠️ History caveat (action before the public launch)
A history audit found that **early commits did carry real values** (old Tigris keys, and
an `AUTH_SECRET`) that were later removed from the working tree —
but removal does not remove them from git **history**. Therefore:
1. **Do not publish this private repo's history.** Publish the showcase as a **fresh
   repo seeded from the current (clean) tree** (one "Initial public snapshot" commit), or
   scrub history with `git filter-repo`/BFG and force-push first.
2. **Rotate the still-live secret:** `AUTH_SECRET` (invalidates all sessions — plan a
   maintenance window). Confirm the old Tigris keys are already revoked.

## 3. Authentication

- **Passwords:** PBKDF2-SHA256, 100k iterations, 16-byte random salt, stored as
  `base64url(salt):base64url(key)`. Comparison is constant-time.
- **New/changed passwords** are validated for strength and checked against the
  Have-I-Been-Pwned breach API before acceptance.
- **Sessions:** short-lived **access JWT** (HS256, 8 h) + opaque **refresh token** (7 d)
  stored in D1 and revocable on logout. Both delivered as `httpOnly`, `Secure`,
  `SameSite=Strict` cookies.
- **Roles:** `admin` > `editor` > `viewer`. Read routes need any session; writes need
  `editor`+; user management, category/unit deletes, and item deletes need `admin`.

## 4. Rate limiting & lockout

- Login: 5 attempts / IP / minute → **15-minute lockout** (per-IP counters in the
  `RATE_LIMIT` KV namespace + `login_attempts` table).
- Inventory: 30 req/min/IP · Upload: 10 req/min/IP → `429` + `Retry-After`.
- A user account is also locked after 5 consecutive failed logins.

## 5. Response headers (set by `functions/_middleware.ts`)

- `Content-Security-Policy` (images restricted to the Tigris proxy origin)
- `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: camera / microphone / geolocation disabled

## 6. Credential & data policy

- **Production admin login is private.** It is rotated and is *not* a public credential.
  Do not write it into the public repo.
- **The demo login is a fixed, documented, low-risk credential on an isolated database**
  (`demo` / `Demo@2026!` — see [seeds/README.md](../seeds/README.md)). It exists so the
  public showcase is explorable; it can never reach production data.
- **The public repo and demo contain sample data only.** No real supplier, price, bin-map,
  or personal data. The demo seed sets a neutral company name so the real plant name is not
  exposed.

## 7. Rotation runbooks (summary)

| What | How | Effect |
|------|-----|--------|
| `AUTH_SECRET` | `wrangler pages secret put AUTH_SECRET` (per project) | **All sessions invalidated** |
| Tigris keys | rotate in Tigris → `wrangler pages secret put` | in-flight image fetches fail until updated |
| A user password | Users panel or `/api/auth/change-password` | that user must re-login |

Full operational steps are in [05 Deployment & Ops](05-deployment-ops.md).
