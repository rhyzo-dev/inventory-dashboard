import { LibsqlDatabase } from '@libsql/client';

export default {
  async GET(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const turso = new LibsqlDatabase({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!
      });

      const url = new URL(request.url);
      const search = url.searchParams.get('search') ?? '';
      const category = url.searchParams.get('category') ?? '';
      const status = url.searchParams.get('status') ?? '';
      const view = url.searchParams.get('view') ?? '';
      const format = url.searchParams.get('format') ?? 'csv'; // csv or xlsx

      // Build WHERE clause (same as inventory API)
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

      // Fetch all matching items (no pagination for export)
      const dataResult = await turso.execute(
        `SELECT * FROM consumable_item WHERE ${whereSql} ORDER BY sku`,
        params
      );

      // Generate CSV
      if (format === 'csv') {
        const headers = [
          'SKU', 'Name', 'Description', 'Category',
          'Quantity', 'Min Threshold', 'Max Threshold', 'Status',
          'Bin Location', 'Production Date', 'Expiry Date', 'Days to Expiry',
          'Image URL', 'Created At', 'Updated At'
        ];

        const csvRows = [headers.join(',')];

        const today = new Date();
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(today.getDate() + 30);

        dataResult.rows.forEach((row: any) => {
          const quantity = Number(row[6]);
          const minThreshold = Number(row[7]);
          const statusLabel = quantity <= 0 ? 'Out of Stock' : quantity < minThreshold ? 'Low Stock' : 'Adequate';

          const productionDate = row[10] ? new Date(row[10]).toISOString().split('T')[0] : '';
          const expiryDate = row[11] ? new Date(row[11]).toISOString().split('T')[0] : '';
          const daysToExpiry = expiryDate
            ? Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 3600 * 24))
            : '';

          const rowData = [
            `"${row[2]}"`, // SKU
            `"${row[3]}"`, // Name
            `"${row[4] ?? ''}"`, // Description
            `"${row[5] ?? ''}"`, // Category
            quantity, // Quantity
            minThreshold, // Min Threshold
            Number(row[8]), // Max Threshold
            `"${statusLabel}"`, // Status
            `"${row[9] ?? ''}"`, // Bin Location
            productionDate, // Production Date
            expiryDate, // Expiry Date
            daysToExpiry !== '' ? daysToExpiry.toString() : '', // Days to Expiry
            `"${row[12] ?? ''}"`, // Image URL
            row[15] ? new Date(row[15]).toISOString().replace('T', ' ').split('.')[0] : '', // Created At
            row[16] ? new Date(row[16]).toISOString().replace('T', ' ').split('.')[0] : '' // Updated At
          ];

          csvRows.push(rowData.join(','));
        });

        const csvContent = csvRows.join('\r\n');
        const filename = `inventory_export_${today.toISOString().split('T')[0]}.csv`;

        return new Response(csvContent, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        });
      }
      // For Excel export, we could use a library like exceljs, but for simplicity
      // we'll return CSV with .xlsx extension or note that Excel generation
      // would require bundling a library (increasing function size)
      else {
        // Fallback to CSV for now - in a production app you'd bundle exceljs or similar
        return new Response('Excel export not implemented in this lightweight version. Use CSV instead.', {
          status: 501,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    } catch (error) {
      console.error('Export API error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};