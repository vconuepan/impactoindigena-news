/**
 * La lista de clientes del aviso de independencia (regla 2, 25-nov-2026).
 *
 * Una nota que menciona a una organización de esta lista lleva en su ficha un
 * aviso genérico: «Esta nota menciona a una organización que es cliente de
 * impactoindigena.legal». Nunca el nombre (decisión del director). El cruce se
 * hace al leer la ficha, así que un cambio aquí vale también para las notas ya
 * publicadas, en menos de un minuto.
 *
 * Solo administradores: la lista puede estar bajo secreto profesional.
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ClienteAviso, type ClienteAvisoBody } from '../../lib/admin-api'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { useToast } from '../../components/ui/Toast'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

const VERTICAL: Record<ClienteAviso['vertical'], string> = {
  ai: 'impactoindigena.ai',
  legal: 'impactoindigena.legal',
}

const INPUT = 'w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

interface FormState {
  name: string
  aliases: string
  vertical: ClienteAviso['vertical']
  rut: string
  endedOn: string
}

const VACIO: FormState = { name: '', aliases: '', vertical: 'legal', rut: '', endedOn: '' }

function desde(c: ClienteAviso): FormState {
  return {
    name: c.name,
    aliases: c.aliases.join(', '),
    vertical: c.vertical,
    rut: c.rut ?? '',
    endedOn: c.endedOn ? c.endedOn.slice(0, 10) : '',
  }
}

function aCuerpo(f: FormState): ClienteAvisoBody {
  return {
    name: f.name.trim(),
    aliases: f.aliases.split(',').map((a) => a.trim()).filter(Boolean),
    vertical: f.vertical,
    rut: f.rut.trim() || null,
    endedOn: f.endedOn || null,
  }
}

function mensaje(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'No se pudo guardar'
}

function Formulario({ editando, onCerrar }: { editando: ClienteAviso | null; onCerrar: () => void }) {
  const [form, setForm] = useState<FormState>(editando ? desde(editando) : VACIO)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const guardar = useMutation({
    mutationFn: (body: ClienteAvisoBody) =>
      editando ? adminApi.avisoClientes.update(editando.id, body) : adminApi.avisoClientes.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'aviso-clientes'] })
      toast('success', editando ? 'Organización actualizada' : 'Organización agregada')
      onCerrar()
    },
    onError: (err) => setError(mensaje(err)),
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); guardar.mutate(aCuerpo(form)) }}
      className="mb-6 rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
      aria-label={editando ? 'Editar organización' : 'Agregar organización'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ac-nombre" className="block text-sm font-medium text-neutral-700 mb-1">
            Organización <span className="text-red-700">*</span>
          </label>
          <input id="ac-nombre" className={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <p className="text-xs text-neutral-500 mt-1">Empresa, comunidad, asociación u órgano del Estado. Nunca una persona.</p>
        </div>
        <div>
          <label htmlFor="ac-vertical" className="block text-sm font-medium text-neutral-700 mb-1">Cliente de</label>
          <select id="ac-vertical" className={INPUT} value={form.vertical} onChange={(e) => set('vertical', e.target.value as FormState['vertical'])}>
            <option value="legal">impactoindigena.legal</option>
            <option value="ai">impactoindigena.ai</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="ac-alias" className="block text-sm font-medium text-neutral-700 mb-1">Otros nombres</label>
        <input id="ac-alias" className={INPUT} value={form.aliases} onChange={(e) => set('aliases', e.target.value)} placeholder="Siglas o nombre corto, separados por coma" />
        <p className="text-xs text-neutral-500 mt-1">
          Se buscan como palabra completa, sin importar tildes ni mayúsculas, en el título, el resumen, la cita y el cuerpo de cada nota. Mínimo tres letras.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ac-rut" className="block text-sm font-medium text-neutral-700 mb-1">RUT (opcional)</label>
          <input id="ac-rut" className={INPUT} value={form.rut} onChange={(e) => set('rut', e.target.value)} placeholder="76.707.746-7" />
          <p className="text-xs text-neutral-500 mt-1">Si se anota, debe ser de persona jurídica.</p>
        </div>
        <div>
          <label htmlFor="ac-fin" className="block text-sm font-medium text-neutral-700 mb-1">La relación terminó el</label>
          <input id="ac-fin" type="date" className={INPUT} value={form.endedOn} onChange={(e) => set('endedOn', e.target.value)} />
          <p className="text-xs text-neutral-500 mt-1">Vacío mientras sigue. Con fecha, el aviso dice «fue cliente».</p>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg">
          Cancelar
        </button>
        <button type="submit" disabled={guardar.isPending} className="px-4 py-2 text-sm font-medium bg-brand-800 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function NotasDelCliente({ cliente }: { cliente: ClienteAviso }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const clave = ['admin', 'aviso-clientes', cliente.id, 'notas']
  const { data, isLoading, isError } = useQuery({ queryKey: clave, queryFn: () => adminApi.avisoClientes.notas(cliente.id) })

  const descartar = useMutation({
    mutationFn: ({ storyId, reason }: { storyId: string; reason: string }) => adminApi.avisoClientes.descartar(cliente.id, storyId, reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: clave }); toast('success', 'El aviso ya no sale en esa nota') },
    onError: (err) => toast('error', mensaje(err)),
  })
  const restaurar = useMutation({
    mutationFn: (storyId: string) => adminApi.avisoClientes.restaurar(cliente.id, storyId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: clave }); toast('success', 'El aviso vuelve a esa nota') },
    onError: (err) => toast('error', mensaje(err)),
  })

  if (isLoading) return <p className="text-sm text-neutral-500 py-2">Buscando en las notas publicadas…</p>
  if (isError || !data) return <p className="text-sm text-red-700 py-2">No se pudieron buscar las notas.</p>
  if (data.data.length === 0) return <p className="text-sm text-neutral-500 py-2">Ninguna nota publicada la menciona.</p>

  return (
    <ul className="divide-y divide-neutral-100">
      {data.data.map((n) => (
        <li key={n.id} className="py-2 flex items-start justify-between gap-4 text-sm">
          <div className="min-w-0">
            {n.slug ? (
              <Link to={`/stories/${n.slug}`} className="text-brand-800 hover:underline" target="_blank" rel="noopener noreferrer">
                {n.title ?? n.slug}
              </Link>
            ) : (
              <span>{n.title ?? n.id}</span>
            )}
            <span className="ml-2 text-xs text-neutral-500">
              {n.datePublished ? new Date(n.datePublished).toLocaleDateString('es-CL', { dateStyle: 'medium' }) : ''}
            </span>
            {n.dismissed && (
              <p className="text-xs text-neutral-600 mt-0.5">
                Sin aviso: {n.dismissed.reason}{n.dismissed.dismissedBy ? ` (${n.dismissed.dismissedBy})` : ''}
              </p>
            )}
          </div>
          {n.dismissed ? (
            <button type="button" onClick={() => restaurar.mutate(n.id)} className="shrink-0 text-xs text-brand-800 hover:underline">
              Devolver el aviso
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt('¿Por qué esta nota no informa sobre esta organización? (un homónimo, una mención al pasar)')
                if (reason && reason.trim().length >= 5) descartar.mutate({ storyId: n.id, reason: reason.trim() })
              }}
              className="shrink-0 text-xs text-neutral-600 hover:text-red-700 hover:underline"
            >
              No es de ella: quitar el aviso
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function AvisoClientesPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formulario, setFormulario] = useState<{ editando: ClienteAviso | null } | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'aviso-clientes'],
    queryFn: () => adminApi.avisoClientes.list(),
  })

  const quitar = useMutation({
    mutationFn: (id: string) => adminApi.avisoClientes.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'aviso-clientes'] }); toast('success', 'Organización quitada de la lista') },
    onError: (err) => toast('error', mensaje(err)),
  })

  const clientes = data?.data ?? []

  return (
    <>
      <Helmet><title>Aviso de clientes — Admin</title></Helmet>
      <PageHeader
        title="Aviso de clientes"
        description="Las organizaciones que son o fueron clientes de impactoindigena.ai o impactoindigena.legal. Una nota que mencione a alguna lleva en su ficha un aviso de independencia, sin su nombre."
        actions={
          <button
            type="button"
            onClick={() => setFormulario({ editando: null })}
            className="flex items-center gap-2 px-4 py-2 bg-brand-800 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Agregar organización
          </button>
        }
      />

      {formulario && (
        <Formulario key={formulario.editando?.id ?? 'nuevo'} editando={formulario.editando} onCerrar={() => setFormulario(null)} />
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState message={mensaje(error)} />
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          <p className="text-lg font-medium mb-2">La lista está vacía</p>
          <p className="text-sm">Mientras esté vacía, ninguna ficha lleva aviso.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3 text-left">Organización</th>
                <th className="px-4 py-3 text-left">Otros nombres</th>
                <th className="px-4 py-3 text-left">Cliente de</th>
                <th className="px-4 py-3 text-left">Relación</th>
                <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {clientes.map((c) => (
                <FilaCliente
                  key={c.id}
                  cliente={c}
                  abierto={abierto === c.id}
                  onAlternar={() => setAbierto(abierto === c.id ? null : c.id)}
                  onEditar={() => setFormulario({ editando: c })}
                  onQuitar={() => {
                    if (window.confirm(`¿Quitar «${c.name}» de la lista? Sus notas dejan de llevar el aviso.`)) quitar.mutate(c.id)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function FilaCliente({ cliente: c, abierto, onAlternar, onEditar, onQuitar }: {
  cliente: ClienteAviso
  abierto: boolean
  onAlternar: () => void
  onEditar: () => void
  onQuitar: () => void
}) {
  return (
    <>
      <tr>
        <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
        <td className="px-4 py-3 text-neutral-600">{c.aliases.join(', ') || '—'}</td>
        <td className="px-4 py-3 text-neutral-600">{VERTICAL[c.vertical]}</td>
        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
          {c.endedOn ? `Terminó el ${new Date(c.endedOn).toLocaleDateString('es-CL', { dateStyle: 'medium', timeZone: 'UTC' })}` : 'Vigente'}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button type="button" onClick={onAlternar} aria-expanded={abierto} className="text-xs text-brand-800 hover:underline mr-3">
            {abierto ? 'Ocultar notas' : 'Ver notas'}
          </button>
          <button type="button" onClick={onEditar} className="p-1 text-neutral-500 hover:text-brand-800" aria-label={`Editar ${c.name}`}>
            <PencilIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onQuitar} className="p-1 text-neutral-500 hover:text-red-700" aria-label={`Quitar ${c.name}`}>
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={5} className="px-4 pb-3 bg-neutral-50">
            <NotasDelCliente cliente={c} />
          </td>
        </tr>
      )}
    </>
  )
}
