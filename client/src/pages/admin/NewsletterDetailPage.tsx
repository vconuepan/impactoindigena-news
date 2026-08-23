import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useNewsletter } from '../../hooks/useNewsletters'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { NewsletterDetail } from '../../components/admin/NewsletterDetail'

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: newsletter, isLoading, error, refetch } = useNewsletter(id || '')

  return (
    <>
      <Helmet>
        <title>{newsletter?.title || 'Boletín'} — Admin — Voces Indígenas</title>
      </Helmet>

      {isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {error && <ErrorState message="Error al cargar boletín" onRetry={refetch} />}

      {newsletter && <NewsletterDetail newsletter={newsletter} />}
    </>
  )
}
