/**
 * /archivo/:id — single newsletter rendered in an iframe
 */
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { publicApi } from '../lib/api'

interface NewsletterDetail {
  id: string
  title: string
  html: string
  sentAt: string | null
  storyCount: number
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Sin fecha no se escribe «del .»: medido el 2-nov-2026 en las 52 ediciones. */
export function descripcionDe(data: Pick<NewsletterDetail, 'sentAt' | 'storyCount'>): string {
  const fecha = formatDate(data.sentAt)
  return fecha
    ? `Boletín de Voces Indígenas del ${fecha}. ${data.storyCount} noticias sobre pueblos indígenas.`
    : `Boletín de Voces Indígenas. ${data.storyCount} noticias sobre pueblos indígenas.`
}

/**
 * El título de la pestaña. Desde el cambio de marca, el job titula cada edición
 * «Voces Indígenas — …», y la página le volvía a agregar « — Voces Indígenas»:
 * medido el 7-nov-2026, 18 de las 52 ediciones del archivo salían con la marca
 * dos veces. Las 34 anteriores al 4-sep se titulan «Impacto Indígena — …»,
 * porque así se enviaron, y llevan la marca del sitio al final.
 */
export function tituloDePestana(titulo: string): string {
  return /voces ind[ií]genas/i.test(titulo) ? titulo : `${titulo} — Voces Indígenas`
}

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError } = useQuery<NewsletterDetail>({
    queryKey: ['newsletter', id],
    queryFn: () => publicApi.newsletterById(id!),
    staleTime: 60 * 60 * 1000,
    enabled: !!id,
  })

  const title = data ? tituloDePestana(data.title) : 'Boletín — Voces Indígenas'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        {data && (
          <meta
            name="description"
            content={descripcionDe(data)}
          />
        )}
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          to="/archivo"
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 transition-colors mb-6"
        >
          ← Archivo de boletines
        </Link>

        {isLoading && (
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-neutral-100 rounded w-2/3" />
            <div className="h-4 bg-neutral-100 rounded w-1/3" />
            <div className="h-96 bg-neutral-50 rounded-lg mt-6" />
          </div>
        )}

        {isError && (
          <div className="py-16 text-center">
            <p className="text-neutral-500 text-sm mb-4">No se pudo cargar este boletín.</p>
            <Link to="/archivo" className="text-sm text-brand-600 hover:underline">
              Ver todos los boletines →
            </Link>
          </div>
        )}

        {data && (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-neutral-900 leading-snug">{data.title}</h1>
              {data.sentAt && (
                <p className="text-sm text-neutral-400 mt-1 capitalize">{formatDate(data.sentAt)}</p>
              )}
            </div>

            {/* Render the email HTML in a sandboxed iframe */}
            {data.html ? (
              <iframe
                srcDoc={data.html}
                title={data.title}
                className="w-full rounded-lg border border-neutral-100"
                style={{ minHeight: '600px', height: '80vh' }}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <p className="text-sm text-neutral-500 py-8 text-center">
                Este boletín no tiene contenido disponible.
              </p>
            )}

            <div className="mt-8 pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Link
                to="/archivo"
                className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                ← Ver todos los boletines
              </Link>
              <Link
                to="/newsletter"
                className="inline-block px-5 py-2.5 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Suscribirse →
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}
