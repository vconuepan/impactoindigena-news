import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PublicStory } from '@shared/types'

interface PullQuoteProps {
  story: PublicStory
}

/**
 * Displays an editorial pull-quote from a story.
 *
 * Large centered text with oversized decorative quotation marks,
 * separated from sections by a vertical diamond divider.
 */
export default function PullQuote({ story }: PullQuoteProps) {
  const { i18n } = useTranslation()
  const isEn = i18n.language === 'en'
  const displayQuote = (isEn && story.quoteEn) ? story.quoteEn : story.quote
  const displayTitle = (isEn && story.titleEn) ? story.titleEn : story.title

  if (!displayQuote) return null

  const hasPersonAttribution = story.quoteAttribution && story.quoteAttribution !== 'Original article'

  return (
    <figure className="py-10 md:py-14 text-center max-w-2xl mx-auto px-4 border-l-4 border-r-4 border-brand-200/40">
      {/* Top rule with diamond */}
      <div className="flex items-center gap-4 mb-8" aria-hidden="true">
        <span className="flex-1 border-t border-neutral-200" />
        <span className="text-brand-300 text-[10px] leading-none">◆</span>
        <span className="flex-1 border-t border-neutral-200" />
      </div>

      {/* Decorative open-quote */}
      <span
        aria-hidden="true"
        className="block leading-none select-none pointer-events-none"
        style={{
          fontSize: '5.5rem',
          fontFamily: 'Fraunces, Georgia, serif',
          fontWeight: 300,
          color: '#0D5F3C',
          opacity: 0.18,
          marginBottom: '-2rem',
        }}
      >
        &ldquo;
      </span>

      <blockquote>
        <p className="text-xl md:text-2xl leading-relaxed px-2 md:px-6 italic font-fraunces" style={{ color: '#44403c' }}>
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

      {/* Bottom rule */}
      <div className="flex items-center gap-4 mt-8" aria-hidden="true">
        <span className="flex-1 border-t border-neutral-200" />
        <span className="text-brand-300 text-[10px] leading-none">◆</span>
        <span className="flex-1 border-t border-neutral-200" />
      </div>
    </figure>
  )
}

