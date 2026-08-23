/**
 * /archivo — public archive of published weekly newsletters
 */
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { publicApi } from '../lib/api'

interface NewsletterListItem {
  id: string
  title: string
  storyCount: number
  sentAt: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function NewsletterRow({ item }: { item: NewsletterListItem }) {
  return (
    <Link
      to={`/archivo/${item.id}`}
      className="flex items-center justify-between gap-4 py-4 border-b border-neutral-100 group hover:bg-neutral-50 -mx-4 px-4 transition-colors rounded"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-900 group-hover:text-brand-700 transition-colors leading-snug">
          {item.title}
        </p>
        {item.sentAt && (
          <p className="text-xs text-neutral-400 mt-0.5">{formatDate(item.sentAt)}</p>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {item.storyCount > 0 && (
          <span className="text-xs text-neutral-400 tabular-nums">
            {item.storyCount} {item.storyCount === 1 ? 'noticia' : 'noticias'}
          </span>
        )}
        <span className="text-xs text-brand-600 font-medium group-hover:underline">Leer →</span>
      </div>
    </Link>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-neutral-100 animate-pulse">
      <div className="min-w-0 flex-1">
        <div className="h-4 bg-neutral-100 rounded w-3/4 mb-1.5" />
        <div className="h-3 bg-neutral-100 rounded w-1/4" />
      </div>
      <div className="h-3 bg-neutral-100 rounded w-12 shrink-0" />
    </div>
  )
}

export default function NewsletterArchivePage() {
  const { data, isLoading, isError } = useQuery<NewsletterListItem[]>({
    queryKey: ['newsletter-archive'],
    queryFn: () => publicApi.newsletterArchive(),
    staleTime: 10 * 60 * 1000,
  })

  return (
    <>
      <Helmet>
        <title>Archivo de boletines — Voces Indígenas</title>
        <meta
          name="description"
          content="Todos los boletines semanales de Voces Indígenas. Noticias sobre pueblos indígenas, territorios y derechos."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Archivo de boletines</h1>
          <p className="text-sm text-neutral-500">
            Boletín semanal con las noticias más relevantes para los pueblos indígenas, curadas por IA.
          </p>
        </div>

        {isError && (
          <p className="text-sm text-neutral-500 py-8 text-center">
            No se pudo cargar el archivo.
          </p>
        )}

        <div>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            : !data || data.length === 0
              ? (
                <div className="py-16 text-center">
                  <p className="text-neutral-500 text-sm">No hay boletines publicados aún.</p>
                  <Link to="/newsletter" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
                    Suscribirse al boletín →
                  </Link>
                </div>
              )
              : data.map((item) => <NewsletterRow key={item.id} item={item} />)
          }
        </div>

        {data && data.length > 0 && (
          <div className="mt-10 pt-6 border-t border-neutral-100 text-center">
            <p className="text-xs text-neutral-400 mb-3">¿Quieres recibirlo cada semana?</p>
            <Link
              to="/newsletter"
              className="inline-block px-5 py-2.5 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Suscribirse al boletín
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
