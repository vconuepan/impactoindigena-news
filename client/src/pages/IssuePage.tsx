import { useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../lib/api'
import { usePublicIssue } from '../hooks/usePublicIssues'
import { usePublicStories } from '../hooks/usePublicStories'
import { getCategoryColor } from '../lib/category-colors'
import StoryCard from '../components/StoryCard'
import PullQuote from '../components/PullQuote'
import Pagination from '../components/Pagination'
import { IssuePageSkeleton } from '../components/skeletons'
import { SEO, CommonOgTags } from '../lib/seo'
import { buildCollectionPageSchema, buildBreadcrumbSchema } from '../lib/structured-data'
import { usePositivity } from '../contexts/PositivityContext'
import DailySnippet from '../components/DailySnippet'
import { positivityToEmotionTags } from '../lib/mix-stories'
import type { PublicStory } from '@shared/types'

// ---------------------------------------------------------------------------
// Story group with a specific layout variant
// ---------------------------------------------------------------------------

type LayoutVariant = 'A' | 'B' | 'C'
const LAYOUTS: LayoutVariant[] = ['A', 'B', 'C']

function StoryGroup({
  stories,
  layout,
}: {
  stories: PublicStory[]
  layout: LayoutVariant
}) {
  if (stories.length === 0) return null

  const [first, ...rest] = stories

  // Layout A: featured (2-col) + compact sidebar
  if (layout === 'A') {
    return (
      <div className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <StoryCard story={first} variant="featured" />
        </div>
        {rest.length > 0 && (
          <div className="space-y-3">
            {rest.map((story) => (
              <StoryCard key={story.id} story={story} variant="compact" />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Layout B: full-width horizontal card + compact row
  if (layout === 'B') {
    return (
      <div className="space-y-5">
        <StoryCard story={first} variant="horizontal" />
        {rest.length > 0 && (
          <div className="grid gap-5 md:grid-cols-3">
            {rest.map((story) => (
              <StoryCard key={story.id} story={story} variant="compact" />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Layout C: equal columns
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        {stories.slice(0, 3).map((story) => (
          <StoryCard key={story.id} story={story} variant="equal" />
        ))}
      </div>
      {stories.length > 3 && (
        <div className="grid gap-5 md:grid-cols-3">
          {stories.slice(3).map((story) => (
            <StoryCard key={story.id} story={story} variant="compact" />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quote divider using the PullQuote component
// ---------------------------------------------------------------------------

function QuoteDivider({ stories }: { stories: PublicStory[] }) {
  const storyWithQuote = stories.find((s) => s.quote)
  if (!storyWithQuote) return null

  return <PullQuote story={storyWithQuote} />
}

// ---------------------------------------------------------------------------
// Issue page
// ---------------------------------------------------------------------------

/** Split an array into chunks of a given size */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

const PAGE_SIZE = 12

export default function IssuePage() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') ?? '1', 10) || 1
  const { positivity } = usePositivity()
  const { data: issue, isLoading, isError } = usePublicIssue(slug ?? '')

  const emotionTags = positivityToEmotionTags(positivity)

  // Server-side pagination with emotion tag filtering
  const { data: storiesData } = usePublicStories({
    issueSlug: slug,
    emotionTags: emotionTags?.join(','),
    page,
    pageSize: PAGE_SIZE,
  })

  // Reset to page 1 when positivity changes
  useEffect(() => {
    if (page !== 1) {
      setSearchParams((prev) => { prev.delete('page'); return prev })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positivity])

  if (isLoading) {
    return <IssuePageSkeleton />
  }

  if (isError || !issue) {
    return (
      <div className="page-section text-center">
        <h1 className="page-title">{t('issuePage.notFound')}</h1>
        <p className="text-neutral-500 mb-6">{t('issuePage.notFoundDesc')}</p>
        <Link
          to="/issues"
          className="text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
        >
          {t('issuePage.viewAllIssues')}
        </Link>
      </div>
    )
  }

  const stories = storiesData?.data ?? []
  const totalPages = storiesData?.totalPages ?? 1
  const colors = getCategoryColor(slug ?? 'general-news')

  // Only show children with published stories
  const activeChildren = (issue.children ?? []).filter(
    (child) => (child.publishedStoryCount ?? 0) > 0,
  )

  const hasAboutContent =
    (issue.evaluationCriteria?.length ?? 0) > 0 ||
    (issue.sourceNames?.length ?? 0) > 0 ||
    (issue.makeADifference?.length ?? 0) > 0

  // Break stories into groups of 4 for layout rotation
  const storyGroups = chunk(stories, 4)

  return (
    <>
      <Helmet>
        <title>{issue.name} - {SEO.siteName}</title>
        <meta name="description" content={(issue.intro || issue.description).slice(0, 160)} />
        <meta property="og:title" content={`${issue.name} - ${SEO.siteName}`} />
        <meta property="og:description" content={(issue.intro || issue.description).slice(0, 200)} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/issues/${slug}`} />
        <link rel="canonical" href={`${SEO.siteUrl}/issues/${slug}`} />
        {CommonOgTags({})}
        <link rel="alternate" type="application/rss+xml" title={`${issue.name} RSS Feed`} href={`${API_BASE}/feed/${slug}`} />
        <script type="application/ld+json">
          {JSON.stringify(buildCollectionPageSchema(issue))}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(buildBreadcrumbSchema([
            { name: 'Home', url: SEO.siteUrl },
            ...(issue.parent ? [{ name: issue.parent.name, url: `${SEO.siteUrl}/issues/${issue.parent.slug}` }] : []),
            { name: issue.name },
          ]))}
        </script>
      </Helmet>

      {/* Category color bar at top */}
      <div className="h-1 w-full mb-0" style={{ backgroundColor: colors.hex }} />

      <div className="page-section-wide">
        {/* Header — compact inline */}
        <header className="mb-5 pt-2">
          {issue.parent && (
            <Link
              to={`/issues/${issue.parent.slug}`}
              className="text-xs font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5 mb-2 inline-flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{ color: colors.hex }}
            >
              &larr; {issue.parent.name}
            </Link>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors.hex }} aria-hidden="true" />
              <h1 className="text-xl md:text-2xl font-bold">{issue.name}</h1>
            </div>
            <a
              href={`${API_BASE}/feed/${slug}`}
              className="shrink-0 p-1.5 text-neutral-400 hover:text-brand-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              title={`RSS feed for ${issue.name}`}
              aria-label={`RSS feed for ${issue.name}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z" />
              </svg>
            </a>
          </div>
        </header>

        {/* Daily editorial snippet */}
        <DailySnippet issueSlug={slug} />

        {/* Sub-topics — only those with stories */}
        {activeChildren.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {activeChildren.map((child) => {
              const childColors = getCategoryColor(child.slug)
              return (
                <Link
                  key={child.slug}
                  to={`/issues/${child.slug}`}
                  className="inline-flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-sm font-normal px-3 py-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: childColors.hex }} aria-hidden="true" />
                  {child.name}
                </Link>
              )
            })}
          </div>
        )}

        {/* Stories — rotating magazine layouts */}
        {stories.length > 0 ? (
          <>
            {storyGroups.map((group, idx) => {
              const layout = LAYOUTS[idx % LAYOUTS.length]
              const isLast = idx === storyGroups.length - 1
              const useQuote = idx % 2 === 0

              return (
                <div key={idx}>
                  <StoryGroup stories={group} layout={layout} />

                  {/* Divider between groups */}
                  {!isLast && (
                    useQuote
                      ? <QuoteDivider stories={group} />
                      : <hr className="section-divider" />
                  )}
                </div>
              )
            })}

            <Pagination
              page={storiesData?.page ?? 1}
              totalPages={totalPages}
              onPageChange={(newPage) => {
                setSearchParams((prev) => {
                  if (newPage === 1) prev.delete('page')
                  else prev.set('page', String(newPage))
                  return prev
                })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </>
        ) : (
          <p className="text-neutral-500 py-8 text-center">
            {t('issuePage.noStories')}
          </p>
        )}

        {/* About this issue — collapsible on mobile, always visible on md+ */}
        {hasAboutContent && (
          <>
            <hr className="section-divider" />

            {/* Mobile: collapsible */}
            <details className="group mb-8 md:hidden">
              <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-500 uppercase tracking-wide py-3 list-none flex items-center gap-2 hover:text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                <svg
                  className="w-4 h-4 transition-transform group-open:rotate-90"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {t('issuePage.about', { name: issue.name })}
              </summary>

              <div className="pt-4 pb-2 grid gap-8">
                {/* Evaluation criteria */}
                {issue.evaluationCriteria?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.howWeEvaluate')}</h3>
                    {issue.evaluationIntro && (
                      <p className="text-sm text-neutral-500 mb-2">{issue.evaluationIntro}</p>
                    )}
                    <ol className="list-decimal list-inside space-y-1 text-sm text-neutral-600">
                      {issue.evaluationCriteria.map((criterion, i) => (
                        <li key={i}>{criterion}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Sources */}
                {issue.sourceNames?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.ourSources')}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {issue.sourceNames.map((source) => (
                        <span
                          key={source}
                          className="bg-neutral-100 text-neutral-600 text-xs px-2 py-0.5 rounded-full"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Make a difference */}
                {issue.makeADifference?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.makeADifference')}</h3>
                    <ul className="space-y-1">
                      {issue.makeADifference.map((link) => (
                        <li key={link.url}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                          >
                            {link.label}
                            <span className="sr-only"> {t('issuePage.opensInNewTab')}</span>
                            {' '}
                            <svg className="inline w-3.5 h-3.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>

            {/* Desktop: always visible, no collapse */}
            <div className="hidden md:block mb-8">
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide py-3">
                {t('issuePage.about', { name: issue.name })}
              </h2>

              <div className="pt-4 pb-2 grid gap-8" style={{ gridTemplateColumns: '3fr 2fr' }}>
                {/* Evaluation criteria — left column (~60%) */}
                {issue.evaluationCriteria?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.howWeEvaluate')}</h3>
                    {issue.evaluationIntro && (
                      <p className="text-sm text-neutral-500 mb-2">{issue.evaluationIntro}</p>
                    )}
                    <ol className="list-decimal list-inside space-y-1 text-sm text-neutral-600">
                      {issue.evaluationCriteria.map((criterion, i) => (
                        <li key={i}>{criterion}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Right column (~40%) — Sources stacked above Make a Difference */}
                <div className="space-y-6">
                  {/* Sources */}
                  {issue.sourceNames?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.ourSources')}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {issue.sourceNames.map((source) => (
                          <span
                            key={source}
                            className="bg-neutral-100 text-neutral-600 text-xs px-2 py-0.5 rounded-full"
                          >
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Make a difference */}
                  {issue.makeADifference?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-neutral-700 mb-2">{t('issuePage.makeADifference')}</h3>
                      <ul className="space-y-1">
                        {issue.makeADifference.map((link) => (
                          <li key={link.url}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                            >
                              {link.label}
                              <span className="sr-only"> {t('issuePage.opensInNewTab')}</span>
                              {' '}
                              <svg className="inline w-3.5 h-3.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        {/* Contextual guide links for relevant issues */}
        {ISSUE_GUIDES[slug ?? ''] && (
          <div className="mt-8 pt-6 border-t border-neutral-100">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Profundiza</p>
            <div className="flex flex-wrap gap-3">
              {ISSUE_GUIDES[slug ?? ''].map((guide) => (
                <Link
                  key={guide.href}
                  to={guide.href}
                  className="text-sm text-brand-800 hover:text-brand-700 font-medium border border-brand-200 hover:border-brand-400 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {guide.label} →
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Guide links to show on specific issue pages
// ---------------------------------------------------------------------------
const ISSUE_GUIDES: Record<string, { label: string; href: string }[]> = {
  'chile-indigena': [
    { label: 'Pueblos Indígenas de Chile', href: '/guia/pueblos-indigenas-chile' },
    { label: 'Pueblo Mapuche', href: '/guia/pueblo-mapuche' },
    { label: 'Consulta Previa y CLPI', href: '/guia/consulta-previa-fpic' },
  ],
  'derechos-indigenas': [
    { label: 'Consulta Previa y CLPI', href: '/guia/consulta-previa-fpic' },
    { label: 'Pueblo Mapuche', href: '/guia/pueblo-mapuche' },
  ],
  'reconciliacion-y-paz': [
    { label: 'Pueblo Mapuche', href: '/guia/pueblo-mapuche' },
    { label: 'Consulta Previa y CLPI', href: '/guia/consulta-previa-fpic' },
  ],
}
