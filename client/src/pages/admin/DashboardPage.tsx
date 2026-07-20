import type { ReactNode } from 'react'
import { Helmet } from 'react-helmet-async'
import { PlayIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { STORY_STATUSES } from '@shared/constants'
import { useStoryStats } from '../../hooks/useStoryStats'
import { useJobs, useRunJob } from '../../hooks/useJobs'
import { adminApi, type IntegrationHealth } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { JobStatusBadge } from '../../components/admin/JobStatusBadge'
import { ActionIconButton } from '../../components/ui/ActionIconButton'
import { formatStatus, STATUS_VARIANTS, JOB_DISPLAY_NAMES, JOB_PIPELINE_ORDER } from '../../lib/constants'
import { TimeWithRelative } from '../../components/admin/TimeWithRelative'

/**
 * Compact metric tile. Flat 1px border (no drop shadow) to match the editorial
 * restraint of the public site; a `brand` tone marks the outcome that matters
 * (published stories, active communities) in the brand green.
 */
function StatTile({
  label,
  badge,
  value,
  tone = 'default',
}: {
  label?: string
  badge?: ReactNode
  value: number
  tone?: 'default' | 'brand'
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="mb-1 min-h-[1.25rem]">
        {badge ?? <span className="text-xs font-medium text-neutral-500">{label}</span>}
      </div>
      <p className={`text-xl font-bold tabular-nums ${tone === 'brand' ? 'text-brand-800' : 'text-neutral-900'}`}>
        {value}
      </p>
    </div>
  )
}

function StatsGrid({ stats }: { stats: Record<string, number> }) {
  const total = Object.values(stats).reduce((sum, n) => sum + n, 0)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {STORY_STATUSES.map(status => (
        <StatTile
          key={status}
          badge={<Badge variant={STATUS_VARIANTS[status]}>{formatStatus(status)}</Badge>}
          value={stats[status] || 0}
          tone={status === 'published' ? 'brand' : 'default'}
        />
      ))}
      <StatTile label="Total" value={total} />
    </div>
  )
}

function CommunityStats() {
  const summaryQuery = useQuery({
    queryKey: ['admin', 'members', 'summary'],
    queryFn: () => adminApi.members.summary(),
  })
  const communitiesQuery = useQuery({
    queryKey: ['admin', 'communities'],
    queryFn: () => adminApi.communities.list(),
  })

  if (summaryQuery.isLoading || communitiesQuery.isLoading) {
    return <div className="flex justify-center py-4"><LoadingSpinner /></div>
  }

  const summary = summaryQuery.data
  const activeCommunities = (communitiesQuery.data ?? []).filter((c) => c.active).length
  const totalCommunities = (communitiesQuery.data ?? []).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <StatTile label="Usuarios" value={summary?.totalUsers ?? 0} />
      <StatTile label="Membresías" value={summary?.totalMemberships ?? 0} />
      <StatTile label="Comunidades activas" value={activeCommunities} tone="brand" />
      <StatTile label="Comunidades totales" value={totalCommunities} />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: string): string {
  if (status === 'published' || status === 'sent') return 'bg-green-500'
  if (status === 'failed') return 'bg-red-500'
  if (status === 'draft') return 'bg-yellow-400'
  return 'bg-neutral-300'
}

function statusLabel(status: string): string {
  if (status === 'published') return 'Publicado'
  if (status === 'sent') return 'Enviado'
  if (status === 'failed') return 'Fallido'
  if (status === 'draft') return 'Borrador'
  return status
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const diffMs = Date.now() - d.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return 'hace menos de 1h'
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'hace 1 día'
  return `hace ${diffD} días`
}

// ── Integration Health Panel ──────────────────────────────────────────────────

