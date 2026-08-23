import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useStory } from '../../hooks/useStories'
import { useIssues } from '../../hooks/useIssues'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { StoryEditForm } from '../../components/admin/StoryEditForm'

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: story, isLoading, error, refetch } = useStory(id || '')
  const issuesQuery = useIssues()

  return (
    <>
      <Helmet>
        <title>{story?.title || story?.sourceTitle || 'Noticia'} — Admin — Voces Indígenas</title>
      </Helmet>

      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/stories')}>
          <ArrowLeftIcon className="h-4 w-4" /> Volver a Noticias
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {error && <ErrorState message="Error al cargar noticia" onRetry={refetch} />}

      {story && (
        <>
          <PageHeader title={story.title || story.sourceTitle} />
          <StoryEditForm story={story} issues={issuesQuery.data || []} onDone={() => navigate('/admin/stories')} />
        </>
      )}
    </>
  )
}
