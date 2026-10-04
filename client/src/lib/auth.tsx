import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { UserRole } from '@shared/types'
import { authApi, setAccessToken, ApiError } from './admin-api'

interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Call this when entering admin routes to restore session if available */
  tryRestoreSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  // Start with isLoading=false since we don't auto-refresh on public pages
  const [isLoading, setIsLoading] = useState(false)
  const hasAttemptedRestore = useRef(false)

  // Clean up old localStorage-based auth (one-time).
  //
  // Con try: este proveedor envuelve TODA la aplicacion, y leer localStorage
  // lanza SecurityError cuando el navegador bloquea el almacenamiento (cookies
  // de terceros bloqueadas, por ejemplo dentro del iframe de /embed en otro
  // sitio). Sin el try, esa excepcion dejaba la pagina entera en blanco.
  useEffect(() => {
    try {
      localStorage.removeItem('admin_api_key')
    } catch {
      // almacenamiento no disponible: no hay nada que limpiar
    }
  }, [])

  // Called when entering admin routes to restore session
  const tryRestoreSession = useCallback(async () => {
    // Only attempt once per page load
    if (hasAttemptedRestore.current) return
    hasAttemptedRestore.current = true
    setIsLoading(true)

    try {
      const token = await authApi.refresh()
      if (token) {
        const userData = await authApi.me()
        if (userData) {
          setUser(userData as AuthUser)
        }
      }
    } catch {
      setUser(null)
      setAccessToken(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await authApi.login(email, password)
      setAccessToken(result.accessToken)
      setUser(result.user as AuthUser)
    } catch (err) {
      setAccessToken(null)
      setUser(null)
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        throw new Error('Invalid email or password')
      }
      throw new Error('Could not connect to server')
    }
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      tryRestoreSession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
