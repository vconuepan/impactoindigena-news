import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../lib/admin-api'
import type { FeedbackItem } from '../../lib/admin-api'
import { useToast } from '../../components/ui/Toast'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'unread', label: 'No leído' },
  { value: 'read', label: 'Leído' },
  { value: 'archived', label: 'Archivado' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas las categorías' },
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Error' },
  { value: 'suggestion', label: 'Sugerencia' },
  { value: 'other', label: 'Otro' },
]

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  bug: 'bg-red-100 text-red-700',
  suggestion: 'bg-amber-100 text-amber-700',
  other: 'bg-neutral-100 text-neutral-600',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CL', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FeedbackPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const status = searchParams.get('status') || ''
  const category = searchParams.get('category') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: true })
    setSelected(new Set())
  }

  const feedbackQuery = useQuery({
    queryKey: ['admin', 'feedback', { status, category, page }],
    queryFn: () => adminApi.feedback.list({
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      page,
      limit: 25,
    }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      adminApi.feedback.updateStatus(id, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
      queryClient.invalidateQueries({ queryKey: ['feedbackCount'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.feedback.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
      queryClient.invalidateQueries({ queryKey: ['feedbackCount'] })
      toast('success', 'Comentario eliminado')
    },
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      adminApi.feedback.bulk(ids, action),
    onSuccess: (_, { ids, action }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
      queryClient.invalidateQueries({ queryKey: ['feedbackCount'] })
      setSelected(new Set())
      toast('success', `${action === 'delete' ? 'Eliminados' : 'Actualizados'} ${ids.length} elemento(s)`)
    },
  })

  const items = feedbackQuery.data?.items ?? []
  const total = feedbackQuery.data?.total ?? 0
  const unreadCount = feedbackQuery.data?.unreadCount ?? 0
  const totalPages = Math.ceil(total / 25)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.id)))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      toast('error', 'Error al eliminar')
      setDeleteTarget(null)
    }
  }

  const handleBulkDelete = async () => {
    try {
      await bulkMutation.mutateAsync({ ids: [...selected], action: 'delete' })
      setBulkDeleteOpen(false)
    } catch {
      toast('error', 'Error al eliminar')
      setBulkDeleteOpen(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Comentarios — Admin — Voces Indígenas</title>
      </Helmet>

      <PageHeader
        title="Comentarios"
        description={unreadCount > 0 ? `${unreadCount} sin leer` : 'Sin comentarios sin leer'}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setFilter('category', e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Filter by category"
        >
          {CATEGORY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-neutral-500">{selected.size} seleccionados</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'read' })}
              loading={bulkMutation.isPending}
            >
              Marcar como leído
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => bulkMutation.mutate({ ids: [...selected], action: 'archived' })}
              loading={bulkMutation.isPending}
            >
              Archivar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Eliminar
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {feedbackQuery.isLoading && (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      )}
      {feedbackQuery.error && (
        <ErrorState message="Error al cargar comentarios" onRetry={() => feedbackQuery.refetch()} />
      )}
      {feedbackQuery.data && items.length === 0 && (
        <EmptyState title="Sin comentarios aún" />
      )}
      {feedbackQuery.data && items.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Categoría</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Mensaje</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Correo</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Estado</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Fecha</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-neutral-50 cursor-pointer transition-colors ${
                    item.status === 'unread' ? 'bg-brand-50/30' : ''
                  }`}
                  onClick={() => {
                    setExpandedId(expandedId === item.id ? null : item.id)
                    if (item.status === 'unread') {
                      updateStatus.mutate({ id: item.id, newStatus: 'read' })
                    }
                  }}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                      aria-label={`Select feedback from ${item.email || 'anonymous'}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[item.category]}`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-neutral-900 max-w-md">
                    {expandedId === item.id ? (
                      <div className="whitespace-pre-wrap">{item.message}</div>
                    ) : (
                      <div className="truncate">{item.message}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-neutral-500">
                    {item.email ? (
                      <a
                        href={`mailto:${item.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        {item.email}
                      </a>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={item.status}
                      onChange={(e) => {
                        e.stopPropagation()
                        updateStatus.mutate({ id: item.id, newStatus: e.target.value })
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-neutral-300 text-sm py-1 px-2 focus:ring-brand-500 focus:border-brand-500"
                      aria-label="Change status"
                    >
                      <option value="unread">No leído</option>
                      <option value="read">Leído</option>
                      <option value="archived">Archivado</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 text-sm text-neutral-500 whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item)}
                      aria-label="Delete feedback"
                    >
                      <svg className="w-4 h-4 text-neutral-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
              <p className="text-sm text-neutral-500">
                {total} en total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setFilter('page', String(page - 1))}
                >
                  Anterior
                </Button>
                <span className="flex items-center text-sm text-neutral-600 px-2">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setFilter('page', String(page + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete single */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar comentario"
        description="¿Estás seguro de que quieres eliminar este comentario? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      {/* Delete bulk */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Eliminar comentarios seleccionados"
        description={`¿Estás seguro de que quieres eliminar ${selected.size} elemento(s)? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={bulkMutation.isPending}
      />
    </>
  )
}
