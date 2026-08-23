import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { usePodcasts, useCreatePodcast, useDeletePodcast } from '../../hooks/usePodcasts'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PodcastTable } from '../../components/admin/PodcastTable'
import { CreateContentDialog } from '../../components/admin/CreateContentDialog'
import { useToast } from '../../components/ui/Toast'

export default function PodcastsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const podcastsQuery = usePodcasts(statusFilter ? { status: statusFilter } : undefined)
  const createPodcast = useCreatePodcast()
  const deletePodcast = useDeletePodcast()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleCreate = async (title: string) => {
    try {
      const pod = await createPodcast.mutateAsync({ title })
      toast('success', 'Podcast creado')
      setCreateOpen(false)
      navigate(`/admin/podcasts/${pod.id}`)
    } catch {
      toast('error', 'Error al crear podcast')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deletePodcast.mutateAsync(deleteId)
      toast('success', 'Podcast eliminado')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeleteId(null)
  }

  const tabs = [
    { label: 'Todos', value: '' },
    { label: 'Borrador', value: 'draft' },
    { label: 'Publicado', value: 'published' },
  ]

  return (
    <>
      <Helmet>
        <title>Podcasts — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Podcasts"
        actions={<Button onClick={() => setCreateOpen(true)}>Nuevo podcast</Button>}
      />

      <div className="flex gap-1 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              statusFilter === tab.value
                ? 'bg-brand-50 text-brand-800'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {podcastsQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {podcastsQuery.error && <ErrorState message="Error al cargar podcasts" onRetry={() => podcastsQuery.refetch()} />}
      {podcastsQuery.data && podcastsQuery.data.data.length === 0 && <EmptyState title="Sin podcasts aún" description="Crea tu primer podcast." />}
      {podcastsQuery.data && podcastsQuery.data.data.length > 0 && (
        <PodcastTable
          podcasts={podcastsQuery.data.data}
          onView={id => navigate(`/admin/podcasts/${id}`)}
          onDelete={setDeleteId}
        />
      )}

      <CreateContentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        type="podcast"
        loading={createPodcast.isPending}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar podcast?"
        description="Se eliminará permanentemente este podcast."
        variant="danger"
        confirmLabel="Eliminar"
        loading={deletePodcast.isPending}
      />
    </>
  )
}
