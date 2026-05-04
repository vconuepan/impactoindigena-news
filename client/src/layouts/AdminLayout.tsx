import { useState, useEffect, Suspense } from 'react'
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Dialog, DialogPanel } from '@headlessui/react'
import { useQuery } from '@tanstack/react-query'
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  DocumentTextIcon,
  RssIcon,
  TagIcon,
  EnvelopeIcon,
  MicrophoneIcon,
  ClockIcon,
  UsersIcon,
  UserGroupIcon,
  ArrowRightStartOnRectangleIcon,
  Square3Stack3DIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftEllipsisIcon,
  GlobeAltIcon,
  WrenchScrewdriverIcon,
  EnvelopeOpenIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../lib/auth'
import { adminApi } from '../lib/admin-api'
import { useServerTime } from '../hooks/useJobs'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ToastProvider } from '../components/ui/Toast'
import { BackgroundTaskProvider } from '../hooks/useBackgroundTasks'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon, end: true },
  { name: 'Stories', href: '/admin/stories', icon: DocumentTextIcon },
  { name: 'Clusters', href: '/admin/clusters', icon: Square3Stack3DIcon },
  { name: 'Feeds', href: '/admin/feeds', icon: RssIcon },
  { name: 'Issues', href: '/admin/issues', icon: TagIcon },
  { name: 'Voces Indígenas', href: '/admin/editorials', icon: DocumentTextIcon },
  { name: 'Newsletters', href: '/admin/newsletters', icon: EnvelopeIcon },
  { name: 'Podcasts', href: '/admin/podcasts', icon: MicrophoneIcon },
  { name: 'Instagram', href: '/admin/instagram', icon: GlobeAltIcon },
  { name: 'LinkedIn', href: '/admin/linkedin', icon: GlobeAltIcon },
  { name: 'Feedback', href: '/admin/feedback', icon: ChatBubbleLeftEllipsisIcon, badge: true },
  { name: 'Jobs', href: '/admin/jobs', icon: ClockIcon },
  { name: 'Users', href: '/admin/users', icon: UsersIcon },
  { name: 'Miembros', href: '/admin/members', icon: UserGroupIcon },
  { name: 'En Foco', href: '/admin/spotlights', icon: GlobeAltIcon },
  { name: 'Comunidades', href: '/admin/communities', icon: GlobeAltIcon },
  { name: 'Analytics', href: '/admin/analytics', icon: ChartBarIcon },
  { name: 'Suscriptores', href: '/admin/subscribers', icon: EnvelopeOpenIcon },
  { name: 'Mantenimiento', href: '/admin/maintenance', icon: WrenchScrewdriverIcon },
]

function NavItems({ onClick, unreadFeedbackCount }: { onClick?: () => void; unreadFeedbackCount: number }) {
  return (
    <>
      {navigation.map(item => (
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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin navigation">
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
          View Website
          <span className="sr-only">(opens in new tab)</span>
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
          Logout
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { isAuthenticated, isLoading, tryRestoreSession } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Try to restore session when accessing admin routes directly
  useEffect(() => {
    tryRestoreSession()
  }, [tryRestoreSession])

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
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
          <Sidebar />
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
            <Sidebar onNavigate={() => setMobileOpen(false)} />
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
