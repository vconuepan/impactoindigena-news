import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../../lib/auth'
import { Button } from '../../components/ui/Button'
import { preloadAdminChunks } from '../../App'
import { useAdminTheme } from '../../hooks/useAdminTheme'

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, tryRestoreSession } = useAuth()
  const navigate = useNavigate()
  useAdminTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // On mount, try to restore existing session and preload admin chunks
  useEffect(() => {
    tryRestoreSession()
    preloadAdminChunks()
  }, [tryRestoreSession])

  if (isLoading) return null

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Helmet>
        <title>Acceso admin — Impacto Indígena</title>
      </Helmet>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-neutral-900 mb-8">Acceso admin</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-neutral-200 shadow-sm p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              required
              className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={submitting} className="w-full">
            Iniciar sesión
          </Button>
        </form>
      </div>
    </main>
  )
}
