import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, X, Check, Shield, UserPlus, Users, Tag, Ruler } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id: string
  username: string
  role: 'admin' | 'editor' | 'viewer'
  is_locked: number
  failed_attempts: number
  locked_until: string | null
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  name: string
  color: string
  description: string | null
  created_at: string
}

interface Unit {
  id: string
  name: string
  created_at: string
}

interface UserModalProps {
  isOpen: boolean
  onClose: () => void
  user?: User | null
  onSuccess: () => void
  onError: (msg: string) => void
  currentUserId: string
  currentUserRole: string
}

interface CategoryModalProps {
  isOpen: boolean
  onClose: () => void
  category?: Category | null
  onSuccess: () => void
  onError: (msg: string) => void
}

interface UnitModalProps {
  isOpen: boolean
  onClose: () => void
  unit?: Unit | null
  onSuccess: () => void
  onError: (msg: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  editor: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

// ── UserModal ──────────────────────────────────────────────────────────────────

export function UserModal({ isOpen, onClose, user, onSuccess, onError, currentUserId, currentUserRole }: UserModalProps) {
  const isEdit = !!user
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', role: 'editor' as User['role'], is_locked: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (user) {
      setForm({ username: user.username, password: '', confirmPassword: '', role: user.role, is_locked: user.is_locked === 1 })
    } else {
      setForm({ username: '', password: '', confirmPassword: '', role: 'editor', is_locked: false })
    }
    setErrors({})
  }, [user, isOpen])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.username.trim()) errs.username = 'Username is required'
    else if (form.username.trim().length < 3) errs.username = 'Minimum 3 characters'
    else if (form.username.trim().length > 50) errs.username = 'Maximum 50 characters'

    if (!isEdit) {
      if (!form.password) errs.password = 'Password is required'
      else if (form.password.length < 8) errs.password = 'Minimum 8 characters'
      else if (!/[a-zA-Z]/.test(form.password)) errs.password = 'Must contain a letter'
      else if (!/\d/.test(form.password)) errs.password = 'Must contain a number'
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const body: any = { username: form.username.trim(), role: form.role }
      if (!isEdit) {
        body.password = form.password
      }
      if (form.is_locked !== undefined) {
        body.is_locked = form.is_locked ? 1 : 0
      }

      const url = isEdit ? `/api/users/${user!.id}` : '/api/users'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onSuccess()
      onClose()
    } catch (err: any) {
      onError(err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input
              value={form.username}
              onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.username ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="johndoe"
              disabled={isEdit}
            />
            {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Min 8 chars, letter + number"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <X className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="Re-enter password"
                />
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>}
              </div>
            </>
          )}

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          )}

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lockUser"
                checked={form.is_locked}
                onChange={(e) => setForm(f => ({ ...f, is_locked: e.target.checked }))}
                className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <label htmlFor="lockUser" className="text-sm text-gray-700">Lock account (prevent login)</label>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CategoryModal ──────────────────────────────────────────────────────────────

const PRESET_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280']

