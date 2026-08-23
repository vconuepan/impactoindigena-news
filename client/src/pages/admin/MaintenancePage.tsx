import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminApi, type FeedStatusItem } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'

interface JobResult {
  ok?: boolean
  found?: boolean
  total?: number
  updated?: number
  skipped?: number
  deleted?: number
  message?: string
  error?: string
  slug?: string
  id?: string
  status?: string
  title?: string
  datePublished?: string
  clusterId?: string
  prevStatus?: string
  newStatus?: string
}

function JobCard({
  title,
  description,
  buttonLabel,
  onRun,
  isPending,
  result,
}: {
  title: string
  description: string
  buttonLabel: string
  onRun: () => void
  isPending: boolean
  result: JobResult | null
}) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 mb-1">{title}</h3>
          <p className="text-sm text-neutral-500">{description}</p>
          {result && (
            <div className={`mt-3 rounded-md px-3 py-2 text-sm ${result.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {result.error ? (
                <span>Error: {result.error}</span>
              ) : (
                <span>
                  {result.message
                    ? result.message
                    : result.total !== undefined
                    ? `Total: ${result.total}${result.updated !== undefined ? `, actualizados: ${result.updated}` : ''}${result.skipped !== undefined ? `, omitidos: ${result.skipped}` : ''}`
                    : JSON.stringify(result)}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRun}
          loading={isPending}
          className="shrink-0"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}

export default function MaintenancePage() {
  const { toast } = useToast()

  const [backfillImagesResult, setBackfillImagesResult] = useState<JobResult | null>(null)
  const [backfillTitlesResult, setBackfillTitlesResult] = useState<JobResult | null>(null)
  const [storySlug, setStorySlug] = useState('')
  const [storyStatusResult, setStoryStatusResult] = useState<JobResult | null>(null)
  const [republishResult, setRepublishResult] = useState<JobResult | null>(null)

  // Limpieza y diagnóstico
  const [purgeTrashedResult, setPurgeTrashedResult] = useState<JobResult | null>(null)
  const [backfillSlugsResult, setBackfillSlugsResult] = useState<JobResult | null>(null)
  const [feedIdInput, setFeedIdInput] = useState('')
  const [backfillFeedResult, setBackfillFeedResult] = useState<JobResult | null>(null)
  const [loadFeedStatus, setLoadFeedStatus] = useState(false)

  const backfillImages = useMutation({
    mutationFn: () => adminApi.maintenance.backfillImages(),
    onSuccess: (data) => {
      setBackfillImagesResult(data)
      toast('success', `Imágenes: ${data.updated} actualizadas, ${data.skipped} omitidas`)
    },
    onError: (err: Error) => {
      setBackfillImagesResult({ error: err.message })
      toast('error', 'Error al actualizar imágenes')
    },
  })

  const backfillTitles = useMutation({
    mutationFn: () => adminApi.maintenance.backfillTitles(),
    onSuccess: (data) => {
      setBackfillTitlesResult(data)
      toast('success', `Reescritura iniciada: ${data.total} historias en cola`)
    },
    onError: (err: Error) => {
      setBackfillTitlesResult({ error: err.message })
      toast('error', 'Error al iniciar reescritura')
    },
  })

  const checkStory = useMutation({
    mutationFn: () => adminApi.maintenance.storyStatus(storySlug),
    onSuccess: (data) => setStoryStatusResult(data),
    onError: (err: Error) => setStoryStatusResult({ error: err.message }),
  })

  const purgeTrashed = useMutation({
    mutationFn: () => adminApi.maintenance.purgeTrashed(),
    onSuccess: (data) => {
      setPurgeTrashedResult(data)
      toast('success', `${data.deleted} historias eliminadas permanentemente`)
    },
    onError: (err: Error) => {
      setPurgeTrashedResult({ error: err.message })
      toast('error', 'Error al purgar papelera')
    },
  })

  const backfillSlugs = useMutation({
    mutationFn: () => adminApi.maintenance.backfillSlugs(),
    onSuccess: (data) => {
      setBackfillSlugsResult(data)
      toast('success', `Slugs: ${data.updated} generados, ${data.skipped} omitidos`)
    },
    onError: (err: Error) => {
      setBackfillSlugsResult({ error: err.message })
      toast('error', 'Error al generar slugs')
    },
  })

  const backfillFeed = useMutation({
    mutationFn: () => adminApi.maintenance.backfillImagesByFeed(feedIdInput.trim()),
    onSuccess: (data) => {
      setBackfillFeedResult(data)
      toast('success', `${data.total} historias en cola`)
    },
    onError: (err: Error) => {
      setBackfillFeedResult({ error: err.message })
      toast('error', 'Error al iniciar extracción')
    },
  })

  const feedStatusQuery = useQuery({
    queryKey: ['maintenance-feed-status'],
    queryFn: () => adminApi.maintenance.feedStatus(),
    enabled: loadFeedStatus,
    staleTime: 60_000,
  })

  const republishStory = useMutation({
    mutationFn: () => adminApi.maintenance.republishSlug(storySlug),
    onSuccess: (data) => {
      setRepublishResult(data)
      toast('success', `Historia republicada: ${data.slug}`)
    },
    onError: (err: Error) => {
      setRepublishResult({ error: err.message })
      toast('error', 'Error al republicar')
    },
  })

  return (
    <>
      <Helmet>
        <title>Mantenimiento — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader title="Mantenimiento" description="Trabajos de limpieza y corrección de datos" />

      <div className="space-y-6">

        {/* Batch jobs */}
        <Card title="Trabajos en lote">
          <div className="space-y-3">
            <JobCard
              title="Rellenar imágenes faltantes"
              description="Extrae og:image de artículos fuente para historias publicadas sin imagen. Corre de forma sincrónica — puede tardar varios minutos."
              buttonLabel="Ejecutar"
              onRun={() => backfillImages.mutate()}
              isPending={backfillImages.isPending}
              result={backfillImagesResult}
            />
            <JobCard
              title="Reescribir títulos (historias antiguas)"
              description="Reescribe títulos y etiquetas en tiempo pasado para historias publicadas hace más de 3 meses. Corre en background — revisa los logs del servidor para ver el progreso."
              buttonLabel="Iniciar"
              onRun={() => backfillTitles.mutate()}
              isPending={backfillTitles.isPending}
              result={backfillTitlesResult}
            />
          </div>
        </Card>

        {/* Story by slug */}
        <Card title="Herramientas por slug">
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="story-slug">
              Slug de la historia
            </label>
            <input
              id="story-slug"
              type="text"
              value={storySlug}
              onChange={(e) => {
                setStorySlug(e.target.value)
                setStoryStatusResult(null)
                setRepublishResult(null)
              }}
              placeholder="ej. temucuicui-denuncia-demora-en-huracan"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => checkStory.mutate()}
              disabled={!storySlug.trim()}
              loading={checkStory.isPending}
            >
              Verificar estado
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => republishStory.mutate()}
              disabled={!storySlug.trim()}
              loading={republishStory.isPending}
            >
              Forzar publicación
            </Button>
          </div>

          {storyStatusResult && (
            <div className={`mt-4 rounded-md px-3 py-2 text-sm font-mono ${storyStatusResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-neutral-50 text-neutral-700 border border-neutral-200'}`}>
              {JSON.stringify(storyStatusResult, null, 2)}
            </div>
          )}
          {republishResult && !storyStatusResult && (
            <div className={`mt-4 rounded-md px-3 py-2 text-sm font-mono ${republishResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {JSON.stringify(republishResult, null, 2)}
            </div>
          )}
        </Card>

        {/* Limpieza y diagnóstico */}
        <Card title="Limpieza y diagnóstico">
          <div className="space-y-3">
            <JobCard
              title="Purgar papelera"
              description="Elimina permanentemente todas las historias con estado 'trashed'. Esta acción no se puede deshacer."
              buttonLabel="Purgar"
              onRun={() => purgeTrashed.mutate()}
              isPending={purgeTrashed.isPending}
              result={purgeTrashedResult}
            />
            <JobCard
              title="Backfill de slugs faltantes"
              description="Genera slugs para historias publicadas que no tienen uno (máx. 500 por vez). Los slugs se derivan del título."
              buttonLabel="Ejecutar"
              onRun={() => backfillSlugs.mutate()}
              isPending={backfillSlugs.isPending}
              result={backfillSlugsResult}
            />
          </div>

          {/* Re-extraer imágenes por feed */}
          <div className="mt-3 bg-white rounded-lg border border-neutral-200 p-5">
            <h3 className="font-semibold text-neutral-900 mb-1">Re-extraer imágenes por feed</h3>
            <p className="text-sm text-neutral-500 mb-3">
              Vuelve a extraer og:image de las historias publicadas sin imagen de un feed específico. Corre en background.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={feedIdInput}
                onChange={(e) => { setFeedIdInput(e.target.value); setBackfillFeedResult(null) }}
                placeholder="Feed ID (UUID)"
                className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => backfillFeed.mutate()}
                disabled={!feedIdInput.trim()}
                loading={backfillFeed.isPending}
                className="shrink-0"
              >
                Ejecutar
              </Button>
            </div>
            {backfillFeedResult && (
              <div className={`mt-3 rounded-md px-3 py-2 text-sm ${backfillFeedResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {backfillFeedResult.error ? `Error: ${backfillFeedResult.error}` : backfillFeedResult.message ?? JSON.stringify(backfillFeedResult)}
              </div>
            )}
          </div>

          {/* Estado de feeds */}
          <div className="mt-3 bg-white rounded-lg border border-neutral-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-neutral-900 mb-1">Estado de feeds activos</h3>
                <p className="text-sm text-neutral-500">Muestra el último crawl, errores y cantidad de historias por feed.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLoadFeedStatus(true)}
                loading={feedStatusQuery.isFetching}
                className="shrink-0"
              >
                Cargar
              </Button>
            </div>
            {feedStatusQuery.isSuccess && feedStatusQuery.data && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="py-1.5 pr-3 font-medium">Feed</th>
                      <th className="py-1.5 pr-3 font-medium">Historias</th>
                      <th className="py-1.5 pr-3 font-medium">Último crawl</th>
                      <th className="py-1.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedStatusQuery.data.feeds.map((feed: FeedStatusItem) => (
                      <tr key={feed.id} className="border-b border-neutral-100">
                        <td className="py-1.5 pr-3 font-medium text-neutral-800 truncate max-w-[200px]" title={feed.title}>{feed.title}</td>
                        <td className="py-1.5 pr-3 text-neutral-600">{feed._count.stories}</td>
                        <td className="py-1.5 pr-3 text-neutral-500">
                          {feed.lastCrawledAt
                            ? new Date(feed.lastCrawledAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                            : '—'}
                        </td>
                        <td className="py-1.5">
                          {feed.consecutiveFailedCrawls > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                              {feed.consecutiveFailedCrawls} errores
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-neutral-400">{feedStatusQuery.data.total} feeds activos</p>
              </div>
            )}
            {feedStatusQuery.isError && (
              <div className="mt-3 text-sm text-red-600">Error al cargar estado de feeds</div>
            )}
          </div>
        </Card>

      </div>
    </>
  )
}
