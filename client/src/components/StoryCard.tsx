import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PublicStory } from '@shared/types'
import { getCategoryColor, hexToRgba } from '../lib/category-colors'
import { formatDate, storyAgeMonths } from '../lib/format'
import { getTitleLabel, getHeadline } from '../lib/title-label'
import { isRead } from '../lib/reading-history'
import FeedFavicon from './FeedFavicon'
import BookmarkButton from './BookmarkButton'
import { publisherFromUrl } from '@shared/utils/publisher'

interface StoryCardProps {
  story: PublicStory
  variant?: 'featured' | 'compact' | 'horizontal' | 'equal'
  /**
   * Oculta el resumen de dos lineas. Solo lo usan las secciones de la cola de
   * la portada.
   *
   * La variante `equal` es la unica con imagen que ademas lleva resumen, y las
   * secciones de cola son cinco: dejarlo puesto metia QUINCE resumenes nuevos
   * en la portada. Medido el 21-sep-2026 comparando produccion contra local con
   * los mismos datos, eso subia el texto de 1.331 a 1.477 palabras — o sea, el
   * peso descendente bajaba el alto y empeoraba lo que venia a arreglar.
   */
  hideSummary?: boolean
  /**
   * Oculta el pill de categoria. Lo apaga la PORTADA, donde cada seccion ya
   * lleva la categoria en su `h2`.
   *
   * Medido el 21-sep-2026: doce tarjetas repetian palabra por palabra el titulo
   * que tenian encima -tres «CONSULTA Y CONSENTIMIENTO» bajo el h2 «Consulta y
   * Consentimiento»-. Dentro de una seccion rotulada el pill no informa nada; en
   * una lista mezclada -busqueda, guardados, una pagina de tema- si, y por eso
   * el valor por defecto es mostrarlo.
   */
  showCategory?: boolean
}

function StoryMeta({ story, size = 'sm' }: { story: PublicStory; size?: 'sm' | 'xs' }) {
  const { t } = useTranslation()
  const sourceDate = story.sourceDatePublished ? formatDate(story.sourceDatePublished) : null
  const publishDate = story.datePublished ? formatDate(story.datePublished) : null
  const ageMonths = story.sourceDatePublished ? storyAgeMonths(story.sourceDatePublished) : 0
  const isOld = ageMonths >= 3
  const showBothDates = sourceDate && publishDate && sourceDate !== publishDate
  return (
    <div className={`flex flex-wrap items-center gap-x-2 text-neutral-500 font-dm-sans ${size === 'xs' ? 'text-[11px]' : 'text-[12px]'}`}>
      <span className="inline-flex items-center gap-1.5">
        {publisherFromUrl(story.sourceUrl, story.feed.displayTitle || story.feed.title) === (story.feed.displayTitle || story.feed.title) && (
          <FeedFavicon feedId={story.feed.id} size={size === 'xs' ? 14 : 16} />
        )}
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 hover:text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {publisherFromUrl(story.sourceUrl, story.feed.displayTitle || story.feed.title)}
          <span className="sr-only"> (opens in new tab)</span>
        </a>
        {sourceDate && <> · {sourceDate}</>}
      </span>
      {showBothDates && (
        <span className="text-neutral-400">
          · Publicado {publishDate}
        </span>
      )}
      {/*
        * Neutrales del sistema, no el ambar por defecto de Tailwind.
        *
        * `amber-50/700/200` son tres colores de fabrica dentro de una paleta
        * tierra calibrada a mano, y era el unico sitio del sitio publico donde
        * aparecian: en medio de ocho familias elegidas por distancia perceptual,
        * un amarillo de libreria se lee como lo que es. La insignia avisa de una
        * fecha, no de un error, asi que tampoco le corresponde el terracota, que
        * DESIGN.md reserva para urgencia.
        */}
      {isOld && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-neutral-100 text-neutral-600 border border-neutral-200">
          {t('story.olderStory')}
        </span>
      )}
    </div>
  )
}

/**
 * Pill de categoria, con un modo para cuando va ENCIMA de una fotografia.
 *
 * El par «fondo al 10% + texto en el color de categoria» esta calibrado para el
 * papel claro y solo funciona ahi. Sobre una foto no hay contraste que valga:
 * medido el 21-sep-2026 en la portada en vivo, el oliva sobre un gris medio de
 * fotografia da **1,09:1**, y calculadas las 8 categorias contra tres
 * luminancias de foto, la mejor combinacion llega a 2,59:1. **Ninguna de las 24
 * pasa AA.** El pill era, sencillamente, invisible.
 *
 * En `onImage` el texto pasa a blanco sobre un velo neutro -que si sostiene
 * contraste sobre cualquier foto- y **el color de categoria se muda a un punto
 * de 6px**: sigue informando de que seccion es, que es su trabajo, sin tener que
 * sostener legibilidad de texto.
 *
 * El testigo de que esto era un olvido y no una decision esta al lado:
 * `NarrativeFrameTag` si recibio una prop `dark`, y se usa con ella dos lineas
 * mas abajo en la misma tarjeta.
 */
