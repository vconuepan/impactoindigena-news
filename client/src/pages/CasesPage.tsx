/**
 * /casos — list of ongoing editorial cases
 */
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { publicApi } from '../lib/api'

interface CaseListItem {
  id: string
  title: string
  slug: string
  description: string | null
  imageUrl: string | null
  keywords: string[]
  storyCount: number
}

function CaseCard({ item }: { item: CaseListItem }) {
  return (
    <Link
      to={`/caso/${item.slug}`}
      className="group block bg-white border border-neutral-100 rounded-xl overflow-hidden hover:border-brand-200 hover:shadow-sm transition-colors duration-150 ease-out"
    >
      {item.imageUrl && (
        <div className="aspect-video overflow-hidden bg-neutral-100">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-out"
          />
        </div>
      )}
      <div className="p-5">
        <h2 className="text-base font-semibold text-neutral-900 group-hover:text-brand-700 transition-colors leading-snug mb-2">
          {item.title}
        </h2>
        {item.description && (
          <p className="text-sm text-neutral-500 leading-relaxed line-clamp-3 mb-3">
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {item.keywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[11px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
          <span className="text-xs text-neutral-400 tabular-nums shrink-0 ml-2">
            {item.storyCount} {item.storyCount === 1 ? 'noticia' : 'noticias'}
          </span>
        </div>
      </div>
    </Link>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-video bg-neutral-100" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-neutral-100 rounded w-3/4" />
        <div className="h-3 bg-neutral-100 rounded w-full" />
        <div className="h-3 bg-neutral-100 rounded w-2/3" />
      </div>
    </div>
  )
}

export default function CasesPage() {
  const { data, isLoading, isError } = useQuery<CaseListItem[]>({
    queryKey: ['cases'],
    queryFn: () => publicApi.cases(),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <>
      <Helmet>
        <title>Casos en curso — Voces Indígenas</title>
        <meta
          name="description"
          content="Seguimiento editorial de conflictos y situaciones de largo aliento que afectan a pueblos indígenas: litio, Wallmapu, consulta previa y más."
        />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">Casos en curso</h1>
          <p className="text-sm text-neutral-500 leading-relaxed max-w-2xl">
            Conflictos y situaciones de largo aliento que requieren seguimiento continuo.
            Cada caso agrupa todas las noticias relacionadas en una línea de tiempo.
          </p>
        </div>

        {isError && (
          <p className="text-sm text-neutral-500 py-8 text-center">
            No se pudieron cargar los casos.
          </p>
        )}

        {!isLoading && data?.length === 0 && (
          <div className="py-16 text-center text-neutral-400">
            <p className="text-sm">No hay casos activos actualmente.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : data?.map((item) => <CaseCard key={item.id} item={item} />)
          }
        </div>
      </div>
    </>
  )
}
