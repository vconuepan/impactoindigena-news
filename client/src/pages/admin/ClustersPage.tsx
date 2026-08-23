import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useClusters, useDissolveClusterById } from '../../hooks/useClusters'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ClusterTable } from '../../components/admin/ClusterTable'
import { ClusterDetailPanel } from '../../components/admin/ClusterDetail'
import { CreateClusterPanel } from '../../components/admin/CreateClusterPanel'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'

export default function ClustersPage() {
  const clustersQuery = useClusters()
  const dissolveCluster = useDissolveClusterById()
  const { toast } = useToast()

  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('open')
  const createParam = searchParams.get('create')

  const [showCreate, setShowCreate] = useState(false)
  const [dissolveId, setDissolveId] = useState<string | null>(null)

  // Open create panel if ?create param is present
  const isCreateOpen = showCreate || !!createParam

  const setEditingId = (id: string | null) => {
    if (id) {
      setSearchParams({ open: id })
    } else {
      setSearchParams({})
    }
  }

  const handleOpenCreate = () => {
    setShowCreate(true)
  }

  const handleCloseCreate = () => {
    setShowCreate(false)
    if (createParam) {
      setSearchParams({})
    }
  }

  const handleCreateSuccess = (clusterId: string) => {
    setShowCreate(false)
    setSearchParams({ open: clusterId })
  }

  const handleDissolve = async () => {
    if (!dissolveId) return
    try {
      await dissolveCluster.mutateAsync(dissolveId)
      toast('success', 'Grupo disuelto')
      if (openId === dissolveId) setEditingId(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al disolver el grupo')
    }
    setDissolveId(null)
  }

  return (
    <>
      <Helmet>
        <title>Grupos — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Grupos"
        description={clustersQuery.data ? `${clustersQuery.data.length} grupos` : undefined}
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Nuevo grupo
          </Button>
        }
      />

      {clustersQuery.isLoading && <div className="flex justify-center py-12"><LoadingSpinner /></div>}
      {clustersQuery.error && <ErrorState message="Error al cargar grupos" onRetry={() => clustersQuery.refetch()} />}
      {clustersQuery.data && clustersQuery.data.length === 0 && (
        <EmptyState title="Sin grupos" description="Los grupos de noticias se crean automáticamente durante la deduplicación." />
      )}
      {clustersQuery.data && clustersQuery.data.length > 0 && (
        <ClusterTable
          clusters={clustersQuery.data}
          onEdit={setEditingId}
          onDissolve={setDissolveId}
        />
      )}

      <ClusterDetailPanel
        clusterId={openId}
        onClose={() => setEditingId(null)}
      />

      <CreateClusterPanel
        open={isCreateOpen}
        onClose={handleCloseCreate}
        preSelectedStoryIds={createParam ? [createParam] : []}
        onSuccess={handleCreateSuccess}
      />

      <ConfirmDialog
        open={!!dissolveId}
        onClose={() => setDissolveId(null)}
        onConfirm={handleDissolve}
        title="¿Disolver grupo?"
        description="Todos los miembros rechazados automáticamente volverán al estado analizado. Esta acción no se puede deshacer."
        variant="danger"
        confirmLabel="Disolver"
        loading={dissolveCluster.isPending}
      />
    </>
  )
}
