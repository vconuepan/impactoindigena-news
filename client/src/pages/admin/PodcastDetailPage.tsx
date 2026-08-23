import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { usePodcast } from '../../hooks/usePodcasts'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { PodcastDetail } from '../../components/admin/PodcastDetail'

export default function PodcastDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: podcast, isLoading, error, refetch } = usePodcast(id || '')

  return (
    <>
      <Helmet>
        <title>{podcast?.title || 'Podcast'} — Admin — Voces Indígenas</title>
      </Helmet>

      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/podcasts')}>
          <ArrowLeftIcon className="h-4 w-4" /> Volver a Podcasts
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {error && <ErrorState message="Error al cargar podcast" onRetry={refetch} />}

      {podcast && (
        <>
          <PageHeader title={podcast.title} />
          <PodcastDetail podcast={podcast} />
        </>
      )}
    </>
  )
}
