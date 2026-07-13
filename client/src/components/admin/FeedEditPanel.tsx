import { useMemo, useState } from 'react'
import type { Issue, FeedRegion } from '@shared/types'
import { FEED_REGIONS } from '@shared/constants'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { FeedFaviconPreview } from '../FeedFavicon'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useFeed, useUpdateFeed, useFeedQuality } from '../../hooks/useFeeds'
import { useEditForm } from '../../hooks/useEditForm'
import { adminApi } from '../../lib/admin-api'
import { useToast } from '../ui/Toast'
import { formatDateWithTime } from '../../lib/constants'
import { EditPanel, PANEL_BODY } from './EditPanel'
import { PanelFooter } from './PanelFooter'
import { buildIssueOptions } from './FeedForm'

interface FeedEditPanelProps {
  feedId: string | null
  issues: Issue[]
  onClose: () => void
}

function buildFormState(feed: { title: string; rssUrl: string; url: string | null; displayTitle: string | null; issueId: string; language: string; region: string | null; crawlIntervalHours: number; htmlSelector: string | null; active: boolean }) {
  return {
    title: feed.title,
    rssUrl: feed.rssUrl,
    url: feed.url || '',
    displayTitle: feed.displayTitle || '',
    issueId: feed.issueId,
    language: feed.language,
    region: feed.region || '',
    crawlIntervalHours: String(feed.crawlIntervalHours),
    htmlSelector: feed.htmlSelector || '',
    active: feed.active,
  }
}

function FaviconSection({ feedId }: { feedId: string }) {
  const [fetching, setFetching] = useState(false)
  const [imgKey, setImgKey] = useState(0)
  const { toast } = useToast()

  const handleFetch = async () => {
    setFetching(true)
    try {
      const result = await adminApi.feeds.fetchFavicon(feedId)
      if (result.success) {
        setImgKey(k => k + 1)
        toast('success', 'Favicon fetched')
      } else {
        toast('error', result.message)
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to fetch favicon')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <FeedFaviconPreview feedId={feedId} imgKey={imgKey} size={24} />
      <Button type="button" variant="ghost" size="sm" onClick={handleFetch} disabled={fetching}>
        {fetching ? 'Fetching...' : 'Fetch Favicon'}
      </Button>
    </div>
  )
}

function ExtractionMethodBreakdown({ methods }: { methods: Record<string, number> }) {
  const entries = Object.entries(methods).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <span className="font-medium">No data yet</span>

  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([method, count]) => (
        <span
          key={method}
          className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700"
        >
          {method} {Math.round((count / total) * 100)}%
        </span>
      ))}
    </div>
  )
}

function QualityCard({ feedId }: { feedId: string }) {
  const { data: metrics } = useFeedQuality()
  const m = metrics?.[feedId]
  if (!m) return null

  return (
    <div className="rounded-md bg-neutral-50 border border-neutral-200 p-3 text-sm">
      <p className="font-medium text-neutral-700 mb-2">Feed Quality</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
        <span>Publish Rate:</span>
        <span className="font-medium">{Math.round(m.publishRate * 100)}% ({m.publishedCount} of {m.totalCrawled})</span>
        <span>Avg Relevance:</span>
        <span className="font-medium">{m.avgRelevance?.toFixed(1) ?? '--'}</span>
        <span>Extraction:</span>
        <ExtractionMethodBreakdown methods={m.extractionMethods} />
      </div>
    </div>
  )
}

function FeedEditForm({ feedId, issues, onClose }: { feedId: string; issues: Issue[]; onClose: () => void }) {
  const { data: feed } = useFeed(feedId)
  const updateFeed = useUpdateFeed()

  const initialState = useMemo(() => buildFormState(feed!), [feed])

  const { form, set, isDirty, isPending, handleSubmit } = useEditForm({
    entityId: feedId,
    initialState,
    mutation: updateFeed,
    toPayload: (f) => ({
      title: f.title,
      rssUrl: f.rssUrl,
      url: f.url || null,
      displayTitle: f.displayTitle || null,
      issueId: f.issueId,
      language: f.language,
      region: (f.region || null) as FeedRegion | null,
      crawlIntervalHours: Number(f.crawlIntervalHours),
      htmlSelector: f.htmlSelector || null,
      active: f.active,
    }),
    successMessage: 'Feed updated',
    entityName: 'feed',
    onSuccess: onClose,
  })

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
      <div className={PANEL_BODY}>
        {feed!.lastCrawlError && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium">Last crawl error</p>
              <p>{feed!.lastCrawlError}</p>
              {feed!.lastCrawlErrorAt && (
                <p className="text-xs text-amber-600 mt-1">{formatDateWithTime(feed!.lastCrawlErrorAt)}</p>
              )}
            </div>
          </div>
        )}
        <Input id="feed-title" label="Title" value={form.title} onChange={e => set('title', e.target.value)} required />
        <Input id="feed-display-title" label="Display Title (optional)" value={form.displayTitle} onChange={e => set('displayTitle', e.target.value)} placeholder="Public-facing name" />
        <Input id="feed-rss-url" label="RSS URL" type="url" value={form.rssUrl} onChange={e => set('rssUrl', e.target.value)} required />
        <Input id="feed-url" label="Homepage URL (optional)" type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="e.g. https://reuters.com" />
        <Select
          id="feed-issue"
          label="Issue"
          placeholder="Select issue"
          value={form.issueId}
          onChange={e => set('issueId', e.target.value)}
          options={buildIssueOptions(issues)}
        />
        <Select
          id="feed-region"
          label="Region"
          placeholder="Select region (optional)"
          value={form.region}
          onChange={e => set('region', e.target.value)}
          options={FEED_REGIONS.map(r => ({ value: r.value, label: r.label }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input id="feed-lang" label="Language" value={form.language} onChange={e => set('language', e.target.value)} />
          <Input id="feed-interval" label="Interval (hours)" type="number" min="1" value={form.crawlIntervalHours} onChange={e => set('crawlIntervalHours', e.target.value)} />
        </div>
        <Input id="feed-selector" label="HTML Selector (optional)" value={form.htmlSelector} onChange={e => set('htmlSelector', e.target.value)} placeholder="e.g. article .content" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={e => set('active', e.target.checked)}
            className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
          />
          Active
        </label>
        <FaviconSection feedId={feedId} />
        <QualityCard feedId={feedId} />
      </div>
      <PanelFooter isPending={isPending} isDirty={isDirty} onCancel={onClose} />
    </form>
  )
}

export function FeedEditPanel({ feedId, issues, onClose }: FeedEditPanelProps) {
  const { data: feed, isLoading, error } = useFeed(feedId || '')

  return (
    <EditPanel
      open={!!feedId}
      onClose={onClose}
      title={feed?.title || 'Feed'}
      loading={isLoading}
      error={!!error}
    >
      {feed && <FeedEditForm feedId={feedId!} issues={issues} onClose={onClose} />}
    </EditPanel>
  )
}
