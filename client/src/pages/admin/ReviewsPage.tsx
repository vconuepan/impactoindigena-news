import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Pagination } from '../../components/ui/Pagination'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { ReviewModeControl } from '../../components/admin/ReviewModeControl'
import { ReviewDetailPanel } from '../../components/admin/ReviewDetailPanel'
import { ReviewHoldDialog } from '../../components/admin/ReviewHoldDialog'
import { useAuth } from '../../lib/auth'
import { ApiError, type ReviewCode, type ReviewQueueItem, type ReviewState } from '../../lib/admin-api'
import { formatDate } from '../../lib/constants'
import { useBulkDecideReview, useDecideReview, useReviewQueue, useReviewVerticals } from '../../hooks/useReviews'
import { STATE_BADGE, STATE_LABEL, marcaLabel, puntajeLabel, razonLabel } from '../../lib/review-labels'

const ESTADO_LABEL: Record<ReviewState | 'all', string> = { ...STATE_LABEL, all: 'Todas' }
const PAGE_SIZE = 25

/**
 * Revisión por marca: la cola de la retención por vertical (D4, Tanda B).
 * Diseño: .plans/2026-10-04_retencion-por-vertical.md, sección 7.
 * Estado en la URL: ?marca=mapuche&estado=pending&page=2&open=<storyId>.
 */
