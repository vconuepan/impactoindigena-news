import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrashIcon, ArrowPathIcon, EnvelopeOpenIcon } from '@heroicons/react/24/outline'
import { adminApi, type Subscriber, type SubscriberEngagement } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'

type StatusFilter = 'all' | 'confirmed' | 'pending' | 'expired'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'expired', label: 'Expirados' },
]

function getStatus(s: Subscriber): 'confirmed' | 'pending' | 'expired' {
  if (s.confirmedAt) return 'confirmed'
  if (new Date(s.expiresAt) > new Date()) return 'pending'
  return 'expired'
}

function StatusBadge({ status }: { status: 'confirmed' | 'pending' | 'expired' }) {
  const styles = {
    confirmed: 'bg-green-50 text-green-700 border border-green-200',
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    expired: 'bg-neutral-100 text-neutral-500 border border-neutral-200',
  }
  const labels = {
    confirmed: 'Confirmado',
    pending: 'Pendiente',
    expired: 'Expirado',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Build a lookup map from the engagement array */
function buildEngagementMap(engagement: SubscriberEngagement[]) {
  return new Map(engagement.map((e) => [e.email, e.engagement]))
}

export default function SubscribersPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [showEngagement, setShowEngagement] = useState(false)
  const PAGE_SIZE = 50

  const statsQuery = useQuery({
    queryKey: ['subscriber-stats'],
    queryFn: () => adminApi.subscribers.stats(),
    staleTime: 30_000,
  })

  const listQuery = useQuery({
    queryKey: ['subscribers', statusFilter, page],
    queryFn: () => adminApi.subscribers.list({ status: statusFilter, page, pageSize: PAGE_SIZE }),
    staleTime: 30_000,
  })

  // Engagement is fetched on demand (Brevo API call per subscriber)
  const engagementQuery = useQuery({
    queryKey: ['subscriber-engagement'],
    queryFn: () => adminApi.subscribers.engagement(),
    enabled: showEngagement,
    staleTime: 5 * 60_000, // 5 min — Brevo stats don't change that fast
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.subscribers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] })
      queryClient.invalidateQueries({ queryKey: ['subscriber-stats'] })
      toast('success', 'Suscriptor eliminado')
    },
    onError: () => toast('error', 'Error al eliminar suscriptor'),
  })

  function handleDelete(id: string, email: string) {
    if (!window.confirm(`¿Eliminar suscriptor "${email}"? Esta acción no se puede deshacer.`)) return
    deleteMutation.mutate(id)
  }

  function handleTabChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleLoadEngagement() {
    setShowEngagement(true)
    if (showEngagement) {
      queryClient.invalidateQueries({ queryKey: ['subscriber-engagement'] })
    }
  }

  const stats = statsQuery.data
  const list = listQuery.data
  const engagementMap = engagementQuery.data ? buildEngagementMap(engagementQuery.data) : null

  return (
    <>
      <Helmet>
        <title>Suscriptores — Admin — Impacto Indígena</title>
      </Helmet>

      <PageHeader
        title="Suscriptores"
        description="Suscriptores del boletín y su estado de confirmación"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Confirmados</p>
          <p className="text-2xl font-bold text-green-600">{stats?.confirmed ?? '—'}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Pendientes</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.pending ?? '—'}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Expirados</p>
          <p className="text-2xl font-bold text-neutral-500">{stats?.expired ?? '—'}</p>
        </div>
      </div>

      <Card>
        {/* Header with engagement toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 border-b border-neutral-200 -mt-1 flex-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  statusFilter === tab.value
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.label}
                {tab.value !== 'all' && stats && (
                  <span className="ml-1.5 text-xs text-neutral-400">
                    {tab.value === 'confirmed' ? stats.confirmed
                      : tab.value === 'pending' ? stats.pending
                      : stats.expired}
                  </span>
                )}
                {tab.value === 'all' && stats && (
                  <span className="ml-1.5 text-xs text-neutral-400">{stats.total}</span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleLoadEngagement}
            disabled={engagementQuery.isFetching}
            title="Cargar métricas de apertura y clics desde Brevo"
            className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50 shrink-0"
          >
            {engagementQuery.isFetching ? (
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <EnvelopeOpenIcon className="h-3.5 w-3.5" />
            )}
            {engagementQuery.isFetching
              ? 'Cargando…'
              : showEngagement && engagementMap
              ? 'Actualizar engagement'
              : 'Cargar engagement'}
          </button>
        </div>

        {listQuery.isLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : listQuery.isError ? (
          <ErrorState message="Error al cargar suscriptores" />
        ) : !list?.data.length ? (
          <EmptyState title="Sin suscriptores" description="No hay suscriptores en esta categoría" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left px-4 py-2 font-medium text-neutral-500">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-500">Estado</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-500">Suscrito</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-500">Expira</th>
                    {engagementMap && (
                      <>
                        <th className="text-right px-4 py-2 font-medium text-neutral-500" title="Boletines abiertos (Brevo)">Aperturas</th>
                        <th className="text-right px-4 py-2 font-medium text-neutral-500" title="Clics en enlaces (Brevo)">Clics</th>
                        <th className="text-right px-4 py-2 font-medium text-neutral-500" title="Boletines enviados (Brevo)">Enviados</th>
                      </>
                    )}
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((sub: Subscriber) => {
                    const status = getStatus(sub)
                    const engagement = engagementMap?.get(sub.email) ?? null
                    return (
                      <tr key={sub.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-4 py-3 font-mono text-xs text-neutral-800">{sub.email}</td>
                        <td className="px-4 py-3"><StatusBadge status={status} /></td>
                        <td className="px-4 py-3 text-neutral-500">{formatDate(sub.createdAt)}</td>
                        <td className="px-4 py-3 text-neutral-500">
                          {status === 'confirmed' ? '—' : formatDate(sub.expiresAt)}
                        </td>
                        {engagementMap && (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {engagement === null ? (
                                <span className="text-neutral-300 text-xs">—</span>
                              ) : engagement.opened > 0 ? (
                                <span className="text-green-700 font-medium">{engagement.opened}</span>
                              ) : (
                                <span className="text-neutral-400">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {engagement === null ? (
                                <span className="text-neutral-300 text-xs">—</span>
                              ) : engagement.clicked > 0 ? (
                                <span className="text-blue-700 font-medium">{engagement.clicked}</span>
                              ) : (
                                <span className="text-neutral-400">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                              {engagement?.messagesSent ?? (
                                <span className="text-neutral-300 text-xs">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(sub.id, sub.email)}
                            disabled={deleteMutation.isPending}
                            className="text-neutral-400 hover:text-red-600 transition-colors p-1 rounded"
                            title="Eliminar suscriptor"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {list.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50 transition-colors"
                >
                  Anterior
                </button>
                <span className="text-sm text-neutral-500">
                  Página {page} de {list.totalPages}
                  <span className="ml-2 text-neutral-400">({list.total} total)</span>
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))}
                  disabled={page === list.totalPages}
                  className="px-3 py-1.5 text-sm rounded border border-neutral-300 disabled:opacity-40 hover:bg-neutral-50 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Engagement note */}
      {!showEngagement && (
        <p className="mt-3 text-xs text-neutral-400 text-center">
          Haz clic en "Cargar engagement" para ver aperturas y clics por suscriptor desde Brevo.
        </p>
      )}
      {engagementQuery.isError && (
        <p className="mt-3 text-xs text-red-500 text-center">
          Error al cargar estadísticas de Brevo. Intenta de nuevo.
        </p>
      )}
    </>
  )
}
