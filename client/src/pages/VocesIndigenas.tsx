import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { publicApi } from '../lib/api'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

export default function VocesIndigenasPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-editorials'],
    queryFn: () => publicApi.editorials.list({ pageSize: 20 }),
  })

  const editorials = data?.data ?? []

  return (
    <>
      <Helmet>
        <title>Voces Indígenas con Venancio Coñuepan — {SEO.siteName}</title>
        <meta
          name="description"
          content="Editorial semanal de Venancio Coñuepan — mapuche, abogado de derechos territoriales, fundador de Voces Indígenas. Análisis de la intersección entre pueblos indígenas, territorios y la transición energética global."
        />
        <meta property="og:title" content={`Voces Indígenas — ${SEO.siteName}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/voces-indigenas`} />
        <link rel="canonical" href={`${SEO.siteUrl}/voces-indigenas`} />
        {CommonOgTags({})}
      </Helmet>
      <StructuredData
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Voces Indígenas con Venancio Coñuepan',
            description: 'Editorial semanal sobre pueblos indígenas, territorios y transición energética.',
            url: `${SEO.siteUrl}/voces-indigenas`,
            author: {
              '@type': 'Person',
              name: 'Venancio Coñuepan',
              jobTitle: 'Abogado de derechos territoriales — Fundador de Voces Indígenas',
            },
          },
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Voces Indígenas' },
          ]),
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">
            Editorial semanal
          </span>
          <h1 className="text-3xl md:text-4xl font-bold font-nexa leading-tight mb-4">
            Voces Indígenas<br />
            <span className="text-white/60 font-normal text-2xl">con Venancio Coñuepan</span>
          </h1>
          <p className="text-white/70 leading-relaxed max-w-xl">
            Mapuche. Abogado de derechos territoriales. Cinco generaciones de constructores de paz.
            Cada semana, análisis desde adentro del mundo indígena sobre los temas que definen
            el siglo XXI: territorios, minería, transición energética, dignidad.
          </p>
        </div>
      </div>

      {/* List */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        {isLoading && (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        )}

        {!isLoading && editorials.length === 0 && (
          <p className="text-neutral-500 text-center py-12">
            La primera editorial está en camino.
          </p>
        )}

        {editorials.length > 0 && (
          <ol className="space-y-8">
            {editorials.map(ed => (
              <li key={ed.id}>
                <Link
                  to={`/voces-indigenas/${ed.id}`}
                  className="group block"
                >
                  <time className="text-xs text-neutral-400 uppercase tracking-wide">
                    {ed.publishedAt
                      ? new Date(ed.publishedAt).toLocaleDateString('es-CL', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })
                      : ''}
                  </time>
                  <h2 className="mt-1 text-lg font-bold text-neutral-900 group-hover:text-brand-600 transition-colors leading-snug">
                    {ed.title}
                  </h2>
                  <span className="text-sm text-brand-600 group-hover:underline mt-1 inline-block">
                    Leer editorial →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