function IntegrationHealthPanel({ data }: { data: IntegrationHealth }) {
  const { feeds, social, newsletter } = data

  const feedsOk = feeds.staleFeedsCount === 0 && feeds.recentErrors.length === 0
  const feedsWarn = !feedsOk

  const socialChannels = [
    { key: 'bluesky', label: 'Bluesky', data: social.bluesky },
    { key: 'mastodon', label: 'Mastodon', data: social.mastodon },
    { key: 'instagram', label: 'Instagram', data: social.instagram },
    { key: 'twitter', label: 'Twitter / X', data: social.twitter },
    { key: 'linkedin', label: 'LinkedIn', data: social.linkedin },
  ].filter((c) => c.data !== null)

  return (
    <div className="space-y-4">
      {/* Feeds */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-700">Feeds RSS</h3>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${feedsWarn ? 'bg-amber-400' : 'bg-green-500'}`} aria-hidden="true" />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <div>
            <p className="text-xl font-bold text-neutral-900">{feeds.totalActive}</p>
            <p className="text-xs text-neutral-500">activos</p>
          </div>
          <div>
            <p className={`text-xl font-bold ${feeds.crawledIn24h < feeds.totalActive ? 'text-amber-600' : 'text-green-700'}`}>{feeds.crawledIn24h}</p>
            <p className="text-xs text-neutral-500">crawleados (24h)</p>
          </div>
          <div>
            <p className={`text-xl font-bold ${feeds.staleFeedsCount > 0 ? 'text-amber-600' : 'text-neutral-400'}`}>{feeds.staleFeedsCount}</p>
            <p className="text-xs text-neutral-500">sin crawl</p>
          </div>
        </div>
        {feeds.lastCrawledAt && (
          <p className="text-xs text-neutral-400">Último crawl exitoso: {relativeTime(feeds.lastCrawledAt)}</p>
        )}
        {feeds.recentErrors.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-amber-700 cursor-pointer font-medium">
              {feeds.recentErrors.length} error{feeds.recentErrors.length > 1 ? 'es' : ''} reciente{feeds.recentErrors.length > 1 ? 's' : ''}
            </summary>
            <ul className="mt-1 space-y-1">
              {feeds.recentErrors.map((f) => (
                <li key={f.id} className="text-xs text-neutral-600 truncate">
                  <span className="font-medium">{f.title}:</span>{' '}
                  <span className="text-red-600">{f.lastCrawlError}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Social channels */}
      {socialChannels.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Redes sociales</h3>
          <div className="space-y-2">
            {socialChannels.map(({ key, label, data: ch }) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">{relativeTime(ch!.lastAt)}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${ch!.status === 'published' ? 'bg-green-50 text-green-700' : ch!.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDot(ch!.status)}`} aria-hidden="true" />
                    {statusLabel(ch!.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Newsletter */}
      {newsletter && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700">Newsletter</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">{relativeTime(newsletter.lastAt)}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${newsletter.status === 'sent' ? 'bg-green-50 text-green-700' : newsletter.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(newsletter.status)}`} aria-hidden="true" />
                {statusLabel(newsletter.status)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const statsQuery = useStoryStats()
  const jobsQuery = useJobs()
  const runJob = useRunJob()
  const healthQuery = useQuery({
    queryKey: ['admin', 'integration-health'],
    queryFn: () => adminApi.integrationHealth.get(),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
  })

  return (
    <>
      <Helmet>
        <title>Panel — Admin — Impacto Indígena</title>
      </Helmet>

      <PageHeader title="Panel" description="Pipeline editorial y estado del sistema" />

      {/* Story pipeline — the primary editorial signal, shown first */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Noticias por estado</h2>
        {statsQuery.isLoading && (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        )}
        {statsQuery.error && (
          <ErrorState message="Error al cargar estadísticas" onRetry={() => statsQuery.refetch()} />
        )}
        {statsQuery.data && <StatsGrid stats={statsQuery.data} />}
      </section>

      {/* Integration Health */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Estado de integraciones</h2>
        {healthQuery.isLoading && (
          <div className="flex justify-center py-4"><LoadingSpinner /></div>
        )}
        {healthQuery.error && (
          <ErrorState message="Error al cargar estado de integraciones" onRetry={() => healthQuery.refetch()} />
        )}
        {healthQuery.data && <IntegrationHealthPanel data={healthQuery.data} />}
      </section>

      {/* Jobs */}
      <section>
        <Card title="Trabajos">
          {jobsQuery.isLoading && (
            <div className="flex justify-center py-4"><LoadingSpinner /></div>
          )}
          {jobsQuery.error && (
            <ErrorState message="Error al cargar trabajos" onRetry={() => jobsQuery.refetch()} />
          )}
          {jobsQuery.data && (
            <div className="overflow-x-auto -mx-4 -my-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th scope="col" className="text-left py-2 px-4 font-medium text-neutral-500">Trabajo</th>
                    <th scope="col" className="text-left py-2 px-4 font-medium text-neutral-500">Estado</th>
                    <th scope="col" className="text-left py-2 px-4 font-medium text-neutral-500">Última ejecución</th>
                    <th scope="col" className="text-left py-2 px-4 font-medium text-neutral-500 hidden sm:table-cell">Error</th>
                    <th scope="col" className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...jobsQuery.data].sort((a, b) => {
                    const ai = JOB_PIPELINE_ORDER.indexOf(a.jobName)
                    const bi = JOB_PIPELINE_ORDER.indexOf(b.jobName)
                    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
                  }).map(job => (
                    <tr key={job.jobName} className={`border-b border-neutral-100 last:border-0 ${job.running ? 'bg-yellow-50' : ''}`}>
                      <td className="py-2 px-4 font-medium text-neutral-900">
                        {JOB_DISPLAY_NAMES[job.jobName] || job.jobName}
                      </td>
                      <td className="py-2 px-4">
                        <JobStatusBadge job={job} variant="dot" />
                      </td>
                      <td className="py-2 px-4 text-neutral-500 whitespace-nowrap">
                        <TimeWithRelative dateStr={job.lastCompletedAt} />
                      </td>
                      <td className="py-2 px-4 text-neutral-500 max-w-xs truncate hidden sm:table-cell">
                        {job.lastError ? (
                          <a
                            href="/admin/jobs"
                            className="text-red-600 hover:text-red-800"
                            title={job.lastError}
                          >
                            {job.lastError.slice(0, 80)}{job.lastError.length > 80 ? '...' : ''}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {job.running ? (
                          <span className="inline-block p-1">
                            <svg className="h-5 w-5 animate-spin text-yellow-600" viewBox="0 0 24 24" fill="none" aria-label="Running">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          </span>
                        ) : (
                          <ActionIconButton
                            icon={PlayIcon}
                            label={`Ejecutar ${JOB_DISPLAY_NAMES[job.jobName] || job.jobName}`}
                            onClick={() => runJob.mutate(job.jobName)}
                            disabled={runJob.isPending && runJob.variables === job.jobName}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Community stats — secondary, shown last */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Comunidades y miembros</h2>
        <CommunityStats />
      </section>
    </>
  )
}
