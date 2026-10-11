import React from 'react';

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
    page: number;
    limit: number;
  };
  onChange: (filters: any) => void;
  onReset: () => void;
}

// These would ideally come from an API or be constants; for now hardcoded based on typical inventory
const CATEGORY_OPTIONS: FilterOption[] = [
  { value: '', label: 'All Categories' },
  { value: 'Lubricants', label: 'Lubricants' },
  { value: 'Cleaning Supplies', label: 'Cleaning Supplies' },
  { value: 'Safety Equipment', label: 'Safety Equipment' },
  { value: 'Electrical', label: 'Electrical' },
  { value: 'Mechanical', label: 'Mechanical' },
  { value: 'Other', label: 'Other' }
];

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

export const Filters: React.FC<FiltersProps> = ({ filters, onChange, onReset }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    onChange(prev => ({ ...prev, [name]: newValue, page: 1 })); // reset to page 1 on filter change
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Filters</label>
        <div className="grid gap-4 sm:grid-cols-4">
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
              {CATEGORY_OPTIONS.map(opt => (
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