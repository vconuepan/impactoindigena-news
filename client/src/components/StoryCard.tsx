import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PublicStory } from '@shared/types'
import { getCategoryColor, hexToRgba } from '../lib/category-colors'
import { getCategoryPattern } from '../lib/category-patterns'
import { formatDate, storyAgeMonths } from '../lib/format'
import { getTitleLabel, getHeadline } from '../lib/title-label'
import { isRead } from '../lib/reading-history'
import FeedFavicon from './FeedFavicon'
import BookmarkButton from './BookmarkButton'

interface StoryCardProps {
  story: PublicStory
  variant?: 'featured' | 'compact' | 'horizontal' | 'equal'
}

function StoryMeta({ story, size = 'sm' }: { story: PublicStory; size?: 'sm' | 'xs' }) {
  const dateStr = formatDate(story.sourceDatePublished || story.datePublished || '')
  const ageMonths = story.sourceDatePublished ? storyAgeMonths(story.sourceDatePublished) : 0
  const isOld = ageMonths >= 3
  return (
    <div className={`flex flex-wrap items-center gap-x-2 text-neutral-500 font-dm-sans ${size === 'xs' ? 'text-xs' : 'text-sm'}`}>
      <span className="inline-flex items-center gap-1.5">
        <FeedFavicon feedId={story.feed.id} size={size === 'xs' ? 14 : 16} />
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 hover:text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {story.feed.displayTitle || story.feed.title}
          <span className="sr-only"> (opens in new tab)</span>
        </a>
        {dateStr && <> · {dateStr}</>}
      </span>
      {isOld && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
          Noticia antigua
        </span>
      )}
    </div>
  )
}

