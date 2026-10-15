import React from 'react';
import type { Category } from '../lib/api';

interface FilterOption {
  value: string;
  label: string;
}

interface FiltersProps {
  filters: {
    search: string;
    category: string;
    status: string;
    view: string;
    sort: string;
    page: number;
    limit: number;
  };
  onChange: (filters: any) => void;
  onReset: () => void;
  categories: Category[];
}

// Status / view / sort are fixed server-side options. Category is driven by the
// live list (whatever the user has created in the Categories panel).

const STATUS_OPTIONS: FilterOption[] = [
  { value: '', label: 'All Status' },
  { value: 'adequate', label: 'Adequate' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' }
];

const VIEW_OPTIONS: FilterOption[] = [
  { value: '', label: 'All Items' },
  { value: 'low-stock', label: 'Low Stock Only' },
  { value: 'expiring', label: 'Expiring Soon' }
];

// Server-side order. Default is SKU so the list is a stable catalog, not a feed.
const SORT_OPTIONS: FilterOption[] = [
  { value: 'sku', label: 'SKU (A–Z)' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'qty-asc', label: 'Quantity · low first' },
  { value: 'qty-desc', label: 'Quantity · high first' },
  { value: 'expiry', label: 'Expiry · FEFO' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'created', label: 'Recently added' }
];

export const Filters: React.FC<FiltersProps> = ({ filters, onChange, onReset, categories }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    onChange(prev => ({ ...prev, [name]: newValue, page: 1 })); // reset to page 1 on filter change
  };

  // "All Categories" + every category the user has created, keyed by name (the
  // value the server's `category = ?` filter and the item rows use).
  const categoryOptions: FilterOption[] = [
    { value: '', label: 'All Categories' },
    ...categories.map((c) => ({ value: c.name, label: c.name })),
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filters</label>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              name="search"
              value={filters.search}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="SKU, name, bin, category..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              name="category"
              value={filters.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categoryOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* View */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View</label>
            <select
              name="view"
              value={filters.view}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {VIEW_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort by</label>
            <select
              name="sort"
              value={filters.sort}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Reset
        </button>
      </div>
    </div>
  );
};