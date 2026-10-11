import ExcelJS from 'exceljs';

export default {
  async GET(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
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
        whereSql += ' AND (sku LIKE ? OR name LIKE ? OR bin_location LIKE ? OR category LIKE ? OR specification LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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
      const dataResult = await env.DB.prepare(
        `SELECT * FROM consumable_item WHERE ${whereSql} ORDER BY sku`
      ).bind(...params).all();

      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      // Transform rows
      const rows = dataResult.results.map((row: any) => ({
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
        updated_at: row.updated_at,
        specification: row.specification ?? null // NEW: specification column
      }));

      // Generate CSV
      if (format === 'csv') {
        const headers = [
          'SKU', 'Name', 'Specification', 'Category',
          'Quantity', 'Min Threshold', 'Max Threshold', 'Status',
          'Bin Location', 'Production Date', 'Expiry Date', 'Days to Expiry',
          'Image URL', 'Created At', 'Updated At'
        ];

        const csvRows = [headers.join(',')];

        rows.forEach((row: any) => {
          const quantity = row.quantity;
          const minThreshold = row.min_threshold;
          const statusLabel = quantity <= 0 ? 'Out of Stock' : quantity < minThreshold ? 'Low Stock' : 'Adequate';

          const productionDate = row.production_date ? new Date(row.production_date).toISOString().split('T')[0] : '';
          const expiryDate = row.expiry_date ? new Date(row.expiry_date).toISOString().split('T')[0] : '';
          const daysToExpiry = expiryDate
            ? Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 3600 * 24))
            : '';

          const rowData = [
            `"${row.sku}"`,
            `"${row.name}"`,
            `"${row.specification ?? ''}"`,
            `"${row.category ?? ''}"`,
            quantity,
            minThreshold,
            row.max_threshold,
            `"${statusLabel}"`,
            `"${row.bin_location ?? ''}"`,
            productionDate,
            expiryDate,
            daysToExpiry !== '' ? daysToExpiry.toString() : '',
            `"${row.image_url ?? ''}"`,
            row.created_at ? new Date(row.created_at).toISOString().replace('T', ' ').split('.')[0] : '',
            row.updated_at ? new Date(row.updated_at).toISOString().replace('T', ' ').split('.')[0] : ''
          ];

          csvRows.push(rowData.join(','));
        });

        const csvContent = csvRows.join('\r\n');
        const filename = `inventory_export_${dateStr}.csv`;

        return new Response(csvContent, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        });
      }

      // Generate Excel (.xlsx) using exceljs
      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Arctech TT Plant Inventory Dashboard';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Inventory Export');

        // Define columns per user requirements: Item Code, Item Name, Specification, Location, Manufacturing Date, Expiration Date, Current Quantity
        worksheet.columns = [
          { header: 'Item Code (SKU)', key: 'sku', width: 18 },
          { header: 'Item Name', key: 'name', width: 30 },
          { header: 'Specification', key: 'specification', width: 40 },
          { header: 'Location', key: 'bin_location', width: 20 },
          { header: 'Manufacturing Date', key: 'production_date', width: 18 },
          { header: 'Expiration Date', key: 'expiry_date', width: 18 },
          { header: 'Current Quantity', key: 'quantity', width: 16 }
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true, size: 11 };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }
        };
        worksheet.getRow(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Add data rows
        rows.forEach((row: any) => {
          const productionDate = row.production_date ? new Date(row.production_date).toISOString().split('T')[0] : '';
          const expiryDate = row.expiry_date ? new Date(row.expiry_date).toISOString().split('T')[0] : '';

          worksheet.addRow({
            sku: row.sku,
            name: row.name,
            specification: row.specification ?? '',
            bin_location: row.bin_location ?? '',
            production_date: productionDate,
            expiry_date: expiryDate,
            quantity: row.quantity
          });
        });

        // Style data rows - alternate colors + status-based formatting
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header

          row.alignment = { vertical: 'middle' };
          row.height = 20;

          // Alternate row colors
          if (rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }

          // Highlight low/out of stock in quantity column (column G = 7)
          const qty = row.getCell(7).value as number;
          const minThreshold = rows[rowNumber - 2]?.min_threshold ?? 0;
          if (qty <= 0) {
            row.getCell(7).font = { bold: true, color: { argb: 'FFDC2626' } };
            row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
          } else if (qty < minThreshold) {
            row.getCell(7).font = { bold: true, color: { argb: 'FFF59E0B' } };
            row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C7' } };
          }
        });

        // Auto-filter
        worksheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: 7 }
        };

        // Freeze header row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `inventory_export_${dateStr}.xlsx`;

        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        });
      }

      // Unknown format
      return new Response('Unsupported format. Use format=csv or format=xlsx', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    } catch (error) {
      console.error('Export API error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};