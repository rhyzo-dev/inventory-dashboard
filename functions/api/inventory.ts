import { LibsqlDatabase } from '@libsql/client';
import { S3Client } from '@aws-sdk/client-s3';

// Types matching our Turso schema
interface ConsumableItem {
  id: string;
  facility_id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  quantity: number;
  min_threshold: number;
  max_threshold: number;
  bin_location: string | null;
  production_date: string | null; // YYYY-MM-DD
  expiry_date: string | null; // YYYY-MM-DD
  image_url: string | null;
  creator_id: string;
  updater_id: string;
  created_at: string;
  updated_at: string;
}

// Initialize Turso client
const turso = new LibsqlDatabase({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
});

// Initialize Tigris S3 client
const s3 = new S3Client({
  endpoint: process.env.TIGRIS_ENDPOINT,
  region: 'auto', // Tigris handles region automatically
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!
  }
});

export default {
  async GET(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const search = url.searchParams.get('search') ?? '';
      const category = url.searchParams.get('category') ?? '';
      const status = url.searchParams.get('status') ?? ''; // adequate | low_stock | out_of_stock
      const view = url.searchParams.get('view') ?? ''; // low-stock | expiring
      const page = Math.max(parseInt(url.searchParams.get('page') ?? '1'), 1);
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25'), 100); // cap at 100

      // Build WHERE clause
      let whereSql = '1=1';
      const params: any[] = [];

      if (process.env.FACILITY_ID) {
        whereSql += ' AND facility_id = ?';
        params.push(process.env.FACILITY_ID);
      }

      if (search) {
        whereSql += ' AND (sku LIKE ? OR name LIKE ? OR bin_location LIKE ? OR category LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (category) {
        whereSql += ' AND category = ?';
        params.push(category);
      }

      if (view === 'low-stock') {
        whereSql += ' AND quantity < min_threshold';
      } else if (view === 'expiring') {
        whereSql += ' AND expiry_date IS NOT NULL AND expiry_date <= date(\'now\', \'+30 days\')';
      }

      if (status === 'low_stock') {
        whereSql += ' AND quantity > 0 AND quantity < min_threshold';
      } else if (status === 'out_of_stock') {
        whereSql += ' AND quantity <= 0';
      } else if (status === 'adequate') {
        whereSql += ' AND quantity >= min_threshold';
      }

      // Count total
      const countResult = await turso.execute(
        `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql}`,
        params
      );
      const total = Number(countResult.rows[0][0]);

      // Fetch paginated data
      const offset = (page - 1) * limit;
      const dataResult = await turso.execute(
        `SELECT * FROM consumable_item WHERE ${whereSql} ORDER BY sku LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      // Transform to frontend-friendly format
      const items = dataResult.rows.map((row: any) => ({
        id: row[0],
        facility_id: row[1],
        sku: row[2],
        name: row[3],
        description: row[4],
        category: row[5],
        quantity: Number(row[6]),
        min_threshold: Number(row[7]),
        max_threshold: Number(row[8]),
        bin_location: row[9],
        production_date: row[10],
        expiry_date: row[11],
        image_url: row[12],
        creator_id: row[13],
        updater_id: row[14],
        created_at: row[15],
        updated_at: row[16]
      }));

      // Calculate stats for summary cards
      const lowStock = items.filter(i => i.quantity > 0 && i.quantity < i.min_threshold).length;
      const outOfStock = items.filter(i => i.quantity <= 0).length;
      const expiringSoon = items.filter(i =>
        i.expiry_date &&
        new Date(i.expiry_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      ).length;

      const stats = {
        total_items: items.length,
        low_stock_count: lowStock,
        out_of_stock_count: outOfStock,
        expiring_soon_count: expiringSoon,
        total_value_estimate: 0 // placeholder - would need unit price field
      };

      return new Response(JSON.stringify({
        items,
        stats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Inventory API error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};