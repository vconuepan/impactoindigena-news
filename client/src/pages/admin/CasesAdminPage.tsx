/**
 * Admin page for managing OngoingCase editorial groupings.
 * Pattern mirrors SpotlightsAdminPage.
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { useToast } from '../../components/ui/Toast'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

interface OngoingCase {
  id: string
  title: string
  slug: string
  description: string | null
  keywords: string[]
  status: string
  imageUrl: string | null
  createdAt: string
}

interface CaseBody {
  title: string
  slug: string
  description?: string | null
  keywords: string[]
  status: 'active' | 'archived'
  imageUrl?: string | null
}

interface FormState {
  title: string
  slug: string
  description: string
  keywords: string
  status: 'active' | 'archived'
  imageUrl: string
}

const EMPTY_FORM: FormState = {
  title: '', slug: '', description: '', keywords: '', status: 'active', imageUrl: '',
}

function toSlug(title: string) {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function toBody(form: FormState): CaseBody {
  return {
    title:       form.title.trim(),
    slug:        form.slug.trim(),
    description: form.description.trim() || null,
    keywords:    form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    status:      form.status,
    imageUrl:    form.imageUrl.trim() || null,
  }
}

function fromCase(c: OngoingCase): FormState {
  return {
    title:       c.title,
    slug:        c.slug,
    description: c.description ?? '',
    keywords:    c.keywords.join(', '),
    status:      c.status as 'active' | 'archived',
    imageUrl:    c.imageUrl ?? '',
  }
}

function CaseDialog({
  editing, onClose, onSave, isSaving,
}: { editing: OngoingCase | null; onClose: () => void; onSave: (body: CaseBody, id?: string) => void; isSaving: boolean }) {
  const [form, setForm] = useState<FormState>(editing ? fromCase(editing) : EMPTY_FORM)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'title' && !editing) next.slug = toSlug(value as string)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = toBody(form)
    if (!body.title || !body.slug) return
    onSave(body, editing?.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            {editing ? 'Editar caso' : 'Nuevo caso en curso'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="Litio y Territorios Atacameños"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Slug (URL) <span className="text-red-500">*</span></label>
            <input type="text" value={form.slug} onChange={(e) => set('slug', e.target.value)}
              placeholder="litio-atacameno"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" required />
            <p className="text-xs text-neutral-400 mt-1">Solo letras minúsculas, números y guiones.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Descripción editorial</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="2-3 oraciones describiendo el caso y su importancia..."
              rows={3} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Palabras clave <span className="text-red-500">*</span></label>
            <textarea value={form.keywords} onChange={(e) => set('keywords', e.target.value)}
              placeholder="litio, atacameño, salar de atacama, lickanantay"
              rows={2} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <p className="text-xs text-neutral-400 mt-1">Separadas por coma. Una noticia aparece si su título o resumen contiene alguna.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Imagen de portada (URL, opcional)</label>
            <input type="url" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="https://..."
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-3">
            <select value={form.status} onChange={(e) => set('status', e.target.value as 'active' | 'archived')}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="active">Activo</option>
              <option value="archived">Archivado</option>
            </select>
            <span className="text-xs text-neutral-500">Los casos archivados no aparecen en el listado público.</span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium bg-brand-800 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
              {isSaving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear caso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CasesAdminPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OngoingCase | null>(null)

  const { data, isLoading, isError } = useQuery<OngoingCase[]>({
    queryKey: ['admin', 'cases'],
    queryFn: () => adminApi.cases.list(),
  })

  const saveMutation = useMutation({
    mutationFn: ({ body, id }: { body: CaseBody; id?: string }) =>
      id ? adminApi.cases.update(id, body) : adminApi.cases.create(body),
    onSuccess: (saved: OngoingCase) => {
      queryClient.setQueryData<OngoingCase[]>(['admin', 'cases'], (prev = []) => {
        const exists = prev.find((c) => c.id === saved.id)
        return exists ? prev.map((c) => c.id === saved.id ? saved : c) : [saved, ...prev]
      })
      toast('success', editing ? 'Caso actualizado' : 'Caso creado')
      setDialogOpen(false); setEditing(null)
    },
    onError: () => toast('error', 'Error al guardar el caso'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.cases.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<OngoingCase[]>(['admin', 'cases'], (prev = []) => prev.filter((c) => c.id !== id))
      toast('success', 'Caso eliminado')
    },
    onError: () => toast('error', 'Error al eliminar el caso'),
  })

  return (
    <>
      <Helmet><title>Casos en curso — Admin</title></Helmet>
      <PageHeader
        title="Casos en curso"
        description="Agrupa noticias relacionadas por tema o conflicto. Los casos activos aparecen en /casos."
        actions={
          <button onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            <PlusIcon className="h-4 w-4" /> Nuevo caso
          </button>
        }
      />

      {isLoading ? <LoadingSpinner /> : isError ? <ErrorState message="No se pudo cargar la lista de casos" /> :
        !data || data.length === 0 ? (
          <div className="text-center py-16 text-neutral-500">
            <p className="text-lg font-medium mb-2">Sin casos</p>
            <p className="text-sm">Crea el primer caso para agrupar noticias relacionadas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-3 text-left">Caso</th>
                  <th className="px-4 py-3 text-left">Palabras clave</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{c.title}</p>
                      <p className="text-xs text-neutral-400 font-mono">/caso/{c.slug}</p>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {c.keywords.slice(0, 4).map((kw) => (
                          <span key={kw} className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-xs">{kw}</span>
                        ))}
                        {c.keywords.length > 4 && <span className="text-xs text-neutral-400">+{c.keywords.length - 4}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {c.status === 'active' ? 'Activo' : 'Archivado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => { setEditing(c); setDialogOpen(true) }}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition-colors" aria-label="Editar">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => { if (window.confirm(`¿Eliminar "${c.title}"?`)) deleteMutation.mutate(c.id) }}
                        className="p-1.5 text-neutral-400 hover:text-red-600 rounded transition-colors ml-1" aria-label="Eliminar">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {dialogOpen && (
        <CaseDialog editing={editing} onClose={() => { setDialogOpen(false); setEditing(null) }}
          onSave={(body, id) => saveMutation.mutate({ body, id })} isSaving={saveMutation.isPending} />
      )}
    </>
  )
}
