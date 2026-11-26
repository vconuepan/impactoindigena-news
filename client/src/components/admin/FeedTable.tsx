import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import {
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import type { Feed, Issue } from '@shared/types'
import type { FeedQualityMetrics } from '../../lib/admin-api'
import { FeedFaviconPreview } from '../FeedFavicon'
import { ActionIconButton } from '../ui/ActionIconButton'
import { formatDateWithTime } from '../../lib/constants'
import { TimeWithRelative } from './TimeWithRelative'

interface FeedTableProps {
  feeds: Feed[]
  issues: Issue[]
  qualityMetrics?: Record<string, FeedQualityMetrics>
  onEdit: (id: string) => void
  onCrawl: (id: string) => void
  onDelete: (id: string) => void
}

function getDominantMethod(methods?: Record<string, number>): string {
  if (!methods || Object.keys(methods).length === 0) return '--'
  return Object.entries(methods).sort((a, b) => b[1] - a[1])[0][0]
}

export function FeedTable({ feeds, issues, qualityMetrics, onEdit, onCrawl, onDelete }: FeedTableProps) {
  const issueMap = new Map(issues.map(i => [i.id, i.name]))

  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-neutral-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Title</th>
            <th scope="col" className="hidden md:table-cell text-left px-3 py-2 font-medium text-neutral-500">Issue</th>
            <th scope="col" className="hidden lg:table-cell text-left px-3 py-2 font-medium text-neutral-500">Lang</th>
            <th scope="col" className="hidden lg:table-cell text-left px-3 py-2 font-medium text-neutral-500">Interval</th>
            <th scope="col" className="hidden xl:table-cell text-center px-3 py-2 font-medium text-neutral-500">Pub %</th>
            <th scope="col" className="hidden xl:table-cell text-center px-3 py-2 font-medium text-neutral-500">Avg Rel.</th>
            <th scope="col" className="hidden xl:table-cell text-center px-3 py-2 font-medium text-neutral-500">Method</th>
            <th scope="col" className="hidden md:table-cell text-left px-3 py-2 font-medium text-neutral-500">Last Crawled</th>
            <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map(feed => (
            <tr key={feed.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <FeedFaviconPreview feedId={feed.id} size={16} />
                  <button
                    onClick={() => onEdit(feed.id)}
                    className="text-left font-medium text-neutral-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                  >
                    {feed.title}
                  </button>
                  <a
                    href={feed.url || feed.rssUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-neutral-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                    title={feed.url || feed.rssUrl}
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                  {feed.isLocal && (
                    <span
                      title="Local media: its stories get a +1 relevance bonus"
                      className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                    >
                      Local
                    </span>
                  )}
                  {feed.lastCrawlError && (
                    <span
                      title={`${feed.lastCrawlError}${feed.lastCrawlErrorAt ? ` (${formatDateWithTime(feed.lastCrawlErrorAt)})` : ''}`}
                      aria-label={`Crawl error: ${feed.lastCrawlError}`}
                      className="shrink-0 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                    >
                      {feed.lastCrawlError.length > 30
                        ? feed.lastCrawlError.slice(0, 30) + '\u2026'
                        : feed.lastCrawlError}
                    </span>
                  )}
                  {feed.consecutiveEmptyCrawls >= 3 && (
                    <span
                      title={`No new articles in last ${feed.consecutiveEmptyCrawls} crawls${feed.lastSuccessfulCrawlAt ? ` (last success: ${formatDateWithTime(feed.lastSuccessfulCrawlAt)})` : ''}`}
                      aria-label={`No new articles in last ${feed.consecutiveEmptyCrawls} crawls`}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                    >
                      <ClockIcon className="h-3.5 w-3.5" />
                      {feed.consecutiveEmptyCrawls} empty
                    </span>
                  )}
                </div>
                {/* Mobile metadata */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1 md:hidden">
                  <span className="text-neutral-500 text-xs">{issueMap.get(feed.issueId) || '—'}</span>
                  <span className="text-neutral-500 text-xs"><TimeWithRelative dateStr={feed.lastCrawledAt} /></span>
                </div>
              </td>
              <td className="hidden md:table-cell px-3 py-2 text-neutral-600">{issueMap.get(feed.issueId) || '—'}</td>
              <td className="hidden lg:table-cell px-3 py-2 text-neutral-600">{feed.language}</td>
              <td className="hidden lg:table-cell px-3 py-2 text-neutral-600">{feed.crawlIntervalHours}h</td>
              {(() => {
                const m = qualityMetrics?.[feed.id]
                return (
                  <>
                    <td className="hidden xl:table-cell px-3 py-2 text-center text-neutral-600 text-xs">
                      {m ? `${Math.round(m.publishRate * 100)}%` : '--'}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-2 text-center text-neutral-600 text-xs">
                      {m?.avgRelevance?.toFixed(1) ?? '--'}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-2 text-center text-neutral-600 text-xs">
                      {getDominantMethod(m?.extractionMethods)}
                    </td>
                  </>
                )
              })()}
              <td className="hidden md:table-cell px-3 py-2 text-neutral-500 whitespace-nowrap"><TimeWithRelative dateStr={feed.lastCrawledAt} /></td>
              <td className="px-3 py-2">
                {/* Desktop actions */}
                <div className="hidden md:flex items-center justify-end gap-0.5">
                  <ActionIconButton
                    icon={ArrowPathIcon}
                    label="Crawl"
                    onClick={() => onCrawl(feed.id)}
                  />
                  <ActionIconButton
                    icon={PencilSquareIcon}
                    label="Edit"
                    onClick={() => onEdit(feed.id)}
                  />
                  <ActionIconButton
                    icon={TrashIcon}
                    label="Delete"
                    variant="danger"
                    onClick={() => onDelete(feed.id)}
                  />
                </div>

                {/* Mobile overflow menu */}
                <div className="md:hidden flex justify-end">
                  <Menu as="div" className="relative">
                    <MenuButton className="rounded p-1 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      <EllipsisVerticalIcon className="h-5 w-5 text-neutral-400" />
                    </MenuButton>
                    <MenuItems className="absolute right-0 z-10 mt-1 w-40 rounded-md bg-white shadow-lg border border-neutral-200 py-1 focus:outline-none">
                      <MenuItem>
                        <button
                          onClick={() => onCrawl(feed.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 data-[focus]:bg-neutral-100"
                        >
                          <ArrowPathIcon className="h-4 w-4 shrink-0" />
                          Crawl
                        </button>
                      </MenuItem>
                      <MenuItem>
                        <button
                          onClick={() => onEdit(feed.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 data-[focus]:bg-neutral-100"
                        >
                          <PencilSquareIcon className="h-4 w-4 shrink-0" />
                          Edit
                        </button>
                      </MenuItem>
                      <MenuItem>
                        <button
                          onClick={() => onDelete(feed.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 data-[focus]:bg-red-50"
                        >
                          <TrashIcon className="h-4 w-4 shrink-0" />
                          Delete
                        </button>
                      </MenuItem>
                    </MenuItems>
                  </Menu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