function CategoryPill({ name, hex, onImage = false }: { name: string; hex: string; onImage?: boolean }) {
  if (onImage) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-2 font-dm-sans"
        style={{
          backgroundColor: 'rgba(255,255,255,0.14)',
          color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.30)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full"
          style={{ width: '6px', height: '6px', backgroundColor: hex }}
        />
        {name}
      </span>
    )
  }
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-2 font-dm-sans"
      style={{
        backgroundColor: hexToRgba(hex, 0.10),
        color: hex,
        border: `1px solid ${hexToRgba(hex, 0.22)}`,
      }}
    >
      {name}
    </span>
  )
}

const NARRATIVE_LABELS: Record<string, string> = {
  protagonismo: 'Protagonismo',
  resiliencia: 'Resiliencia',
  alianza: 'Alianza',
  confrontacion: 'Confrontación',
}

function NarrativeFrameTag({ frame, dark = false }: { frame: string; dark?: boolean }) {
  const label = NARRATIVE_LABELS[frame] ?? frame
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] italic font-dm-sans cursor-help leading-none mb-2 ${dark ? 'text-white/75' : 'text-neutral-500'}`}
      title={`Marco narrativo identificado por IA: ${label}`}
    >
      {/*
       * Sin el marcador «IA» literal. Medido el 21-sep-2026 en la portada en
       * vivo: aparecia 15 veces en una sola pagina. A 8px y opacidad 0,55 no
       * informaba —no cambia ninguna decision del lector— y repetido quince
       * veces hacia justo lo contrario de lo que buscaba: en vez de senalar
       * curaduria algoritmica como un rasgo del medio, leia como plantilla.
       *
       * La regla de DESIGN.md se sigue cumpliendo: lo que manda mostrar en
       * todas las tarjetas es el MARCO NARRATIVO, y el marco sigue aqui. Lo
       * que se retira es el rotulo de dos letras, no la senal. La atribucion
       * al sistema se conserva donde si se lee: en el `title` de arriba.
       */}
      <span aria-hidden="true" className={`w-2.5 h-px ${dark ? 'bg-white/40' : 'bg-neutral-300'}`} />
      {label}
    </span>
  )
}

/**
 * Sello editorial: la marca de excelencia sobre la foto de una historia con
 * `relevance >= 8`. Jerarquia sin recurrir a un badge generico de «DESTACADO».
 *
 * SVG en linea de TRAZO BLANCO -circulo exterior + estrella de siete puntas-,
 * que es lo que especifica DESIGN.md. El codigo usaba
 * `/images/logo-no-text-square.png`, el emblema multicolor completo de la marca,
 * reducido a 36px y bajado al 32% de opacidad: a ese tamaño sus siete colores se
 * mezclan en una mancha y, sobre una fotografia cualquiera, ni se distingue la
 * forma ni se reconoce la marca. Un trazo blanco si sostiene su silueta sobre
 * cualquier fondo, que es justo el requisito.
 */
function EditorialSeal() {
  return (
    <div className="absolute bottom-2.5 right-2.5 pointer-events-none select-none" aria-hidden="true">
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.25"
        strokeLinejoin="round"
        style={{ opacity: 0.32 }}
      >
        <circle cx="18" cy="18" r="16" />
        <path d="M18 6.5 L20.6 14.2 L28.4 12.6 L23.4 18 L28.4 23.4 L20.6 21.8 L18 29.5 L15.4 21.8 L7.6 23.4 L12.6 18 L7.6 12.6 L15.4 14.2 Z" />
      </svg>
    </div>
  )
}

function CardImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}) {
  const [error, setError] = useState(false)
  if (error) return <>{fallback ?? null}</>
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      /*
       * width y height NO fijan el tamaño -eso lo hace el CSS del contenedor-
       * sino la PROPORCION, que es lo que el navegador necesita para reservar
       * el hueco antes de descargar la imagen. Sin ellos, Lighthouse marca
       * "media element lacking an explicit size" y la tarjeta salta cuando la
       * imagen llega: 0,0169 del CLS de la portada, medido el 5-sep-2026.
       *
       * 1200x630 es lo que compone `composeBrandedStoryCard` y el ancho al que
       * se normaliza todo lo rehospedado (REHOST_MAX_WIDTH). Las que no tienen
       * esa proporcion exacta se recortan igual con object-cover.
       */
      width={1200}
      height={630}
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}

export default function StoryCard({ story, variant = 'featured', hideSummary = false, showCategory = true }: StoryCardProps) {
  const { i18n } = useTranslation()
  const issueSlug = story.issue?.slug ?? story.feed?.issue?.slug ?? 'general-news'
  const issueName = story.issue?.name ?? story.feed?.issue?.name ?? ''
  const colors = getCategoryColor(issueSlug)
  const [read, setRead] = useState(false)

  useEffect(() => {
    if (story.slug) setRead(isRead(story.slug))
  }, [story.slug])

  /*
   * El estado «leido» se marca en el TITULAR, no en la tarjeta entera.
   *
   * `opacity-70` iba en el `<article>`, asi que componia contra el fondo todo lo
   * de dentro. Calculado sobre blanco: la metadata (n-500) caia de 5,81:1 a
   * 3,06:1, el resumen (n-600) de 7,63:1 a 3,59:1 y «Publicado» / «Noticia
   * antigua» (n-400) de 4,80:1 a 2,73:1. Sobre el papel #FAFAF8 es peor.
   *
   * O sea: en cuanto alguien leia una noticia, su tarjeta dejaba de cumplir
   * WCAG AA en todo menos el titular — y el efecto era permanente y acumulativo,
   * porque al lector habitual la portada se le iba volviendo ilegible.
   *
   * En el titular la señal se conserva y el contraste aguanta: n-900 al 70% da
   * 6,45:1.
   */
  const readTitle = read ? 'opacity-70' : ''

  const isEn = i18n.language === 'en'
  const localizedStory = {
    ...story,
    title: (isEn && story.titleEn) ? story.titleEn : story.title,
    titleLabel: (isEn && story.titleLabelEn) ? story.titleLabelEn : story.titleLabel,
  }
  const displaySummary: string | null | undefined = (isEn && story.relevanceSummaryEn) ? story.relevanceSummaryEn
    : (isEn && story.summaryEn) ? story.summaryEn
    : story.relevanceSummary || story.summary

  const imageUrl = story.imageUrl ?? null
  const headlineText = getHeadline(localizedStory)

  // === FEATURED variant — full-bleed image, meta flush inside card ===
  if (variant === 'featured') {
    return (
      <article className={`group relative overflow-hidden rounded-lg border border-neutral-200 bg-white`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg">
          {/* Image area */}
          <div className="relative aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover"
                fallback={
                  <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.2)}, ${hexToRgba(colors.hex, 0.45)})` }}>
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.2)}, ${hexToRgba(colors.hex, 0.45)})` }}>
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            {/* Solo sobre fotografia: DESIGN.md dice «no mostrar si la imagen no carga» */}
            {imageUrl && (story.relevance ?? 0) >= 8 && <EditorialSeal />}
            {/* Headline + category */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pt-5 pb-4">
              {showCategory && issueName && <CategoryPill name={issueName} hex={colors.hex} onImage />}
              {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} dark />}
              {getTitleLabel(localizedStory) && (
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1.5 font-dm-sans">{getTitleLabel(localizedStory)}</span>
              )}
              <h3 className={`font-fraunces text-[21px] md:text-[24px] font-semibold text-white leading-tight ${readTitle}`}>
                {headlineText}
              </h3>
            </div>
          </div>
        </Link>
        {/* Meta strip */}
        <div className="px-5 py-3 flex items-center justify-between gap-2 border-t border-neutral-100 bg-white">
          <StoryMeta story={story} size="xs" />
          {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
        </div>
      </article>
    )
  }

  // === EQUAL variant — image top, text below ===
  if (variant === 'equal') {
    return (
      <article className={`group relative overflow-hidden rounded-lg border border-neutral-200 bg-white h-full`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-lg overflow-hidden">
          <div className="relative aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover"
                fallback={
                  <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.12)}, ${hexToRgba(colors.hex, 0.28)})` }}>
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.12)}, ${hexToRgba(colors.hex, 0.28)})` }}>
              </div>
            )}
            {imageUrl && (story.relevance ?? 0) >= 8 && <EditorialSeal />}
          </div>
        </Link>
        <div className="p-5">
          {showCategory && issueName && <CategoryPill name={issueName} hex={colors.hex} />}
          {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} />}
          <div className="flex items-start justify-between gap-1">
            <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              <h3 className={`font-fraunces text-[17px] font-semibold text-neutral-900 mb-2.5 group-hover:text-brand-800 transition-colors leading-snug ${readTitle}`}>
                {headlineText}
              </h3>
            </Link>
            {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
          </div>
          <StoryMeta story={story} size="xs" />
          {displaySummary && !hideSummary && (
            <p className="text-[13px] text-neutral-500 leading-relaxed mt-2.5 line-clamp-2">{displaySummary}</p>
          )}
        </div>
      </article>
    )
  }

  // === HORIZONTAL variant — text left, image right ===
  if (variant === 'horizontal') {
    return (
      <article className={`group relative overflow-hidden rounded-lg border border-neutral-200 bg-white`}>
        <div className="flex flex-col md:flex-row">
          {/* Text left */}
          <div className="flex-1 p-5 md:p-6">
            {showCategory && issueName && <CategoryPill name={issueName} hex={colors.hex} />}
            {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} />}
            <div className="flex items-start justify-between gap-2">
              <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                {getTitleLabel(localizedStory) && (
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 font-dm-sans">{getTitleLabel(localizedStory)}</span>
                )}
                <h3 className={`font-fraunces text-xl md:text-[22px] font-semibold text-neutral-900 mb-3 group-hover:text-brand-800 transition-colors leading-tight ${readTitle}`}>
                  {headlineText}
                </h3>
              </Link>
              {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
            </div>
            <StoryMeta story={story} />
            {displaySummary && (
              <p className="text-[13px] text-neutral-600 leading-relaxed mt-3 line-clamp-3">{displaySummary}</p>
            )}
          </div>
          {/* Image right */}
          {/*
           * 256px y proporcion propia, no 176px estirados por la columna de texto.
           *
           * El origen es 1200x630 (1,90:1 apaisado). Con `md:w-44` la caja media
           * 176px de ancho por el ALTO de la columna de texto -entre 220 y 340px
           * segun el largo del resumen-, asi que `object-cover` escalaba por el
           * lado corto y solo se veia entre el 27% y el 42% CENTRAL de la imagen.
           * Cuando la imagen es una captura de portada o de red social con su
           * propio titular encima -y varias lo son-, se veia un tercio de una
           * frase. En movil no pasaba: ahi la caja es `h-44` a ancho completo,
           * casi la proporcion del origen.
           */}
          <Link to={`/stories/${story.slug}`} className="md:w-64 md:shrink-0 overflow-hidden rounded-b-lg md:rounded-b-none md:rounded-r-lg focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="h-44 md:h-auto md:self-start md:aspect-[4/3] min-h-[160px] overflow-hidden bg-neutral-100 relative">
              {imageUrl ? (
                <CardImage
                  src={imageUrl}
                  alt={headlineText}
                  className="w-full h-full object-cover object-[center_40%]"
                  fallback={
                    <div
                      className="w-full h-full"
                      style={{ background: `linear-gradient(150deg, ${hexToRgba(colors.hex, 0.18)}, ${hexToRgba(colors.hex, 0.42)})` }}
                    >
                    </div>
                  }
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: `linear-gradient(150deg, ${hexToRgba(colors.hex, 0.18)}, ${hexToRgba(colors.hex, 0.42)})` }}
                >
                </div>
              )}
              {imageUrl && (story.relevance ?? 0) >= 8 && <EditorialSeal />}
            </div>
          </Link>
        </div>
      </article>
    )
  }

  // === COMPACT variant — no image, "en breve" style ===
  return (
    <article className={`group relative flex gap-3 py-3.5 border-b border-neutral-100 last:border-0`}>
      {/* Category dot */}
      <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.hex }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <Link
          to={`/stories/${story.slug}`}
          className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {getTitleLabel(localizedStory) && (
            <span className="block text-[10px] font-bold uppercase tracking-widest mb-0.5 font-dm-sans" style={{ color: colors.hex }}>{getTitleLabel(localizedStory)}</span>
          )}
          <h3 className={`font-fraunces text-[15px] font-semibold text-neutral-800 mb-1 group-hover:text-brand-800 transition-colors leading-snug ${readTitle}`}>
            {headlineText}
          </h3>
        </Link>
        <StoryMeta story={story} size="xs" />
      </div>
      {story.slug && (
        <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0 self-start mt-0.5" />
      )}
    </article>
  )
}
