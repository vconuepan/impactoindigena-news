import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHomepageData } from '../hooks/useHomepageData'
import StoryCard from '../components/StoryCard'
import PullQuote from '../components/PullQuote'
import { HeroSkeleton, IssueSectionSkeleton } from '../components/skeletons'
import type { PublicIssue } from '../lib/api'
import type { PublicStory } from '@shared/types'
import { getCategoryColor } from '../lib/category-colors'
import { getCategoryPattern } from '../lib/category-patterns'
import { parsePoints, stripMarkdown, stripPrefix, limitSentences } from '../lib/parse-points'
import { formatDate } from '../lib/format'
import { getTitleLabel, getHeadline } from '../lib/title-label'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildWebSiteSchema, buildOrganizationSchema } from '../lib/structured-data'
import SupportBanner from '../components/SupportBanner'
import SpotlightBand from '../components/SpotlightBand'
import CasosSection from '../components/CasosSection'
import DailySnippet from '../components/DailySnippet'
import { usePositivity } from '../contexts/PositivityContext'
import { mixHomepageStories, pickHero } from '../lib/mix-stories'

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function HeroSection({ story }: { story: PublicStory }) {
  const { i18n } = useTranslation()
  const issueSlug = story.issue?.slug ?? story.feed?.issue?.slug ?? 'general-news'
  const issueName = story.issue?.name ?? story.feed?.issue?.name ?? ''
  const colors = getCategoryColor(issueSlug)
  const Pattern = getCategoryPattern(issueSlug)
  const dateStr = story.datePublished ? formatDate(story.datePublished) : null
  const heroImage = story.imageUrl || null

  const isEn = i18n.language === 'en'
  const localizedStory = {
    ...story,
    title: (isEn && story.titleEn) ? story.titleEn : story.title,
    titleLabel: (isEn && story.titleLabelEn) ? story.titleLabelEn : story.titleLabel,
  }
  const displaySummary = (isEn && story.summaryEn) ? story.summaryEn : story.summary
  const displayQuote = (isEn && story.quoteEn) ? story.quoteEn : story.quote

  return (
    <section className="relative overflow-hidden">
      {/* Full-bleed image background */}
      <div className="relative w-full h-[460px] md:h-[580px] overflow-hidden bg-neutral-900">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover opacity-65"
            fetchPriority="high"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full relative" style={{ background: `linear-gradient(150deg, ${colors.hex}55 0%, #1a1a1a 60%)` }}>
            {Pattern && <Pattern opacity={0.18} />}
          </div>
        )}
        {/* Gradient overlay — heavier at bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />

        {/* Content on overlay */}
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-4xl mx-auto px-4 pb-12 md:pb-16 w-full">
            {/* Issue pill */}
            {issueName && (
              <span
                className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                style={{ backgroundColor: `${colors.hex}40`, color: colors.hex, border: `1px solid ${colors.hex}80` }}
              >
                {issueName}
              </span>
            )}
            {getTitleLabel(localizedStory) && (
              <span className="block text-sm font-bold uppercase tracking-wider text-white/60 mb-2">{getTitleLabel(localizedStory)}</span>
            )}
            <h1 className="text-3xl md:text-5xl font-bold font-fraunces text-white mb-4 leading-tight max-w-3xl">
              <Link
                to={`/stories/${story.slug}`}
                className="hover:text-white/90 transition-colors focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                {getHeadline(localizedStory)}
              </Link>
            </h1>
            {/* Summary or quote */}
            {story.relevanceReasons && parsePoints(story.relevanceReasons)[0] ? (
              <p className="text-base md:text-lg text-white/80 leading-relaxed max-w-2xl mb-4">
                {limitSentences(stripPrefix(stripMarkdown(parsePoints(story.relevanceReasons)[0])), 2)}
              </p>
            ) : displayQuote ? (
              <p className="text-base md:text-lg text-white/80 leading-relaxed max-w-2xl mb-4">
                &ldquo;{displayQuote}&rdquo;
              </p>
            ) : displaySummary ? (
              <p className="text-base md:text-lg text-white/80 leading-relaxed max-w-2xl mb-4">
                {displaySummary.slice(0, 200)}
              </p>
            ) : null}
            {/* Meta */}
            <div className="flex items-center gap-2 text-sm text-white/60">
              <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors">
                {story.feed.displayTitle || story.feed.title}
              </a>
              {dateStr && <><span>·</span><span>{dateStr}</span></>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section heading with rules
// ---------------------------------------------------------------------------

function RuledHeading({ issue }: { issue: PublicIssue }) {
  const colors = getCategoryColor(issue.slug)

  return (
    <div className="relative z-20 mb-6">
      <div className="flex items-center gap-4">
        <span className="flex-1 border-t border-neutral-200" aria-hidden="true" />
        <Link
          to={`/issues/${issue.slug}`}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
        >
          <span
            className={`w-3 h-3 rounded-full shrink-0`}
            style={{ backgroundColor: colors.hex }}
            aria-hidden="true"
          />
          <h2
            className="text-sm font-bold uppercase tracking-widest"
            style={{ color: colors.hex }}
          >
            {issue.name}
          </h2>
        </Link>
        <span className="flex-1 border-t border-neutral-200" aria-hidden="true" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Issue section with rotating layouts
// ---------------------------------------------------------------------------

type LayoutVariant = 'A' | 'B' | 'C'

function IssueSection({
  issue,
  allStories,
  heroStoryId,
  layout,
  divider,
}: {
  issue: PublicIssue
  allStories: PublicStory[]
  heroStoryId: string | null
  layout: LayoutVariant
  divider?: 'quote' | 'snippet' | 'diamond' | 'none'
}) {
  // Exclude the hero story from this section
  const stories = heroStoryId
    ? allStories.filter((s) => s.id !== heroStoryId)
    : allStories

  if (stories.length === 0) return null

  const [featured, ...rest] = stories

  return (
    <>
      <section className="relative mb-8 mt-16 md:mt-32">
        {/* Pre-rendered PNG to avoid Chromium inline-SVG compositing bug */}
        <div className="absolute -left-12 top-0 -translate-y-[40%] z-10 pointer-events-none select-none hidden md:block w-[200px] h-[200px]">
          <img src={`/illustrations/${issue.slug}.png`} alt="" className="opacity-[0.18] w-full h-full" />
        </div>

        <RuledHeading issue={issue} />

        <div className="relative">
          {/* Layout A: 2+3 grid (featured left, compacts right) */}
          {layout === 'A' && (
            <div className="grid gap-5 md:grid-cols-3">
              <div className="md:col-span-2">
                <StoryCard story={featured} variant="featured" />
              </div>
              {rest.length > 0 && (
                <div className="space-y-3">
                  {rest.slice(0, 3).map((story) => (
                    <StoryCard key={story.id} story={story} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Layout B: Full-width horizontal card + compact row below */}
          {layout === 'B' && (
            <div className="space-y-5">
              <StoryCard story={featured} variant="horizontal" />
              {rest.length > 0 && (
                <div className="grid gap-5 md:grid-cols-3">
                  {rest.slice(0, 3).map((story) => (
                    <StoryCard key={story.id} story={story} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Layout C: Three equal columns + compact remainder */}
          {layout === 'C' && (
            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-3">
                {stories.slice(0, 3).map((story) => (
                  <StoryCard key={story.id} story={story} variant="equal" />
                ))}
              </div>
              {stories.length > 3 && (
                <div className="grid gap-5 md:grid-cols-3">
                  {stories.slice(3, 6).map((story) => (
                    <StoryCard key={story.id} story={story} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section divider */}
      {divider === 'quote' && (
        <QuoteDivider stories={allStories} />
      )}
      {divider === 'snippet' && <DailySnippet issueSlug={issue.slug} />}
      {divider === 'diamond' && <hr className="section-divider" />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Quote divider using the new PullQuote component
// ---------------------------------------------------------------------------

function QuoteDivider({ stories }: { stories: PublicStory[] }) {
  const storyWithQuote = stories.find((s) => s.quote)
  if (!storyWithQuote) return null

  return <PullQuote story={storyWithQuote} />
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

const ISSUE_ORDER = [
  'cambio-climatico',
  'derechos-indigenas',
  'desarrollo-sostenible-y-autodeterminado',
  'chile-indigena',
]

const LAYOUTS: LayoutVariant[] = ['A', 'B', 'C']

export default function HomePage() {
  const { t } = useTranslation()
  const { positivity } = usePositivity()
  // Single API call — both emotion buckets per issue, mixed client-side
  const { data, isLoading } = useHomepageData()

  const issues = data?.issues ?? []
  const storiesByIssueBuckets = data?.storiesByIssue ?? {}
  const activeCases = data?.activeCases ?? []

  // Pick hero client-side from the issue buckets based on positivity
  const heroStory = pickHero(storiesByIssueBuckets, positivity)

  const sortedIssues = [...issues]
    .filter((i) => ISSUE_ORDER.includes(i.slug))
    .sort((a, b) => ISSUE_ORDER.indexOf(a.slug) - ISSUE_ORDER.indexOf(b.slug))

  return (
    <>
      <Helmet>
        <title>{SEO.defaultTitle}</title>
        <meta name="description" content={SEO.defaultDescription} />
        <meta property="og:title" content={SEO.defaultTitle} />
        <meta property="og:description" content={SEO.defaultDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/`} />
        <link rel="canonical" href={`${SEO.siteUrl}/`} />
        {CommonOgTags({ title: SEO.defaultTitle, description: SEO.defaultDescription })}
        <script type="application/ld+json">
          {JSON.stringify(buildWebSiteSchema())}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(buildOrganizationSchema())}
        </script>
      </Helmet>

      {/* Hero — show skeleton while loading */}
      {isLoading ? <HeroSkeleton /> : heroStory ? <HeroSection story={heroStory} /> : null}

      {/* En Foco — spotlight band (renders only when an active spotlight exists) */}
      <SpotlightBand />

      {/* Casos en curso — editorial case groupings (renders only when active cases exist) */}
      <CasosSection cases={activeCases} />

      {/* Issue sections with rotating layouts */}
      <div className="page-section-wide md:-mt-14 min-h-screen">
        {isLoading ? (
          // Show skeleton sections while data loads
          <>
            <IssueSectionSkeleton layout="A" />
            <IssueSectionSkeleton layout="B" />
            <IssueSectionSkeleton layout="C" />
            <IssueSectionSkeleton layout="A" />
          </>
        ) : sortedIssues.length > 0 ? (
          sortedIssues.map((issue, idx) => {
            const layout = LAYOUTS[idx % LAYOUTS.length]
            const isLast = idx === sortedIssues.length - 1
            const divider: 'quote' | 'snippet' | 'diamond' | 'none' = isLast
              ? 'none'
              : idx % 2 === 0
                ? 'quote'
                : 'snippet'

            const buckets = storiesByIssueBuckets[issue.slug]
            const mixed = buckets
              ? mixHomepageStories(buckets, 7, positivity)
              : []

            return (
              <IssueSection
                key={issue.id}
                issue={issue}
                allStories={mixed}
                heroStoryId={heroStory?.id ?? null}
                layout={layout}
                divider={divider}
              />
            )
          }).reduce<React.ReactNode[]>((acc, section, idx) => {
            acc.push(section)
            // Insert support banner after the 2nd issue section
            if (idx === 1) {
              acc.push(
                <SupportBanner key="support-banner" />
              )
            }
            return acc
          }, [])
        ) : (
          <p className="text-center text-neutral-500 py-12">
            {t('home.noStories')}
          </p>
        )}
      </div>
    </>
  )
}