function CategoryPill({ name, hex }: { name: string; hex: string }) {
  return (
    <span
      className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-2 font-dm-sans"
      style={{
        backgroundColor: hexToRgba(hex, 0.12),
        color: hex,
        border: `1px solid ${hexToRgba(hex, 0.25)}`,
      }}
    >
      {name}
    </span>
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
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}

export default function StoryCard({ story, variant = 'featured' }: StoryCardProps) {
  const { i18n } = useTranslation()
  const issueSlug = story.issue?.slug ?? story.feed?.issue?.slug ?? 'general-news'
  const issueName = story.issue?.name ?? story.feed?.issue?.name ?? ''
  const colors = getCategoryColor(issueSlug)
  const Pattern = getCategoryPattern(issueSlug)
  const [read, setRead] = useState(false)

  useEffect(() => {
    if (story.slug) setRead(isRead(story.slug))
  }, [story.slug])

  const readClass = read ? 'opacity-70' : ''

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
      <article className={`group relative overflow-hidden rounded-xl shadow-sm hover:shadow-xl transition-shadow duration-300 ${readClass}`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl">
          {/* Image area — extended gradient covers the meta row below */}
          <div className="relative aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                fallback={
                  <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.2)}, ${hexToRgba(colors.hex, 0.45)})` }}>
                    {Pattern && <Pattern opacity={0.25} />}
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.2)}, ${hexToRgba(colors.hex, 0.45)})` }}>
                {Pattern && <Pattern opacity={0.25} />}
              </div>
            )}
            {/* Gradient overlay — heavier at bottom to seat the meta strip */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            {/* Headline + category */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pt-5 pb-3">
              {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
              {getTitleLabel(localizedStory) && (
                <span className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-1">{getTitleLabel(localizedStory)}</span>
              )}
              <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">
                {headlineText}
              </h3>
            </div>
          </div>
        </Link>
        {/* Meta strip — no border, neutral-50 background for seamless step-down */}
        <div className="bg-neutral-50 px-5 py-3 flex items-center justify-between gap-2 rounded-b-xl">
          <StoryMeta story={story} size="xs" />
          {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
        </div>
      </article>
    )
  }

  // === EQUAL variant — image top, text below (Ladera Sur style) ===
  if (variant === 'equal') {
    return (
      <article className={`group relative overflow-hidden rounded-xl border border-neutral-100 bg-white hover:shadow-lg transition-shadow duration-300 h-full ${readClass}`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-xl overflow-hidden">
          <div className="aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                fallback={
                  <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.12)}, ${hexToRgba(colors.hex, 0.28)})` }}>
                    {Pattern && <Pattern opacity={0.2} />}
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full relative" style={{ background: `linear-gradient(135deg, ${hexToRgba(colors.hex, 0.12)}, ${hexToRgba(colors.hex, 0.28)})` }}>
                {Pattern && <Pattern opacity={0.2} />}
              </div>
            )}
          </div>
        </Link>
        <div className="p-4">
          {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
          <div className="flex items-start justify-between gap-1">
            <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              <h3 className="text-base font-bold text-neutral-900 mb-2 group-hover:text-brand-800 transition-colors leading-snug">
                {headlineText}
              </h3>
            </Link>
            {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
          </div>
          <StoryMeta story={story} size="xs" />
          {displaySummary && (
            <p className="text-sm text-neutral-500 leading-relaxed mt-2 line-clamp-2">{displaySummary}</p>
          )}
        </div>
      </article>
    )
  }

  // === HORIZONTAL variant — text left, image right ===
  if (variant === 'horizontal') {
    return (
      <article className={`group relative overflow-hidden rounded-xl border border-neutral-100 bg-white hover:shadow-lg transition-shadow duration-300 ${readClass}`}>
        <div className="flex flex-col md:flex-row">
          {/* Text left */}
          <div className="flex-1 p-6 md:p-7">
            {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
            <div className="flex items-start justify-between gap-2">
              <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                {getTitleLabel(localizedStory) && (
                  <span className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">{getTitleLabel(localizedStory)}</span>
                )}
                <h3 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3 group-hover:text-brand-800 transition-colors leading-tight">
                  {headlineText}
                </h3>
              </Link>
              {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
            </div>
            <StoryMeta story={story} />
            {displaySummary && (
              <p className="text-neutral-600 leading-relaxed mt-3 line-clamp-3">{displaySummary}</p>
            )}
          </div>
          {/* Image right — shown with image or as color accent strip */}
          <Link to={`/stories/${story.slug}`} className="md:w-56 md:shrink-0 overflow-hidden rounded-b-xl md:rounded-b-none md:rounded-r-xl focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="h-48 md:h-full min-h-[180px] overflow-hidden bg-neutral-100 relative">
              {imageUrl ? (
                <CardImage
                  src={imageUrl}
                  alt={headlineText}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  fallback={
                    <div
                      className="w-full h-full"
                      style={{ background: `linear-gradient(150deg, ${hexToRgba(colors.hex, 0.18)}, ${hexToRgba(colors.hex, 0.42)})` }}
                    >
                      {Pattern && <Pattern opacity={0.22} />}
                    </div>
                  }
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: `linear-gradient(150deg, ${hexToRgba(colors.hex, 0.18)}, ${hexToRgba(colors.hex, 0.42)})` }}
                >
                  {Pattern && <Pattern opacity={0.22} />}
                </div>
              )}
            </div>
          </Link>
        </div>
      </article>
    )
  }

  // === COMPACT variant — no image, "en breve" style ===
  return (
    <article className={`group relative flex gap-3 py-3.5 border-b border-neutral-100 last:border-0 ${readClass}`}>
      {/* Category dot */}
      <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.hex }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <Link
          to={`/stories/${story.slug}`}
          className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {getTitleLabel(localizedStory) && (
            <span className="block text-xs font-bold uppercase tracking-wider mb-0.5 font-dm-sans" style={{ color: colors.hex }}>{getTitleLabel(localizedStory)}</span>
          )}
          <h3 className="text-[15px] font-bold text-neutral-800 mb-1 group-hover:text-brand-800 transition-colors leading-snug">
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
