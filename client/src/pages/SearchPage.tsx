import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { usePublicStories } from '../hooks/usePublicStories'
import StoryCard from '../components/StoryCard'
import Pagination from '../components/Pagination'
import { SearchResultsSkeleton } from '../components/skeletons'
import { SEO, CommonOgTags } from '../lib/seo'

export default function SearchPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const [page, setPage] = useState(1)

  // Local form state, kept in sync with the URL (the URL is the source of truth)
  const [qInput, setQInput] = useState(q)
  const [fromInput, setFromInput] = useState(from)
  const [toInput, setToInput] = useState(to)
  useEffect(() => {
    setQInput(q)
    setFromInput(from)
    setToInput(to)
    setPage(1)
  }, [q, from, to])

  const hasFilters = Boolean(q || from || to)

  const { data, isLoading } = usePublicStories({
    search: q || undefined,
    dateFrom: from || undefined,
    dateTo: to || undefined,
    page,
    pageSize: 12,
  })
  const stories = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  function applyFilters(e: FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams()
    const trimmed = qInput.trim()
    if (trimmed.length >= 2) next.set('q', trimmed)
    if (fromInput) next.set('from', fromInput)
    if (toInput) next.set('to', toInput)
    setSearchParams(next)
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams())
  }

  const inputClass =
    'px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition-colors'

  return (
    <>
      <Helmet>
        <title>{q ? t('search.title', { q }) : t('search.label')} - {SEO.siteName}</title>
        <meta name="description" content={q ? t('search.pageTitle', { q }) : t('search.defaultTitle')} />
        <meta property="og:title" content={q ? `${t('search.title', { q })} - ${SEO.siteName}` : `${t('search.label')} - ${SEO.siteName}`} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${SEO.siteUrl}/search`} />
        <meta name="robots" content="noindex, follow" />
        {CommonOgTags({})}
      </Helmet>
      <div className="page-section-wide">
        <header className="mb-6 border-b border-neutral-100 pb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">{t('search.label')}</p>
          <h1 className="text-2xl md:text-3xl font-bold">
            {q ? t('search.resultsFor', { q }) : t('search.defaultTitle') || 'Buscar noticias'}
          </h1>
          {hasFilters && !isLoading && (
            <p className="text-sm text-neutral-500 mt-1">
              {t('search.results_other', { count: data?.total ?? 0 })}
            </p>
          )}
        </header>

        <form onSubmit={applyFilters} className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="search-q" className="block text-xs font-semibold text-neutral-500 mb-1">
              {t('search.label')}
            </label>
            <input
              id="search-q"
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              autoFocus={!hasFilters}
              placeholder={t('nav.searchPlaceholder')}
              aria-label={t('nav.searchLabel')}
              className={`w-full ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="search-from" className="block text-xs font-semibold text-neutral-500 mb-1">
              {t('search.dateFrom')}
            </label>
            <input
              id="search-from"
              type="date"
              value={fromInput}
              max={toInput || undefined}
              onChange={(e) => setFromInput(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="search-to" className="block text-xs font-semibold text-neutral-500 mb-1">
              {t('search.dateTo')}
            </label>
            <input
              id="search-to"
              type="date"
              value={toInput}
              min={fromInput || undefined}
              onChange={(e) => setToInput(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {t('search.label')}
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-normal text-neutral-600 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t('search.clearFilters')}
              </button>
            )}
          </div>
        </form>

        {!hasFilters ? (
          <p className="text-center text-neutral-500 py-8">{t('search.promptFilters')}</p>
        ) : isLoading ? (
          <SearchResultsSkeleton />
        ) : stories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-500 mb-4">
              {q ? t('search.noResults', { q }) : t('search.noResultsFiltered')}
            </p>
            <Link
              to="/"
              className="text-brand-800 hover:text-brand-700 font-normal focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
            >
              {t('search.backToHome')}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-3">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} variant="equal" />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  )
}
