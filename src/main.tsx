import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppProvider, useApp } from './context'
import App from './App'
import { LoginPage } from './pages/Login'
import './index.css'

// Login page wired to context so onLogin is always available
function LoginScreen() {
  const { login } = useApp()
  return <LoginPage onLogin={login} />
}

// Root app that decides between login page and main app based on auth state
function Root() {
  const [redirecting, setRedirecting] = React.useState(true)
  const [redirectToLogin, setRedirectToLogin] = React.useState(false)

  React.useEffect(() => {
    // Check if user has a valid session cookie
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me', { credentials: 'include' })
        if (res.ok) {
          setRedirectToLogin(false)
        } else {
          setRedirectToLogin(true)
        }
      } catch {
        setRedirectToLogin(true)
      } finally {
        setRedirecting(false)
      }
    }
    checkAuth()
  }, [])

  if (redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AppProvider>
      {redirectToLogin ? <LoginScreen /> : <App />}
    </AppProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
