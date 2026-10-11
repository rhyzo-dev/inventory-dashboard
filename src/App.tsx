import React, { useEffect, useState } from 'react';
import InventoryTable from './components/InventoryTable';
import { StatsCards } from './components/StatsCards';
import { Filters } from './components/Filters';
import { ExportButton } from './components/ExportButton';
import { Loading } from './components/Loading';

function App() {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: '',
    view: '',
    page: 1,
    limit: 25
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, [filters]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('search', filters.search);
      params.append('category', filters.category);
      params.append('status', filters.status);
      params.append('view', filters.view);
      params.append('page', String(filters.page));
      params.append('limit', String(filters.limit));

      const res = await fetch(`/api/inventory?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Inventory Dashboard</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {!loading && data ? (
          <>
            <StatsCards stats={data.stats} />
            <div className="mt-6">
              <Filters
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters({
                  search: '',
                  category: '',
                  status: '',
                  view: '',
                  page: 1,
                  limit: 25
                })}
              />
              <ExportButton filters={filters} />
            </div>
            <div className="mt-6">
              <InventoryTable
                items={data.items}
                pagination={data.pagination}
                onPageChange={(page) => setFilters(f => ({ ...f, page }))}
                onLimitChange={(limit) => setFilters(f => ({ ...f, limit, page: 1 }))}
              />
            </div>
          </>
        ) : (
          <Loading />
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500">
            <span>Arctech TT Plant</span>
            <span className="mt-2 sm:mt-0">Developed by rhyzo</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;