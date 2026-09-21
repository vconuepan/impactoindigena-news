import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PublicStory } from '@shared/types'

interface PullQuoteProps {
  story: PublicStory
}

/**
 * Cita editorial de una historia.
 *
 * Ejecuta la ficha `.pull-quote` de DESIGN.md, que el componente no seguia:
 * Fraunces italic 22-26px, `line-height 1.4`, y **una regla superior de 2px en
 * el verde de marca**. Nada mas.
 *
 * Lo que habia antes eran CINCO decoraciones sobre la misma cita —dos reglas con
 * rombo, una comilla de 5,5rem al 18%, bordes verticales de 4px y todo
 * centrado—, repetidas cuatro veces en la portada. Ese apilamiento hacia que la
 * cita pesara como un titular y compitiera con las secciones en vez de separar
 * dos de ellas, que es su trabajo.
 *
 * **Alineada a la izquierda**, no centrada: DESIGN.md lista «todo centrado»
 * entre los anti-patrones activos, y la cita alineada se lee como un cambio de
 * registro dentro del flujo editorial en vez de como un cartel.
 */
export default function PullQuote({ story }: PullQuoteProps) {
  const { i18n } = useTranslation()
  const isEn = i18n.language === 'en'
  const displayQuote = (isEn && story.quoteEn) ? story.quoteEn : story.quote
  const displayTitle = (isEn && story.titleEn) ? story.titleEn : story.title

  if (!displayQuote) return null

  const hasPersonAttribution = story.quoteAttribution && story.quoteAttribution !== 'Original article'

  return (
    <figure className="py-10 md:py-12 max-w-2xl mx-auto px-4 border-t-2 border-brand-800">
      <blockquote>
        <p
          className="font-fraunces italic mt-6"
          style={{ fontSize: 'clamp(22px, 2.2vw, 26px)', fontWeight: 400, lineHeight: 1.4, color: '#44403c' }}
        >
          {displayQuote}
        </p>
      </blockquote>

      <figcaption className="mt-5 text-sm font-dm-sans" style={{ color: '#78716C' }}>
        {hasPersonAttribution ? (
          <>
            {story.quoteAttribution}, via{' '}
            <Link
              to={`/stories/${story.slug}`}
              className="text-brand-800 hover:text-brand-600 underline decoration-brand-200 hover:decoration-brand-400 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5"
            >
              {displayTitle || story.sourceTitle}
            </Link>
          </>
        ) : (
          <Link
            to={`/stories/${story.slug}`}
            className="text-brand-800 hover:text-brand-600 underline decoration-brand-200 hover:decoration-brand-400 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5"
          >
            {displayTitle || story.sourceTitle}
          </Link>
        )}
      </figcaption>
    </figure>
  )
}
