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
import { publisherFromUrl } from '@shared/utils/publisher'

interface StoryCardProps {
  story: PublicStory
  variant?: 'featured' | 'compact' | 'horizontal' | 'equal'
}

function StoryMeta({ story, size = 'sm' }: { story: PublicStory; size?: 'sm' | 'xs' }) {
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
      className={`inline-block text-[9px] italic font-dm-sans cursor-help leading-none mb-1.5 ${dark ? 'text-white/50' : 'text-neutral-400'}`}
      title={`Marco narrativo: ${label}`}
    >
      {label}
    </span>
  )
}

function EditorialSeal() {
  return (
    <div className="absolute bottom-2 right-2 pointer-events-none select-none" aria-hidden="true">
      <img
        src="/images/logo-no-text-square.png"
        alt=""
        className="w-9 h-9 object-contain"
        style={{ opacity: 0.18 }}
      />
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
      <article className={`group relative overflow-hidden rounded-lg ${readClass}`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg">
          {/* Image area */}
          <div className="relative aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            {(story.relevance ?? 0) >= 8 && <EditorialSeal />}
            {/* Headline + category */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pt-5 pb-4">
              {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
              {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} dark />}
              {getTitleLabel(localizedStory) && (
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1.5 font-dm-sans">{getTitleLabel(localizedStory)}</span>
              )}
              <h3 className="font-fraunces text-[21px] md:text-[24px] font-semibold text-white leading-tight">
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
      <article className={`group relative overflow-hidden rounded-lg border border-neutral-100 bg-white h-full ${readClass}`}>
        <Link to={`/stories/${story.slug}`} className="block focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-lg overflow-hidden">
          <div className="relative aspect-video overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={headlineText}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
            {(story.relevance ?? 0) >= 8 && <EditorialSeal />}
          </div>
        </Link>
        <div className="p-5">
          {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
          {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} />}
          <div className="flex items-start justify-between gap-1">
            <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
              <h3 className="font-fraunces text-[17px] font-semibold text-neutral-900 mb-2.5 group-hover:text-brand-800 transition-colors leading-snug">
                {headlineText}
              </h3>
            </Link>
            {story.slug && <BookmarkButton slug={story.slug} size="sm" hoverReveal className="shrink-0" />}
          </div>
          <StoryMeta story={story} size="xs" />
          {displaySummary && (
            <p className="text-[13px] text-neutral-500 leading-relaxed mt-2.5 line-clamp-2">{displaySummary}</p>
          )}
        </div>
      </article>
    )
  }

  // === HORIZONTAL variant — text left, image right ===
  if (variant === 'horizontal') {
    return (
      <article className={`group relative overflow-hidden rounded-lg border border-neutral-100 bg-white ${readClass}`}>
        <div className="flex flex-col md:flex-row">
          {/* Text left */}
          <div className="flex-1 p-5 md:p-6">
            {issueName && <CategoryPill name={issueName} hex={colors.hex} />}
            {story.narrativeFrame && <NarrativeFrameTag frame={story.narrativeFrame} />}
            <div className="flex items-start justify-between gap-2">
              <Link to={`/stories/${story.slug}`} className="block flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                {getTitleLabel(localizedStory) && (
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5 font-dm-sans">{getTitleLabel(localizedStory)}</span>
                )}
                <h3 className="font-fraunces text-xl md:text-[22px] font-semibold text-neutral-900 mb-3 group-hover:text-brand-800 transition-colors leading-tight">
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
          <Link to={`/stories/${story.slug}`} className="md:w-44 md:shrink-0 overflow-hidden rounded-b-lg md:rounded-b-none md:rounded-r-lg focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="h-44 md:h-full min-h-[160px] overflow-hidden bg-neutral-100 relative">
              {imageUrl ? (
                <CardImage
                  src={imageUrl}
                  alt={headlineText}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
              {(story.relevance ?? 0) >= 8 && <EditorialSeal />}
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
            <span className="block text-[10px] font-bold uppercase tracking-widest mb-0.5 font-dm-sans" style={{ color: colors.hex }}>{getTitleLabel(localizedStory)}</span>
          )}
          <h3 className="font-fraunces text-[15px] font-semibold text-neutral-800 mb-1 group-hover:text-brand-800 transition-colors leading-snug">
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