export default function ReviewsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const verticales = useReviewVerticals()

  const marcas = verticales.data?.data ?? []
  const marcaParam = searchParams.get('marca')
  const slug = marcaParam && marcas.some((m) => m.slug === marcaParam) ? marcaParam : (marcas[0]?.slug ?? null)
  const estado = (searchParams.get('estado') as ReviewState | 'all') || 'pending'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const abierto = searchParams.get('open')

  const setParam = (cambios: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  const cola = useReviewQueue(slug, { state: estado === 'all' ? undefined : estado, page, pageSize: PAGE_SIZE })
  const decidir = useDecideReview(slug ?? '')
  const decidirMasa = useBulkDecideReview(slug ?? '')
  const maxScore = verticales.data?.bulkReleaseMaxScore ?? 1

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  useEffect(() => setSeleccion(new Set()), [slug, estado, page])

  const [retener, setRetener] = useState<{ storyIds: string[] } | null>(null)
  const [liberarMasa, setLiberarMasa] = useState(false)

  const filas = cola.data?.data ?? []
  const item = useMemo(() => filas.find((f) => f.storyId === abierto) ?? null, [filas, abierto])
  const marca = marcas.find((m) => m.slug === slug)

  const seleccionadas = filas.filter((f) => seleccion.has(f.storyId))
  const fuertes = seleccionadas.filter((f) => f.gateScore > maxScore)
  const liberarMasaBloqueado = seleccionadas.length === 0 || fuertes.length > 0

  const mensajeError = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

  const liberar = (it: ReviewQueueItem) =>
    decidir.mutate(
      { storyId: it.storyId, decision: 'release' },
      { onSuccess: () => toast('success', 'Nota liberada'), onError: (e) => toast('error', mensajeError(e, 'No se pudo liberar')) },
    )
  const reabrir = (it: ReviewQueueItem) =>
    decidir.mutate(
      { storyId: it.storyId, decision: 'reopen' },
      { onSuccess: () => toast('success', 'Decisión reabierta'), onError: (e) => toast('error', mensajeError(e, 'No se pudo reabrir')) },
    )
  const confirmarRetener = (code: ReviewCode, note: string) => {
    if (!retener) return
    const body = { decision: 'hold' as const, code, note: note || undefined }
    if (retener.storyIds.length === 1) {
      decidir.mutate(
        { storyId: retener.storyIds[0], ...body },
        {
          onSuccess: () => {
            toast('success', 'Nota retenida')
            setRetener(null)
          },
          onError: (e) => toast('error', mensajeError(e, 'No se pudo retener')),
        },
      )
    } else {
      decidirMasa.mutate(
        { storyIds: retener.storyIds, ...body },
        {
          onSuccess: (r) => {
            toast('success', `${r.updated} notas retenidas`)
            setRetener(null)
            setSeleccion(new Set())
          },
          onError: (e) => toast('error', mensajeError(e, 'No se pudo retener en masa')),
        },
      )
    }
  }
  const confirmarLiberarMasa = () =>
    decidirMasa.mutate(
      { storyIds: seleccionadas.map((f) => f.storyId), decision: 'release' },
      {
        onSuccess: (r) => {
          toast('success', `${r.updated} notas liberadas`)
          setLiberarMasa(false)
          setSeleccion(new Set())
        },
        onError: (e) => {
          toast('error', mensajeError(e, 'No se pudo liberar en masa'))
          setLiberarMasa(false)
        },
      },
    )

  const toggleTodas = () =>
    setSeleccion(seleccion.size === filas.length ? new Set() : new Set(filas.map((f) => f.storyId)))

  const chip = (activo: boolean) =>
    `rounded-full border px-2.5 py-1 ${activo ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`

  return (
    <>
      <Helmet>
        <title>Revisión por marca — Admin</title>
      </Helmet>

      <PageHeader
        title="Revisión por marca"
        description="Lo que el gate retuvo en cada marca. Liberar lo que puede verse; retener lo sensible o lo que no es de esta marca."
      />

      {verticales.isLoading ? (
        <LoadingSpinner />
      ) : verticales.isError ? (
        <ErrorState message="No se pudo cargar la revisión por marca" onRetry={() => verticales.refetch()} />
      ) : marcas.length === 0 ? (
        <EmptyState
          title="Ninguna marca está en revisión"
          description="Una marca entra en revisión cuando un administrador la pasa a modo sombra o aplicar."
        />
      ) : (
        <div className="space-y-4">
          <div role="tablist" aria-label="Marcas en revisión" className="flex gap-1 border-b border-neutral-200">
            {marcas.map((m) => {
              const activa = m.slug === slug
              return (
                <button
                  key={m.slug}
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setParam({ marca: m.slug, page: null, open: null })}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    activa ? 'border-brand-700 text-brand-800' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {marcaLabel(m.slug)}
                  <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{m.stats.byState.pending}</span>
                  {m.stats.queueAlert && (
                    <span className="ml-1 text-xs font-semibold text-red-600" title="La pendiente más vieja supera el plazo">!</span>
                  )}
                </button>
              )
            })}
          </div>

          {marca && slug && (
            <>
              <ReviewModeControl slug={slug} stats={marca.stats} isAdmin={user?.role === 'admin'} />

              <div className="flex flex-wrap gap-2 text-xs">
                {(['pending', 'held', 'released', 'auto'] as ReviewState[]).map((s) => (
                  <button key={s} onClick={() => setParam({ estado: s, page: null, open: null })} className={chip(estado === s)}>
                    {STATE_LABEL[s]} <strong>{marca.stats.byState[s]}</strong>
                  </button>
                ))}
                <button onClick={() => setParam({ estado: 'all', page: null, open: null })} className={chip(estado === 'all')}>
                  {ESTADO_LABEL.all}
                </button>
                {marca.stats.missingRows > 0 && (
                  <span className="self-center text-neutral-500">· {marca.stats.missingRows} sin evaluar (las toma el conciliador)</span>
                )}
                {marca.stats.oldestPendingHours !== null && (
                  <span className={`self-center ${marca.stats.queueAlert ? 'font-semibold text-red-600' : 'text-neutral-500'}`}>
                    · pendiente más vieja: {marca.stats.oldestPendingHours} h
                  </span>
                )}
              </div>

              {cola.isLoading ? (
                <LoadingSpinner />
              ) : cola.isError ? (
                <ErrorState message="No se pudo cargar la cola" onRetry={() => cola.refetch()} />
              ) : filas.length === 0 ? (
                <EmptyState title={`Nada ${ESTADO_LABEL[estado].toLowerCase()} en ${marcaLabel(slug)}`} />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                        <th className="w-8 px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label="Seleccionar todas"
                            checked={filas.length > 0 && seleccion.size === filas.length}
                            onChange={toggleTodas}
                          />
                        </th>
                        <th className="px-3 py-3">Nota</th>
                        <th className="px-3 py-3">Razones</th>
                        <th className="px-3 py-3">Puntaje</th>
                        <th className="px-3 py-3">Estado</th>
                        <th className="px-3 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => {
                        const p = puntajeLabel(f.gateScore)
                        const razones = f.gateReasons.filter((r) => r !== 'learning_mode')
                        return (
                          <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${f.story.title || f.story.sourceTitle}`}
                                checked={seleccion.has(f.storyId)}
                                onChange={() => {
                                  const n = new Set(seleccion)
                                  if (n.has(f.storyId)) n.delete(f.storyId)
                                  else n.add(f.storyId)
                                  setSeleccion(n)
                                }}
                              />
                            </td>
                            <td className="max-w-md px-3 py-3">
                              <button onClick={() => setParam({ open: f.storyId })} className="text-left font-medium text-neutral-900 hover:text-brand-800">
                                {f.story.title || f.story.sourceTitle}
                              </button>
                              <div className="mt-0.5 text-xs text-neutral-400">
                                {formatDate(f.story.datePublished)}
                                {f.alsoIn.length > 0 &&
                                  ` · también en: ${f.alsoIn.map((a) => `${marcaLabel(a.slug)} (${STATE_LABEL[a.reviewState].toLowerCase()})`).join(', ')}`}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex max-w-xs flex-wrap gap-1">
                                {razones.slice(0, 3).map((r) => {
                                  const l = razonLabel(r)
                                  return <Badge key={r} variant={l.variant}>{l.texto}</Badge>
                                })}
                                {razones.length > 3 && <span className="text-xs text-neutral-400">+{razones.length - 3}</span>}
                                {razones.length === 0 && f.gateSignals.length > 0 && (
                                  <span className="text-xs text-neutral-400">señales: {f.gateSignals.length}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3"><Badge variant={p.variant}>{p.texto}</Badge></td>
                            <td className="px-3 py-3"><Badge variant={STATE_BADGE[f.reviewState]}>{STATE_LABEL[f.reviewState]}</Badge></td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                {f.reviewState !== 'released' && (
                                  <Button size="sm" variant="secondary" onClick={() => liberar(f)} disabled={decidir.isPending}>Liberar</Button>
                                )}
                                {f.reviewState !== 'held' && (
                                  <Button size="sm" variant="ghost" onClick={() => setRetener({ storyIds: [f.storyId] })} disabled={decidir.isPending}>Retener</Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {cola.data && cola.data.totalPages > 1 && (
                    <div className="border-t border-neutral-200 px-3 py-2">
                      <Pagination page={page} totalPages={cola.data.totalPages} onPageChange={(p) => setParam({ page: String(p), open: null })} />
                    </div>
                  )}
                </div>
              )}

              {seleccion.size > 0 && (
                <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-white px-4 py-3 shadow-lg">
                  <span className="text-sm font-medium text-neutral-700">{seleccion.size} seleccionadas</span>
                  <span title={fuertes.length > 0 ? `${fuertes.length} con señal fuerte: se liberan de a una` : undefined}>
                    <Button size="sm" onClick={() => setLiberarMasa(true)} disabled={liberarMasaBloqueado || decidirMasa.isPending}>
                      Liberar seleccionadas
                    </Button>
                  </span>
                  <Button size="sm" variant="danger" onClick={() => setRetener({ storyIds: [...seleccion] })} disabled={decidirMasa.isPending}>
                    Retener seleccionadas
                  </Button>
                  {fuertes.length > 0 && (
                    <span className="text-xs text-neutral-500">
                      {fuertes.length} con señal fuerte (puntaje {maxScore + 1} o más): se liberan de a una.
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSeleccion(new Set())} className="ml-auto">Limpiar</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ReviewDetailPanel
        item={item}
        onClose={() => setParam({ open: null })}
        onRelease={liberar}
        onHold={(it) => setRetener({ storyIds: [it.storyId] })}
        onReopen={reabrir}
        pending={decidir.isPending}
      />

      <ReviewHoldDialog
        open={!!retener}
        count={retener?.storyIds.length ?? 0}
        loading={decidir.isPending || decidirMasa.isPending}
        onClose={() => setRetener(null)}
        onConfirm={confirmarRetener}
      />

      <ConfirmDialog
        open={liberarMasa}
        onClose={() => setLiberarMasa(false)}
        onConfirm={confirmarLiberarMasa}
        title={`Liberar ${seleccionadas.length} notas`}
        description="Pasan a verse en esta marca aunque la pases a «aplicar». Todas tienen señal débil."
        confirmLabel="Liberar"
        loading={decidirMasa.isPending}
      />
    </>
  )
}
