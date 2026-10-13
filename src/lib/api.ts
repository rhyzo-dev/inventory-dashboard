/**
 * API client for the Inventory Dashboard.
 *
 * All endpoints call relative URLs (apiBase = '') — the browser resolves them
 * against the same origin, which Cloudflare Pages routes to the correct handler.
 *
 * D1 table: consumable_item
 *   PK: id (UUID, generated server-side via crypto.randomUUID())
 *   NOT auto-increment — UUIDs are created in the Worker before INSERT.
 */

export interface InventoryItem {
  id: string;                    // UUID v4
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

export interface InventoryResponse {
  items: InventoryItem[];
  stats: {
    total_items: number;
    low_stock_count: number;
    out_of_stock_count: number;
    expiring_soon_count: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  is_locked: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
}

const apiBase = '';
const CRED = { credentials: 'include' } as const;

/** Convert a direct Tigris URL to our proxy endpoint URL.
 *  Tigris requires auth for all object access, so we serve images through our API instead.
 *  e.g. https://t3.storage.dev/inventory-dashboard/items/xxx.jpg → /api/images/items/xxx.jpg
 */
export const toProxyImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  // Already a proxy URL
  if (url.startsWith('/api/images/')) return url
  // Convert direct Tigris URL to proxy URL
  const match = url.match(/\/inventory-dashboard\/(.+)$/)
  if (match) return `/api/images/${match[1]}`
  return url
}

function getHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export interface LoginInput {
  username: string;
  password: string;
}

export const login = async (input: LoginInput): Promise<{ user: User }> => {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Login failed: ${res.status}`)
  }
  return res.json()
}

export const logout = async (): Promise<void> => {
  await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' })
}

export const getCurrentUser = async (): Promise<User | null> => {
  const res = await fetch(`${apiBase}/api/users/me`, { credentials: 'include' })
  if (!res.ok) return null
  return res.json()
}

/**
 * Silently renew the session using the refresh_token cookie.
 * Returns true if a fresh access token was issued (or the session was already valid).
 * Call this when a 401 is received — it lets a user keep working past the 8-hour
 * access-token window without re-logging in, as long as the 7-day refresh cookie is alive.
 */
export const refreshAuth = async (): Promise<boolean> => {
  const res = await fetch(`${apiBase}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
  return res.ok
}

// ── Inventory ──────────────────────────────────────────────────────────────────

export const fetchInventory = async (
  search = '',
  category = '',
  status = '',
  view = '',
  page = 1,
  limit = 25
): Promise<InventoryResponse> => {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (category) params.append('category', category)
  if (status) params.append('status', status)
  if (view) params.append('view', view)
  params.append('page', String(page))
  params.append('limit', String(limit))

  const res = await fetch(`${apiBase}/api/inventory?${params.toString()}`, {
    headers: getHeaders(),
    ...CRED,
  })
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.status}`)
  return res.json()
}

export const fetchStats = async (): Promise<InventoryResponse['stats']> => {
  const res = await fetch(`${apiBase}/api/stats`, { ...CRED })
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`)
  return res.json()
}

export const exportInventory = async (
  search = '',
  category = '',
  status = '',
  view = '',
  format: 'csv' | 'xlsx' = 'xlsx'
): Promise<Blob> => {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (category) params.append('category', category)
  if (status) params.append('status', status)
  if (view) params.append('view', view)
  params.append('format', format)

  const res = await fetch(`${apiBase}/api/export?${params.toString()}`, { ...CRED })
  if (!res.ok) throw new Error(`Failed to export inventory: ${res.status}`)
  return res.blob()
}

// ── Create / Update / Delete items ─────────────────────────────────────────────

export interface CreateItemInput {
  sku: string
  name: string
  description?: string
  category?: string
  quantity?: number
  min_threshold?: number
  max_threshold?: number
  bin_location?: string
  production_date?: string
  expiry_date?: string
  image_url?: string
  specification?: string
}

