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
import { getHeadline } from '../lib/title-label'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildWebSiteSchema, buildOrganizationSchema } from '../lib/structured-data'
import SupportBanner from '../components/SupportBanner'
import SpotlightBand from '../components/SpotlightBand'
import CasosSection from '../components/CasosSection'
import DailySnippet from '../components/DailySnippet'
import { usePositivity } from '../contexts/PositivityContext'
import { mixHomepageStories, pickHero } from '../lib/mix-stories'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const NARRATIVE_LABELS: Record<string, string> = {
  protagonismo: 'Protagonismo',
  resiliencia: 'Resiliencia',
  alianza: 'Alianza',
  confrontacion: 'Confrontación',
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function HeroSection({ story }: { story: PublicStory }) {
  const { i18n } = useTranslation()
  const issueSlug = story.issue?.slug ?? story.feed?.issue?.slug ?? 'general-news'
  const issueName = story.issue?.name ?? story.feed?.issue?.name ?? ''
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

  const deckText = story.relevanceReasons && parsePoints(story.relevanceReasons)[0]
    ? limitSentences(stripPrefix(stripMarkdown(parsePoints(story.relevanceReasons)[0])), 2)
    : displayQuote
      ? `"${displayQuote}"`
      : displaySummary
        ? displaySummary.slice(0, 240)
        : null

  return (
    <section className="relative overflow-hidden">
      <div className="relative w-full h-[560px] md:h-[600px] overflow-hidden bg-neutral-900">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover opacity-90"
            fetchPriority="high"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div
            className="w-full h-full relative"
            style={{ background: 'linear-gradient(150deg, rgba(13,95,60,0.8) 0%, #1a1a1a 60%)' }}
          >
            {Pattern && <Pattern opacity={0.18} />}
          </div>
        )}

        {/* Brand green gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(13,95,60,0.88) 0%, rgba(13,95,60,0.42) 55%, rgba(13,95,60,0.06) 100%)' }}
        />

        {/* Geometric watermark — top right, opacity 0.04 */}
        {Pattern && (
          <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none select-none" aria-hidden="true">
            <Pattern opacity={0.04} />
          </div>
        )}

        {/* Content */}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-4xl mx-auto px-4 md:px-14 pb-10 md:pb-14">

            {/* Eyebrow: accent line + issue + narrativeFrame */}
            <div className="flex items-center gap-3 mb-5">
              <span aria-hidden="true" style={{ width: '24px', height: '1px', backgroundColor: '#C8473A', flexShrink: 0 }} />
              <span
                className="font-dm-sans"
                style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.60)' }}
              >
                {issueName}
                {issueName && story.narrativeFrame && (
                  <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
                )}
                {story.narrativeFrame && (
                  <span style={{ fontStyle: 'italic', textTransform: 'none', letterSpacing: '0.02em' }}>
                    {NARRATIVE_LABELS[story.narrativeFrame] ?? story.narrativeFrame}
                  </span>
                )}
              </span>
            </div>

            {/* Title */}
            <h1
              className="font-fraunces text-white mb-5"
              style={{ fontSize: 'clamp(42px, 4.5vw, 62px)', fontWeight: '700', lineHeight: '1.06', letterSpacing: '-0.02em', maxWidth: '820px' }}
            >
              <Link
                to={`/stories/${story.slug}`}
                className="hover:text-white/90 transition-colors focus-visible:ring-2 focus-visible:ring-white rounded"
              >
                {getHeadline(localizedStory)}
              </Link>
            </h1>

            {/* Deck */}
            {deckText && (
              <p
                className="mb-4"
                style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.65', maxWidth: '520px' }}
              >
                {deckText}
              </p>
            )}

            {/* Byline */}
            <div className="flex items-center gap-2 font-dm-sans" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)' }}>
              <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">
                {story.feed.displayTitle || story.feed.title}
              </a>
              {dateStr && <><span aria-hidden="true">·</span><span>{dateStr}</span></>}
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section heading — editorial ruled style
// ---------------------------------------------------------------------------

