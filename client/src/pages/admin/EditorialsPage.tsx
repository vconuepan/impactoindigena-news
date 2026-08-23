import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useEditorials, useCreateEditorial, useDeleteEditorial } from '../../hooks/useEditorials'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { CreateContentDialog } from '../../components/admin/CreateContentDialog'
import { useToast } from '../../components/ui/Toast'
import type { Editorial } from '@shared/types'

function StatusBadge({ status }: { status: Editorial['status'] }) {
  return status === 'published' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
      Publicado
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
      Borrador
    </span>
  )
}

export default function EditorialsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const editorialsQuery = useEditorials(statusFilter ? { status: statusFilter } : undefined)
  const createEditorial = useCreateEditorial()
  const deleteEditorial = useDeleteEditorial()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleCreate = async (title: string) => {
    try {
      const ed = await createEditorial.mutateAsync({ title })
      toast('success', 'Editorial creada')
      setCreateOpen(false)
      navigate(`/admin/editorials/${ed.id}`)
    } catch {
      toast('error', 'Error al crear editorial')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteEditorial.mutateAsync(deleteId)
      toast('success', 'Editorial eliminada')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeleteId(null)
  }

  const tabs = [
    { label: 'Todas', value: '' },
    { label: 'Borrador', value: 'draft' },
    { label: 'Publicado', value: 'published' },
  ]

  const editorials = editorialsQuery.data?.data ?? []

  return (
    <>
      <Helmet>
        <title>Voces Indígenas — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Voces Indígenas"
        actions={<Button onClick={() => setCreateOpen(true)}>Nueva editorial</Button>}
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

      {editorialsQuery.isLoading && (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      )}
      {editorialsQuery.error && (
        <ErrorState message="Error al cargar editoriales" onRetry={() => editorialsQuery.refetch()} />
      )}
      {!editorialsQuery.isLoading && !editorialsQuery.error && editorials.length === 0 && (
        <EmptyState title="Sin editoriales aún" description="Crea la primera editorial semanal." />
      )}
      {editorials.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-2 pr-4 font-medium text-neutral-600">Título</th>
                <th className="text-left py-2 pr-4 font-medium text-neutral-600">Estado</th>
                <th className="text-left py-2 pr-4 font-medium text-neutral-600">Publicado</th>
                <th className="text-left py-2 font-medium text-neutral-600">Creado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editorials.map(ed => (
                <tr
                  key={ed.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                  onClick={() => navigate(`/admin/editorials/${ed.id}`)}
                >
                  <td className="py-2 pr-4 font-medium text-neutral-900 max-w-xs truncate">
                    {ed.title}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={ed.status} />
                  </td>
                  <td className="py-2 pr-4 text-neutral-500">
                    {ed.publishedAt ? new Date(ed.publishedAt).toLocaleDateString('es-CL') : '—'}
                  </td>
                  <td className="py-2 text-neutral-500">
                    {new Date(ed.createdAt).toLocaleDateString('es-CL')}
                  </td>
                  <td className="py-2 pl-4 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(ed.id) }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateContentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        type="newsletter"
        loading={createEditorial.isPending}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar editorial?"
        description="Se eliminará permanentemente esta editorial."
        variant="danger"
        confirmLabel="Eliminar"
        loading={deleteEditorial.isPending}
      />
    </>
  )
}
