import { Helmet } from 'react-helmet-async'
import { useJobs } from '../../hooks/useJobs'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { JobsTable } from '../../components/admin/JobsTable'

export default function JobsPage() {
  const jobsQuery = useJobs({ refetchInterval: 10_000 })

  return (
    <>
      <Helmet>
        <title>Trabajos — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Trabajos"
        description="Trabajos programados en segundo plano. Se actualiza automáticamente cada 10 segundos."
      />

      {jobsQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {jobsQuery.error && <ErrorState message="Error al cargar trabajos" onRetry={() => jobsQuery.refetch()} />}
      {jobsQuery.data && jobsQuery.data.length === 0 && <EmptyState title="Sin trabajos configurados" />}
      {jobsQuery.data && jobsQuery.data.length > 0 && <JobsTable jobs={jobsQuery.data} />}
    </>
  )
}
