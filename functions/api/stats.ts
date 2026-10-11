import { LibsqlDatabase } from '@libsql/client';

export default {
  async GET(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const turso = new LibsqlDatabase({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!
      });

      let whereSql = '1=1';
      const params: any[] = [];

      if (process.env.FACILITY_ID) {
        whereSql += ' AND facility_id = ?';
        params.push(process.env.FACILITY_ID);
      }

      // Total items
      const totalResult = await turso.execute(
        `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql}`,
        params
      );
      const total_items = Number(totalResult.rows[0][0]);

      // Low stock count
      const lowStockResult = await turso.execute(
        `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND quantity > 0 AND quantity < min_threshold`,
        params
      );
      const low_stock_count = Number(lowStockResult.rows[0][0]);

      // Out of stock count
      const outOfStockResult = await turso.execute(
        `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND quantity <= 0`,
        params
      );
      const out_of_stock_count = Number(outOfStockResult.rows[0][0]);

      // Expiring soon (within 30 days)
      const expiringResult = await turso.execute(
        `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days')`,
        params
      );
      const expiring_soon_count = Number(expiringResult.rows[0][0]);

      // Total value estimate (placeholder)
      const total_value_estimate = 0;

      return new Response(JSON.stringify({
        total_items,
        low_stock_count,
        out_of_stock_count,
        expiring_soon_count,
        total_value_estimate
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Stats API error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};