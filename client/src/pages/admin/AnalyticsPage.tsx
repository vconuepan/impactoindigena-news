import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../lib/admin-api'
import { countryName } from '../../lib/countryName'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ETIQUETA_FAMILIA, resumenPorFamilia, agentesPrincipales, cargasSinJs, porcentaje } from './analyticsSenales'
import { EncabezadoLectores, DetalleLectores } from './LectoresProbables'

type Overview = Awaited<ReturnType<typeof adminApi.analytics.overview>>

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

function SinDatosAun() {
  return (
    <p className="text-sm text-neutral-500 py-2">
      Sin datos aún. Empieza a medir cuando se aplica el SQL de la migración
      <code className="mx-1 text-xs">20261120000000_analytics_robots_interaccion</code>
      y el código está desplegado.
    </p>
  )
}

/** Robots que el filtro descarta y cargas de fichas que nunca ejecutaron JavaScript. */
function TraficoAutomatizado({ automated }: { automated: Overview['automated'] }) {
  if (!automated?.desde) {
    return <Card title="Tráfico automatizado (no entra en las cifras de arriba)"><SinDatosAun /></Card>
  }
  const familias = resumenPorFamilia(automated.filas)
  const agentes = agentesPrincipales(automated.filas)
  const sinJs = cargasSinJs(automated.filas, automated.fichasConJs)
  return (
    <Card title={`Tráfico automatizado (no entra en las cifras de arriba) · desde el ${fechaCorta(automated.desde)}`}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-neutral-700">
            Fichas cargadas por algo que dice ser un navegador:{' '}
            <strong className="tabular-nums">{sinJs.conCaraDeNavegador.toLocaleString('es-CL')}</strong>. De esas,{' '}
            <strong className="tabular-nums">{sinJs.conJs.toLocaleString('es-CL')}</strong> ejecutaron JavaScript y
            llegaron al panel, y <strong className="tabular-nums">{sinJs.sinJs.toLocaleString('es-CL')} ({sinJs.pctSinJs} %)</strong>{' '}
            nunca lo hicieron.
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Las que no ejecutan JavaScript son, casi siempre, robots disfrazados de navegador. Una parte pueden ser
            lectores con JavaScript bloqueado: el panel no los ve. Es una estimación, no un conteo de personas.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                <th className="py-1.5 font-medium">Familia</th>
                <th className="py-1.5 font-medium text-right" title="Robots que ejecutaron JavaScript y mandaron el aviso de vista; antes se descartaban sin contarse">Avisos de vista descartados</th>
                <th className="py-1.5 font-medium text-right" title="Cargas de fichas servidas por el servidor, ejecuten JavaScript o no">Cargas de fichas</th>
              </tr>
            </thead>
            <tbody>
              {familias.map((f) => (
                <tr key={f.family} className="border-b border-neutral-100">
                  <td className="py-1.5 text-neutral-700">{f.etiqueta}</td>
                  <td className="py-1.5 text-right tabular-nums text-neutral-600">{f.beacons.toLocaleString('es-CL')}</td>
                  <td className="py-1.5 text-right tabular-nums text-neutral-600">{f.fichas.toLocaleString('es-CL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {agentes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Agentes con más peticiones</p>
            <ul className="space-y-1">
              {agentes.map((a) => (
                <li key={`${a.family}|${a.agent}`} className="flex justify-between gap-3 text-sm">
                  <span className="text-neutral-700 truncate">
                    {a.agent} <span className="text-neutral-500">· {ETIQUETA_FAMILIA[a.family] ?? a.family}</span>
                  </span>
                  <span className="tabular-nums text-neutral-600">{a.count.toLocaleString('es-CL')}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500 mt-2">
              «Googlebot (falso)»: dice ser Google y la comprobación por DNS dice que no lo es.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

/** Cuántos visitantes del panel interactuaron de verdad con la página. */
function InteraccionHumana({ interaction }: { interaction: Overview['interaction'] }) {
  if (!interaction?.desde) {
    return <Card title="Interacción humana"><SinDatosAun /></Card>
  }
  const pct = porcentaje(interaction.interactuaron, interaction.visitantes)
  return (
    <Card title={`Interacción humana · desde el ${fechaCorta(interaction.desde)}`}>
      <p className="text-sm text-neutral-700">
        De <strong className="tabular-nums">{interaction.visitantes.toLocaleString('es-CL')}</strong> visitantes-día,{' '}
        <strong className="tabular-nums">{interaction.interactuaron.toLocaleString('es-CL')} ({pct} %)</strong> hicieron
        scroll, tocaron, usaron el teclado o movieron el mouse con la página visible al menos 5 segundos.
      </p>
      <p className="text-xs text-neutral-500 mt-1 mb-3">
        Señal fuerte de lector, pero no prueba: un lector que abre y se va en 3 segundos no cuenta, y un robot sofisticado
        podría imitarla. Es una estimación.
      </p>
      {interaction.porPais.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <th className="py-1.5 font-medium">País</th>
              <th className="py-1.5 font-medium text-right">Visitantes-día</th>
              <th className="py-1.5 font-medium text-right">Interactuaron</th>
              <th className="py-1.5 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {interaction.porPais.map((p) => (
              <tr key={p.country} className="border-b border-neutral-100">
                <td className="py-1.5 text-neutral-700">{countryName(p.country)}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{p.visitantes.toLocaleString('es-CL')}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{p.interactuaron.toLocaleString('es-CL')}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{porcentaje(p.interactuaron, p.visitantes)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

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

const DEVICE_LABELS: Record<string, string> = {
  mobile: '📱 Móvil',
  tablet: '📲 Tablet',
  desktop: '💻 Escritorio',
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
        <title>Analytics — Admin — Impacto Indígena News</title>
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
          {/* Desde el 21-nov-2026: la estimación de lectores, al lado del bruto */}
          <EncabezadoLectores readers={data.readers} />

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

          {/* Unique visitors */}
          <div className="bg-white rounded-lg border border-neutral-200 p-4">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Visitantes únicos</p>
            <div className="flex gap-8 flex-wrap">
              <div className="flex flex-col">
                <span className="text-xs text-neutral-500">Hoy</span>
                <span className="text-2xl font-bold text-brand-800 tabular-nums">{data.uniqueVisitors.today.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-neutral-500">Ayer</span>
                <span className="text-2xl font-bold text-neutral-700 tabular-nums">{data.uniqueVisitors.yesterday.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-neutral-500">Últimos {period}d (suma diaria)</span>
                <span className="text-2xl font-bold text-neutral-700 tabular-nums">{data.uniqueVisitors.period.toLocaleString('es-CL')}</span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-3">
              Cada visitante se cuenta una vez por día, sin cookies. La suma del período no equivale a personas distintas del mes.
            </p>
          </div>

          {/* Desde el 20-nov-2026: lo que el panel no veía (docs/propuesta-analytics-bots.md) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <InteraccionHumana interaction={data.interaction} />
            <TraficoAutomatizado automated={data.automated} />
          </div>

          <DetalleLectores readers={data.readers} />

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
                {(() => {
                  const SOURCE_LABELS: Record<string, string> = {
                    newsletter: '📧 Boletín',
                    social: '🔗 Social',
                    search: '🔍 Búsqueda',
                    referral: '↗ Referido',
                    direct: '🌐 Directo',
                  }
                  // Percentages are over acquisition visits (internal navigation
                  // is excluded server-side), so they sum to ~100%.
                  const acqTotal = data.bySource.reduce((sum, x) => sum + x.count, 0)
                  return data.bySource.map((s) => {
                    const label = SOURCE_LABELS[s.source] ?? '🌐 Directo'
                    const pct = acqTotal > 0 ? Math.round((s.count / acqTotal) * 100) : 0
                    return (
                      <div key={s.source} className="flex flex-col items-center gap-1">
                        <span className="text-xs text-neutral-500">{label}</span>
                        <span className="text-2xl font-bold text-neutral-900 tabular-nums">{s.count.toLocaleString('es-CL')}</span>
                        <span className="text-xs text-neutral-400">{pct}%</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Country + device breakdown (by unique daily visitors) */}
          {((data.byCountry && data.byCountry.length > 0) || (data.byDevice && data.byDevice.length > 0)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="País (visitantes)">
                {data.byCountry.length > 0 ? (
                  <div className="space-y-0.5">
                    {data.byCountry.map((c) => (
                      <BarRow key={c.country} label={countryName(c.country)} count={c.count} max={data.byCountry[0]?.count ?? 1} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 py-4 text-center">Sin datos aún</p>
                )}
              </Card>
              <Card title="Dispositivo (visitantes)">
                {data.byDevice.length > 0 ? (
                  <div className="space-y-0.5">
                    {data.byDevice.map((d) => (
                      <BarRow key={d.device} label={DEVICE_LABELS[d.device] ?? d.device} count={d.count} max={data.byDevice[0]?.count ?? 1} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 py-4 text-center">Sin datos aún</p>
                )}
              </Card>
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
