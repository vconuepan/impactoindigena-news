import { lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import { useCommunities } from '../hooks/useCommunities'

// Lazy-load heavy map components so they don't bloat the main bundle
const MapWidget = lazy(() => import('../components/MapWidget'))
const CommunityMap = lazy(() => import('../components/CommunityMap'))
const NoCoordsList = lazy(() =>
  import('../components/CommunityMap').then((m) => ({ default: m.NoCoordsList }))
)

const META = {
  title: 'Mapa de pueblos indígenas de Chile | Impacto Indígena',
  description:
    'Mapa interactivo de los territorios ancestrales y ubicación de los diez pueblos indígenas reconocidos en Chile: mapuche, aymara, rapanui, atacameño, quechua, colla, diaguita, kawésqar, yagán y lafkenche.',
  url: `${SEO.siteUrl}/mapa`,
}

function MapSkeleton() {
  return (
    <div className="h-[520px] w-full rounded-xl bg-neutral-100 animate-pulse flex items-center justify-center text-neutral-400 text-sm">
      Cargando mapa…
    </div>
  )
}

export default function MapPage() {
  const { data: communities, isLoading, isError } = useCommunities()
  const puebloCount     = communities?.filter((c) => c.type === 'PUEBLO').length ?? 0
  const territorioCount = communities?.filter((c) => c.type === 'TERRITORIO').length ?? 0

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

      <StructuredData
        data={[
          buildBreadcrumbSchema([
            { name: 'Inicio', url: SEO.siteUrl },
            { name: 'Mapa de territorios' },
          ]),
        ]}
      />

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-10 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-3">Mapa interactivo</span>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight mb-3">
            Territorios indígenas de Chile
          </h1>
          <p className="text-base text-white/70 leading-relaxed max-w-xl mx-auto">
            Ubicación y territorios ancestrales de los diez pueblos indígenas reconocidos. Haz clic en cada pueblo para conocer más.
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="h-[60vh] md:h-[70vh] min-h-[400px] w-full">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full bg-neutral-100">
            <div className="text-sm text-neutral-500">Cargando mapa…</div>
          </div>
        }>
          <MapWidget />
        </Suspense>
      </div>

      {/* Legend + context */}
      <div className="page-section">
        <div className="max-w-2xl mx-auto">
          <h2 className="section-heading mt-6">Sobre este mapa</h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Los marcadores indican la ubicación aproximada del territorio histórico de cada pueblo.
            Los polígonos sombreados representan las áreas de mayor presencia ancestral documentada.
            Las fronteras mostradas corresponden a los límites políticos actuales y no implican
            reconocimiento ni renuncia a ningún reclamo territorial.
          </p>
          <p className="text-sm text-neutral-600 leading-relaxed mt-3">
            Los datos de población corresponden al Censo 2017 de Chile (INE). Las coordenadas de
            los territorios son aproximaciones basadas en fuentes históricas y etnográficas.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/guia/pueblos-indigenas-chile"
              className="text-sm font-medium text-brand-800 hover:text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Guía: Pueblos de Chile →
            </Link>
            <Link
              to="/guia/pueblo-mapuche"
              className="text-sm font-medium text-brand-800 hover:text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Guía: Pueblo Mapuche →
            </Link>
            <Link
              to="/glosario"
              className="text-sm font-medium text-brand-800 hover:text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Glosario de términos →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Dynamic communities map ────────────────────────────────────────── */}
      <div className="page-section">
        <div className="mb-6">
          <h2 className="section-heading">Comunidades en Impacto Indígena</h2>
          <p className="text-sm text-neutral-600 mt-1 leading-relaxed max-w-2xl">
            Pueblos y territorios con cobertura de noticias curadas por IA.
            {!isLoading && !isError && (
              <span className="text-neutral-400">
                {' '}— {puebloCount} pueblo{puebloCount !== 1 ? 's' : ''},{' '}
                {territorioCount} territorio{territorioCount !== 1 ? 's' : ''}.
              </span>
            )}
          </p>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block" aria-hidden="true" />
              Pueblos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
              Territorios
            </span>
          </div>
        </div>

        {isError && (
          <p className="text-neutral-400 text-sm py-8 text-center">
            Error al cargar las comunidades.
          </p>
        )}

        {(isLoading || !communities) && <MapSkeleton />}

        {!isLoading && !isError && communities && (
          <Suspense fallback={<MapSkeleton />}>
            <CommunityMap communities={communities} />
            <NoCoordsList communities={communities} />
          </Suspense>
        )}

        {!isLoading && !isError && communities && communities.length > 0 && (
          <div className="mt-4 text-right">
            <Link
              to="/comunidades"
              className="text-sm text-brand-800 hover:text-brand-700 underline underline-offset-2"
            >
              Ver lista completa →
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
