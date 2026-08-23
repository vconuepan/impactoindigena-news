/**
 * /fuentes — editorial source profiles
 *
 * Shows all active feeds indexed by Voces Indígenas, with quality stats
 * computed over the last 90 days: avg relevance score, story count, and
 * date of last published story.
 *
 * Sorted by avg relevance (descending). Feeds with zero recent stories
 * appear at the bottom.
 */
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { publicApi, type SourceProfile } from '../lib/api'
import { getCategoryColor } from '../lib/category-colors'
import { useTranslation } from 'react-i18next'

// Skeleton card for loading state
function SourceCardSkeleton() {
  return (
    <div className="bg-white border border-neutral-100 rounded-lg p-5 animate-pulse">
      <div className="h-4 bg-neutral-100 rounded w-2/3 mb-3" />
      <div className="h-3 bg-neutral-100 rounded w-1/3 mb-4" />
      <div className="flex gap-4">
        <div className="h-3 bg-neutral-100 rounded w-16" />
        <div className="h-3 bg-neutral-100 rounded w-20" />
      </div>
    </div>
  )
}

// Relevance bar — visual quality indicator
function RelevanceBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-neutral-400">—</span>
  const pct = Math.round((score / 10) * 100)
  const color =
    score >= 7 ? 'bg-emerald-400' :
    score >= 4 ? 'bg-amber-400' :
    'bg-neutral-300'

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-600">{score.toFixed(1)}/10</span>
    </div>
  )
}

function LanguageFlag({ lang }: { lang: string }) {
  const labels: Record<string, string> = {
    en: 'EN', es: 'ES', pt: 'PT', fr: 'FR', de: 'DE',
  }
  return (
    <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
      {labels[lang] ?? lang.toUpperCase()}
    </span>
  )
}

function SourceCard({ source }: { source: SourceProfile }) {
  const color = getCategoryColor(source.issueSlug ?? '')
  const displayName = source.displayTitle ?? source.title

  const lastPublished = source.lastPublishedAt
    ? new Date(source.lastPublishedAt).toLocaleDateString('es-CL', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null

  return (
    <div className={`bg-white border ${color.border} rounded-lg p-5 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-neutral-800 hover:text-brand-700 transition-colors leading-tight"
            >
              {displayName}
            </a>
          ) : (
            <span className="text-sm font-semibold text-neutral-800 leading-tight">{displayName}</span>
          )}
          {source.issueName && (
            <p className={`text-xs mt-0.5 ${color.dot} font-medium`}>{source.issueName}</p>
          )}
        </div>
        <LanguageFlag lang={source.language} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Relevancia</span>
          <RelevanceBar score={source.avgRelevance} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Noticias (90d)</span>
          <span className="text-xs tabular-nums text-neutral-600 font-medium">{source.storyCount}</span>
        </div>
        {lastPublished && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Última</span>
            <span className="text-xs text-neutral-500">{lastPublished}</span>
          </div>
        )}
      </div>

      {/* Region */}
      {source.regionLabel && (
        <p className="text-[11px] text-neutral-400">{source.regionLabel}</p>
      )}
    </div>
  )
}

export default function SourcesPage() {
  const { i18n } = useTranslation()
  const lang = i18n.language

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sourceProfiles'],
    queryFn: () => publicApi.sourceProfiles(),
    staleTime: 2 * 60 * 60 * 1000,
  })

  const title = lang === 'es' ? 'Nuestras fuentes — Voces Indígenas' : 'Our sources — Voces Indígenas'
  const heading = lang === 'es' ? 'Nuestras fuentes' : 'Our sources'
  const subtitle = lang === 'es'
    ? 'Indexamos medios especializados y organismos internacionales que cubren derechos, territorios y culturas indígenas. La relevancia promedio refleja qué tan frecuente y pertinentemente cubre cada fuente estos temas.'
    : 'We index specialized media and international bodies covering indigenous rights, territories, and cultures. The average relevance reflects how frequently and relevantly each source covers these topics.'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta
          name="description"
          content={lang === 'es'
            ? 'Conoce los medios y organismos que Voces Indígenas monitorea: relevancia editorial, cobertura temática y actividad reciente.'
            : 'Explore the media outlets and organizations monitored by Voces Indígenas: editorial relevance, thematic coverage, and recent activity.'}
        />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">{heading}</h1>
          <p className="text-sm text-neutral-500 leading-relaxed max-w-2xl">{subtitle}</p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-8 p-4 bg-neutral-50 rounded-lg text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <div className="w-8 h-1.5 bg-emerald-400 rounded-full" />
            <span>{lang === 'es' ? 'Alta relevancia (7-10)' : 'High relevance (7-10)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1.5 bg-amber-400 rounded-full" />
            <span>{lang === 'es' ? 'Relevancia media (4-6)' : 'Medium relevance (4-6)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1.5 bg-neutral-300 rounded-full" />
            <span>{lang === 'es' ? 'Baja o sin datos' : 'Low or no data'}</span>
          </div>
        </div>

        {/* Grid */}
        {isError && (
          <p className="text-sm text-neutral-500 py-8 text-center">
            {lang === 'es' ? 'No se pudieron cargar las fuentes.' : 'Could not load sources.'}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => <SourceCardSkeleton key={i} />)
            : data?.map((source) => <SourceCard key={source.id} source={source} />)
          }
        </div>

        {/* Count */}
        {data && (
          <p className="mt-8 text-xs text-neutral-400 text-center">
            {lang === 'es'
              ? `${data.length} fuentes activas monitoreadas`
              : `${data.length} active sources monitored`}
          </p>
        )}
      </div>
    </>
  )
}
