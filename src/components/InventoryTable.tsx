import React from 'react';
import { Package, AlertTriangle, AlertCircle, Calendar, Image, Trash2, Edit3, ExternalLink } from 'lucide-react';

interface InventoryItem {
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

interface InventoryTableProps {
  items: InventoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const getStatus = (quantity: number, minThreshold: number): { label: string; color: 'green' | 'yellow' | 'red' } => {
  if (quantity <= 0) return { label: 'Out of Stock', color: 'red' };
  if (quantity < minThreshold) return { label: 'Low Stock', color: 'yellow' };
  return { label: 'Adequate', color: 'green' };
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString();
};

const InventoryTable: React.FC<InventoryTableProps> = ({ items, pagination, onPageChange, onLimitChange }) => {
  const handlePageChange = (page: number) => {
    onPageChange(page);
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onLimitChange(parseInt(e.target.value));
  };

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        No items found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bin</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item) => {
            const status = getStatus(item.quantity, item.min_threshold);
            const daysToExpiry = item.expiry_date
              ? Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24))
              : null;

            return (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sku}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.category || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color === 'green' ? 'bg-green-100 text-green-800' : status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.bin_location || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.expiry_date ? (
                    <>
                      {formatDate(item.expiry_date)} <br />
                      <span className={daysToExpiry !== null && daysToExpiry < 0 ? 'text-red-600 text-xs' : daysToExpiry !== null && daysToExpiry <= 7 ? 'text-yellow-600 text-xs' : 'text-green-600 text-xs'}>
                        {daysToExpiry !== null ? (daysToExpiry > 0 ? `+${daysToExpiry}d` : `${daysToExpiry}d`) : ''}
                      </span>
                    </>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {item.image_url ? (
                    <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                      View
                    </a>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(item.updated_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => console.log('Edit item:', item.id)}
                      className="text-sm text-blue-600 hover:text-blue-900"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => console.log('Delete item:', item.id)}
                      className="text-sm text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="py-4 px-4 sm:px-6 flex items-center justify-between text-sm text-gray-500">
        <div>
          Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
            disabled={pagination.page === 1}
            className={`px-3 py-1 rounded border-gray-300 bg-white hover:bg-gray-50 ${pagination.page === 1 ? 'opacity-50' : ''}`}
          >
            Previous
          </button>
          <select
            value={pagination.limit}
            onChange={handleLimitChange}
            className="border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button
            onClick={() => onPageChange(Math.min(pagination.pages, pagination.page + 1))}
            disabled={pagination.page === pagination.pages}
            className={`px-3 py-1 rounded border-gray-300 bg-white hover:bg-gray-50 ${pagination.page === pagination.pages ? 'opacity-50' : ''}`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryTable;