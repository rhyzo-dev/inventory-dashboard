# Inventory Dashboard (Cloudflare Pages + Turso + Tigris)

A read-only inventory dashboard built with React, TypeScript, Vite, and deployed to Cloudflare Pages. Data is stored in Turso (libSQL) and images in Tigris Data (S3-compatible).

## Features

- View inventory with photos
- Search and filter by SKU, name, category, status, and view
- Export to CSV (Excel export placeholder)
- Responsive design
- Zero ongoing cost (uses free tiers)

## Architecture

```
Browser → Cloudflare Pages (React SPA)
                    ↓
          Cloudflare Pages Functions (API)
                    ↓
   Turso (libSQL) for data + Tigris Data (S3) for images
```

## Prerequisites

1. [Turso account](https://turso.tech) with a database and auth token
2. [Tigris Data account](https://tigrisdata.com) with bucket and API keys
3. [Cloudflare account](https://dash.cloudflare.com) (for Pages)
4. [GitHub account](https://github.com) (for CI/CD)
5. Node.js >= 18

## Environment Variables

Create a `.env` file in the root (or set in Cloudflare dashboard):

```bash
# Turso
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
FACILITY_ID= # optional, leave empty for all facilities

# Tigris Data
TIGRIS_ACCESS_KEY_ID=tid_...
TIGRIS_SECRET_ACCESS_KEY=your_tigris_secret_key
TIGRIS_BUCKET=inventory-dashboard
TIGRIS_ENDPOINT=https://t3.storage.dev
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

3. (Optional) Seed sample data:
   ```bash
   npm run seed
   ```

## Deployment to Cloudflare Pages

1. Push this repository to GitHub.

2. In Cloudflare Dashboard:
   - Go to **Pages** → **Create a project** → **Connect to Git**
   - Select your repository
   - Set:
     - **Framework:** None (or Vite)
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
   - Under **Settings** → **Environment Variables**, add the variables from `.env`
   - Save and deploy

3. Cloudflare will automatically build and deploy on push.

## API Endpoints (Pages Functions)

- `GET /api/inventory` – Paginated list with filters
- `GET /api/stats` – Dashboard statistics
- `GET /api/export?format=csv` – CSV export (Excel placeholder)

## Project Structure

```
inventory-dashboard/
├── wrangler.toml          # Cloudflare Pages config with bindings
├── package.json
├── tsconfig.json
├── vite.config.ts
├── frontend/              # React + Vite app
│   ├── src/
│   │   ├── components/    # InventoryTable, StatsCards, etc.
│   │   ├── lib/           # API client
│   │   └── App.tsx
├── functions/             # Pages Functions (API)
│   ├── api/
│   │   ├── inventory.ts
│   │   ├── stats.ts
│   │   └── export.ts
├── scripts/               # Utility scripts
│   └── seed-turso.ts      # Seed sample data
└── README.md
```

## Cost Estimate

| Service    | Free Tier                          | Your Usage (Est.)     | Cost       |
|------------|------------------------------------|-----------------------|------------|
| Cloudflare Pages | Unlimited sites, builds, bandwidth | < 1GB build/month     | $0         |
| Turso      | 5 GB storage, 10K writes, 100K reads/month | < 100 MB, < 1K ops | $0         |
| Tigris Data | 5 GB storage, 10K Class A, 100K Class B/month, free egress | < 200 MB images, < 5K ops | $0         |
| **Total**  |                                    |                       | **$0/month** |

## Notes

- The Excel export is currently a placeholder returning a 501 error. To implement, bundle a library like `exceljs` in the function (increases size).
- Images are served directly from Tigris URLs (cached at Cloudflare edge).
- For production, consider adding auth (Cloudflare Access or a simple shared secret middleware).

---

Deployed with ❤️ using Cloudflare Pages, Turso, and Tigris Data.