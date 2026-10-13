import { createBrowserRouter, Navigate, useNavigate } from 'react-router-dom'
import App from './App'
import LoginPage from './pages/Login'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '*', element: <App /> },
])

// Redirect non-authenticated users to login
export function useAuthRedirect() {
  const navigate = useNavigate()
  // This hook is used inside the App component
  return navigate
}
