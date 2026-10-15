# Inventory Dashboard — System Documentation / 库存仪表盘 — 系统文档

| | |
|---|---|
| **Version / 版本** | 1.0 |
| **Documented / 记录日期** | 2026-10-14 |
| **Audience / 读者** | Team engineers & operators / 团队工程与运维人员 |
| **Maintainer / 维护者** | rhyzo |
| **Source of truth / 权威来源** | This document + the code in this repository / 本文档 + 本仓库代码 |

> **Scope.** This document describes the *current, deployed* Inventory Dashboard: its
> architecture, data model, API, user flows, and security/data policies. It is the
> single reference for both English and Chinese readers.
>
> **Security note.** No secrets appear in this document. `AUTH_SECRET` and the Tigris
> access/secret keys are stored in **Cloudflare** (Pages secrets / dashboard) and are
> intentionally omitted here. Older drafts of this document that leaked keys have been
> discarded; treat any credential you see in old notes as compromised and rotate it.

---

# PART 1 — ENGLISH

## 1. Overview

The Inventory Dashboard is a role-based web application for tracking consumable
inventory (spare parts, lubricants, PPE, and similar stock-keeping items) across a
facility. It supports:

- Searching, filtering, and paginating inventory items
- Adding / editing items with SKU, quantity, thresholds, category, **unit of measure**,
  bin location, production/expiry dates, specification, and a photo
- Image storage for item photos
- Export to CSV or XLSX
- A **By-SKU** view: total on hand per SKU with **FEFO** lot ordering and optional
  per-SKU min/max thresholds
- An attention-first list: the four stat cards double as one-click filters, and the list
  uses a stable, user-selectable **sort** (SKU / name / quantity / FEFO / recency) so
  newly added items land in place instead of jumping to the top
- Self-service **change-your-own-password** (any role), revoking the old session
- **Bulk import** from Excel / CSV: download a template, preview a per-row plan
  (add / duplicate-skip / error), then commit. Duplicates are skipped, never overwritten
- Role-based user management (admin / editor / viewer)
- Management of reference data: **categories** and **units**
- App-wide settings (currently the company name)

The entire stack runs on Cloudflare free-tier services, so ongoing cost is ~$0/month
for light internal use.

## 2. System Architecture

### 2.1 Components

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 | Single-page application (SPA) |
| Backend | Cloudflare Pages Functions (TypeScript) | REST API |
| Relational data | Cloudflare **D1** (SQLite, UUID primary keys) | Items, users, tokens, categories, units, settings |
| Object storage | **Tigris** (S3-compatible) | Item photos |
| Rate limiting | Cloudflare **KV** (`RATE_LIMIT`) | Per-IP throttle for inventory & upload |
| Secrets | Cloudflare **Pages secrets** | `AUTH_SECRET`, `TIGRIS_ACCESS_KEY_ID`, `TIGRIS_SECRET_ACCESS_KEY` |

```
Browser (React SPA)
   │  (auth via httpOnly cookies)
   ▼
Cloudflare Pages Functions  ──►  D1 (SQLite)      ──►  Tigris (images)
   │                              KV RATE_LIMIT      (Cloudflare secrets)
   ▼
HTML/JS/CSS bundle + static assets
```

### 2.2 Key design decisions

- **D1, not Turso.** The current system uses Cloudflare D1. (Earlier drafts described a
  Turso + read-only + no-auth design; that is obsolete.)
- **UUID primary keys.** D1 tables here use UUID keys (no rowId / auto-increment). IDs
  are generated server-side with `crypto.randomUUID()` and included in INSERTs. IDs are
  strings — never parse them as integers.
- **Units are denormalized by name.** `consumable_item.unit` stores the unit's *name*
  (TEXT), the same pattern as `category`. This keeps item rows readable and avoids a
  join; deleting a unit is blocked while any item references it.
- **Tigris has no object ACLs.** Images are not publicly addressable; they are served
  through a same-origin proxy `GET /api/images/{key}` so the SPA's CSP (which only
  allows `img-src 'self' data: blob:`) can load them.
- **No auto-migrations.** Schema changes are SQL files in `migrations/` applied
  manually to remote D1 (see §7.3).

## 3. Data Model (D1)

All tables use TEXT UUID primary keys.

### 3.1 `consumable_item`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) | PK |
| `facility_id` | TEXT | foreign facility reference |
| `sku` | TEXT | item code (uniqueness dropped in 0004 — items may share SKU) |
| `name` | TEXT | required |
| `description` | TEXT | optional |
| `category` | TEXT | stores category **name** (nullable) |
| `unit` | TEXT | stores unit **name** (nullable; added in 0005) |
| `quantity` | INTEGER | current quantity |
| `min_threshold` / `max_threshold` | INTEGER | stock levels |
| `bin_location` | TEXT | optional |
| `production_date` / `expiry_date` | TEXT (date) | optional |
| `image_url` | TEXT | points at `/api/images/{key}` (nullable) |
| `creator_id` / `updater_id` | TEXT | audit references to `users.id` |
| `created_at` / `updated_at` | TEXT | timestamps |
| `specification` | TEXT | optional |

**Stock status is derived (not stored):**
- `Out of Stock` → `quantity <= 0`
- `Low Stock` → `0 < quantity < min_threshold`
- `Adequate` → `quantity >= min_threshold`

