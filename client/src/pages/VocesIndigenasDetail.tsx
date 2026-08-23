import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { publicApi } from '../lib/api'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

export default function VocesIndigenasDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: editorial, isLoading, error } = useQuery({
    queryKey: ['public-editorial', id],
    queryFn: () => publicApi.editorials.get(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !editorial) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <p className="text-neutral-500">Editorial no encontrada.</p>
        <Link to="/voces-indigenas" className="text-brand-600 hover:underline mt-4 inline-block">
          ← Volver a Voces Indígenas
        </Link>
      </div>
    )
  }

  const publishedDate = editorial.publishedAt
    ? new Date(editorial.publishedAt).toLocaleDateString('es-CL', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''

  // Split content into paragraphs for rendering
  const paragraphs = editorial.content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  // Last paragraph is the signature
  const signature = paragraphs[paragraphs.length - 1] ?? ''
  const bodyParagraphs = paragraphs.slice(0, -1)

  return (
    <>
      <Helmet>
        <title>{editorial.title} — Voces Indígenas — {SEO.siteName}</title>
        <meta
          name="description"
          content={bodyParagraphs[0]?.slice(0, 160) ?? 'Editorial semanal de Venancio Coñuepan.'}
        />
        <meta property="og:title" content={editorial.title} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${SEO.siteUrl}/voces-indigenas/${editorial.id}`} />
        <link rel="canonical" href={`${SEO.siteUrl}/voces-indigenas/${editorial.id}`} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: editorial.title,
            datePublished: editorial.publishedAt,
            author: {
              '@type': 'Person',
              name: 'Venancio Coñuepan',
              jobTitle: 'Abogado de derechos territoriales — Fundador de Voces Indígenas',
            },
            publisher: {
              '@type': 'Organization',
              name: SEO.siteName,
              url: SEO.siteUrl,
            },
            url: `${SEO.siteUrl}/voces-indigenas/${editorial.id}`,
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Voces Indígenas', url: `${SEO.siteUrl}/voces-indigenas` },
            { name: editorial.title },
          ]),
        ]}
      />

      <article className="max-w-2xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link
          to="/voces-indigenas"
          className="text-sm text-neutral-500 hover:text-neutral-700 mb-8 inline-block"
        >
          ← Voces Indígenas con Venancio Coñuepan
        </Link>

        {/* Meta */}
        <div className="mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Editorial semanal
          </span>
        </div>
        {publishedDate && (
          <time className="text-sm text-neutral-400">{publishedDate}</time>
        )}

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold font-nexa leading-tight mt-3 mb-8 text-neutral-900">
          {editorial.title}
        </h1>

        {/* Body */}
        <div className="space-y-5 text-base text-neutral-800 leading-relaxed">
          {bodyParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* Signature */}
        {signature && (
          <p className="mt-8 pt-6 border-t border-neutral-200 text-sm text-neutral-500 italic">
            {signature}
          </p>
        )}

        {/* Footer nav */}
        <div className="mt-12 pt-6 border-t border-neutral-100">
          <Link
            to="/voces-indigenas"
            className="text-sm text-brand-600 hover:underline"
          >
            ← Ver todas las editoriales
          </Link>
        </div>
      </article>
    </>
  )
}
