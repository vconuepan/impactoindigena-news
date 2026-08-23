import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useNewsletters, useCreateNewsletter, useDeleteNewsletter } from '../../hooks/useNewsletters'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { NewsletterTable } from '../../components/admin/NewsletterTable'
import { CreateContentDialog } from '../../components/admin/CreateContentDialog'
import { useToast } from '../../components/ui/Toast'

export default function NewslettersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const newslettersQuery = useNewsletters(statusFilter ? { status: statusFilter } : undefined)
  const createNewsletter = useCreateNewsletter()
  const deleteNewsletter = useDeleteNewsletter()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleCreate = async (title: string) => {
    try {
      const nl = await createNewsletter.mutateAsync({ title })
      toast('success', 'Boletín creado')
      setCreateOpen(false)
      navigate(`/admin/newsletters/${nl.id}`)
    } catch {
      toast('error', 'Error al crear boletín')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteNewsletter.mutateAsync(deleteId)
      toast('success', 'Boletín eliminado')
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
        <title>Boletines — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Boletines"
        actions={<Button onClick={() => setCreateOpen(true)}>Nuevo boletín</Button>}
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

      {newslettersQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {newslettersQuery.error && <ErrorState message="Error al cargar boletines" onRetry={() => newslettersQuery.refetch()} />}
      {newslettersQuery.data && newslettersQuery.data.data.length === 0 && <EmptyState title="Sin boletines aún" description="Crea tu primer boletín." />}
      {newslettersQuery.data && newslettersQuery.data.data.length > 0 && (
        <NewsletterTable
          newsletters={newslettersQuery.data.data}
          onView={id => navigate(`/admin/newsletters/${id}`)}
          onDelete={setDeleteId}
        />
      )}

      <CreateContentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        type="newsletter"
        loading={createNewsletter.isPending}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar boletín?"
        description="Se eliminará permanentemente este boletín."
        variant="danger"
        confirmLabel="Eliminar"
        loading={deleteNewsletter.isPending}
      />
    </>
  )
}