### 3.2 `users`
`id` (UUID PK), `username` (unique), `password_hash` (PBKDF2, see §5.2), `role`
(CHECK IN `'admin','editor','viewer'`), `is_locked` (0/1), `locked_until`,
`failed_attempts`, `created_at`.

### 3.3 `refresh_tokens`
`token`, `user_id`, `expires_at` (UTC). A refresh token is stored on login, rotated on
every `/api/auth/refresh`, and deleted on logout.

### 3.4 `login_attempts`
`ip`, `attempted_at`, `success` (0/1). Used for the per-IP login rate limit.

### 3.5 `categories`
`id` (UUID PK), `name` (unique), `color`, `created_at`. Seeded by the schema.
Deleting a category is blocked while any item uses it.

### 3.6 `units` (added in migration 0005)
`id` (UUID PK), `name` (unique, case-insensitive via `COLLATE NOCASE`), `created_at`,
`updated_at`. Seeded with defaults: `pc, kg, L, drum, box, pallet`. Deleting a unit is
blocked while any item references it.

### 3.7 `app_settings`
`key` (PK) / `value` / `updated_at`. Currently one row: `company_name`.

## 4. API Reference

All responses are JSON. Auth endpoints set/read `httpOnly` cookies.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/auth/login` | public | Authenticate; set `auth_token` + `refresh_token` cookies |
| `POST` | `/api/auth/refresh` | refresh cookie | Rotate session (renew an expired access token) |
| `POST` | `/api/auth/logout` | required | Revoke refresh token; clear both cookies |
| `POST` | `/api/auth/change-password` | required | Change the caller's **own** password (verify current, HIBP + strength; revokes refresh tokens) |
| `GET` | `/api/users/me` | required | Current user |
| `GET` | `/api/users` | admin | List users |
| `POST` | `/api/users` | admin | Create user (HIBP + strength check) |
| `PUT` | `/api/users/:id` | admin | Update role / lock / password |
| `DELETE` | `/api/users/:id` | admin | Delete user |
| `GET` | `/api/categories` | public | List categories |
| `POST` | `/api/categories` | editor+ | Create category |
| `PUT` | `/api/categories/:id` | editor+ | Update category |
| `DELETE` | `/api/categories/:id` | admin | Delete category (409 if in use) |
| `GET` | `/api/units` | public | List units |
| `POST` | `/api/units` | editor+ | Create unit (name, 1–20 chars) |
| `PUT` | `/api/units/:id` | editor+ | Rename unit |
| `DELETE` | `/api/units/:id` | admin | Delete unit (409 if in use) |
| `GET` | `/api/inventory` | required | List items (filter + pagination) |
| `POST` | `/api/inventory` | editor+ | Create item. **Duplicate guard:** returns `409` if an item matches on all six lot fields (SKU + name + bin + specification + production + expiry) unless the body sets `allow_duplicate: true` |
| `GET` | `/api/inventory/duplicates` | required | Pre-check: list items matching the six lot fields (`?sku&name&bin_location&specification&production_date&expiry_date&exclude_id`) — powers the Add form’s live duplicate warning |
| `PUT` | `/api/inventory/:id` | editor+ | Update item |
| `DELETE` | `/api/inventory/:id` | admin | Delete item |
| `GET` | `/api/sku` | required | Per-SKU summary (total on hand, FEFO lots, thresholds) — `?category&search&sort` |
| `PUT` | `/api/sku` | editor+ | Upsert a SKU's optional min/max thresholds (body `{ sku, min_threshold?, max_threshold? }`) |
| `POST` | `/api/import` | editor+ | Bulk import — body `{ rows: […], dry_run: bool }`. Dry-run returns a per-row plan; commit inserts in one D1 transaction. Duplicates (same SKU + name + bin + specification + production + expiry) are **skipped**, never overwritten (cap 1000 rows) |
| `POST` | `/api/upload` | editor+ | Upload image to Tigris (returns object key) |
| `GET` | `/api/images/:key` | public | Proxy an image from Tigris |
| `GET` | `/api/stats` | required | `{ total_items, low_stock_count, out_of_stock_count, expiring_soon_count, expired_count }` — “expiring soon” = due within 30 days but not yet; “expired” = past its expiry date |
| `GET` | `/api/settings` | required | App settings (`company_name`) |
| `PUT` | `/api/settings` | admin | Update settings |
| `GET` | `/api/export` | required | CSV or XLSX of the current filter |

`expiring_soon_count` = items expiring within **30 days**. XLSX export columns:
*Item Code (SKU), Item Name, Specification, Location, Manufacturing Date, Expiration
Date, Current Quantity* — the quantity cell is color-coded by stock status.

## 5. Authentication & Session Policy

### 5.1 Tokens
- **Access token:** JWT, `HS256`, **8-hour** lifetime. (The file header in
  `functions/lib/auth.ts` still says "15-minute" — that comment is stale; the code is
  `ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000`.) Delivered in the `auth_token` cookie.
- **Refresh token:** opaque, **7-day** lifetime, stored in D1 `refresh_tokens`,
  delivered in the `refresh_token` cookie. **Rotated on every refresh** (the used token
  is deleted and a new one stored).
- Cookies: `HttpOnly; Secure; SameSite=Strict; Path=/`.

### 5.2 Passwords
- Hashed with **PBKDF2-SHA256, 100,000 iterations, 16-byte salt**, stored as
  `base64(salt):base64(hash)`.
- Policy: **8–128 characters, must contain at least one letter and one number.**
- New/reset passwords are checked against a breach list (**HIBP k-anonymity**) and
  rejected if too common.

### 5.3 Rate limiting
| Scope | Limit | Storage |
|-------|-------|---------|
| Login, per IP | 5 attempts / **15-minute** rolling window | D1 `login_attempts` |
| Login, per account | 5 consecutive failures → **15-minute** account lockout | `users.failed_attempts` |
| Inventory endpoints | 30 req/min per IP | KV `RATE_LIMIT` |
| Upload endpoint | 10 req/min per IP | KV `RATE_LIMIT` |

### 5.4 Roles
`admin > editor > viewer`.

| Capability | Admin | Editor | Viewer |
|------------|:-----:|:------:|:------:|
| View items, stats, export, images | ✅ | ✅ | ✅ |
| Add / edit items & images | ✅ | ✅ | ❌ |
| Delete items | ✅ | ❌ | ❌ |
| Manage categories & units (add/edit) | ✅ | ✅ | ❌ |
| Delete categories / units | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Manage settings | ✅ | ❌ | ❌ |

### 5.5 Initial access / default administrator
- A seeded **`admin`** account ships with the app as a first-run / demo credential so the
  project can be evaluated out of the box:
  - Username: `admin`
  - Password: `Admin@2024!`
- This is a **known, public** credential. It is intended for demos and evaluation, **not**
  for production. For a real deployment:
  1. Sign in as `admin` and immediately change the password via **Change Password**
     (see §6.9), or reset it in the **Users** panel.
  2. Set a strong, unique `AUTH_SECRET` (rotating it invalidates all sessions — §7.4).
  3. Delete the seeded `admin` account and work from your own admin user.

## 6. User Flows

### 6.1 Loading the app
`src/main.tsx` mounts `Root`, which calls `GET /api/users/me` on start:
- **200** → render the dashboard (`App.tsx`).
- **401 / error** → render the login page (`src/pages/Login.tsx`).

### 6.2 Logging in
Enter username + password → `POST /api/auth/login`. On success the server sets both
cookies and the app reloads into the dashboard. A wrong/unknown credential returns a
uniform "Invalid username or password" (no user enumeration).

### 6.3 Dashboard
Top of the page shows four **stat cards** (Total, Low Stock, Out of Stock, Expiring
Soon), a **Filters** row, an **Export** button (CSV / XLSX of the current filter), and
the **inventory table** with pagination (10 / 25 / 50 / 100 per page). The quantity cell
shows the value plus its unit (e.g. `12 L`).

- **View toggle** (`Items` / `By SKU`): *By SKU* collapses lots into one row per SKU —
  total on hand, **FEFO** issue order across bins/lots, and the SKU's optional min/max
  thresholds (edit via the row's *Thresholds* button, §6.4b).
- **Stat cards are filters.** Clicking *Low Stock* / *Out of Stock* / *Expiring Soon*
  applies the matching server-side filter and a sensible sort (quantity-ascending for
  stock, FEFO for expiry); clicking again clears it.
- **Filters** row: search, category, status, view, and a **Sort** control
  (SKU / name / quantity / FEFO / recently updated / recently added). The default sort is
  **SKU**, so the list is a stable catalog — a newly added item appears in its own place
  instead of jumping to the top, then **flashes** once so it is easy to find.

### 6.4 Item edit / add
The **Add Item** / pencil button opens the **Edit modal**: SKU (locked on edit), Name,
Category (managed list), **Unit** (managed list, with a `(legacy)` option for values not
in the list), quantity + min/max thresholds, bin location, production/expiry dates,
specification, description, and image preview (remove via the 🗑 button).

### 6.4b Per-SKU thresholds (By-SKU view)
In the *By SKU* view, each row's **Thresholds** button opens a small editor for that SKU's
optional **min / max** stock levels (stored in the `sku` table, not on the item rows).
Leave a field blank to clear it; `max` must be ≥ `min`. This is intended for the
fast-moving production items — a SKU with no thresholds simply shows "—" and no
low/out flags.

### 6.5 Images
Editors can **upload** (camera icon), **view** (click thumbnail → lightbox), or
**remove** an item photo. Uploads go to Tigris and are read back through the
`/api/images/{key}` proxy.

### 6.6 Admin panels (in the header, role-gated)
- **Users** (admin): create / edit / lock / delete users.
- **Categories** (editor+): add / rename / delete (delete admin-only, in-use guarded).
- **Units** (editor+): add / rename / delete (delete admin-only, in-use guarded).
- **Settings** (admin): edit `company_name`.

### 6.7 Logging out
`POST /api/auth/logout` revokes the refresh token and clears both cookies.

### 6.8 Silent refresh
If a data request returns **401**, the app first tries `POST /api/auth/refresh`
(using the refresh cookie) and retries; only if that also fails does it force a logout
to the login page. This keeps long sessions alive within the 7-day refresh window.

### 6.9 Change your own password
Any user (admin, editor, viewer) can change their **own** password from the account
menu → **Change Password**. The server (`POST /api/auth/change-password`):
1. Verifies the current password (constant-time PBKDF2 compare) — the first step for a
   lone admin to lock out the shipped default credential.
2. Rejects an unchanged password and enforces the §5.2 policy + HIBP breach check.
3. Rehashes and stores the new password, then **deletes that user's refresh tokens**, so
   the old credential can no longer mint a session. The current access token stays valid
   until it lapses, so the user is not logged out mid-page.

### 6.10 Bulk import (Excel / CSV)
Editors and admins can load many items at once from a spreadsheet instead of keying
them in one at a time. From the header, **Import** (editor+ only) opens a dialog:

1. **Download a template** (Excel `.xlsx` or `.csv`) with the exact columns and an
   example row: `SKU* · Name* · Specification · Category · Unit · Quantity ·
   Min/Max Threshold · Bin Location · Production/Expiry Date · Description`.
2. **Upload** the filled file. The app parses it **in the browser** (SheetJS) and posts
   a dry-run to `POST /api/import`. Nothing is written yet.
3. **Preview** a per-row plan: 🟢 *will add* · 🟡 *duplicate — will skip* · 🔴 *error*
   (with the reason). Duplicates are detected by lot identity — `SKU + bin location +
   production date + expiry date` — against both the existing data and earlier rows in the
   same file.
4. **Import** commits the "will add" rows in a single D1 transaction and reports a
   summary (added / skipped / errors).

Duplicate policy is **skip & report**: existing items are never overwritten, so the same
file can be re-run safely (idempotent). Per-row validation mirrors the Add-Item form
(SKU format, date format, `max ≥ min`, non-negative quantity). One upload is capped at
1000 rows. Image files are not part of the import — upload photos to items separately
(§6.5).

## 7. Operations

### 7.1 Build & deploy
```bash
npm run deploy
# = npm run build && npx wrangler pages deploy dist --project-name=inventory-dashboard
```
Static bundle → `dist/`; functions bundled alongside. Alternatively connect the repo to
Cloudflare Pages (Vite preset, build `npm run build`, output `dist`) for push-to-deploy.

### 7.2 Local development
`npm run dev` (Vite, functions unavailable) or `npx wrangler pages dev dist --d1=DB
--vars-file=.env` for the full stack locally.

### 7.3 Database migrations
Apply each file to remote D1 **in numeric order** (idempotent-ish; run once):
```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0005_units.sql
```
There is no auto-runner. Migrations: `0001` initial schema, `0002` auth tables, `0003`
app_settings, `0004` remove SKU uniqueness, `0005` units, `0006` per-SKU thresholds
(the `sku` table backing the By-SKU view's optional min/max levels).

### 7.4 Secrets management
`AUTH_SECRET`, `TIGRIS_ACCESS_KEY_ID`, `TIGRIS_SECRET_ACCESS_KEY` live in Cloudflare
(Pages secrets / dashboard). **Rotating `AUTH_SECRET` invalidates every active
session** (all existing JWTs and the rotation must be re-logged-in). Set non-secret
config (`TIGRIS_BUCKET`, `TIGRIS_ENDPOINT`, `FACILITY_ID`) in `wrangler.toml` `[vars]`.

### 7.5 Cost
All services run within Cloudflare / Tigris free tiers for light internal use —
~$0/month.

## 8. Security Policy

- **Headers (applied by `functions/_middleware.ts` on every response):**
  strict same-origin `Content-Security-Policy` (`default-src 'self'`;
  `img-src 'self' data: blob:` — images load only via the same-origin `/api/images/`
  proxy, `data:`/`blob:` for client-side compression), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (camera / microphone / geolocation disabled), and
  `Strict-Transport-Security` (1 year, includeSubDomains).
- **Secrets** — operational secrets (`AUTH_SECRET`, Tigris keys) are never committed,
  never in the docs, and never returned by the API. The exception is the **demo/first-run
  credential** (`admin` / `Admin@2024!`), which is deliberately documented (§5.5) so the
  project can be evaluated; it is *not* an operational secret and must be rotated for any
  real deployment.
- **Password** handling and **breach checking** per §5.2.
- **Least-privilege roles** per §5.4; destructive actions (delete item/category/unit,
  user & settings management) are admin-only.
- **In-use guards** prevent deleting a category or unit that items still reference.
- **Rate limiting** per §5.3 throttles login, inventory, and upload abuse.
- **Default credential:** a seeded `admin` account is shipped for demo/evaluation only
  (§5.5). It is public by design; treat it as invalid in production — rotate the password,
  set a strong `AUTH_SECRET`, and remove the account.
- **Cred-leak history:** the Tigris keys that appeared in an earlier document are revoked
  and must **not** reappear — if a real secret surfaces again, treat it as compromised and
  rotate immediately. The seeded `admin` demo credential is a separate, deliberate value
  (§5.5), not a leak.

---

# PART 2 — 中文 / CHINESE

## 1. 概述

库存仪表盘（Inventory Dashboard）是一款基于角色的 Web 应用，用于管理一个厂区内可消耗
库存（备件、润滑油、劳保用品等）的记录与跟踪。核心能力包括：

- 对库存条目进行搜索、筛选与分页浏览
- 新增 / 编辑条目：SKU、数量、阈值、类别、**计量单位**、货位、生产/到期日期、规格、照片
- 条目图片的存储
- 导出 CSV 或 XLSX
- **按 SKU** 视图：每个 SKU 的现有总量，批次按 **FEFO**（先到期先出）排序，并可选
  每个 SKU 的最小/最大库存阈值
- 以"需关注"为先的列表：四张统计卡片可一键过滤，列表采用可自定义的**排序**
  （SKU / 名称 / 数量 / FEFO / 最近变更），新加入的条目落到自己位置而不是跳到最上方，
  并短暂**高亮**一次以便定位
- 自助**修改本人密码**（各角色均可），并撤销旧会话
- 从 Excel / CSV **批量导入**：下载模板、预览逐行计划（新增 / 重复跳过 / 出错），再提交。重复项一律跳过、绝不覆盖
- 基于角色的用户管理（管理员 / 编辑 / 查看）
- 参考数据管理：**类别** 与 **单位**
- 应用级设置（目前为：公司名称）

整个技术栈运行在 Cloudflare 免费额度内，轻度的内部使用下持续成本约为 $0/月。

## 2. 系统架构

### 2.1 组成
| 层 | 技术 | 职责 |
|----|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS v3 | 单页应用（SPA） |
| 后端 | Cloudflare Pages Functions（TypeScript） | REST API |
| 关系数据 | Cloudflare **D1**（SQLite，UUID 主键） | 条目、用户、令牌、类别、单位、设置 |
| 对象存储 | **Tigris**（S3 兼容） | 条目照片 |
| 限流 | Cloudflare **KV**（`RATE_LIMIT`） | 库存与上传接口的按 IP 节流 |
| 密钥 | Cloudflare **Pages Secrets** | `AUTH_SECRET`、`Tigris 访问/密钥` |

```
浏览器（React SPA）
   │  （通过 httpOnly Cookie 鉴权）
   ▼
