import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQueryClient } from '@tanstack/react-query'
import { useFeeds, useDeleteFeed, useFeedQuality } from '../../hooks/useFeeds'
import { useIssues } from '../../hooks/useIssues'
import { useBackgroundTasks } from '../../hooks/useBackgroundTasks'
import { adminApi } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { FeedTable } from '../../components/admin/FeedTable'
import { FeedCreateForm } from '../../components/admin/FeedForm'
import { FeedEditPanel } from '../../components/admin/FeedEditPanel'
import { useToast } from '../../components/ui/Toast'
import type { Issue } from '@shared/types'

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
      options.push({ value: child.id, label: `└ ${child.name}` })
    }
  }
  return options
}

export default function FeedsPage() {
  const [showInactive, setShowInactive] = useState(false)
  const [issueFilter, setIssueFilter] = useState('')
  const feedsQuery = useFeeds({
    ...(showInactive ? {} : { active: true }),
    ...(issueFilter ? { issueId: issueFilter } : {}),
  })
  const issuesQuery = useIssues()
  const qualityQuery = useFeedQuality()
  const deleteFeed = useDeleteFeed()
  const { toast } = useToast()
  const { launchTask } = useBackgroundTasks()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const invalidateFeeds = () => {
    queryClient.invalidateQueries({ queryKey: ['feeds'] })
  }

  const handleCrawl = (id: string) => {
    const feed = feedsQuery.data?.find(f => f.id === id)
    const label = `Crawling ${feed?.title || 'feed'}`

    launchTask({
      id: `crawl-feed-${id}-${Date.now()}`,
      label,
      executor: async () => {
        const result = await adminApi.feeds.crawl(id)
        return { succeeded: result.newStories, failed: result.errors }
      },
      onComplete: invalidateFeeds,
    })
  }

  const handleFetchAllFavicons = () => {
    launchTask({
      id: `fetch-favicons-${Date.now()}`,
      label: 'Fetching missing favicons',
      executor: async () => {
        const result = await adminApi.feeds.fetchAllFavicons()
        return { succeeded: result.succeeded, failed: result.failed, skipped: result.skipped }
      },
    })
  }

  const handleCrawlAll = () => {
    const feeds = feedsQuery.data
    if (!feeds || feeds.length === 0) return

    const activeFeeds = feeds.filter(f => f.active)
    const label = `Crawling ${activeFeeds.length} feeds`

    launchTask({
      id: `crawl-all-${Date.now()}`,
      label,
      executor: async (reportProgress) => {
        let succeeded = 0
        let failed = 0
        for (const feed of activeFeeds) {
          try {
            const result = await adminApi.feeds.crawl(feed.id)
            succeeded += result.newStories
            failed += result.errors
          } catch {
            failed++
          }
          reportProgress(activeFeeds.indexOf(feed) + 1, activeFeeds.length)
        }
        return { succeeded, failed }
      },
      onComplete: invalidateFeeds,
    })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const result = await deleteFeed.mutateAsync(deleteId)
      toast('success', result.message)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al eliminar fuente')
    }
    setDeleteId(null)
  }

  return (
    <>
      <Helmet>
        <title>Feeds — Admin — Impacto Indígena</title>
      </Helmet>

      <PageHeader
        title="Fuentes"
        description={feedsQuery.data ? `${feedsQuery.data.length} fuentes` : undefined}
        actions={
          <>
            <Button
              variant={showInactive ? 'secondary' : 'ghost'}
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? 'Ocultar inactivas' : 'Mostrar inactivas'}
            </Button>
            <Button variant="secondary" onClick={handleFetchAllFavicons}>
              Obtener todos los favicons
            </Button>
            <Button variant="secondary" onClick={handleCrawlAll}>
              Rastrear todo
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Agregar fuente</Button>
          </>
        }
      />

      {issuesQuery.data && issuesQuery.data.length > 0 && (
        <div className="mb-4">
          <Select
            id="filter-issue"
            label="Tema"
            placeholder="Todos los temas"
            value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}
            options={buildIssueOptions(issuesQuery.data)}
          />
        </div>
      )}

      {feedsQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {feedsQuery.error && <ErrorState message="Error al cargar fuentes" onRetry={() => feedsQuery.refetch()} />}
      {feedsQuery.data && feedsQuery.data.length === 0 && <EmptyState title="Sin fuentes aún" description="Agrega tu primer feed RSS." />}
      {feedsQuery.data && feedsQuery.data.length > 0 && (
        <FeedTable
          feeds={feedsQuery.data}
          issues={issuesQuery.data || []}
          qualityMetrics={qualityQuery.data}
          onEdit={setEditingFeedId}
          onCrawl={handleCrawl}
          onDelete={setDeleteId}
        />
      )}

      <FeedCreateForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        issues={issuesQuery.data || []}
      />

      <FeedEditPanel
        feedId={editingFeedId}
        issues={issuesQuery.data || []}
        onClose={() => setEditingFeedId(null)}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar fuente?"
        description="Si la fuente tiene noticias se desactivará. Si no, se eliminará permanentemente."
        variant="danger"
        confirmLabel="Eliminar"
        loading={deleteFeed.isPending}
      />
    </>
  )
}
