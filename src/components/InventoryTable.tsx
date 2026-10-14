import React, { useState } from 'react';
import { Package, AlertTriangle, AlertCircle, Calendar, Image, Trash2, Edit3, Plus, Camera } from 'lucide-react';

export interface InventoryItem {
  id: string;
  facility_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  quantity: number;
  min_threshold: number;
  max_threshold: number;
  bin_location: string | null;
  production_date: string | null;
  expiry_date: string | null;
  image_url: string | null;
  creator_id: string | null;
  updater_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  specification: string | null;
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
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onViewImage: (item: InventoryItem) => void;
  onUploadImage: (item: InventoryItem) => void;
  onRemoveImage: (item: InventoryItem) => void;
  onAdd: () => void;
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

const InventoryTable: React.FC<InventoryTableProps> = ({
  items,
  pagination,
  onPageChange,
  onLimitChange,
  onEdit,
  onDelete,
  onViewImage,
  onUploadImage,
  onRemoveImage,
  onAdd,
}) => {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-lg font-medium">No items found</p>
        <p className="text-sm mt-1">Click "Add Item" to create your first item.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Add item bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
        </p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mfg</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Image</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item) => {
            const status = getStatus(item.quantity, item.min_threshold);
            const daysToExpiry = item.expiry_date
              ? Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24))
              : null;
            const isHovered = hoveredItemId === item.id;

            return (
              <tr
                key={item.id}
                className="hover:bg-gray-50 transition-colors"
                onMouseEnter={() => setHoveredItemId(item.id)}
                onMouseLeave={() => setHoveredItemId(null)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono text-sm text-gray-900">{item.sku}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  {item.specification && (
                    <div className="text-xs text-gray-400 truncate max-w-[180px]" title={item.specification}>
                      {item.specification}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {item.category || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {item.bin_location || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                  {item.quantity}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    status.color === 'green' ? 'bg-green-100 text-green-800'
                    : status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {item.production_date ? formatDate(item.production_date) : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {item.expiry_date ? (
                    <div>
                      <div>{formatDate(item.expiry_date)}</div>
                      {daysToExpiry !== null && (
                        <span className={`text-xs ${
                          daysToExpiry < 0 ? 'text-red-500'
                          : daysToExpiry <= 7 ? 'text-yellow-600'
                          : 'text-green-600'
                        }`}>
                          {daysToExpiry > 0 ? `+${daysToExpiry}d` : `${daysToExpiry}d`}
                        </span>
                      )}
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.image_url ? (
                    <div className="relative group/image">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-10 h-10 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onViewImage(item)}
                        title="Click to view full size"
                      />
                      {/* Remove button — visible on hover */}
                      {isHovered && onRemoveImage && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveImage(item); }}
                          className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover/image:opacity-100 transition-opacity shadow-sm"
                          title="Remove image"
                        >
                          <span className="text-xs leading-none">✕</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-10 rounded bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center">
                        <Image className="w-4 h-4 text-gray-300" />
                      </div>
                      <span className="text-xs text-gray-400">No photo</span>
                      {onUploadImage && isHovered && (
                        <button
                          onClick={() => onUploadImage(item)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="Upload image"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit item"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete item"
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

      {/* Pagination */}
      <div className="py-4 px-4 flex items-center justify-between text-sm text-gray-500 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span>Per page:</span>
          <select
            value={pagination.limit}
            onChange={(e) => onLimitChange(parseInt(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
            disabled={pagination.page === 1}
            className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="px-2">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(pagination.pages, pagination.page + 1))}
            disabled={pagination.page === pagination.pages}
            className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryTable;
