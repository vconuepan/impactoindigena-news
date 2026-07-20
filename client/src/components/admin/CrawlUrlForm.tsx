import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useCrawlUrl } from '../../hooks/useStories'
import { useFeeds } from '../../hooks/useFeeds'
import { useToast } from '../ui/Toast'

interface CrawlUrlFormProps {
  open: boolean
  onClose: () => void
}

export function CrawlUrlForm({ open, onClose }: CrawlUrlFormProps) {
  const [url, setUrl] = useState('')
  const [feedId, setFeedId] = useState('')
  const feeds = useFeeds()
  const crawlUrl = useCrawlUrl()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await crawlUrl.mutateAsync({ url, feedId })
      toast('success', 'URL crawled successfully')
      setUrl('')
      setFeedId('')
      onClose()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to crawl URL')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-md w-full rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-neutral-900 mb-4">
            Crawl URL
          </DialogTitle>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="crawl-url"
              label="URL"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              required
            />
            <Select
              id="crawl-feed"
              label="Feed"
              placeholder="Select a feed"
              value={feedId}
              onChange={e => setFeedId(e.target.value)}
              options={(feeds.data || []).map(f => ({ value: f.id, label: f.title }))}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={crawlUrl.isPending} disabled={!url || !feedId}>
                Crawl
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
