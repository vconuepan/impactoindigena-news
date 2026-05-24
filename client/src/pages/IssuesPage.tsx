import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePublicIssues } from '../hooks/usePublicIssues'
import { getCategoryColor } from '../lib/category-colors'
import { IssueAccordionSkeleton } from '../components/skeletons'
import { SEO, CommonOgTags } from '../lib/seo'
import type { PublicIssue } from '../lib/api'

function IssueAccordion({ issue }: { issue: PublicIssue }) {
  const { t } = useTranslation()
  const colors = getCategoryColor(issue.slug)

  const hasDetails =
    (issue.evaluationCriteria?.length ?? 0) > 0 ||
    (issue.sourceNames?.length ?? 0) > 0 ||
    (issue.makeADifference?.length ?? 0) > 0

  return (
    <details className="group">
      <summary className="cursor-pointer select-none list-none flex items-center gap-3 py-4 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500">
        <svg
          className="w-4 h-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.hex }} aria-hidden="true" />
        <span className="text-lg font-bold text-neutral-900">{issue.name}</span>
      </summary>

      <div className="pl-11 pb-4 space-y-4">
        {/* Intro */}
        {(issue.intro || issue.description) && (
          <p className="text-neutral-600 text-sm leading-relaxed">
            {issue.intro || issue.description}
          </p>
        )}

        {/* Sub-topics */}
        {issue.children && issue.children.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {issue.children.map((child) => {
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

        {/* Details grid */}
        {hasDetails && (
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            {issue.evaluationCriteria?.length > 0 && (
              <div>
                <h3 className="font-bold text-neutral-700 mb-1.5">{t('issuePage.howWeEvaluate')}</h3>
                {issue.evaluationIntro && (
                  <p className="text-neutral-500 mb-1.5">{issue.evaluationIntro}</p>
                )}
                <ol className="list-decimal list-inside space-y-0.5 text-neutral-600">
                  {issue.evaluationCriteria.map((criterion, i) => (
                    <li key={i}>{criterion}</li>
                  ))}
                </ol>
              </div>
            )}

            {issue.sourceNames?.length > 0 && (
              <div>
                <h3 className="font-bold text-neutral-700 mb-1.5">{t('issuePage.ourSources')}</h3>
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

            {issue.makeADifference?.length > 0 && (
              <div>
                <h3 className="font-bold text-neutral-700 mb-1.5">{t('issuePage.makeADifference')}</h3>
                <ul className="space-y-1">
                  {issue.makeADifference.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                      >
                        {link.label}
                        <span className="sr-only"> {t('issuePage.opensInNewTab')}</span>
                        {' '}&rarr;
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* View stories link */}
        <div>
          <Link
            to={`/issues/${issue.slug}`}
            className="inline-flex items-center gap-2 text-sm font-normal hover:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5"
            style={{ color: colors.hex }}
          >
            {t('issuePage.viewStories')} →
          </Link>
        </div>
      </div>
    </details>
  )
}

const ISSUE_ORDER = [
  'cambio-climatico',
  'derechos-indigenas',
  'desarrollo-sostenible-y-autodeterminado',
  'chile-indigena',
]

export default function IssuesPage() {
  const { t } = useTranslation()
  const { data: issues, isLoading } = usePublicIssues()
  const sorted = [...(issues ?? [])].sort(
    (a, b) => ISSUE_ORDER.indexOf(a.slug) - ISSUE_ORDER.indexOf(b.slug),
  )

  return (
    <>
      <Helmet>
        <title>{t('issuesPage.title')} - {SEO.siteName}</title>
        <meta
          name="description"
          content={t('issuesPage.subtitle')}
        />
        <meta property="og:title" content={`${t('issuesPage.title')} - ${SEO.siteName}`} />
        <meta property="og:description" content={t('issuesPage.subtitle')} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/issues`} />
        <link rel="canonical" href={`${SEO.siteUrl}/issues`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section-wide">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{t('issuesPage.title')}</h1>
          <p className="text-sm text-neutral-500">
            {t('issuesPage.subtitle')}
          </p>
        </header>

        <div className="divide-y divide-neutral-200">
          {isLoading ? (
            // Show skeleton accordions while loading
            <>
              <IssueAccordionSkeleton />
              <IssueAccordionSkeleton />
              <IssueAccordionSkeleton />
              <IssueAccordionSkeleton />
            </>
          ) : (
            sorted.map((issue) => (
              <IssueAccordion key={issue.slug} issue={issue} />
            ))
          )}
        </div>
      </div>
    </>
  )
}
