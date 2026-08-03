import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Story, StoryStatus, EmotionTag, Issue } from '@shared/types'
import { STORY_STATUSES, EMOTION_TAGS } from '@shared/constants'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useUpdateStory, useDissolveCluster } from '../../hooks/useStories'
import { useEditForm } from '../../hooks/useEditForm'
import { formatStatus, formatDate } from '../../lib/constants'
import { PANEL_BODY } from './EditPanel'
import { PanelFooter } from './PanelFooter'
import { buildIssueOptions } from './StoryFiltersBar'

interface StoryEditFormProps {
  story: Story
  issues: Issue[]
  onDone: () => void
  onBlueskyGenerate?: (storyId: string) => void
  onMastodonGenerate?: (storyId: string) => void
  onInstagramGenerate?: (storyId: string) => void
  onLinkedInGenerate?: (storyId: string) => void
  onTwitterGenerate?: (storyId: string) => void
  onFacebookGenerate?: (storyId: string) => void
  variant?: 'page' | 'panel'
}

function buildFormState(story: Story) {
  return {
    titleLabel: story.titleLabel ?? '',
    title: story.title ?? '',
    slug: story.slug ?? '',
    issueId: story.issueId ?? '',
    status: story.status,
    relevancePre: story.relevancePre ?? '',
    relevance: story.relevance ?? '',
    emotionTag: story.emotionTag ?? '',
    summary: story.summary ?? '',
    quote: story.quote ?? '',
    quoteAttribution: story.quoteAttribution ?? '',
    marketingBlurb: story.marketingBlurb ?? '',
    relevanceReasons: story.relevanceReasons ?? '',
    relevanceSummary: story.relevanceSummary ?? '',
    antifactors: story.antifactors ?? '',
    relevanceCalculation: story.relevanceCalculation ?? '',
  }
}