function RuledSection({ issue }: { issue: PublicIssue }) {
  const colors = getCategoryColor(issue.slug)

  return (
    <div
      className="relative z-20 flex items-center"
      style={{ gap: '14px', padding: '36px 0 18px', borderBottom: '2px solid #1C1917', marginBottom: '24px' }}
    >
      <span
        className="shrink-0"
        style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: colors.hex }}
        aria-hidden="true"
      />
      <h2
        className="font-fraunces"
        style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.01em', color: '#1C1917' }}
      >
        {issue.name}
      </h2>
      <Link
        to={`/issues/${issue.slug}`}
        className="ml-auto font-dm-sans hover:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
        style={{ fontSize: '11px', fontWeight: '600', color: '#0D5F3C', whiteSpace: 'nowrap' }}
      >
        Ver todas →
      </Link>
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
      <section className={`relative mb-8 mt-16 md:mt-32 ${layout === 'B' ? '-mx-4 md:-mx-8 px-4 md:px-8 py-8 md:py-12 bg-neutral-50/70 rounded-none' : ''}`}>
        {/* Pre-rendered PNG to avoid Chromium inline-SVG compositing bug */}
        <div className="absolute -left-12 top-0 -translate-y-[40%] z-10 pointer-events-none select-none hidden md:block w-[200px] h-[200px]">
          <img src={`/illustrations/${issue.slug}.png`} alt="" className="opacity-[0.18] w-full h-full" />
        </div>

        <RuledSection issue={issue} />

        <div className="relative">
          {/* Layout A: editorial grid 1.7fr/1fr with 1px separators (NYT/Guardian style) */}
          {layout === 'A' && (
            <>
              {/* Mobile: stacked */}
              <div className="block md:hidden space-y-4">
                <StoryCard story={featured} variant="featured" />
                {rest.slice(0, 2).map((story) => (
                  <StoryCard key={story.id} story={story} variant="compact" />
                ))}
              </div>
              {/* Desktop: editorial grid */}
              <div
                className="hidden md:grid"
                style={{
                  gridTemplateColumns: '1.7fr 1fr',
                  gap: '1px',
                  background: '#E7E5E4',
                  border: '1px solid #E7E5E4',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ gridRow: '1 / 3', background: '#FFFFFF' }}>
                  <StoryCard story={featured} variant="featured" />
                </div>
                {rest.slice(0, 2).map((story) => (
                  <div
                    key={story.id}
                    className="[&_article]:border-b-0 [&_article]:py-0"
                    style={{ background: '#FFFFFF', padding: '24px 28px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                  >
                    <StoryCard story={story} variant="compact" />
                  </div>
                ))}
              </div>
            </>
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
// Mission statement section
// ---------------------------------------------------------------------------

function StatementSection() {
  return (
    <section
      className="my-12 mx-auto"
      style={{
        background: '#0D5F3C',
        padding: 'clamp(40px, 6vw, 64px) clamp(24px, 5vw, 56px)',
        borderRadius: '6px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative concentric circles */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', right: '-60px', bottom: '-60px',
          width: '280px', height: '280px', borderRadius: '50%',
          border: '50px solid rgba(255,255,255,0.04)',
          pointerEvents: 'none', userSelect: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', right: '50px', bottom: '50px',
          width: '150px', height: '150px', borderRadius: '50%',
          border: '30px solid rgba(255,255,255,0.04)',
          pointerEvents: 'none', userSelect: 'none',
        }}
      />

      {/* Eyebrow */}
      <div className="flex items-center gap-3 mb-6">
        <span aria-hidden="true" style={{ width: '20px', height: '1px', backgroundColor: '#C8473A', flexShrink: 0 }} />
        <span
          className="font-dm-sans"
          style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}
        >
          Nuestra misión
        </span>
      </div>

      {/* Main text */}
      <p
        className="font-fraunces mb-8"
        style={{
          fontSize: 'clamp(28px, 2.8vw, 38px)',
          fontWeight: '300',
          fontStyle: 'italic',
          lineHeight: '1.35',
          color: 'rgba(255,255,255,0.95)',
          maxWidth: '680px',
        }}
      >
        Cubrimos las historias que ponen a los pueblos indígenas como protagonistas, no como víctimas.
      </p>

      {/* CTA */}
      <Link
        to="/metodologia"
        className="font-dm-sans transition-colors hover:border-white/60"
        style={{
          display: 'inline-block',
          border: '1px solid rgba(255,255,255,0.30)',
          borderRadius: '9999px',
          fontSize: '13px',
          fontWeight: '600',
          color: '#fff',
          padding: '10px 20px',
          textDecoration: 'none',
        }}
      >
        Nuestra metodología →
      </Link>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

const ISSUE_ORDER = [
  'chile-indigena',
  'cambio-climatico',
  'derechos-indigenas',
  'desarrollo-sostenible-y-autodeterminado',
]

const LAYOUTS: LayoutVariant[] = ['A', 'B', 'C']

export default function HomePage() {
  const { t } = useTranslation()
  const { positivity } = usePositivity()
  // Single API call — both emotion buckets per issue, mixed client-side
  const { data, isLoading, isError } = useHomepageData()

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

      {/* API error banner — visible when the data fetch fails */}
      {!isLoading && isError && (
        <div role="alert" className="page-section">
          <div className="max-w-lg mx-auto text-center py-12">
            <p className="text-lg font-semibold text-neutral-800 mb-2">{t('home.apiError')}</p>
            <p className="text-neutral-500">{t('home.apiErrorDesc')}</p>
          </div>
        </div>
      )}

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
            if (idx === 0) {
              acc.push(<StatementSection key="statement-section" />)
            }
            if (idx === 1) {
              acc.push(<SupportBanner key="support-banner" />)
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
