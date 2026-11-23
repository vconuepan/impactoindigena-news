import { useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { usePublicStories } from '../hooks/usePublicStories'
import { usePublicIssues } from '../hooks/usePublicIssues'
import StoryCard from '../components/StoryCard'
import Pagination from '../components/Pagination'
import { SEO, CommonOgTags } from '../lib/seo'
import { ISSUE_LINKS } from '../layouts/PublicLayout'
import { scrollBehavior } from '../lib/scroll'
import type { PublicStory } from '@shared/types'

/**
 * Directorio de todas las noticias publicadas (/noticias).
 *
 * Hasta el 23-nov-2026 no habia una sola pagina que mostrara el archivo
 * completo: la de cada tema filtraba por fecha nunca y por el deslizador de
 * positividad siempre, y /search no muestra nada sin un filtro y no filtra por
 * tema. La API ya combinaba tema y fechas; faltaba la pagina.
 *
 * Tres decisiones:
 * - **No lee el deslizador de positividad.** Un directorio que esconde noticias
 *   segun el animo del lector no es un directorio.
 * - **La URL manda** (`?tema=`, `?desde=`, `?hasta=`, `?page=`), para poder
 *   compartir «Territorio, octubre 2026» como enlace.
 * - **Solo la vista sin filtros se indexa.** Cada combinacion de filtros es una
 *   URL nueva para un robot; /search fue en noviembre la pagina mas vista por
 *   robots. Las vistas filtradas piden `noindex, follow` y apuntan su canonica
 *   a /noticias.
 *
 * El dia que agrupa la lista es el dia UTC de `datePublished`, el mismo con el
 * que el servidor resuelve `dateFrom`/`dateTo` (`buildPublishedDateRange`): si
 * se agrupara en hora de Chile, una nota de las 22:00 saldria bajo un dia que el
 * filtro «hasta» no incluye.
 */

const PAGE_SIZE = 50
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Slugs de los ocho temas; el resto de las secciones raiz son geografias. */
const TEMAS = new Set(ISSUE_LINKS.map((l) => l.slug))

/** Clave de dia UTC (YYYY-MM-DD) de una noticia, o null si no tiene fecha. */
export function diaUtc(story: Pick<PublicStory, 'datePublished'>): string | null {
  return story.datePublished ? story.datePublished.slice(0, 10) : null
}

/** Agrupa una pagina ya ordenada por fecha en bloques consecutivos por dia. */
export function agruparPorDia<T extends Pick<PublicStory, 'datePublished'>>(stories: T[]) {
  const grupos: { dia: string | null; stories: T[] }[] = []
  for (const s of stories) {
    const dia = diaUtc(s)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.stories.push(s)
    else grupos.push({ dia, stories: [s] })
  }
  return grupos
}

export default function NewsDirectoryPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tema = searchParams.get('tema') || ''
  const desdeRaw = searchParams.get('desde') || ''
  const hastaRaw = searchParams.get('hasta') || ''
  const desde = FECHA.test(desdeRaw) ? desdeRaw : ''
  const hasta = FECHA.test(hastaRaw) ? hastaRaw : ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const hayFiltros = Boolean(tema || desde || hasta)
  const indexable = !hayFiltros && page === 1

  const { data: issues } = usePublicIssues()
  const { data, isLoading, isError } = usePublicStories({
    issueSlug: tema || undefined,
    dateFrom: desde || undefined,
    dateTo: hasta || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const stories = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const grupos = useMemo(() => agruparPorDia(stories), [stories])

  const { temas, geografias } = useMemo(() => {
    const raiz = (issues ?? []).filter((i) => !i.parentId)
    const porNombre = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es')
    return {
      temas: raiz.filter((i) => TEMAS.has(i.slug)).sort(porNombre),
      geografias: raiz.filter((i) => !TEMAS.has(i.slug)).sort(porNombre),
    }
  }, [issues])

  const nombreTema = (issues ?? []).find((i) => i.slug === tema)?.name

  const formatoDia = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-US' : 'es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [i18n.language],
  )

  function setFiltro(clave: 'tema' | 'desde' | 'hasta', valor: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (valor) next.set(clave, valor)
      else next.delete(clave)
      next.delete('page')
      return next
    })
  }

  function limpiar() {
    setSearchParams(new URLSearchParams())
  }

  function irAPagina(n: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (n === 1) next.delete('page')
      else next.set('page', String(n))
      return next
    })
  }

  useEffect(() => {
    if (page > 1 || hayFiltros) window.scrollTo({ top: 0, behavior: scrollBehavior() })
    // Solo al cambiar de pagina; los filtros ya dejan la lista arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const titulo = `${t('directory.title')} - ${SEO.siteName}`
  const descripcion = t('directory.description')

  const inputClass =
    'w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition-colors'
  const labelClass = 'block text-xs font-semibold text-neutral-500 mb-1 font-dm-sans'

  return (
    <>
      <Helmet>
        <title>{titulo}</title>
        <meta name="description" content={descripcion} />
        <meta property="og:title" content={titulo} />
        <meta property="og:description" content={descripcion} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/noticias`} />
        <link rel="canonical" href={`${SEO.siteUrl}/noticias`} />
        {!indexable && <meta name="robots" content="noindex, follow" />}
        {CommonOgTags({})}
      </Helmet>
      <div className="page-section-wide">
        <header className="mb-6 border-b border-neutral-100 pb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2 font-dm-sans">
            {t('directory.label')}
          </p>
          <h1 className="font-fraunces text-2xl md:text-3xl font-semibold">{t('directory.title')}</h1>
          <p className="text-neutral-600 mt-2 max-w-2xl">{t('directory.intro')}</p>
          {!isLoading && data && (
            <p className="text-sm text-neutral-500 mt-3 font-dm-sans" aria-live="polite">
              {t('directory.count', { count: data.total })}
              {nombreTema ? ` · ${nombreTema}` : ''}
            </p>
          )}
        </header>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="mb-8 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          aria-label={t('directory.filters')}
        >
          <div>
            <label htmlFor="dir-tema" className={labelClass}>{t('directory.category')}</label>
            <select
              id="dir-tema"
              value={tema}
              onChange={(e) => setFiltro('tema', e.target.value)}
              className={inputClass}
            >
              <option value="">{t('directory.allCategories')}</option>
              {temas.length > 0 && (
                <optgroup label={t('directory.topics')}>
                  {temas.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.name}</option>
                  ))}
                </optgroup>
              )}
              {geografias.length > 0 && (
                <optgroup label={t('directory.regions')}>
                  {geografias.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="dir-desde" className={labelClass}>{t('search.dateFrom')}</label>
            <input
              id="dir-desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setFiltro('desde', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="dir-hasta" className={labelClass}>{t('search.dateTo')}</label>
            <input
              id="dir-hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setFiltro('hasta', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiar}
                className="w-full sm:w-auto px-4 py-2 text-sm font-normal text-neutral-600 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t('search.clearFilters')}
              </button>
            )}
          </div>
        </form>

        {isLoading ? (
          <div aria-busy="true" aria-label={t('directory.loading')} className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-center text-neutral-500 py-8">{t('directory.error')}</p>
        ) : stories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-500 mb-4">{t('search.noResultsFiltered')}</p>
            <button
              type="button"
              onClick={limpiar}
              className="text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
            >
              {t('search.clearFilters')}
            </button>
          </div>
        ) : (
          <>
            {grupos.map((g, idx) => (
              <section key={`${g.dia ?? 'sin-fecha'}-${idx}`} className="mb-6" aria-labelledby={`dia-${idx}`}>
                <h2
                  id={`dia-${idx}`}
                  className="font-dm-sans text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-neutral-900 pb-2 mb-1"
                >
                  {g.dia ? formatoDia.format(new Date(`${g.dia}T00:00:00Z`)) : t('directory.noDate')}
                </h2>
                <div>
                  {g.stories.map((story) => (
                    <StoryCard key={story.id} story={story} variant="compact" />
                  ))}
                </div>
              </section>
            ))}
            <Pagination page={page} totalPages={totalPages} onPageChange={irAPagina} />
          </>
        )}

        <p className="mt-10 text-sm text-neutral-500">
          {t('directory.searchHint')}{' '}
          <Link to="/search" className="text-brand-800 hover:text-brand-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
            {t('search.label')}
          </Link>
        </p>
      </div>
    </>
  )
}
