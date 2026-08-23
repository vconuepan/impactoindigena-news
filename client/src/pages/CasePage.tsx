/**
 * /caso/:slug — ongoing case detail with chronological story timeline
 */
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { publicApi } from '../lib/api'
import { getCategoryColor } from '../lib/category-colors'

interface CaseStory {
  slug: string | null
  title: string | null
  imageUrl: string | null
  datePublished: string | null
  issueName: string | null
  issueSlug: string | null
  source: string | null
}

interface CaseDetail {
  id: string
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  keywords: string[]
  stories: CaseStory[]
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function StoryItem({ story }: { story: CaseStory }) {
  const color = getCategoryColor(story.issueSlug ?? '')

  if (!story.slug) return null

  return (
    <Link
      to={`/stories/${story.slug}`}
      className="group flex gap-4 py-4 border-b border-neutral-100 hover:bg-neutral-50 -mx-4 px-4 transition-colors rounded"
    >
      {story.imageUrl && (
        <img
          src={story.imageUrl}
          alt=""
          className="w-16 h-16 object-cover rounded shrink-0 bg-neutral-100"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 group-hover:text-brand-700 transition-colors leading-snug line-clamp-2 mb-1">
          {story.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {story.issueName && (
            <span className={`text-[11px] font-medium ${color.dot}`}>{story.issueName}</span>
          )}
          {story.source && (
            <span className="text-[11px] text-neutral-400">{story.source}</span>
          )}
          {story.datePublished && (
            <span className="text-[11px] text-neutral-400">{formatDate(story.datePublished)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function CasePage() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isLoading, isError } = useQuery<CaseDetail>({
    queryKey: ['case', slug],
    queryFn: () => publicApi.caseBySlug(slug!),
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  })

  const title = data ? `${data.title} — Voces Indígenas` : 'Caso en curso — Voces Indígenas'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        {data?.description && (
          <meta name="description" content={data.description} />
        )}
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          to="/casos"
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 transition-colors mb-6"
        >
          ← Casos en curso
        </Link>

        {isLoading && (
          <div className="animate-pulse space-y-4">
            <div className="h-7 bg-neutral-100 rounded w-2/3" />
            <div className="h-4 bg-neutral-100 rounded w-full" />
            <div className="h-4 bg-neutral-100 rounded w-4/5" />
            <div className="mt-8 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 py-4 border-b border-neutral-100">
                  <div className="w-16 h-16 bg-neutral-100 rounded shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-neutral-100 rounded w-full" />
                    <div className="h-3 bg-neutral-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="py-16 text-center">
            <p className="text-neutral-500 text-sm mb-4">No se pudo cargar este caso.</p>
            <Link to="/casos" className="text-sm text-brand-600 hover:underline">
              Ver todos los casos →
            </Link>
          </div>
        )}

        {data && (
          <>
            {data.imageUrl && (
              <div className="aspect-video overflow-hidden rounded-xl bg-neutral-100 mb-6">
                <img src={data.imageUrl} alt={data.title} className="w-full h-full object-cover" />
              </div>
            )}

            <h1 className="text-2xl font-bold text-neutral-900 mb-3">{data.title}</h1>

            {data.description && (
              <p className="text-sm text-neutral-600 leading-relaxed mb-4">{data.description}</p>
            )}

            <div className="flex flex-wrap gap-1.5 mb-8">
              {data.keywords.map((kw) => (
                <span key={kw} className="text-xs bg-neutral-100 text-neutral-500 px-2.5 py-1 rounded-full">
                  {kw}
                </span>
              ))}
            </div>

            {/* Stories */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                {data.stories.length} {data.stories.length === 1 ? 'noticia' : 'noticias'}
              </h2>
              <span className="text-xs text-neutral-400">Más reciente primero</span>
            </div>

            {data.stories.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">
                No hay noticias publicadas para este caso aún.
              </p>
            ) : (
              <div>
                {data.stories.map((story, i) => (
                  <StoryItem key={story.slug ?? i} story={story} />
                ))}
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-neutral-100">
              <Link
                to="/casos"
                className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                ← Ver todos los casos en curso
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}
