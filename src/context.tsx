import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { fetchInventory, fetchStats, fetchCategories, fetchUnits, getCurrentUser, logout, type User, type Category, type Unit, toProxyImageUrl, fetchSettings, type AppSettings } from './lib/api'

interface AppState {
  user: User | null
  loading: boolean
  categories: Category[]
  units: Unit[]
  settings: AppSettings
  login: (username: string, password: string) => Promise<void>
  doLogout: () => Promise<void>
  refreshCategories: () => Promise<void>
  refreshUnits: () => Promise<void>
  refreshSettings: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [settings, setSettings] = useState<AppSettings>({ company_name: 'Inventory Dashboard' })

  const initAuth = useCallback(async () => {
    try {
      let u = await getCurrentUser()
      // Access token expired but refresh cookie still valid → renew silently
      if (!u) {
        const { refreshAuth } = await import('./lib/api')
        if (await refreshAuth()) u = await getCurrentUser()
      }
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

  const initUnits = useCallback(async () => {
    try {
      const res = await fetchUnits()
      setUnits(res.units || [])
    } catch {
      setUnits([])
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
    initUnits()
    initSettings()
  }, [initAuth, initCategories, initUnits, initSettings])

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

  const refreshUnits = async () => {
    try {
      const res = await fetchUnits()
      setUnits(res.units || [])
    } catch {}
  }

  const refreshSettings = async () => {
    try {
      const res = await fetchSettings()
      setSettings(res)
    } catch {}
  }

  return (
    <AppContext.Provider value={{ user, loading, categories, units, settings, login, doLogout, refreshCategories, refreshUnits, refreshSettings }}>
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
  limit: number,
  sort = 'sku'
) {
  const [invRes, statsRes] = await Promise.all([
    fetchInventory(search, category, status, view, page, limit, sort),
    fetchStats(),
  ])
  // Normalize all Tigris direct URLs to proxy URLs for consistent image access
  const items = (invRes.items || []).map(item => ({
    ...item,
    image_url: toProxyImageUrl(item.image_url),
  }))
  return { ...invRes, items, stats: statsRes }
}
