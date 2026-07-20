import { useState, useEffect, Suspense } from 'react'
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Dialog, DialogPanel } from '@headlessui/react'
import { useQuery } from '@tanstack/react-query'
import {
  Bars3Icon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../lib/auth'
import { adminApi } from '../lib/admin-api'
import { useServerTime } from '../hooks/useJobs'
import { useAdminTheme } from '../hooks/useAdminTheme'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ToastProvider } from '../components/ui/Toast'
import { BackgroundTaskProvider } from '../hooks/useBackgroundTasks'
import { NAV_SECTIONS } from '../config/admin-nav'
import CommandPalette from '../components/admin/CommandPalette'

function NavItems({ onClick, unreadFeedbackCount }: { onClick?: () => void; unreadFeedbackCount: number }) {
  return (
    <>
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.title ?? '_top'} className={i > 0 ? 'mt-5' : ''}>
          {section.title && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {section.title}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map(item => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.end}
                onClick={onClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                  ${isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.name}
                {item.badge && unreadFeedbackCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[1.25rem]">
                    {unreadFeedbackCount > 99 ? '99+' : unreadFeedbackCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function ServerClock() {
  const serverTime = useServerTime()
  if (!serverTime) return null

  return (
    <div className="border-t border-neutral-200 px-6 py-2 text-center">
      <span className="font-mono tabular-nums text-xs text-neutral-500">{serverTime.time}</span>
      <span className="ml-1 text-[10px] text-neutral-400">{serverTime.timezone}</span>
    </div>
  )
}

function Sidebar({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const feedbackCountQuery = useQuery({
    queryKey: ['feedbackCount'],
    queryFn: () => adminApi.feedback.count(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const unreadFeedbackCount = feedbackCountQuery.data?.unreadCount ?? 0

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5 border-b border-neutral-200">
        <span className="text-lg font-bold text-neutral-900">Admin</span>
      </div>
      <div className="px-3 pt-3">
        <button
          onClick={onSearch}
          className="flex w-full items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Buscar…</span>
          <kbd className="ml-auto rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">⌘K</kbd>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        <NavItems onClick={onNavigate} unreadFeedbackCount={unreadFeedbackCount} />
      </nav>
      <ServerClock />
      <div className="border-t border-neutral-200 px-3 py-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 mb-1"
        >
          <ArrowTopRightOnSquareIcon className="h-5 w-5 shrink-0" />
          Ver sitio
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-neutral-900 truncate">{user.name}</p>
            <p className="text-xs text-neutral-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={async () => { await logout(); navigate('/admin/login') }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { isAuthenticated, isLoading, tryRestoreSession } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  useAdminTheme()

  // Try to restore session when accessing admin routes directly
  useEffect(() => {
    tryRestoreSession()
  }, [tryRestoreSession])

  // ⌘K / Ctrl+K toggles the command palette from anywhere in the admin.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (isLoading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <h1 className="sr-only">Loading</h1>
        <LoadingSpinner size="lg" />
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <ToastProvider>
    <BackgroundTaskProvider>
      <div className="flex h-screen bg-neutral-50">
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
          <Sidebar onSearch={() => setPaletteOpen(true)} />
        </aside>

        {/* Mobile sidebar */}
        <Dialog open={mobileOpen} onClose={setMobileOpen} className="relative z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <DialogPanel className="fixed inset-y-0 left-0 z-50 w-60 bg-white shadow-xl">
            <div className="absolute right-2 top-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Close menu"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} onSearch={() => { setMobileOpen(false); setPaletteOpen(true) }} />
          </DialogPanel>
        </Dialog>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile top bar */}
          <div className="flex items-center border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            <span className="ml-3 text-lg font-bold text-neutral-900">Admin</span>
          </div>

          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <Suspense fallback={
              <div className="flex justify-center py-12">
                <h1 className="sr-only">Loading</h1>
                <LoadingSpinner />
              </div>
            }>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </BackgroundTaskProvider>
    </ToastProvider>
  )
}
