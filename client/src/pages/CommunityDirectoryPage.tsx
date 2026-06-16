import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useCommunities } from '../hooks/useCommunities'
import { SEO, CommonOgTags } from '../lib/seo'
import { communityDotColor } from '../lib/category-colors'
import type { Community } from '@shared/types'

function CommunityCard({ community }: { community: Community }) {
  return (
    <Link
      to={`/comunidad/${community.slug}`}
      className="group block bg-white border border-neutral-200 rounded-lg p-5 hover:border-brand-300 hover:shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 w-3 h-3 rounded-full shrink-0 ${communityDotColor(community.type)}`}
          aria-hidden="true"
        />
        <div>
          <h2 className="font-bold text-neutral-900 group-hover:text-brand-800 transition-colors">
            {community.name}
          </h2>
          {community.region && (
            <p className="text-xs text-neutral-400 mt-0.5">{community.region}</p>
          )}
          <p className="text-sm text-neutral-600 mt-2 line-clamp-2">{community.description}</p>
          <span className="inline-block mt-3 text-xs font-semibold text-brand-800 group-hover:underline">
            Ver noticias &rarr;
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function CommunityDirectoryPage() {
  const { data: communities, isLoading, isError } = useCommunities()

  const pueblos    = communities?.filter((c) => c.type === 'PUEBLO') ?? []
  const territorios = communities?.filter((c) => c.type === 'TERRITORIO') ?? []
  const causas     = communities?.filter((c) => c.type === 'CAUSA') ?? []

  return (
    <>
      <Helmet>
        <title>Comunidades — {SEO.siteName}</title>
        <meta
          name="description"
          content="Noticias curadas por IA organizadas por pueblo indígena, territorio y causa temática."
        />
        <meta property="og:title" content={`Comunidades — ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Noticias relevantes para pueblos, territorios y causas: Mapuche, Aymara, Amazonía, Andes, clima, derechos, paz."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/comunidades`} />
        <link rel="canonical" href={`${SEO.siteUrl}/comunidades`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section-wide">
        <header className="mb-8">
          <h1 className="page-title">Comunidades</h1>
          <p className="text-neutral-500 mt-2 max-w-xl text-center mx-auto">
            Noticias curadas por IA organizadas por pueblo indígena, territorio y causa temática.
            Sin login, sin algoritmo personalizado — solo lo que es relevante para cada comunidad.
          </p>
          <div className="flex items-center justify-center gap-5 mt-4 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block" />Pueblos</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Territorios</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />Causas</span>
          </div>
          <div className="flex justify-center mt-5">
            <Link
              to="/mapa"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path fillRule="evenodd" d="M8.157 2.175a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.27v10.57a1.5 1.5 0 0 0 2.074 1.386l3.51-1.452 4.26 1.763a1.5 1.5 0 0 0 1.148 0l4.083-1.69A1.5 1.5 0 0 0 18 14.73V4.16a1.5 1.5 0 0 0-2.073-1.386l-3.51 1.452-4.26-1.763ZM7.5 4.695v9.886L6 14.026V4.14l1.5.555Zm2.5 10.609V5.304L12 5.86v9.885L10 15.304Zm4.5-10.57v9.886l-1.5-.555V4.14l1.5.555Z" clipRule="evenodd" />
              </svg>
              Ver en mapa
            </Link>
          </div>
        </header>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-32 bg-neutral-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-neutral-500 py-8 text-center">
            Error al cargar las comunidades. Intenta de nuevo.
          </p>
        )}

        {!isLoading && !isError && communities && (
          <>
            {pueblos.length > 0 && (
              <section className="mb-10">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block" aria-hidden="true" />
                  Pueblos
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pueblos.map((c) => (
                    <CommunityCard key={c.slug} community={c} />
                  ))}
                </div>
              </section>
            )}

            {territorios.length > 0 && (
              <section className="mb-10">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
                  Territorios
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {territorios.map((c) => (
                    <CommunityCard key={c.slug} community={c} />
                  ))}
                </div>
              </section>
            )}

            {causas.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" aria-hidden="true" />
                  Causas
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {causas.map((c) => (
                    <CommunityCard key={c.slug} community={c} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
