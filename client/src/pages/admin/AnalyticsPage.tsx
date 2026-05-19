import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

const PERIOD_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

function formatPath(path: string) {
  if (path === '/') return 'Inicio'
  if (path.startsWith('/stories/')) return path.replace('/stories/', '📰 ')
  if (path.startsWith('/issues/')) return path.replace('/issues/', '🏷 ')
  if (path.startsWith('/comunidad/')) return path.replace('/comunidad/', '🌎 ')
  return path
}

function BarRow({ label, count, max, href }: { label: string; count: number; max: number; href?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-48 shrink-0 truncate text-sm text-neutral-700" title={label}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 hover:underline">
            {label}
          </a>
        ) : label}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 bg-neutral-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-brand-500 h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-medium text-neutral-600 tabular-nums">{count.toLocaleString('es-CL')}</span>
      </div>
    </div>
  )
}

function MiniBarChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d) => {
        const h = Math.max(2, Math.round((d.count / max) * 64))
        const isToday = d.date === new Date().toISOString().slice(0, 10)
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center justify-end"
            title={`${d.date}: ${d.count} vistas`}
          >
            <div
              className={`w-full rounded-sm transition-all ${isToday ? 'bg-brand-500' : 'bg-brand-200'}`}
              style={{ height: `${h}px` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState(30)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', period],
    queryFn: () => adminApi.analytics.overview(period),
    staleTime: 60_000,
  })

  return (
    <>
      <Helmet>
        <title>Analytics — Admin — Impacto Indígena</title>
      </Helmet>

      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Analytics" description="Vistas de páginas del sitio público" />
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                period === opt.value
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : isError ? (
        <div className="text-center py-20 text-neutral-500">Error al cargar analytics</div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                Total vistas ({period}d)
              </p>
              <p className="text-3xl font-bold text-neutral-900">{data.total.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Hoy</p>
              <p className="text-3xl font-bold text-brand-600">{data.today.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Ayer</p>
              <p className="text-3xl font-bold text-neutral-700">{data.yesterday.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Páginas únicas</p>
              <p className="text-3xl font-bold text-neutral-700">{data.uniquePages.toLocaleString('es-CL')}</p>
            </div>
          </div>

          {/* Daily chart */}
          <Card title={`Vistas por día (últimos ${period} días)`}>
            {data.byDay.length > 0 ? (
              <div>
                <MiniBarChart data={data.byDay} />
                <div className="flex justify-between mt-1 text-xs text-neutral-400">
                  <span>{data.byDay[0]?.date}</span>
                  <span>hoy</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400 py-4 text-center">Sin datos aún</p>
            )}
          </Card>

          {/* Source breakdown */}
          {data.bySource && data.bySource.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Origen del tráfico</p>
              <div className="flex gap-6 flex-wrap">
                {data.bySource.map((s) => {
                  const label =
                    s.source === 'newsletter' ? '📧 Boletín'
                    : s.source === 'social' ? '🔗 Social'
                    : '🌐 Directo'
                  const pct = data.total > 0 ? Math.round((s.count / data.total) * 100) : 0
                  return (
                    <div key={s.source} className="flex flex-col items-center gap-1">
                      <span className="text-xs text-neutral-500">{label}</span>
                      <span className="text-2xl font-bold text-neutral-900 tabular-nums">{s.count.toLocaleString('es-CL')}</span>
                      <span className="text-xs text-neutral-400">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top pages */}
            <Card title="Top páginas">
              {data.topPages.length > 0 ? (
                <div className="space-y-0.5">
                  {data.topPages.map((p) => (
                    <BarRow
                      key={p.path}
                      label={formatPath(p.path)}
                      count={p.count}
                      max={data.topPages[0]?.count ?? 1}
                      href={p.path}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-400 py-4 text-center">Sin datos aún</p>
              )}
            </Card>

            {/* Top stories */}
            <Card title="Historias más leídas">
              {data.topStories.length > 0 ? (
                <div className="space-y-0.5">
                  {data.topStories.map((p) => (
                    <BarRow
                      key={p.path}
                      label={p.path.replace('/stories/', '')}
                      count={p.count}
                      max={data.topStories[0]?.count ?? 1}
                      href={p.path}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-400 py-4 text-center">Sin datos de historias aún</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </>
  )
}
