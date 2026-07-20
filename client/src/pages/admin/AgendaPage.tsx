/**
 * Admin page for "Incidencia Internacional" agenda items. Review drafts produced
 * by the ingestion job, edit dates/type, and publish. Pattern mirrors CasesAdminPage.
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminAgendaItem } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { useToast } from '../../components/ui/Toast'
import { PencilIcon, TrashIcon, ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline'

type StatusFilter = 'draft' | 'published' | 'all'
type AgendaType = AdminAgendaItem['type']

const TYPE_LABEL: Record<AgendaType, string> = {
  evento: 'Evento',
  convocatoria: 'Convocatoria',
  oportunidad: 'Oportunidad',
  publicacion: 'Publicación',
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const orNull = (s: string) => (s.trim() ? s.trim() : null)

interface FormState {
  type: AgendaType
  status: 'draft' | 'published'
  title: string
  summary: string
  startDate: string
  endDate: string
  dueDate: string
  location: string
}

function fromItem(it: AdminAgendaItem): FormState {
  return {
    type: it.type,
    status: it.status,
    title: it.title,
    summary: it.summary ?? '',
    startDate: toDateInput(it.startDate),
    endDate: toDateInput(it.endDate),
    dueDate: toDateInput(it.dueDate),
    location: it.location ?? '',
  }
}

function EditDialog({
  item, onClose, onSave, isSaving,
}: { item: AdminAgendaItem; onClose: () => void; onSave: (body: Partial<AdminAgendaItem>) => void; isSaving: boolean }) {
  const [form, setForm] = useState<FormState>(fromItem(item))
  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave({
      type: form.type,
      status: form.status,
      title: form.title.trim(),
      summary: orNull(form.summary),
      startDate: orNull(form.startDate),
      endDate: orNull(form.endDate),
      dueDate: orNull(form.dueDate),
      location: orNull(form.location),
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Editar ítem de agenda</h2>
          <p className="text-xs text-neutral-400 mt-0.5">{item.sourceName}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tipo</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value as AgendaType)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {(Object.keys(TYPE_LABEL) as AgendaType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Estado</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value as 'draft' | 'published')}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} required
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Resumen</label>
            <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={3}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Inicio (evento)</label>
              <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Fin (evento)</label>
              <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Límite (convoc.)</label>
              <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Lugar</label>
            <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium bg-brand-800 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AgendaPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [status, setStatus] = useState<StatusFilter>('draft')
  const [editing, setEditing] = useState<AdminAgendaItem | null>(null)

  const queryKey = ['admin', 'agenda', status]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => adminApi.agenda.list({ status: status === 'all' ? undefined : status, pageSize: 200 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'agenda'] })

  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AdminAgendaItem> }) => adminApi.agenda.update(id, body),
    onSuccess: () => { invalidate(); toast('success', 'Ítem actualizado'); setEditing(null) },
    onError: () => toast('error', 'Error al guardar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.agenda.delete(id),
    onSuccess: () => { invalidate(); toast('success', 'Ítem eliminado') },
    onError: () => toast('error', 'Error al eliminar'),
  })

  const ingestMutation = useMutation({
    mutationFn: () => adminApi.agenda.ingest(),
    onSuccess: () => toast('success', 'Ingesta disparada — refresca en ~1 min para ver nuevos ítems'),
    onError: () => toast('error', 'Error al disparar la ingesta'),
  })

  const items = data?.items ?? []

  return (
    <>
      <Helmet><title>Incidencia (agenda) — Admin</title></Helmet>
      <PageHeader
        title="Incidencia Internacional"
        description="Revisa y publica los ítems de agenda ingeridos automáticamente (eventos, convocatorias, oportunidades, publicaciones)."
        actions={
          <button onClick={() => ingestMutation.mutate()} disabled={ingestMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
            <ArrowPathIcon className="h-4 w-4" /> {ingestMutation.isPending ? 'Ingiriendo…' : 'Ingestar ahora'}
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['draft', 'published', 'all'] as StatusFilter[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${status === s ? 'bg-brand-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
            {s === 'draft' ? 'Borradores' : s === 'published' ? 'Publicados' : 'Todos'}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : isError ? <ErrorState message="No se pudo cargar la agenda" /> :
        items.length === 0 ? (
          <div className="text-center py-16 text-neutral-500">
            <p className="text-lg font-medium mb-2">Sin ítems</p>
            <p className="text-sm">Usa "Ingestar ahora" para poblar la agenda desde las fuentes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-3 text-left">Ítem</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((it) => {
                  const date = it.startDate ?? it.dueDate
                  return (
                    <tr key={it.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 max-w-md">
                        <p className="font-medium text-neutral-900">{it.title}</p>
                        <p className="text-xs text-neutral-400">{it.sourceName}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{TYPE_LABEL[it.type]}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-600">{date ? toDateInput(date) : <span className="text-amber-600">sin fecha</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${it.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {it.status === 'published' ? 'Publicado' : 'Borrador'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {it.status === 'draft' && (
                          <button onClick={() => saveMutation.mutate({ id: it.id, body: { status: 'published' } })}
                            className="p-1.5 text-neutral-400 hover:text-emerald-600 rounded transition-colors" aria-label="Publicar" title="Publicar">
                            <CheckIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setEditing(it)} className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition-colors ml-1" aria-label="Editar">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => { if (window.confirm(`¿Eliminar "${it.title}"?`)) deleteMutation.mutate(it.id) }}
                          className="p-1.5 text-neutral-400 hover:text-red-600 rounded transition-colors ml-1" aria-label="Eliminar">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {editing && (
        <EditDialog item={editing} onClose={() => setEditing(null)}
          onSave={(body) => saveMutation.mutate({ id: editing.id, body })} isSaving={saveMutation.isPending} />
      )}
    </>
  )
}