export const createItem = async (data: CreateItemInput): Promise<{ id: string; message: string }> => {
  const res = await fetch(`${apiBase}/api/inventory`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Create failed: ${res.status}`)
  }
  return res.json()
}

export interface UpdateItemInput {
  sku?: string
  name?: string
  description?: string | null
  category?: string | null
  quantity?: number
  min_threshold?: number
  max_threshold?: number
  bin_location?: string | null
  production_date?: string | null
  expiry_date?: string | null
  image_url?: string | null
  specification?: string | null
}

export const updateItem = async (id: string, data: UpdateItemInput): Promise<{ id: string; message: string }> => {
  const res = await fetch(`${apiBase}/api/inventory/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Update failed: ${res.status}`)
  }
  return res.json()
}

export const deleteItem = async (id: string): Promise<{ message: string }> => {
  const res = await fetch(`${apiBase}/api/inventory/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Delete failed: ${res.status}`)
  }
  return res.json()
}

// ── Image compression helpers ────────────────────────────────────────────────

const MAX_DIM = 1200
const JPEG_QUALITY = 0.8
const SKIP_SIZE = 50 * 1024 // skip compression if already under 50 KB

/** Compress an image via canvas. Returns a WebP blob if the input was larger than SKIP_SIZE;
 *  otherwise returns the original file unchanged. */
async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_SIZE) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')) }
      URL.revokeObjectURL(img.src)

      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      // Prefer WebP for smaller output; fall back to JPEG if not supported
      const preferWebP = typeof HTMLCanvasElement.prototype.toBlob === 'function'
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Fallback: try JPEG
            canvas.toBlob(
              (jblob) => resolve(jblob ? new File([jblob], file.name, { type: 'image/jpeg' }) : file),
              'image/jpeg',
              JPEG_QUALITY
            )
            return
          }
          resolve(new File([blob], file.name, { type: blob.type }))
        },
        'image/webp',
        JPEG_QUALITY
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// ── Upload image ───────────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean
  image_url: string
  object_key: string
  mime_type: string
  size_bytes: number
  item_id: string | null
}

export const uploadImage = async (file: File, itemId?: string): Promise<UploadResult> => {
  const compressed = await compressImage(file)
  const formData = new FormData()
  formData.append('file', compressed)
  if (itemId) formData.append('itemId', itemId)

  const res = await fetch(`${apiBase}/api/upload`, { method: 'POST', credentials: 'include', body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Upload failed: ${res.status}`)
  }
  return res.json()
}

/** Remove an item's image — clears image_url from DB (backend deletes file from Tigris) */
export const removeImage = async (id: string): Promise<void> => {
  const res = await fetch(`${apiBase}/api/inventory/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ image_url: '' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Remove image failed: ${res.status}`)
  }
}

// ── Users (admin only) ─────────────────────────────────────────────────────────

export const fetchUsers = async (): Promise<{ users: User[] }> => {
  const res = await fetch(`${apiBase}/api/users`, { ...CRED })
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json()
}

export const createUser = async (data: { username: string; password: string; role: User['role'] }): Promise<User> => {
  const res = await fetch(`${apiBase}/api/users`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Create user failed: ${res.status}`)
  }
  return res.json()
}

export const updateUser = async (id: string, data: { role?: User['role']; password?: string; is_locked?: number }): Promise<User> => {
  const res = await fetch(`${apiBase}/api/users/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Update user failed: ${res.status}`)
  }
  return res.json()
}

export const deleteUser = async (id: string): Promise<void> => {
  const res = await fetch(`${apiBase}/api/users/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Delete user failed: ${res.status}`)
  }
}

// ── Categories ─────────────────────────────────────────────────────────────────

export const fetchCategories = async (): Promise<{ categories: Category[] }> => {
  const res = await fetch(`${apiBase}/api/categories`, { ...CRED })
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`)
  return res.json()
}

export const createCategory = async (data: { name: string; color: string; description?: string }): Promise<Category> => {
  const res = await fetch(`${apiBase}/api/categories`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Create category failed: ${res.status}`)
  }
  return res.json()
}

export const updateCategory = async (id: string, data: { name?: string; color?: string; description?: string | null }): Promise<Category> => {
  const res = await fetch(`${apiBase}/api/categories/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Update category failed: ${res.status}`)
  }
  return res.json()
}

export const deleteCategory = async (id: string): Promise<void> => {
  const res = await fetch(`${apiBase}/api/categories/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Delete category failed: ${res.status}`)
  }
}

// ── App Settings ───────────────────────────────────────────────────────────────

export interface AppSettings {
  company_name: string
}

export const fetchSettings = async (): Promise<AppSettings> => {
  const res = await fetch(`${apiBase}/api/settings`, { ...CRED })
  if (!res.ok) return { company_name: 'Inventory Dashboard' }
  return res.json()
}

export const updateSettings = async (updates: Partial<AppSettings>): Promise<void> => {
  const res = await fetch(`${apiBase}/api/settings`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Update settings failed: ${res.status}`)
  }
}
