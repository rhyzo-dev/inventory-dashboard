# Inventory Dashboard (Cloudflare Pages + D1 + Tigris)

A role-based inventory dashboard built with React, TypeScript, and Vite, deployed to Cloudflare Pages. Data is stored in Cloudflare D1 (SQLite) and images in Tigris Data (S3-compatible).

## Features

- **Authentication**: JWT in httpOnly cookies, PBKDF2 password hashing, rate-limited login
- **Role-based access**: Admin (full), Editor (add/edit/delete), Viewer (read-only)
- **User management**: Create, edit, lock, and delete users (admin only)
- **Category management**: Create, edit, and delete product categories with colors
- **Inventory**: View items with photo thumbnails, search/filter, pagination
- **Export**: Download inventory as CSV or XLSX
- **Responsive design**: Works on desktop and mobile
- **Zero ongoing cost**: All services on free tiers

## Architecture

```
Browser → Cloudflare Pages (React SPA + Auth)
                    ↓
          Cloudflare Pages Functions (API)
                    ↓
   Cloudflare D1 (SQLite) for data + Tigris Data (S3) for images
```

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com) with D1 database
2. [Tigris Data account](https://tigrisdata.com) with bucket and API keys
3. Node.js >= 18

## Environment Variables

Create a `.env` file in the root (or set in Cloudflare dashboard):

```bash
# Cloudflare D1 (auto-configured via wrangler.toml bindings)
# No D1_URL needed — Pages Functions access it via the DB binding

# Tigris Data
TIGRIS_ACCESS_KEY_ID=tid_...
TIGRIS_SECRET_ACCESS_KEY=your_tigris_secret_key
TIGRIS_BUCKET=inventory-dashboard
TIGRIS_ENDPOINT=https://t3.storage.dev

# JWT signing secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
AUTH_SECRET=your-random-64-char-hex-string
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the Vite dev server (functions won't be available locally without `wrangler pages dev`):
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

3. Run the full stack locally:
   ```bash
   npx wrangler pages dev dist --d1=DB --vars-file=.env
   ```

4. (Optional) Seed sample data and auth tables:
   ```bash
   npx wrangler d1 execute inventory-dashboard --file=migrations/0002_auth_tables.sql
   ```

## Deployment to Cloudflare Pages

```bash
npm run deploy
```

This builds the frontend, bundles functions, and uploads to Cloudflare.

### Manual deployment steps

1. Push this repository to GitHub.
2. In Cloudflare Dashboard → **Pages** → **Connect to Git** → select your repository.
3. Set build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Add environment variables from the table above.
5. Deploy. Cloudflare will automatically rebuild on push.

## API Endpoints (Pages Functions)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/auth/login | none | Login (rate-limited: 5/min/IP) |
| POST | /api/auth/logout | required | Logout |
| GET | /api/users/me | required | Current user info |
| GET | /api/users | admin | List all users |
| POST | /api/users | admin | Create user (HIBP check) |
| PUT | /api/users/:id | admin | Update user |
| DELETE | /api/users/:id | admin | Delete user |
| GET | /api/categories | none | List all categories |
| POST | /api/categories | editor+ | Create category |
| PUT | /api/categories/:id | editor+ | Update category |
| DELETE | /api/categories/:id | admin | Delete category |
| GET | /api/inventory | required | List items (filtered, paginated) |
| POST | /api/inventory | editor+ | Create item |
| PUT | /api/inventory/:id | editor+ | Update item |
| DELETE | /api/inventory/:id | admin | Delete item |
| POST | /api/upload | editor+ | Upload image to Tigris |
| GET | /api/stats | required | Aggregate statistics |
| GET | /api/export | required | CSV/XLSX export |

## Project Structure

```
inventory-dashboard/
├── wrangler.toml          # Cloudflare Pages config + D1 binding + vars
├── package.json
├── tsconfig.json
├── postcss.config.cjs
├── tailwind.config.js
├── vite.config.ts
├── functions/             # Pages Functions (TypeScript)
│   ├── _middleware.ts     # Global middleware (auth headers, JWT parsing)
│   ├── lib/
│   │   └── auth.ts        # JWT, PBKDF2, HIBP utilities
│   ├── api/
│   │   ├── auth/          # Login / logout
│   │   ├── inventory/     # CRUD for items
│   │   ├── users/         # User management
│   │   ├── categories/    # Category management
│   │   ├── stats.ts
│   │   ├── export.ts
│   │   └── upload.ts
│   └── assets/
├── src/                   # React + Vite app
│   ├── main.tsx           # Auth check on mount → login or app
│   ├── App.tsx            # Main app with role-based UI
│   ├── context.tsx        # Auth + data context
│   ├── lib/api.ts         # API client (all endpoints)
│   ├── components/        # UI components
│   └── pages/Login.tsx    # Login page
├── migrations/
│   └── 0002_auth_tables.sql  # D1 schema (users, refresh_tokens, categories)
└── README.md
```

## Cost Estimate

| Service    | Free Tier                                  | Your Usage (Est.)    | Cost       |
|------------|--------------------------------------------|----------------------|------------|
| Cloudflare Pages | Unlimited sites, builds, bandwidth   | < 1 GB build/month   | $0         |
| Cloudflare D1    | 1 GB storage, 1M reads, 100K writes/day | < 50 MB, < 1K ops    | $0         |
| Tigris Data  | 5 GB storage, 10K Class A, 100K Class B/month | < 200 MB images, < 5K ops | $0    |
| **Total**  |                                            |                      | **$0/month** |

## Default Credentials

- **Username**: `admin`
- **Password**: `Admin@2024!`

Create additional users through the admin panel after logging in.

---

Deployed with ❤️ using Cloudflare Pages, D1, and Tigris Data.
