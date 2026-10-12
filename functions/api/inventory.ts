// Types matching our Turso schema
type ConsumableItem = Record<string, any>;

export const onRequestGet: PagesFunction = async (context) => {
  try {
    const url = new URL(context.request.url);
    const search = url.searchParams.get('search') ?? '';
    const category = url.searchParams.get('category') ?? '';
    const status = url.searchParams.get('status') ?? ''; // adequate | low_stock | out_of_stock
    const view = url.searchParams.get('view') ?? ''; // low-stock | expiring
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1'), 1);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25'), 100); // cap at 100

    // Build WHERE clause
    let whereSql = '1=1';
    const params: any[] = [];

    if (context.env.FACILITY_ID) {
      whereSql += ' AND facility_id = ?';
      params.push(context.env.FACILITY_ID);
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
    const countResult = await context.env.DB.prepare(
      `SELECT COUNT(*) FROM consumable_item WHERE ${whereSql}`
    ).bind(...params).all();
    const total = Number(countResult.results[0]['COUNT(*)']);

    // Fetch paginated data
    const offset = (page - 1) * limit;
    const dataResult = await context.env.DB.prepare(
      `SELECT * FROM consumable_item WHERE ${whereSql} ORDER BY sku LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    // Transform to frontend-friendly format
    const items = dataResult.results.map((row: ConsumableItem) => ({
      id: row.id,
      facility_id: row.facility_id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      quantity: Number(row.quantity),
      min_threshold: Number(row.min_threshold),
      max_threshold: Number(row.max_threshold),
      bin_location: row.bin_location,
      production_date: row.production_date,
      expiry_date: row.expiry_date,
      image_url: row.image_url,
      creator_id: row.creator_id,
      updater_id: row.updater_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    // Calculate stats for summary cards
    const lowStock = items.filter((i: ConsumableItem) => i.quantity > 0 && i.quantity < i.min_threshold).length;
    const outOfStock = items.filter((i: ConsumableItem) => i.quantity <= 0).length;
    const expiringSoon = items.filter((i: ConsumableItem) =>
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
};
