import React, { useState, useEffect, useRef } from 'react'
import { fetchAllData } from './context'
import { useApp } from './context'
import { removeImage } from './lib/api'
import InventoryTable, { type InventoryItem } from './components/InventoryTable'
import { StatsCards } from './components/StatsCards'
import { Filters } from './components/Filters'
import { ExportButton } from './components/ExportButton'
import { Loading } from './components/Loading'
import { EditModal } from './components/EditModal'
import { DeleteDialog } from './components/DeleteDialog'
import { ImageViewer } from './components/ImageViewer'
import { UploadModal } from './components/UploadModal'
import { UserManagement, CategoryManagement, UnitsManagement } from './components/AdminPanels'
import { SettingsModal } from './components/SettingsModal'
import {
  LogOut, Users, Tag, Ruler, ChevronDown, SlidersHorizontal,
} from 'lucide-react'

function AppContent() {
  const { user, categories, units, settings, doLogout, refreshCategories, refreshUnits, refreshSettings } = useApp();
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: '',
    view: '',
    page: 1,
    limit: 25,
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [viewImageItem, setViewImageItem] = useState<InventoryItem | null>(null);
  const [uploadItem, setUploadItem] = useState<InventoryItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Admin panels
  const [showUsers, setShowUsers] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isEditor = user?.role === 'editor' || user?.role === 'admin'
  const canManageUsers = isAdmin
  const canManageCategories = isEditor

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAllData(filters.search, filters.category, filters.status, filters.view, filters.page, filters.limit)
      setData(result)
    } catch (e: any) {
      if (e.message?.includes('401') || e.message?.includes('Authentication')) {
        // Access token may have lapsed — try to silently renew before forcing logout
        const { refreshAuth } = await import('./lib/api')
        const renewed = await refreshAuth()
        if (renewed) {
          setLoading(true)
          try {
            const result = await fetchAllData(filters.search, filters.category, filters.status, filters.view, filters.page, filters.limit)
            setData(result)
            setLoading(false)
            return
          } catch (retryErr: any) {
            setError(retryErr.message || 'Failed to load data')
            setLoading(false)
            return
          }
        }
        doLogout()
        return
      }
      setError(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filters])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleEdit = (item: InventoryItem) => {
    setEditItem(item); setIsEditOpen(true)
  }

  const handleAdd = () => {
    setEditItem(null); setIsEditOpen(true)
  }

  const handleEditSuccess = () => {
    showToast('Item saved successfully')
    fetchData()
  }

  const handleDelete = (item: InventoryItem) => {
    setDeleteItem(item); setIsDeleteOpen(true)
  }

  const handleDeleteSuccess = () => {
    showToast('Item deleted successfully')
    fetchData()
  }

  const handleViewImage = (item: InventoryItem) => {
    if (item.image_url) setViewImageItem(item)
  }

  const handleUploadImage = (item: InventoryItem) => {
    setUploadItem(item); setIsUploadOpen(true)
  }

  const handleRemoveImage = async (item: InventoryItem) => {
    try {
      await removeImage(item.id)
      showToast('Image removed')
      fetchData()
    } catch (e: any) {
      showToast(e.message || 'Failed to remove image', 'error')
    }
  }

  const handleImageUploaded = (_url: string) => {
    showToast('Image uploaded successfully')
    fetchData()
  }

  // Only render if authenticated (loading screen shown by Layout)
  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Inventory Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">{settings.company_name}</p>
            </div>

            {/* Role badge */}
            <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
              user.role === 'editor' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {user.role === 'admin' ? 'Admin' : user.role === 'editor' ? 'Editor' : 'Viewer'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {error && (
              <button onClick={fetchData} className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                Retry
              </button>
            )}

            {/* Admin/Editor action buttons */}
            {canManageUsers && (
              <button
                onClick={() => setShowUsers(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="User Management"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Users</span>
              </button>
            )}

            {canManageCategories && (
              <button
                onClick={() => setShowCategories(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Category Management"
              >
                <Tag className="w-4 h-4" />
                <span className="hidden sm:inline">Categories</span>
              </button>
            )}

            {canManageCategories && (
              <button
                onClick={() => setShowUnits(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Units Management"
              >
                <Ruler className="w-4 h-4" />
                <span className="hidden sm:inline">Units</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Site Settings"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}

            {/* User menu */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-700 hidden sm:block">{user.username}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user.username}</p>
                    <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); doLogout() }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        ) : data ? (
          <>
            <StatsCards stats={data.stats} />

            <div className="mt-6 space-y-4">
              <Filters
                filters={filters}
                onChange={(next) => setFilters(typeof next === 'function' ? next(filters) : next)}
                onReset={() => setFilters({ search: '', category: '', status: '', view: '', page: 1, limit: 25 })}
                categories={categories}
              />
              <ExportButton filters={filters} />
            </div>

            <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <InventoryTable
                items={data.items}
                pagination={data.pagination}
                onPageChange={(page) => setFilters(f => ({ ...f, page }))}
                onLimitChange={(limit) => setFilters(f => ({ ...f, limit, page: 1 }))}
                onEdit={isEditor ? handleEdit : undefined}
                onDelete={isAdmin ? handleDelete : undefined}
                onViewImage={handleViewImage}
                onUploadImage={isEditor ? handleUploadImage : undefined}
                onRemoveImage={isEditor ? handleRemoveImage : undefined}
                onAdd={isEditor ? handleAdd : undefined}
              />
            </div>
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500">
            <span>{settings.company_name}</span>
            <span className="mt-1 sm:mt-0">Developed by rhyzo</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        item={editItem || undefined}
        onSuccess={handleEditSuccess}
        onError={(msg) => showToast(msg, 'error')}
        categories={categories}
        units={units}
      />

      <DeleteDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        item={deleteItem}
        onDeleted={handleDeleteSuccess}
        onError={(msg) => showToast(msg, 'error')}
      />

      {viewImageItem?.image_url && (
        <ImageViewer
          imageUrl={viewImageItem.image_url}
          itemName={viewImageItem.name}
          onClose={() => setViewImageItem(null)}
        />
      )}

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        itemId={uploadItem?.id}
        onUploaded={handleImageUploaded}
        onError={(msg) => showToast(msg, 'error')}
      />

      {canManageUsers && (
        <UserManagement
          isOpen={showUsers}
          onClose={() => setShowUsers(false)}
          currentUser={user}
          onRefresh={fetchData}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {canManageCategories && (
        <CategoryManagement
          isOpen={showCategories}
          onClose={() => setShowCategories(false)}
          onCategoryChange={refreshCategories}
          onError={(msg) => showToast(msg, 'error')}
          allowedRoles={['admin', 'editor']}
        />
      )}

      {canManageCategories && (
        <UnitsManagement
          isOpen={showUnits}
          onClose={() => setShowUnits(false)}
          onUnitChange={refreshUnits}
          onError={(msg) => showToast(msg, 'error')}
          allowedRoles={['admin', 'editor']}
        />
      )}

      {isAdmin && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSaved={() => { showToast('Settings saved'); refreshSettings() }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  )
}

export default AppContent
