// Helper: treat string "null" as actual null
const clean = (val: any) => val === 'null' ? null : val;

export const onRequestGet: PagesFunction = async (context) => {
  try {
    let whereSql = '1=1';
    const params: any[] = [];

    if (context.env.FACILITY_ID) {
      whereSql += ' AND facility_id = ?';
      params.push(context.env.FACILITY_ID);
    }

    // Total items
    const totalResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql}`
    ).bind(...params).all();
    const total_items = Number(totalResult.results[0]['COUNT(*)']);

    // Low stock count
    const lowStockResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND quantity > 0 AND quantity < min_threshold`
    ).bind(...params).all();
    const low_stock_count = Number(lowStockResult.results[0]['COUNT(*)']);

    // Out of stock count
    const outOfStockResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND quantity <= 0`
    ).bind(...params).all();
    const out_of_stock_count = Number(outOfStockResult.results[0]['COUNT(*)']);

    // Expiring soon: coming due within 30 days but NOT yet expired
    // (expiry_date >= today AND <= today + 30 days). Expired items are
    // counted separately below — previously both fell under "expiring soon".
    const expiringResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND expiry_date IS NOT NULL AND expiry_date != ''
       AND expiry_date >= date('now') AND expiry_date <= date('now', '+30 days')`
    ).bind(...params).all();
    const expiring_soon_count = Number(expiringResult.results[0]['COUNT(*)']);

    // Expired: past their expiry date (expiry_date < today).
    const expiredResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql} AND expiry_date IS NOT NULL AND expiry_date != ''
       AND expiry_date < date('now')`
    ).bind(...params).all();
    const expired_count = Number(expiredResult.results[0]['COUNT(*)']);

    return new Response(JSON.stringify({
      total_items,
      low_stock_count,
      out_of_stock_count,
      expiring_soon_count,
      expired_count,
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
};
