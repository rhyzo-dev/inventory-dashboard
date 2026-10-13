import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { fetchInventory, fetchStats, fetchCategories, getCurrentUser, logout, type User, type Category, toProxyImageUrl, fetchSettings, type AppSettings } from './lib/api'

interface AppState {
  user: User | null
  loading: boolean
  categories: Category[]
  settings: AppSettings
  login: (username: string, password: string) => Promise<void>
  doLogout: () => Promise<void>
  refreshCategories: () => Promise<void>
  refreshSettings: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<AppSettings>({ company_name: 'Inventory Dashboard' })

  const initAuth = useCallback(async () => {
    try {
      const u = await getCurrentUser()
      setUser(u)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const initCategories = useCallback(async () => {
    try {
      const res = await fetchCategories()
      setCategories(res.categories || [])
    } catch {
      setCategories([])
    }
  }, [])

  const initSettings = useCallback(async () => {
    try {
      const res = await fetchSettings()
      setSettings(res)
    } catch {
      setSettings({ company_name: 'Inventory Dashboard' })
    }
  }, [])

  useEffect(() => {
    initAuth()
    initCategories()
    initSettings()
  }, [initAuth, initCategories, initSettings])

  const login = async (username: string, password: string) => {
    const { login: apiLogin } = await import('./lib/api')
    const res = await apiLogin({ username: username.trim(), password })
    setUser(res.user)
  }

  const doLogout = async () => {
    try { await logout() } catch {}
    setUser(null)
    window.location.href = '/login'
  }

  const refreshCategories = async () => {
    try {
      const res = await fetchCategories()
      setCategories(res.categories || [])
    } catch {}
  }

  const refreshSettings = async () => {
    try {
      const res = await fetchSettings()
      setSettings(res)
    } catch {}
  }

  return (
    <AppContext.Provider value={{ user, loading, categories, settings, login, doLogout, refreshCategories, refreshSettings }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

// ── Fetch hook used by App component ───────────────────────────────────────────
export async function fetchAllData(
  search: string,
  category: string,
  status: string,
  view: string,
  page: number,
  limit: number
) {
  const [invRes, statsRes] = await Promise.all([
    fetchInventory(search, category, status, view, page, limit),
    fetchStats(),
  ])
  // Normalize all Tigris direct URLs to proxy URLs for consistent image access
  const items = (invRes.items || []).map(item => ({
    ...item,
    image_url: toProxyImageUrl(item.image_url),
  }))
  return { ...invRes, items, stats: statsRes }
}
