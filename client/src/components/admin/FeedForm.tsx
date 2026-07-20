import { useState, useEffect } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import type { Issue, FeedRegion } from '@shared/types'
import { FEED_REGIONS } from '@shared/constants'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useCreateFeed } from '../../hooks/useFeeds'
import { useToast } from '../ui/Toast'

/** Build hierarchical issue options: parents first, children indented under their parent. */
function buildIssueOptions(issues: Issue[]): { value: string; label: string }[] {
  const parents = issues.filter(i => !i.parentId).sort((a, b) => a.name.localeCompare(b.name))
  const childrenByParent = new Map<string, Issue[]>()
  for (const issue of issues) {
    if (issue.parentId) {
      const list = childrenByParent.get(issue.parentId) || []
      list.push(issue)
      childrenByParent.set(issue.parentId, list)
    }
  }
  const options: { value: string; label: string }[] = []
  for (const parent of parents) {
    options.push({ value: parent.id, label: parent.name })
    const children = childrenByParent.get(parent.id) || []
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      options.push({ value: child.id, label: `\u00A0\u00A0└ ${child.name}` })
    }
  }
  return options
}

interface FeedCreateFormProps {
  open: boolean
  onClose: () => void
  issues: Issue[]
}

/** Create-only dialog for adding a new feed. */
export function FeedCreateForm({ open, onClose, issues }: FeedCreateFormProps) {
  const [form, setForm] = useState({
    title: '',
    rssUrl: '',
    url: '',
    displayTitle: '',
    issueId: '',
    language: 'en',
    region: '',
    crawlIntervalHours: '6',
    htmlSelector: '',
    active: true,
  })

  const createFeed = useCreateFeed()
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setForm({ title: '', rssUrl: '', url: '', displayTitle: '', issueId: '', language: 'en', region: '', crawlIntervalHours: '6', htmlSelector: '', active: true })
    }
  }, [open])

  const set = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createFeed.mutateAsync({
        title: form.title,
        rssUrl: form.rssUrl,
        url: form.url || undefined,
        displayTitle: form.displayTitle || undefined,
        issueId: form.issueId,
        language: form.language,
        region: (form.region || undefined) as FeedRegion | undefined,
        crawlIntervalHours: Number(form.crawlIntervalHours),
        htmlSelector: form.htmlSelector || undefined,
        active: form.active,
      })
      toast('success', 'Feed created')
      onClose()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create feed')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-md w-full rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-neutral-900 mb-4">
            Add Feed
          </DialogTitle>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={createFeed.isPending}>Create</Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export { buildIssueOptions }
