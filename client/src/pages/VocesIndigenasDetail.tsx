import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { publicApi } from '../lib/api'
import { SEO, CommonOgTags } from '../lib/seo'
import StructuredData from '../components/StructuredData'
import { buildBreadcrumbSchema } from '../lib/structured-data'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

/**
 * Qué dice el recuadro «¿Cómo se hizo?» según el método declarado (plan del
 * 25-oct-2026, B6: indicadores 2, 4 y 5 del Trust Project como diseño). El texto
 * dice la verdad de cada caso; una editorial sin método es anterior al 26-oct-2026.
 */
export function textoDelMetodo(method: string, authorName: string): string | null {
  const autor = authorName || 'el autor'
  switch (method) {
    case 'humana':
      return `${autor} escribió esta editorial. Un modelo de lenguaje pudo ayudar a ordenar el borrador; el texto, las ideas y las fuentes son suyos.`
    case 'ia_revisada':
      return `${autor} escribió las notas con el hecho, su lectura y su propuesta. Un modelo de lenguaje las ordenó en este texto, y ${autor} lo leyó, lo corrigió y decidió publicarlo. Nada que no esté en sus notas entra en la editorial.`
    default:
      return null
  }
}

const URL_RE = /(https?:\/\/[^\s)]+)/g

/** Cada línea de las fuentes, con sus enlaces como enlaces. */
function Fuente({ linea }: { linea: string }) {
  const partes = linea.split(URL_RE)
  return (
    <li>
      {partes.map((p, i) =>
        URL_RE.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-brand-800 underline break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </li>
  )
}

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

  const paragraphs = editorial.content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  // La firma vive en `authorName` desde el 26-oct-2026. Una editorial anterior
  // la traía como último párrafo («— Venancio…»); se respeta.
  const firmaEnTexto = !editorial.authorName && /^[—–-]\s*\S/.test(paragraphs[paragraphs.length - 1] ?? '')
  const bodyParagraphs = firmaEnTexto ? paragraphs.slice(0, -1) : paragraphs
  const firma = editorial.authorName || (firmaEnTexto ? paragraphs[paragraphs.length - 1].replace(/^[—–-]\s*/, '') : '')
  const metodo = textoDelMetodo(editorial.method, editorial.authorName)
  const fuentes = (editorial.sources || '').split('\n').map(l => l.trim()).filter(Boolean)

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
              name: editorial.authorName || 'Venancio Coñuepan',
              jobTitle: 'Abogado de derechos territoriales — Editor de Voces Indígenas',
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
        <Link
          to="/voces-indigenas"
          className="text-sm text-neutral-500 hover:text-neutral-700 mb-8 inline-block"
        >
          ← Voces Indígenas con Venancio Coñuepan
        </Link>

        {/* Rótulo de género, fecha y firma: indicadores 2 y 3 del Trust Project */}
        <div className="mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Editorial
          </span>
        </div>
        <p className="text-sm text-neutral-500">
          {editorial.authorName && <span className="text-neutral-700 font-medium">Por {editorial.authorName}</span>}
          {editorial.authorName && publishedDate && <span aria-hidden="true"> · </span>}
          {publishedDate && <time dateTime={editorial.publishedAt ?? undefined}>{publishedDate}</time>}
        </p>

        <h1 className="text-2xl md:text-3xl font-bold font-nexa leading-tight mt-3 mb-8 text-neutral-900">
          {editorial.title}
        </h1>

        <div className="space-y-5 text-base text-neutral-800 leading-relaxed">
          {bodyParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {firma && (
          <p className="mt-8 pt-6 border-t border-neutral-200 text-sm text-neutral-600">
            — {firma}
          </p>
        )}

        {/* Método y fuentes: indicadores 4 y 5 del Trust Project */}
        {metodo && (
          <aside className="mt-10 border-l-2 border-brand-800 pl-4" aria-labelledby="como-se-hizo">
            <h2 id="como-se-hizo" className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
              ¿Cómo se hizo esta editorial?
            </h2>
            <p className="text-sm text-neutral-700 leading-relaxed">{metodo}</p>
          </aside>
        )}

        {fuentes.length > 0 && (
          <section className="mt-8" aria-labelledby="fuentes">
            <h2 id="fuentes" className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
              Fuentes consultadas
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-700">
              {fuentes.map((l, i) => <Fuente key={i} linea={l} />)}
            </ul>
          </section>
        )}

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
