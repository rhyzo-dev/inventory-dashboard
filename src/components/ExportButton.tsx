import React from 'react';
import { Download } from 'lucide-react';

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
  // Build query string (same as used in API calls, but without pagination for export)
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.category) params.append('category', filters.category);
  if (filters.status) params.append('status', filters.status);
  if (filters.view) params.append('view', filters.view);
  // Note: we deliberately do NOT include page/limit for export; the API ignores them for export endpoint

  const queryString = params.toString();
  const url = queryString ? `/api/export?${queryString}` : '/api/export';

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium">
      <Download className="w-4 h-4" />
      Export Excel
    </a>
  );
};