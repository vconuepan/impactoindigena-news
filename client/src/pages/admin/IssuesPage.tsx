import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useIssues, useDeleteIssue } from '../../hooks/useIssues'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { IssueTable } from '../../components/admin/IssueTable'
import { IssueEditPanel } from '../../components/admin/IssueEditPanel'
import { useToast } from '../../components/ui/Toast'

export default function IssuesPage() {
  const issuesQuery = useIssues()
  const deleteIssue = useDeleteIssue()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteIssue.mutateAsync(deleteId)
      toast('success', 'Tema eliminado')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al eliminar tema')
    }
    setDeleteId(null)
  }

  return (
    <>
      <Helmet>
        <title>Temas — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Temas"
        description={issuesQuery.data ? `${issuesQuery.data.length} temas` : undefined}
        actions={<Button onClick={() => navigate('/admin/issues/new')}>Agregar tema</Button>}
      />

      {issuesQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {issuesQuery.error && <ErrorState message="Error al cargar temas" onRetry={() => issuesQuery.refetch()} />}
      {issuesQuery.data && issuesQuery.data.length === 0 && <EmptyState title="Sin temas aún" description="Crea tu primer tema." />}
      {issuesQuery.data && issuesQuery.data.length > 0 && (
        <IssueTable
          issues={issuesQuery.data}
          onEdit={setEditingIssueId}
          onDelete={setDeleteId}
        />
      )}

      <IssueEditPanel
        issueId={editingIssueId}
        onClose={() => setEditingIssueId(null)}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar tema?"
        description="Se eliminará el tema. Las fuentes deben ser reasignadas primero."
        variant="danger"
        confirmLabel="Eliminar"
        loading={deleteIssue.isPending}
      />
    </>
  )
}
