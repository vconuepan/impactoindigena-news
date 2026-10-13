import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useBrandStory } from '../hooks/useCommunities'
import { SEO, CommonOgTags } from '../lib/seo'

/**
 * Ficha de una nota que entró a una vertical por la marca (D5, entrega 2).
 * Vive en la vertical, sin tema ni bloque de relevancia: una multicancha en Angol
 * no puede salir rotulada con un tema indígena (diseño D5, 6.6). Lleva siempre a
 * la fuente: el título y el resumen son de la marca; la noticia, del medio.
 */
export default function BrandStoryPage() {
  const { slug = '', brandSlug = '' } = useParams<{ slug: string; brandSlug: string }>()
  const { data: nota, isLoading, isError } = useBrandStory(slug, brandSlug)

  if (isLoading) {
    return (
      <div className="page-section">
        <div className="h-7 w-2/3 bg-neutral-100 rounded animate-pulse mb-3" />
        <div className="h-4 w-full bg-neutral-100 rounded animate-pulse" />
      </div>
    )
  }

  if (isError || !nota) {
    return (
      <div className="page-section text-center">
        <h1 className="text-2xl font-bold mb-2">Nota no encontrada</h1>
        <p className="text-neutral-500 mb-6">Esta nota ya no está disponible en la vertical.</p>
        <Link to={`/comunidad/${slug}`} className="text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1">
          &larr; Volver a la vertical
        </Link>
      </div>
    )
  }

  const url = `${SEO.siteUrl}/comunidad/${slug}/n/${brandSlug}`
  const titulo = nota.title ?? nota.sourceTitle
  const fecha = nota.date ? new Date(nota.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <>
      <Helmet>
        <title>{`${titulo} — ${nota.community.name}`}</title>
        <meta name="description" content={(nota.summary ?? '').slice(0, 160)} />
        <meta property="og:title" content={titulo} />
        <meta property="og:description" content={(nota.summary ?? '').slice(0, 200)} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <link rel="canonical" href={url} />
        {CommonOgTags({})}
      </Helmet>

      <article className="page-section max-w-2xl">
        <Link
          to={`/comunidad/${slug}`}
          className="text-xs text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5 mb-3 inline-block"
        >
          &larr; {nota.community.name}
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold leading-tight">{titulo}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {nota.publisher}
          {fecha && <> · <time dateTime={nota.date ?? undefined}>{fecha}</time></>}
        </p>
        {nota.summary && <p className="mt-5 font-serif text-lg leading-relaxed text-neutral-800">{nota.summary}</p>}
        <a
          href={nota.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full border border-brand-300 px-4 py-2 text-sm text-brand-800 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Leer la nota completa en {nota.publisher}
        </a>
      </article>
    </>
  )
}
