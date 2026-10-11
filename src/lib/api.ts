export interface InventoryItem {
  id: string;
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
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface InventoryResponse {
  items: InventoryItem[];
  stats: {
    total_items: number;
    low_stock_count: number;
    out_of_stock_count: number;
    expiring_soon_count: number;
    total_value_estimate: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const fetchInventory = async (
  search: string = '',
  category: string = '',
  status: string = '',
  view: string = '',
  page: number = 1,
  limit: number = 25
): Promise<InventoryResponse> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (status) params.append('status', status);
  if (view) params.append('view', view);
  params.append('page', String(page));
  params.append('limit', String(limit));

  const res = await fetch(`/api/inventory?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch inventory: ${res.status}`);
  }
  return res.json();
};

export const fetchStats = async (): Promise<{
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expiring_soon_count: number;
  total_value_estimate: number;
}> => {
  const res = await fetch('/api/stats');
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: ${res.status}`);
  }
  return res.json();
};

export const exportInventory = async (
  search: string = '',
  category: string = '',
  status: string = '',
  view: string = '',
  format: 'csv' | 'xlsx' = 'xlsx'
): Promise<Blob> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (status) params.append('status', status);
  if (view) params.append('view', view);
  params.append('format', format);

  const res = await fetch(`/api/export?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to export inventory: ${res.status}`);
  }
  return res.blob();
};