export function StoryEditForm({ story, issues, onDone, onBlueskyGenerate, onMastodonGenerate, onInstagramGenerate, onLinkedInGenerate, onTwitterGenerate, onFacebookGenerate, variant = 'page' }: StoryEditFormProps) {
  const [contentExpanded, setContentExpanded] = useState(false)
  const [confirmDissolve, setConfirmDissolve] = useState(false)
  const updateStory = useUpdateStory()
  const dissolveCluster = useDissolveCluster()

  const initialState = useMemo(() => buildFormState(story), [story])

  const { form, set, isDirty, isPending, handleSubmit } = useEditForm({
    entityId: story.id,
    initialState,
    mutation: updateStory,
    toPayload: (f) => ({
      titleLabel: f.titleLabel || null,
      title: f.title || null,
      slug: f.slug || undefined,
      issueId: f.issueId || null,
      status: f.status as StoryStatus,
      relevancePre: f.relevancePre === '' ? null : Number(f.relevancePre),
      relevance: f.relevance === '' ? null : Number(f.relevance),
      emotionTag: (f.emotionTag || null) as EmotionTag | null,
      summary: f.summary || null,
      quote: f.quote || null,
      quoteAttribution: f.quoteAttribution || null,
      marketingBlurb: f.marketingBlurb || null,
      relevanceReasons: f.relevanceReasons || null,
      relevanceSummary: f.relevanceSummary || null,
      antifactors: f.antifactors || null,
      relevanceCalculation: f.relevanceCalculation || null,
    }),
    successMessage: 'Story updated',
    entityName: 'story',
    onSuccess: onDone,
  })

  const fields = (
    <>
      <Input id="edit-title-label" label="Title Label" value={form.titleLabel} onChange={e => set('titleLabel', e.target.value)} placeholder="e.g. EU AI Act" />
      <Input id="edit-title" label="Title" value={form.title} onChange={e => set('title', e.target.value)} />
      {story.slug && (
        story.datePublished
          ? <Input id="edit-slug" label="Slug" value={form.slug} readOnly className="bg-neutral-50 text-neutral-500 cursor-not-allowed" />
          : <Input id="edit-slug" label="Slug" value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="auto-generated-on-publish" />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select
          id="edit-status"
          label="Status"
          value={form.status}
          onChange={e => set('status', e.target.value as StoryStatus)}
          options={STORY_STATUSES.map(s => ({ value: s, label: formatStatus(s) }))}
        />
        <Select
          id="edit-emotion"
          label="Emotion"
          placeholder="None"
          value={form.emotionTag}
          onChange={e => set('emotionTag', e.target.value)}
          options={EMOTION_TAGS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
        />
      </div>
      <Select
        id="edit-issue"
        label="Issue"
        placeholder="From feed"
        value={form.issueId}
        onChange={e => set('issueId', e.target.value)}
        options={buildIssueOptions(issues)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input id="edit-rating-pre" label="Pre-rating" type="number" min="1" max="10" value={String(form.relevancePre)} onChange={e => set('relevancePre', e.target.value)} />
        <Input id="edit-rating" label="Rating" type="number" min="1" max="10" value={String(form.relevance)} onChange={e => set('relevance', e.target.value)} />
      </div>
      <Textarea id="edit-summary" label="Summary" rows={3} value={form.summary} onChange={e => set('summary', e.target.value)} />
      <Input id="edit-quote" label="Quote" value={form.quote} onChange={e => set('quote', e.target.value)} />
      <Input id="edit-quote-attribution" label="Quote Attribution" value={form.quoteAttribution} onChange={e => set('quoteAttribution', e.target.value)} placeholder="e.g. Dr. Smith, University of Oxford" />
      <Textarea id="edit-blurb" label="Marketing Blurb" rows={3} value={form.marketingBlurb} onChange={e => set('marketingBlurb', e.target.value)} />
      <Textarea id="edit-reasons" label="Relevance Reasons" rows={3} value={form.relevanceReasons} onChange={e => set('relevanceReasons', e.target.value)} />
      <Textarea id="edit-relevance-summary" label="Relevance Summary" rows={2} value={form.relevanceSummary} onChange={e => set('relevanceSummary', e.target.value)} />
      <Textarea id="edit-antifactors" label="Antifactors" rows={3} value={form.antifactors} onChange={e => set('antifactors', e.target.value)} />
      <Textarea id="edit-calculation" label="Relevance Calculation" rows={3} value={form.relevanceCalculation} onChange={e => set('relevanceCalculation', e.target.value)} />

      {/* Source info (read-only) */}
      <div className="border-t border-neutral-200 pt-4 space-y-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Source</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-neutral-500">Title</dt>
          <dd className="text-neutral-900">{story.sourceTitle || '—'}</dd>
          <dt className="text-neutral-500">Published</dt>
          <dd className="text-neutral-900">{formatDate(story.sourceDatePublished)}</dd>
          <dt className="text-neutral-500">Feed</dt>
          <dd className="text-neutral-900">{story.feed?.title || '—'}</dd>
          <dt className="text-neutral-500">URL</dt>
          <dd className="text-neutral-900 truncate">
            <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:text-brand-700 underline">
              {story.sourceUrl}
            </a>
          </dd>
        </dl>
        {story.sourceContent && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setContentExpanded(!contentExpanded)}
              className="text-sm text-brand-800 hover:text-brand-700 font-medium"
            >
              {contentExpanded ? 'Hide content' : 'Show source content'}
            </button>
            {contentExpanded && (
              <div className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap max-h-80 overflow-y-auto border border-neutral-200 rounded p-3">
                {story.sourceContent}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cluster info (read-only) */}
      {story.clusterId && story.cluster ? (
        <div className="border-t border-neutral-200 pt-4 space-y-2">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Cluster</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-neutral-500">Role</dt>
            <dd className="text-neutral-900">
              {story.cluster.primaryStoryId === story.id ? (
                <span className="inline-flex items-center gap-1 text-green-700 font-medium">Primary</span>
              ) : (
                <span className="text-purple-700">Member</span>
              )}
            </dd>
            <dt className="text-neutral-500">Members</dt>
            <dd className="text-neutral-900">{story.cluster._count.stories} stories</dd>
          </dl>
          <div className="pt-1">
            <p className="text-xs font-medium text-neutral-500 mb-1">Other stories in cluster:</p>
            <ul className="space-y-0.5">
              {story.cluster.stories
                .filter(s => s.id !== story.id)
                .map(s => (
                  <li key={s.id} className="text-sm text-neutral-700 flex items-center gap-1.5">
                    <span className="truncate">{s.title || s.sourceTitle}</span>
                    {s.id === story.cluster!.primaryStoryId && (
                      <span className="text-xs text-green-600 font-medium shrink-0">(Primary)</span>
                    )}
                    <span className="text-xs text-neutral-400 shrink-0">{formatStatus(s.status as StoryStatus)}</span>
                  </li>
                ))}
            </ul>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <Link
              to={`/admin/clusters?open=${story.clusterId}`}
              className="text-sm text-brand-800 hover:text-brand-700 font-medium"
            >
              Manage cluster
            </Link>
            {confirmDissolve ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Dissolve cluster and restore members to analyzed?</span>
                <button
                  type="button"
                  onClick={() => {
                    dissolveCluster.mutate(story.id, { onSuccess: () => setConfirmDissolve(false) })
                  }}
                  disabled={dissolveCluster.isPending}
                  className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {dissolveCluster.isPending ? 'Dissolving...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDissolve(false)}
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDissolve(true)}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Dissolve cluster
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Cluster</h3>
          <Link
            to={`/admin/clusters?create=${story.id}`}
            className="text-sm text-brand-800 hover:text-brand-700 font-medium"
          >
            Create cluster with this story
          </Link>
        </div>
      )}

      {/* Bluesky */}
      {onBlueskyGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Bluesky</h3>
          {(story._count?.blueskyPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              This story has been posted to Bluesky.
              {story.blueskyPosts?.[0]?.postUri && (() => {
                const match = story.blueskyPosts![0].postUri!.match(/^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/(.+)$/)
                if (!match) return null
                const url = `https://bsky.app/profile/${match[1]}/post/${match[2]}`
                return (
                  <>
                    {' '}
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                      View post
                    </a>
                  </>
                )
              })()}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onBlueskyGenerate(story.id)}
            >
              Generate Bluesky Post
            </Button>
          )}
        </div>
      )}

      {/* Mastodon */}
      {onMastodonGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Mastodon</h3>
          {(story._count?.mastodonPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              This story has been posted to Mastodon.
              {story.mastodonPosts?.[0]?.statusUrl && (
                <>
                  {' '}
                  <a href={story.mastodonPosts[0].statusUrl} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                    View post
                  </a>
                </>
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onMastodonGenerate(story.id)}
            >
              Generate Mastodon Post
            </Button>
          )}
        </div>
      )}

      {/* Instagram */}
      {onInstagramGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Instagram</h3>
          {(story._count?.instagramPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              {/* Un post publicado siempre trae permalink; sin él solo hay un
                  borrador o un intento fallido. Decir "ya se publicó" en ese
                  caso es falso y esconde que queda trabajo por hacer. */}
              {story.instagramPosts?.[0]?.permalink ? (
                <>
                  This story has been posted to Instagram.{' '}
                  <a href={story.instagramPosts[0].permalink} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                    View post
                  </a>
                </>
              ) : (
                <>An Instagram post exists but is not published yet. Finish it from the Instagram page.</>
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onInstagramGenerate(story.id)}
            >
              Generate Instagram Post
            </Button>
          )}
        </div>
      )}

      {/* LinkedIn */}
      {onLinkedInGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">LinkedIn</h3>
          {(story._count?.linkedinPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              {/* Mismo caso que Instagram: sin postUrl no está publicado. */}
              {story.linkedinPosts?.[0]?.postUrl ? (
                <>
                  This story has been posted to LinkedIn.{' '}
                  <a href={story.linkedinPosts[0].postUrl} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                    View post
                  </a>
                </>
              ) : (
                <>A LinkedIn post exists but is not published yet. Finish it from the LinkedIn page.</>
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onLinkedInGenerate(story.id)}
            >
              Generate LinkedIn Post
            </Button>
          )}
        </div>
      )}

      {/* X/Twitter */}
      {onTwitterGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">X/Twitter</h3>
          {(story._count?.twitterPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              {/* Mismo caso que Instagram y LinkedIn: sin tweetUrl no está publicado. */}
              {story.twitterPosts?.[0]?.tweetUrl ? (
                <>
                  This story has been posted to X.{' '}
                  <a href={story.twitterPosts[0].tweetUrl} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                    View post
                  </a>
                </>
              ) : (
                <>An X post exists but is not published yet. Finish it from the X/Twitter page.</>
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onTwitterGenerate(story.id)}
            >
              Generate X Post
            </Button>
          )}
        </div>
      )}

      {/* Facebook (Página) */}
      {onFacebookGenerate && story.status === 'published' && (
        <div className="border-t border-neutral-200 pt-4">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Facebook</h3>
          {(story._count?.facebookPosts ?? 0) > 0 ? (
            <p className="text-sm text-neutral-500">
              {/* Sin permalink no está publicado, igual que en los otros canales. */}
              {story.facebookPosts?.[0]?.permalink ? (
                <>
                  This story has been posted to the Facebook Page.{' '}
                  <a href={story.facebookPosts[0].permalink} target="_blank" rel="noopener noreferrer" className="text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                    View post
                  </a>
                </>
              ) : (
                <>A Facebook post exists but is not published yet. Finish it from the Facebook page.</>
              )}
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onFacebookGenerate(story.id)}
            >
              Generate Facebook Post
            </Button>
          )}
        </div>
      )}
    </>
  )

  if (variant === 'panel') {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className={PANEL_BODY}>{fields}</div>
        <PanelFooter isPending={isPending} isDirty={isDirty} onCancel={onDone} />
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-16">
      {fields}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 bg-white border-t border-neutral-200 px-4 lg:px-6 py-3 flex gap-3 z-10">
        <Button type="submit" loading={isPending} disabled={!isDirty}>Save</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