export function CategoryModal({ isOpen, onClose, category, onSuccess, onError }: CategoryModalProps) {
  const isEdit = !!category
  const [form, setForm] = useState({ name: '', color: '#6b7280', description: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (category) {
      setForm({ name: category.name, color: category.color, description: category.description || '' })
    } else {
      setForm({ name: '', color: '#3b82f6', description: '' })
    }
    setErrors({})
  }, [category, isOpen])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    else if (form.name.trim().length > 50) errs.name = 'Maximum 50 characters'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const url = isEdit ? `/api/categories/${category!.id}` : '/api/categories'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onSuccess()
      onClose()
    } catch (err: any) {
      onError(err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g. Lubricants"
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded cursor-pointer border-0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional description..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── UserManagement ─────────────────────────────────────────────────────────────

interface UserManagementProps {
  isOpen: boolean
  onClose: () => void
  currentUser: { id: string; role: string } | null
  onRefresh: () => void
  onError: (msg: string) => void
}

export function UserManagement({ isOpen, onClose, currentUser, onRefresh, onError }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  const isAdmin = currentUser?.role === 'admin'
  const canManage = isAdmin

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users', { credentials: 'include' })
      if (!res.ok) { if (res.status === 401) window.location.href = '/login' ; return }
      const data = await res.json()
      setUsers(data.users || [])
    } catch { onError('Failed to load users') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (isOpen) loadUsers()
  }, [isOpen])

  const handleDelete = async (u: User) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onRefresh()
      loadUsers()
    } catch (err: any) { onError(err.message || 'Failed to delete user') }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                <p className="text-xs text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button
                  onClick={() => { setEditUser(null); setCreateModal(true) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> New User
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><span className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /></div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No users yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="pb-2 pr-4">Username</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Created</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: u.role === 'admin' ? '#8b5cf6' : u.role === 'editor' ? '#3b82f6' : '#6b7280' }}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900 text-sm">{u.username}</span>
                          {u.id === currentUser?.id && <span className="text-xs text-gray-400">(you)</span>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {u.is_locked === 1 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditUser(u); setCreateModal(true) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {u.id !== currentUser?.id && canManage && (
                            <button onClick={() => handleDelete(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <UserModal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        user={editUser}
        onSuccess={() => { loadUsers(); onRefresh() }}
        onError={onError}
        currentUserId={currentUser?.id || ''}
        currentUserRole={currentUser?.role || ''}
      />
    </>
  )
}

// ── CategoryManagement ─────────────────────────────────────────────────────────

interface CategoryManagementProps {
  isOpen: boolean
  onClose: () => void
  onCategoryChange: () => void
  onError: (msg: string) => void
  allowedRoles: string[]
}

export function CategoryManagement({ isOpen, onClose, onCategoryChange, onError, allowedRoles }: CategoryManagementProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)

  const canManage = allowedRoles.includes('admin') || allowedRoles.includes('editor')

  const loadCategories = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/categories', { credentials: 'include' })
      if (!res.ok) { if (res.status === 401) window.location.href = '/login'; return }
      const data = await res.json()
      setCategories(data.categories || [])
    } catch { onError('Failed to load categories') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (isOpen) loadCategories()
  }, [isOpen])

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"? Items using this category will keep their category text.`)) return
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onCategoryChange()
      loadCategories()
    } catch (err: any) { onError(err.message || 'Failed to delete category') }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Tag className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Category Management</h2>
                <p className="text-xs text-gray-500">{categories.length} category{categories.length !== 1 ? 'ies' : 'y'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={() => { setEditCategory(null); setCreateModal(true) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> New Category
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><span className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /></div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No categories yet</div>
            ) : (
              <div className="grid gap-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">{cat.name}</div>
                      {cat.description && <div className="text-xs text-gray-500 truncate">{cat.description}</div>}
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <>
                          <button onClick={() => { setEditCategory(cat); setCreateModal(true) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(cat)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CategoryModal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        category={editCategory}
        onSuccess={() => { loadCategories(); onCategoryChange() }}
        onError={onError}
      />
    </>
  )
}

// ── UnitModal ──────────────────────────────────────────────────────────────────

export function UnitModal({ isOpen, onClose, unit, onSuccess, onError }: UnitModalProps) {
  const isEdit = !!unit
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(unit?.name || '')
    setError('')
  }, [unit, isOpen])

  const validate = (): boolean => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Unit name is required'); return false }
    if (trimmed.length > 20) { setError('Maximum 20 characters'); return false }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setError('')
    try {
      const url = isEdit ? `/api/units/${unit!.id}` : '/api/units'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Unit' : 'New Unit'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g. pc, kg, L, drum"
              autoFocus
              maxLength={20}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <p className="mt-1 text-xs text-gray-400">Max 20 characters</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── UnitsManagement ────────────────────────────────────────────────────────────

interface UnitsManagementProps {
  isOpen: boolean
  onClose: () => void
  onUnitChange: () => void
  onError: (msg: string) => void
  allowedRoles: string[]
}

export function UnitsManagement({ isOpen, onClose, onUnitChange, onError, allowedRoles }: UnitsManagementProps) {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)

  const canManage = allowedRoles.includes('admin') || allowedRoles.includes('editor')
  const canDelete = allowedRoles.includes('admin')

  const loadUnits = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/units', { credentials: 'include' })
      if (!res.ok) { if (res.status === 401) window.location.href = '/login'; return }
      const data = await res.json()
      setUnits(data.units || [])
    } catch { onError('Failed to load units') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (isOpen) loadUnits()
  }, [isOpen])

  const handleDelete = async (u: Unit) => {
    if (!confirm(`Delete unit "${u.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/units/${u.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUnitChange()
      loadUnits()
    } catch (err: any) { onError(err.message || 'Failed to delete unit') }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                <Ruler className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Units</h2>
                <p className="text-xs text-gray-500">{units.length} unit{units.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={() => { setEditUnit(null); setCreateModal(true) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> New Unit
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><span className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /></div>
            ) : units.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No units yet</div>
            ) : (
              <div className="grid gap-2">
                {units.map(u => (
                  <div key={u.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 text-sm">{u.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <button onClick={() => { setEditUnit(u); setCreateModal(true) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <UnitModal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        unit={editUnit}
        onSuccess={() => { loadUnits(); onUnitChange() }}
        onError={onError}
      />
    </>
  )
}