Cloudflare Pages Functions  ──►  D1（SQLite）   ──►  Tigris（图片）
   │                              KV RATE_LIMIT    （Cloudflare Secrets）
   ▼
HTML/JS/CSS 静态资源
```

### 2.2 关键设计决策
- **使用 D1，而非 Turso。** 当前系统采用 Cloudflare D1。（早期草稿描述的是
  Turso + 只读 + 无鉴权的方案，已作废。）
- **UUID 主键。** D1 表使用 UUID 主键（无 rowId / 自增）。ID 在服务端用
  `crypto.randomUUID()` 生成并写入 INSERT。ID 是字符串——切勿按整数解析。
- **单位按名称去规范化。** `consumable_item.unit` 存储单位的*名称*（TEXT），与
  `category` 相同的模式。这使条目行可读且免去连接查询；只要有条目引用，该单位即不可删除。
- **Tigris 无对象 ACL。** 图片不可被公开直接访问；通过同源代理 `GET /api/images/{key}`
  提供，使 SPA 的 CSP（仅允许 `img-src 'self' data: blob:`）能够加载它们。
- **无自动迁移。** 结构变更是 `migrations/` 下的 SQL 文件，需手动应用到远端 D1（见 §7.3）。

## 3. 数据模型（D1）

所有表均使用 TEXT 类型 UUID 主键。

### 3.1 `consumable_item`
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `facility_id` | TEXT | 厂区引用 |
| `sku` | TEXT | 物料编码（0004 中取消了唯一约束——条目可共用 SKU） |
| `name` | TEXT | 必填 |
| `description` | TEXT | 可选 |
| `category` | TEXT | 存类别**名称**（可空） |
| `unit` | TEXT | 存单位**名称**（可空；0005 新增） |
| `quantity` | INTEGER | 当前数量 |
| `min_threshold` / `max_threshold` | INTEGER | 库存阈值 |
| `bin_location` | TEXT | 货位，可选 |
| `production_date` / `expiry_date` | TEXT (日期) | 可选 |
| `image_url` | TEXT | 指向 `/api/images/{key}`（可空） |
| `creator_id` / `updater_id` | TEXT | 指向 `users.id` 的审计字段 |
| `created_at` / `updated_at` | TEXT | 时间戳 |
| `specification` | TEXT | 规格，可选 |

**库存状态为派生值（不入库）：**
- `缺货（Out of Stock）` → `quantity <= 0`
- `低库存（Low Stock）` → `0 < quantity < min_threshold`
- `充足（Adequate）` → `quantity >= min_threshold`

### 3.2 `users`
`id`（UUID 主键）、`username`（唯一）、`password_hash`（PBKDF2，见 §5.2）、`role`
（CHECK IN `'admin','editor','viewer'`）、`is_locked`（0/1）、`locked_until`、
`failed_attempts`、`created_at`。

### 3.3 `refresh_tokens`
`token`、`user_id`、`expires_at`（UTC）。登录时存入，每次 `/api/auth/refresh` 轮转，
退出时删除。

### 3.4 `login_attempts`
`ip`、`attempted_at`、`success`（0/1）。用于按 IP 的登录限流。

### 3.5 `categories`
`id`（UUID 主键）、`name`（唯一）、`color`、`created_at`。由建表脚本预置。只要有条目使用，
该类别即不可删除。

### 3.6 `units`（迁移 0005 新增）
`id`（UUID 主键）、`name`（唯一，经 `COLLATE NOCASE` 不区分大小写）、`created_at`、
`updated_at`。预置默认值：`pc, kg, L, drum, box, pallet`。只要有条目引用，该单位即不可删除。

### 3.7 `app_settings`
`key`（主键）/ `value` / `updated_at`。当前仅一行：`company_name`。

## 4. API 参考

所有响应均为 JSON。鉴权相关端点通过 `httpOnly` Cookie 读写。

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| `POST` | `/api/auth/login` | 公开 | 登录；写入 `auth_token` + `refresh_token` Cookie |
| `POST` | `/api/auth/refresh` | refresh Cookie | 轮转会话（刷新过期的访问令牌） |
| `POST` | `/api/auth/logout` | 需登录 | 吊销 refresh 令牌；清除两个 Cookie |
| `POST` | `/api/auth/change-password` | 需登录 | 修改**本人**密码（校验旧密码、HIBP + 强度；撤销 refresh 令牌） |
| `GET` | `/api/users/me` | 需登录 | 当前用户 |
| `GET` | `/api/users` | admin | 用户列表 |
| `POST` | `/api/users` | admin | 新建用户（HIBP + 强度校验） |
| `PUT` | `/api/users/:id` | admin | 修改角色 / 锁定 / 密码 |
| `DELETE` | `/api/users/:id` | admin | 删除用户 |
| `GET` | `/api/categories` | 公开 | 类别列表 |
| `POST` | `/api/categories` | editor+ | 新建类别 |
| `PUT` | `/api/categories/:id` | editor+ | 更新类别 |
| `DELETE` | `/api/categories/:id` | admin | 删除类别（使用中返回 409） |
| `GET` | `/api/units` | 公开 | 单位列表 |
| `POST` | `/api/units` | editor+ | 新建单位（名称，1–20 字符） |
| `PUT` | `/api/units/:id` | editor+ | 重命名单位 |
| `DELETE` | `/api/units/:id` | admin | 删除单位（使用中返回 409） |
| `GET` | `/api/inventory` | 需登录 | 条目列表（筛选 + 分页） |
| `POST` | `/api/inventory` | editor+ | 新建条目。**重复防护：** 若条目在六个批次字段（SKU + 名称 + 库位 + 规格 + 生产日期 + 有效期）上全部匹配，则返回 `409`；除非请求体设置 `allow_duplicate: true` |
| `GET` | `/api/inventory/duplicates` | 需登录 | 预检：列出在六个批次字段上匹配的条目（`?sku&name&bin_location&specification&production_date&expiry_date&exclude_id`）——为新增表单的实时重复警告提供支持 |
| `PUT` | `/api/inventory/:id` | editor+ | 更新条目 |
| `DELETE` | `/api/inventory/:id` | admin | 删除条目 |
| `GET` | `/api/sku` | 需登录 | 按 SKU 汇总（现有总量、FEFO 批次、阈值）——`?category&search&sort` |
| `PUT` | `/api/sku` | editor+ | 更新某 SKU 的可选最小/最大阈值（请求体 `{ sku, min_threshold?, max_threshold? }`） |
| `POST` | `/api/import` | editor+ | 批量导入——请求体 `{ rows: […], dry_run: 布尔 }`。试跑返回逐行计划；提交时在单个 D1 事务内插入。重复项（相同 SKU + 名称 + 库位 + 规格 + 生产日期 + 有效期）**跳过**，绝不覆盖（每批上限 1000 行） |
| `POST` | `/api/upload` | editor+ | 上传图片到 Tigris（返回对象 key） |
| `GET` | `/api/images/:key` | 公开 | 从 Tigris 代理返回图片 |
| `GET` | `/api/stats` | 需登录 | `{ total_items, low_stock_count, out_of_stock_count, expiring_soon_count, expired_count }` —「即将过期」= 30 天内到期且尚未过期；「已过期」= 已过期 |
| `GET` | `/api/settings` | 需登录 | 应用设置（`company_name`） |
| `PUT` | `/api/settings` | admin | 更新设置 |
| `GET` | `/api/export` | 需登录 | 按当前筛选导出 CSV 或 XLSX |

`expiring_soon_count` = **30 天内**到期的条目。XLSX 导出列：*物料编码 (SKU)、名称、
规格、货位、生产日期、到期日期、当前数量*——数量单元格按库存状态着色。

## 5. 认证与会话策略

### 5.1 令牌
- **访问令牌：** JWT，`HS256`，**8 小时**有效期。（`functions/lib/auth.ts` 文件头注释
  仍写"15 分钟"——该注释已过时；代码为 `ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000`。）
  通过 `auth_token` Cookie 下发。
- **刷新令牌：** 不透明令牌，**7 天**有效期，存于 D1 `refresh_tokens`，通过
  `refresh_token` Cookie 下发。**每次刷新都会轮转**（删除旧令牌并写入新令牌）。
- Cookie 属性：`HttpOnly; Secure; SameSite=Strict; Path=/`。

### 5.2 密码
- 使用 **PBKDF2-SHA256、100,000 次迭代、16 字节盐** 哈希，存储格式为
  `base64(salt):base64(hash)`。
- 策略：**8–128 字符，且至少包含一个字母和一个数字。**
- 新建/重置密码会先经过泄露库（**HIBP k-匿名**）校验，过于常见的密码会被拒绝。

### 5.3 限流
| 范围 | 限制 | 存储位置 |
|------|------|----------|
| 登录，按 IP | 5 次 / **15 分钟**滚动窗口 | D1 `login_attempts` |
| 登录，按账号 | 连续 5 次失败 → **15 分钟**账号锁定 | `users.failed_attempts` |
| 库存接口 | 30 次/分钟（按 IP） | KV `RATE_LIMIT` |
| 上传接口 | 10 次/分钟（按 IP） | KV `RATE_LIMIT` |

### 5.4 角色
`admin > editor > viewer`。

| 能力 | Admin | Editor | Viewer |
|------|:-----:|:------:|:------:|
| 查看条目、统计、导出、图片 | ✅ | ✅ | ✅ |
| 新增 / 编辑条目与图片 | ✅ | ✅ | ❌ |
| 删除条目 | ✅ | ❌ | ❌ |
| 管理类别与单位（新增/编辑） | ✅ | ✅ | ❌ |
| 删除类别 / 单位 | ✅ | ❌ | ❌ |
| 管理用户 | ✅ | ❌ | ❌ |
| 管理设置 | ✅ | ❌ | ❌ |

### 5.5 初始访问 / 默认管理员
- 应用内置一个 **`admin`** 账号作为首启 / 演示凭据，便于开箱即用地评估本项目：
  - 用户名：`admin`
  - 密码：`Admin@2024!`
- 这是**已知、公开**的凭据，仅供演示与评估，**不**用于生产环境。真实部署请：
  1. 以 `admin` 登录后立即通过**修改密码**（见 §6.9）改密，或在**用户**面板中重置；
  2. 设置强且唯一的 `AUTH_SECRET`（轮换会使所有会话失效——见 §7.4）；
  3. 删除该内置 `admin` 账号，改用自建的管理员账号。

## 6. 用户流程

### 6.1 加载应用
`src/main.tsx` 挂载 `Root`，启动时调用 `GET /api/users/me`：
- **200** → 渲染仪表盘（`App.tsx`）。
- **401 / 异常** → 渲染登录页（`src/pages/Login.tsx`）。

### 6.2 登录
输入用户名 + 密码 → `POST /api/auth/login`。成功后服务端写入两个 Cookie，应用重载
进入仪表盘。用户名或密码错误时统一返回 "Invalid username or password"（不泄露账号是否存在）。

### 6.3 仪表盘
页面顶部为四张**统计卡**（总数、低库存、缺货、即将到期）、**筛选**行、**导出**按钮
（按当前筛选导出 CSV / XLSX），以及带分页的**库存表格**（每页 10 / 25 / 50 / 100）。
数量列显示数值加单位（例如 `12 L`）。

- **视图切换**（`条目` / `按 SKU`）：*按 SKU* 把批次合并为每个 SKU 一行——现有总量、
  跨货位/批次的 **FEFO** 出库顺序，以及该 SKU 的可选最小/最大阈值（通过该行的
  *阈值* 按钮编辑，见 §6.4b）。
- **统计卡即过滤器**：点击*低库存 / 缺货 / 即将到期*会应用对应的服务端筛选并匹配一种
  合理排序（库存类按数量升序，到期类按 FEFO）；再次点击则清除。
- **筛选**行：搜索、类别、状态、视图，以及一个**排序**控件（SKU / 名称 / 数量 / FEFO /
  最近更新 / 最近新增）。默认排序为 **SKU**，使列表成为稳定的目录——新加入的条目落到
  自己的位置而不是跳到最上方，并**高亮**一次以便定位。

### 6.4 编辑 / 新增条目
**Add Item** / 铅笔按钮打开**编辑弹窗**：SKU（编辑时锁定）、名称、类别（受管列表）、
**单位**（受管列表，对不在列表中的旧值提供 `(legacy)` 选项）、数量与最小/最大阈值、货位、
生产/到期日期、规格、描述，以及图片预览（可点 🗑 移除）。

### 6.4b 按 SKU 阈值（按 SKU 视图）
在*按 SKU*视图中，每行的**阈值**按钮打开该 SKU 的可选**最小 / 最大**库存设置（存于
`sku` 表，而非条目行上）。留空即清除；`max` 必须 ≥ `min`。这些阈值面向快动生产物料；
未设阈值的 SKU 显示"—"，也不会有低/缺库存标记。

### 6.5 图片
编辑者可以**上传**（相机图标）、**查看**（点击缩略图 → 灯箱）、**移除**条目照片。
图片上传到 Tigris，并通过 `/api/images/{key}` 代理读取。

### 6.6 管理面板（位于页头，按角色显示）
- **用户**（admin）：新建 / 编辑 / 锁定 / 删除用户。
- **类别**（editor+）：新增 / 重命名 / 删除（删除仅 admin，且使用中受保护）。
- **单位**（editor+）：新增 / 重命名 / 删除（删除仅 admin，且使用中受保护）。
- **设置**（admin）：编辑 `company_name`。

### 6.7 退出
`POST /api/auth/logout` 吊销刷新令牌并清除两个 Cookie。

### 6.8 静默刷新
若某数据请求返回 **401**，应用先尝试 `POST /api/auth/refresh`（用 refresh Cookie）
并重试；只有它也失败时，才强制登出回到登录页。这让 7 天刷新窗口内的长会话保持有效。

### 6.9 修改本人密码
任何用户（管理员 / 编辑 / 查看）都可从账号菜单 → **修改密码** 更改**本人**密码。
服务端（`POST /api/auth/change-password`）：
1. 校验当前密码（定长 PBKDF2 比对）——这是唯一管理员把内置默认凭据"锁掉"的第一步。
2. 拒绝沿用旧密码，并执行 §5.2 的强度策略 + HIBP 泄露校验。
3. 重新哈希并存储新密码，随后**删除该用户的刷新令牌**，使旧凭据无法再开通会话；
   当前访问令牌在到期前仍有效，因此不会把用户当场登出。

### 6.10 批量导入（Excel / CSV）
编辑者与管理员可一次从电子表格载入大量条目，而无需逐条录入。在页头点击**导入**
（仅 editor 及以上），打开对话框：

1. **下载模板**（Excel `.xlsx` 或 `.csv`），含精确列与一行示例：`SKU* · 名称* ·
   规格 · 类别 · 单位 · 数量 · 最小/最大阈值 · 货位 · 生产/到期日期 · 描述`。
2. **上传**填好的文件。应用在**浏览器端**解析（SheetJS）并调用 `POST /api/import`
   试跑，此时尚未写入任何数据。
3. **预览**逐行计划：🟢 *将新增* · 🟡 *重复——将跳过* · 🔴 *出错*（含原因）。重复项按
   批次标识判定——`SKU + 货位 + 生产日期 + 到期日期`——同时对照库内已有数据与同一文件
   中靠前的行。
4. **导入**在单个 D1 事务内提交"将新增"的行，并给出汇总（新增 / 跳过 / 出错数）。

重复策略为**跳过并报告**：绝不覆盖已有条目，因此同一文件可安全重跑（幂等）。逐行校验
与新增条目表单一致（SKU 格式、日期格式、`max ≥ min`、数量非负）。单次导入上限 1000 行。
图片不属于导入范围——请通过 §6.5 为条目单独上传照片。

## 7. 运维

### 7.1 构建与部署
```bash
npm run deploy
# = npm run build && npx wrangler pages deploy dist --project-name=inventory-dashboard
```
静态资源 → `dist/`，函数一同打包。也可将仓库连接到 Cloudflare Pages（Vite 预设，
构建命令 `npm run build`，输出目录 `dist`）实现推送即部署。

### 7.2 本地开发
`npm run dev`（Vite，本地不可用函数），或 `npx wrangler pages dev dist --d1=DB
--vars-file=.env` 在本地跑完整栈。

### 7.3 数据库迁移
按**数字顺序**将每个文件应用到远端 D1（大致幂等；只跑一次）：
```bash
npx wrangler d1 execute inventory-dashboard --remote --file=migrations/0005_units.sql
```
没有自动运行器。迁移：`0001` 初始结构、`0002` 鉴权表、`0003` app_settings、
`0004` 取消 SKU 唯一、`0005` 单位、`0006` 按 SKU 阈值（`sku` 表，支撑"按 SKU"视图的
可选最小/最大库存）。

### 7.4 密钥管理
`AUTH_SECRET`、`TIGRIS_ACCESS_KEY_ID`、`TIGRIS_SECRET_ACCESS_KEY` 存放在 Cloudflare
（Pages Secrets / 控制台）。**轮换 `AUTH_SECRET` 会使所有活跃会话失效**（既有 JWT 全部作废，
用户需重新登录）。非密钥配置（`TIGRIS_BUCKET`、`TIGRIS_ENDPOINT`、`FACILITY_ID`）
放在 `wrangler.toml` `[vars]`。

### 7.5 成本
各服务均在 Cloudflare / Tigris 免费额度内，轻度内部使用下约 $0/月。

## 8. 安全策略

- **响应头（由 `functions/_middleware.ts` 对每个响应统一设置）：** 严格的同源
  `Content-Security-Policy`（`default-src 'self'`；`img-src 'self' data: blob:`——图片只
  经由同源的 `/api/images/` 代理、`data:`/`blob:` 客户端压缩图加载），`X-Frame-Options: DENY`，
  `X-Content-Type-Options: nosniff`，`Referrer-Policy: strict-origin-when-cross-origin`，
  `Permissions-Policy`（禁用摄像头 / 麦克风 / 地理位置），以及
  `Strict-Transport-Security`（1 年，includeSubDomains）。
- **密钥** —— 运行密钥（`AUTH_SECRET`、Tigris 密钥）从不提交、不写入文档、也不由 API 返回。
  唯一的例外是**演示 / 首启凭据**（`admin` / `Admin@2024!`），它是被刻意记录在文档中
  （§5.5）以便评估本项目的；它**不是**运行密钥，真实部署必须轮换。
- **密码** 处理与**泄露校验** 见 §5.2。
- **最小权限角色** 见 §5.4；破坏性操作（删除条目/类别/单位、用户与设置管理）仅 admin。
- **使用保护** 防止删除仍被条目引用的类别或单位。
- **限流** 见 §5.3，抑制登录、库存、上传的滥用。
- **默认凭据：** 内置 `admin` 账号仅用于演示 / 评估（§5.5）。它按设计是公开的；生产环境
  视为无效——请改密、设置强 `AUTH_SECRET`，并删除该账号。
- **密钥泄露历史：** 早前文档中出现过的 Tigris 密钥已被吊销，**不得**再次出现——若真实的
  运行密钥再次出现，一律视为已泄露并立即轮换。内置的 `admin` 演示凭据（§5.5）另当别论，
  是刻意公开的值，不属于泄露。
