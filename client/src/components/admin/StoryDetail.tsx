import type { Issue } from '@shared/types'
import { EditPanel } from './EditPanel'
import { StoryEditForm } from './StoryEditForm'
import { useStory } from '../../hooks/useStories'

interface StoryDetailProps {
  storyId: string | null
  issues: Issue[]
  onClose: () => void
  onBlueskyGenerate?: (storyId: string) => void
  onMastodonGenerate?: (storyId: string) => void
  onInstagramGenerate?: (storyId: string) => void
  onLinkedInGenerate?: (storyId: string) => void
  onTwitterGenerate?: (storyId: string) => void
}

export function StoryDetail({ storyId, issues, onClose, onBlueskyGenerate, onMastodonGenerate, onInstagramGenerate, onLinkedInGenerate, onTwitterGenerate }: StoryDetailProps) {
  const { data: story, isLoading, error } = useStory(storyId || '')

  return (
    <EditPanel
      open={!!storyId}
      onClose={onClose}
      title={story?.title || story?.sourceTitle || 'Story'}
      loading={isLoading}
      error={!!error}
    >
      {story && <StoryEditForm story={story} issues={issues} onDone={onClose} onBlueskyGenerate={onBlueskyGenerate} onMastodonGenerate={onMastodonGenerate} onInstagramGenerate={onInstagramGenerate} onLinkedInGenerate={onLinkedInGenerate} onTwitterGenerate={onTwitterGenerate} variant="panel" />}
    </EditPanel>
  )
}
