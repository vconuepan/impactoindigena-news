import { useState, useEffect } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { StarIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid'
import type { Story } from '@shared/types'
import { useCreateCluster } from '../../hooks/useClusters'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { useToast } from '../ui/Toast'
import { formatStatus } from '../../lib/constants'

interface CreateClusterDialogProps {
  open: boolean
  onClose: () => void
  stories: Story[]
  onSuccess?: () => void
}

export function CreateClusterDialog({ open, onClose, stories, onSuccess }: CreateClusterDialogProps) {
  const [primaryId, setPrimaryId] = useState<string | null>(stories.length > 0 ? stories[0].id : null)
  const createCluster = useCreateCluster()
  const { toast } = useToast()

  const alreadyClustered = stories.filter(s => s.clusterId !== null)
  const hasConflicts = alreadyClustered.length > 0
  const canCreate = stories.length >= 2 && !hasConflicts && primaryId !== null

  const handleCreate = () => {
    if (!canCreate || !primaryId) return
    const storyIds = stories.map(s => s.id)
    createCluster.mutate({ storyIds, primaryStoryId: primaryId }, {
      onSuccess: () => {
        toast('success', `Cluster created with ${stories.length} stories`)
        onSuccess?.()
        onClose()
      },
      onError: (err) => {
        toast('error', err instanceof Error ? err.message : 'Failed to create cluster')
      },
    })
  }

  // Reset primary when dialog opens with new stories
  useEffect(() => {
    if (open && (!primaryId || !stories.find(s => s.id === primaryId))) {
      setPrimaryId(stories.length > 0 ? stories[0].id : null)
    }
  }, [open, stories, primaryId])

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-lg w-full rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">
            Create Cluster
          </DialogTitle>

          {hasConflicts && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-sm text-red-700 font-medium">
                Some stories are already in a cluster:
              </p>
              <ul className="mt-1 space-y-1">
                {alreadyClustered.map(s => (
                  <li key={s.id} className="text-sm text-red-600">
                    {s.title || s.sourceTitle}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-red-600 mt-2">
                Remove these stories from your selection to create a new cluster.
              </p>
            </div>
          )}

          <p className="text-sm text-neutral-600 mb-3">
            Select the primary story for this cluster. Non-primary stories will be auto-rejected.
          </p>

          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {stories.map(story => {
              const isPrimary = story.id === primaryId
              const isClustered = story.clusterId !== null
              return (
                <li
                  key={story.id}
                  className={`rounded-md border p-3 ${
                    isClustered ? 'border-red-200 bg-red-50' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => !isClustered && setPrimaryId(story.id)}
                      disabled={isClustered}
                      className={`mt-0.5 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        isClustered
                          ? 'text-neutral-300 cursor-not-allowed'
                          : isPrimary
                            ? 'text-green-700'
                            : 'text-neutral-400 hover:text-green-700'
                      }`}
                      title={isClustered ? 'Already clustered' : isPrimary ? 'Primary story' : 'Make primary'}
                    >
                      {isPrimary ? <StarSolidIcon className="h-5 w-5" /> : <StarIcon className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {story.title || story.sourceTitle}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-neutral-500">{formatStatus(story.status)}</span>
                        {story.relevance != null && (
                          <span className="text-xs text-neutral-500">Rating: {story.relevance}</span>
                        )}
                        {isClustered && <Badge variant="red">Already clustered</Badge>}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} disabled={createCluster.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || createCluster.isPending}
              loading={createCluster.isPending}
            >
              Create Cluster
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
