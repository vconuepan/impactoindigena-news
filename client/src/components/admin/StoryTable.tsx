import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import {
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
  GlobeAltIcon,
  XCircleIcon,
  ArchiveBoxXMarkIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import type { Story, StoryStatus } from '@shared/types'
import { Badge } from '../ui/Badge'
import { ActionIconButton } from '../ui/ActionIconButton'
import { STATUS_VARIANTS, EMOTION_VARIANTS, formatStatus, formatShortDate } from '../../lib/constants'

function ClusterBadge({ story }: { story: Story }) {
  if (!story.clusterId) return null
  const isPrimary = story.cluster?.primaryStoryId === story.id
  return (
    <Link to={`/admin/clusters?open=${story.clusterId}`}>
      <Badge variant={isPrimary ? 'green' : 'purple'} className="shrink-0 hover:opacity-80">
        {isPrimary ? 'Primary' : 'Cluster'}
      </Badge>
    </Link>
  )
}

interface StoryTableProps {
  stories: Story[]
  selectedIds: Set<string>
  processingIds?: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  allSelected: boolean
  onView: (id: string) => void
  onStatusChange: (id: string, status: StoryStatus) => void
  onDelete: (id: string) => void
  onPreassess?: (id: string) => void
  onAssess?: (id: string) => void
  onPublish?: (id: string) => void
}

function getJobActions(story: Story) {
  const actions: { label: string; icon: typeof SparklesIcon; handler: 'preassess' | 'assess' | 'publish' }[] = []

  switch (story.status) {
    case 'fetched':
      actions.push({ label: 'Pre-assess', icon: AdjustmentsHorizontalIcon, handler: 'preassess' })
      break
    case 'pre_analyzed':
      actions.push({ label: 'Assess', icon: SparklesIcon, handler: 'assess' })
      break
    case 'analyzed':
      actions.push({ label: 'Re-analyze', icon: SparklesIcon, handler: 'assess' })
      actions.push({ label: 'Publish', icon: GlobeAltIcon, handler: 'publish' })
      break
    case 'selected':
      actions.push({ label: 'Re-analyze', icon: SparklesIcon, handler: 'assess' })
      actions.push({ label: 'Publish', icon: GlobeAltIcon, handler: 'publish' })
      break
    case 'published':
      actions.push({ label: 'Re-analyze', icon: SparklesIcon, handler: 'assess' })
      break
  }

  return actions
}

function MenuItemWithIcon({ icon: Icon, label, onClick, danger }: {
  icon: typeof SparklesIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <MenuItem>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm ${
          danger
            ? 'text-red-600 data-[focus]:bg-red-50'
            : 'text-neutral-700 data-[focus]:bg-neutral-100'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </button>
    </MenuItem>
  )
}

export function StoryTable({
  stories,
  selectedIds,
  processingIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  onView,
  onStatusChange,
  onDelete,
  onPreassess,
  onAssess,
  onPublish,
}: StoryTableProps) {
  const jobHandlers: Record<string, ((id: string) => void) | undefined> = {
    preassess: onPreassess,
    assess: onAssess,
    publish: onPublish,
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-neutral-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th scope="col" className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected && stories.length > 0}
                onChange={onToggleSelectAll}
                className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                aria-label="Select all stories"
              />
            </th>
            <th scope="col" className="text-left px-3 py-2 font-medium text-neutral-500">Title</th>
            <th scope="col" className="hidden md:table-cell text-left px-3 py-2 font-medium text-neutral-500">Status</th>
            <th scope="col" className="hidden md:table-cell text-left px-3 py-2 font-medium text-neutral-500">Rating</th>
            <th scope="col" className="hidden lg:table-cell text-left px-3 py-2 font-medium text-neutral-500">Emotion</th>
            <th scope="col" className="hidden lg:table-cell text-left px-3 py-2 font-medium text-neutral-500">Crawled</th>
            <th scope="col" className="px-3 py-2 text-right font-medium text-neutral-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stories.map(story => {
            const isProcessing = processingIds?.has(story.id) ?? false
            const jobActions = getJobActions(story)
            const hasJobActions = jobActions.some(a => jobHandlers[a.handler])

            return (
              <tr
                key={story.id}
                className={`border-b border-neutral-100 last:border-0 ${isProcessing ? 'bg-brand-50/50' : 'hover:bg-neutral-50'}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(story.id)}
                    onChange={() => onToggleSelect(story.id)}
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`Select ${story.title || story.sourceTitle}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {isProcessing && (
                      <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-label="Processing" />
                    )}
                    <button
                      onClick={() => onView(story.id)}
                      className="text-left font-medium text-neutral-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                    >
                      {story.title || story.sourceTitle}
                    </button>
                    <ClusterBadge story={story} />
                    {(story._count?.blueskyPosts ?? 0) > 0 && (
                      <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0 text-blue-500" aria-label="Posted to Bluesky" title="Posted to Bluesky" />
                    )}
                    {(story._count?.mastodonPosts ?? 0) > 0 && (
                      <GlobeAltIcon className="h-4 w-4 shrink-0 text-purple-500" aria-label="Posted to Mastodon" title="Posted to Mastodon" />
                    )}
                  </div>
                  {/* Mobile metadata */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 md:hidden">
                    <Badge variant={STATUS_VARIANTS[story.status]}>{formatStatus(story.status)}</Badge>
                    <span className="text-neutral-500 text-xs">
                      {story.relevance != null
                        ? String(story.relevance)
                        : story.relevancePre != null
                          ? `(${story.relevancePre})`
                          : '—'}
                    </span>
                    {story.emotionTag && (
                      <Badge variant={EMOTION_VARIANTS[story.emotionTag]}>
                        {story.emotionTag}
                      </Badge>
                    )}
                    <span className="text-neutral-400 text-xs">{formatShortDate(story.dateCrawled)}</span>
                  </div>
                </td>
                <td className="hidden md:table-cell px-3 py-2">
                  <Badge variant={STATUS_VARIANTS[story.status]}>{formatStatus(story.status)}</Badge>
                </td>
                <td className="hidden md:table-cell px-3 py-2 text-neutral-600">
                  {story.relevance != null
                    ? String(story.relevance)
                    : story.relevancePre != null
                      ? `(${story.relevancePre})`
                      : '—'}
                </td>
                <td className="hidden lg:table-cell px-3 py-2">
                  {story.emotionTag ? (
                    <Badge variant={EMOTION_VARIANTS[story.emotionTag]}>
                      {story.emotionTag}
                    </Badge>
                  ) : '—'}
                </td>
                <td className="hidden lg:table-cell px-3 py-2 text-neutral-500 whitespace-nowrap">
                  {formatShortDate(story.dateCrawled)}
                </td>
                <td className="px-3 py-2">
                  {isProcessing ? (
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-brand-600 font-medium">Processing...</span>
                    </div>
                  ) : (
                    <>
                      {/* Desktop actions */}
                      <div className="hidden md:flex items-center justify-end gap-0.5">
                        {jobActions.map(action => {
                          const handler = jobHandlers[action.handler]
                          return handler ? (
                            <ActionIconButton
                              key={action.handler}
                              icon={action.icon}
                              label={action.label}
                              onClick={() => handler(story.id)}
                            />
                          ) : null
                        })}
                        {hasJobActions && (
                          <span className="mx-0.5 h-4 w-px bg-neutral-200" aria-hidden="true" />
                        )}
                        <ActionIconButton
                          icon={PencilSquareIcon}
                          label="Edit"
                          onClick={() => onView(story.id)}
                        />
                        <ActionIconButton
                          icon={TrashIcon}
                          label="Delete"
                          variant="danger"
                          onClick={() => onDelete(story.id)}
                        />
                      </div>

                      {/* Mobile overflow menu */}
                      <div className="md:hidden flex justify-end">
                        <Menu as="div" className="relative">
                          <MenuButton className="rounded p-1 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                            <EllipsisVerticalIcon className="h-5 w-5 text-neutral-400" />
                          </MenuButton>
                          <MenuItems className="absolute right-0 z-10 mt-1 w-44 rounded-md bg-white shadow-lg border border-neutral-200 py-1 focus:outline-none">
                            {jobActions.map(action => {
                              const handler = jobHandlers[action.handler]
                              return handler ? (
                                <MenuItemWithIcon
                                  key={action.handler}
                                  icon={action.icon}
                                  label={action.label}
                                  onClick={() => handler(story.id)}
                                />
                              ) : null
                            })}
                            <MenuItemWithIcon
                              icon={PencilSquareIcon}
                              label="Edit"
                              onClick={() => onView(story.id)}
                            />
                            {story.status !== 'published' && (
                              <MenuItemWithIcon
                                icon={GlobeAltIcon}
                                label="Publish"
                                onClick={() => onStatusChange(story.id, 'published')}
                              />
                            )}
                            {story.status !== 'rejected' && (
                              <MenuItemWithIcon
                                icon={XCircleIcon}
                                label="Reject"
                                onClick={() => onStatusChange(story.id, 'rejected')}
                              />
                            )}
                            {story.status !== 'trashed' && (
                              <MenuItemWithIcon
                                icon={ArchiveBoxXMarkIcon}
                                label="Trash"
                                onClick={() => onStatusChange(story.id, 'trashed')}
                              />
                            )}
                            <MenuItemWithIcon
                              icon={TrashIcon}
                              label="Delete"
                              onClick={() => onDelete(story.id)}
                              danger
                            />
                          </MenuItems>
                        </Menu>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
