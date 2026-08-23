/**
 * /por-que-importa — editorial contrast page
 *
 * Shows this week's top Voces Indígenas stories (highest AI relevance score)
 * alongside what Google News Latinoamérica is covering. The contrast makes
 * the platform's value proposition visible without needing a tagline.
 */
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../lib/api'
import type { ContrastOurItem, ContrastMainstreamItem } from '../lib/api'
import { getCategoryColor } from '../lib/category-colors'
import { formatDate } from '../lib/format'
import { SEO, CommonOgTags } from '../lib/seo'

const META = {
  title: '¿Por qué importa? — Voces Indígenas vs. el mainstream',
  description:
    'Lo que los medios masivos no cubren esta semana: las noticias más relevantes para los pueblos indígenas, curadas por IA.',
  url: `${SEO.siteUrl}/por-que-importa`,
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ColumnSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-3 bg-neutral-200 rounded w-16 mb-2" />
          <div className="h-4 bg-neutral-200 rounded w-full mb-1" />
          <div className="h-4 bg-neutral-200 rounded w-3/4" />
        </div>
      ))}
    </div>
  )
}

// ─── Our story card ───────────────────────────────────────────────────────────

function OurCard({ story }: { story: ContrastOurItem }) {
  const colors = story.issueSlug ? getCategoryColor(story.issueSlug) : null

  const inner = (
    <>
      {story.issueName && (
        <span
          className="text-[10px] font-bold uppercase tracking-widest block mb-0.5"
          style={{ color: colors?.hex ?? '#a1a1aa' }}
        >
          {story.issueName}
        </span>
      )}
      <p className="text-sm font-semibold text-neutral-900 leading-snug group-hover:text-brand-700 transition-colors">
        {story.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-neutral-500">
        <span>{story.sourceTitle}</span>
        {story.datePublished && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatDate(story.datePublished)}</span>
          </>
        )}
        {story.relevanceScore !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span
              className="font-semibold"
              style={{ color: colors?.hex ?? '#a1a1aa' }}
              title="Puntuación de relevancia IA"
            >
              {story.relevanceScore}/10
            </span>
          </>
        )}
      </div>
    </>
  )

  return story.slug ? (
    <Link
      to={`/stories/${story.slug}`}
      className="group block py-3 border-b border-neutral-100 last:border-0"
    >
      {inner}
    </Link>
  ) : (
    <div className="py-3 border-b border-neutral-100 last:border-0">{inner}</div>
  )
}

// ─── Mainstream story card ────────────────────────────────────────────────────

function MainstreamCard({ item }: { item: ContrastMainstreamItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block py-3 border-b border-neutral-100 last:border-0"
    >
      <p className="text-sm text-neutral-700 leading-snug group-hover:text-neutral-900 transition-colors line-clamp-3">
        {item.title}
      </p>
      {item.datePublished && (
        <span className="text-xs text-neutral-400 mt-1 block">
          {formatDate(item.datePublished)}
        </span>
      )}
    </a>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhyItMattersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contrast'],
    queryFn: () => publicApi.contrast(),
    staleTime: 30 * 60 * 1000,
  })

  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={META.url} />
        <link rel="canonical" href={META.url} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section py-12">
        {/* Header */}
        <div className="max-w-2xl mb-10">
          <h1 className="page-title mb-3">¿Por qué importa?</h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            Esta semana, los medios masivos en Latinoamérica cubrieron esto. Mientras tanto,
            la IA de Voces Indígenas identificó estas noticias como las más relevantes para
            los pueblos indígenas, sus territorios y sus derechos.
          </p>
          <p className="text-sm text-neutral-400 mt-2">
            Actualizado cada 30 minutos.{' '}
            {data?.generatedAt && (
              <span>Última actualización: {formatDate(data.generatedAt)}.</span>
            )}
          </p>
        </div>

        {/* Two-column comparison */}
        <div className="grid md:grid-cols-2 gap-0 md:gap-10">
          {/* Our column */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" aria-hidden="true" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-brand-700">
                Voces Indígenas esta semana
              </h2>
            </div>

            {isLoading && <ColumnSkeleton />}
            {isError && (
              <p className="text-sm text-neutral-400">No se pudo cargar el contenido.</p>
            )}
            {data && data.our.length === 0 && (
              <p className="text-sm text-neutral-400">Sin historias esta semana aún.</p>
            )}
            {data && data.our.map((story) => (
              <OurCard key={story.id} story={story} />
            ))}
          </div>

          {/* Divider — mobile only */}
          <div className="block md:hidden my-8 border-t border-neutral-200" aria-hidden="true" />

          {/* Mainstream column */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-neutral-400 shrink-0" aria-hidden="true" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Medios masivos — Google News
              </h2>
            </div>

            {isLoading && <ColumnSkeleton />}
            {data && data.mainstream.length === 0 && (
              <p className="text-sm text-neutral-400">
                Sin datos de medios masivos disponibles.
              </p>
            )}
            {data && data.mainstream.map((item, i) => (
              <MainstreamCard key={i} item={item} />
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
          <p className="text-sm text-neutral-500 mb-4">
            ¿Quieres este contraste en tu sitio web?
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/widgets"
              className="text-sm font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Widget para tu sitio →
            </Link>
            <Link
              to="/free-api"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-800 underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              API gratuita →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
