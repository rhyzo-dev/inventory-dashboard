import React, { useState } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';

interface ExportButtonProps {
  filters: {
    search: string;
    category: string;
    status: string;
    view: string;
    page?: number;
    limit?: number;
  };
}

export const ExportButton: React.FC<ExportButtonProps> = ({ filters }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Build query string (same as used in API calls, but without pagination for export)
  const buildUrl = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    if (filters.view) params.append('view', filters.view);
    params.append('format', format);

    const queryString = params.toString();
    return queryString ? `/api/export?${queryString}` : `/api/export?format=${format}`;
  };

  const csvUrl = buildUrl('csv');
  const xlsxUrl = buildUrl('xlsx');

  return (
    <div className="relative">
      <div className="flex space-x-2">
        <a
          href={xlsxUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Excel
        </a>
        <a
          href={csvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium"
        >
          <FileText className="w-4 h-4" />
          CSV
        </a>
      </div>
    </div>
  );
};