/**
 * Admin page for managing Spotlight (En Foco) topics.
 *
 * Each spotlight has:
 * - label:    display name shown in the band (e.g. "Foro Permanente ONU 2025")
 * - keywords: comma-separated list used to match stories via ILIKE
 * - isActive: shows/hides the band
 * - startsAt / endsAt: optional date window
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminSpotlight, type SpotlightBody } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { useToast } from '../../components/ui/Toast'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

// ─── Form dialog ──────────────────────────────────────────────────────────────

interface FormState {
  label:    string
  keywords: string   // comma-separated for UX
  isActive: boolean
  startsAt: string
  endsAt:   string
}

const EMPTY_FORM: FormState = {
  label:    '',
  keywords: '',
  isActive: true,
  startsAt: '',
  endsAt:   '',
}

function toBody(form: FormState): SpotlightBody {
  return {
    label:    form.label.trim(),
    keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
    isActive: form.isActive,
    startsAt: form.startsAt || null,
    endsAt:   form.endsAt   || null,
  }
}

function fromSpotlight(s: AdminSpotlight): FormState {
  return {
    label:    s.label,
    keywords: s.keywords.join(', '),
    isActive: s.isActive,
    startsAt: s.startsAt ? s.startsAt.slice(0, 16) : '',  // datetime-local format
    endsAt:   s.endsAt   ? s.endsAt.slice(0, 16)   : '',
  }
}

interface DialogProps {
  editing:  AdminSpotlight | null
  onClose:  () => void
  onSave:   (body: SpotlightBody, id?: string) => void
  isSaving: boolean
}

function SpotlightDialog({ editing, onClose, onSave, isSaving }: DialogProps) {
  const [form, setForm] = useState<FormState>(editing ? fromSpotlight(editing) : EMPTY_FORM)

  function set(field: keyof FormState, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = toBody(form)
    if (!body.label || body.keywords.length === 0) return
    onSave(body, editing?.id)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">
            {editing ? 'Editar spotlight' : 'Nuevo spotlight'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Título del tema <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="Foro Permanente de Cuestiones Indígenas ONU 2025"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Palabras clave <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.keywords}
              onChange={e => set('keywords', e.target.value)}
              placeholder="foro permanente, UNPFII, cuestiones indígenas ONU, pueblos indígenas ONU"
              rows={3}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              Separadas por coma. Una historia se incluye si su título o resumen contiene alguna de estas palabras.
            </p>
          </div>

          {/* Date window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Desde (opcional)</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={e => set('startsAt', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Hasta (opcional)</label>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={e => set('endsAt', e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-500 -mt-2">
            Sin fechas = siempre activo mientras "Activo" esté marcado.
          </p>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => set('isActive', !form.isActive)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 ${
                form.isActive ? 'bg-brand-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                  form.isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-neutral-700">
              {form.isActive ? 'Activo — visible en homepage' : 'Inactivo — no se muestra'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium bg-brand-800 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear spotlight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SpotlightsAdminPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminSpotlight | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'spotlights'],
    queryFn: () => adminApi.spotlights.list(),
  })

  const saveMutation = useMutation({
    mutationFn: ({ body, id }: { body: SpotlightBody; id?: string }) =>
      id
        ? adminApi.spotlights.update(id, body)
        : adminApi.spotlights.create(body),
    onSuccess: (saved) => {
      queryClient.setQueryData<AdminSpotlight[]>(['admin', 'spotlights'], (prev = []) => {
        const exists = prev.find(s => s.id === saved.id)
        return exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
      })
      toast('success', editing ? 'Spotlight actualizado' : 'Spotlight creado')
      setDialogOpen(false)
      setEditing(null)
    },
    onError: () => toast('error', 'Error al guardar el spotlight'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.spotlights.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AdminSpotlight[]>(['admin', 'spotlights'],
        (prev = []) => prev.filter(s => s.id !== id)
      )
      toast('success', 'Spotlight eliminado')
    },
    onError: () => toast('error', 'Error al eliminar el spotlight'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.spotlights.update(id, { isActive }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminSpotlight[]>(['admin', 'spotlights'],
        (prev = []) => prev.map(s => s.id === updated.id ? updated : s)
      )
    },
    onError: () => toast('error', 'Error al actualizar el estado'),
  })

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(s: AdminSpotlight) {
    setEditing(s)
    setDialogOpen(true)
  }

  function confirmDelete(s: AdminSpotlight) {
    if (window.confirm(`¿Eliminar "${s.label}"? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate(s.id)
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-CL', { dateStyle: 'medium' })
  }

  return (
    <>
      <Helmet>
        <title>En Foco — Admin</title>
      </Helmet>

      <PageHeader
        title="En Foco"
        description="Configura el tema del momento. El spotlight activo aparece como una banda rotativa en la homepage."
        actions={
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo spotlight
          </button>
        }
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState message="No se pudo cargar la lista de spotlights" />
      ) : !data || data.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          <p className="text-lg font-medium mb-2">Sin spotlights</p>
          <p className="text-sm">Crea uno para activar la banda "En Foco" en la homepage.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3 text-left">Tema</th>
                <th className="px-4 py-3 text-left">Palabras clave</th>
                <th className="px-4 py-3 text-left">Ventana</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.map(s => (
                <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-neutral-900 max-w-[220px]">
                    {s.label}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 max-w-[280px]">
                    <div className="flex flex-wrap gap-1">
                      {s.keywords.slice(0, 4).map(kw => (
                        <span key={kw} className="inline-block bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded text-xs">
                          {kw}
                        </span>
                      ))}
                      {s.keywords.length > 4 && (
                        <span className="text-xs text-neutral-400">+{s.keywords.length - 4} más</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500 whitespace-nowrap text-xs">
                    {s.startsAt || s.endsAt
                      ? `${formatDate(s.startsAt)} → ${formatDate(s.endsAt)}`
                      : 'Sin límite'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      role="switch"
                      aria-checked={s.isActive}
                      aria-label={s.isActive ? 'Desactivar' : 'Activar'}
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 ${
                        s.isActive ? 'bg-brand-600' : 'bg-neutral-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                          s.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
                      aria-label="Editar"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(s)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded transition-colors ml-1"
                      aria-label="Eliminar"
                    >
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
        <SpotlightDialog
          editing={editing}
          onClose={() => { setDialogOpen(false); setEditing(null) }}
          onSave={(body, id) => saveMutation.mutate({ body, id })}
          isSaving={saveMutation.isPending}
        />
      )}
    </>
  )
}
