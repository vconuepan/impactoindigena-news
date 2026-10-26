import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  useEditorial,
  useUpdateEditorial,
  useGenerateEditorial,
  usePublishEditorial,
  useUnpublishEditorial,
  useEditorialLinkedIn,
} from '../../hooks/useEditorials'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { ErrorState } from '../../components/ui/ErrorState'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { EditorialAviso, EditorialMethod } from '@shared/types'

/**
 * La editorial firmada (plan del 25-oct-2026, B5).
 *
 * El flujo cambió: antes el botón «Generar con IA» escribía la columna desde
 * las ocho noticias de la semana, sin que el autor hubiera dicho nada. Ahora el
 * borrador sale de las NOTAS del director, y sin notas suficientes el botón no
 * se habilita. Publicar exige firma y método; el servidor lo vuelve a comprobar.
 */

export const MIN_NOTAS = 200

const METODOS: { value: EditorialMethod; label: string; ayuda: string }[] = [
  { value: '', label: 'Sin fijar', ayuda: 'No se puede publicar hasta elegir uno.' },
  { value: 'ia_revisada', label: 'Redactada desde mis notas y revisada por mí', ayuda: 'El modelo ordenó tus notas; tú leíste, corregiste y publicas.' },
  { value: 'humana', label: 'La escribí yo', ayuda: 'El texto es tuyo; a lo más el modelo ayudó a ordenar el borrador.' },
]

export default function EditorialDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data: editorial, isLoading, error, refetch } = useEditorial(id || '')
  const updateEditorial = useUpdateEditorial()
  const generateEditorial = useGenerateEditorial()
  const publishEditorial = usePublishEditorial()
  const unpublishEditorial = useUnpublishEditorial()
  const getLinkedIn = useEditorialLinkedIn()

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [authorDraft, setAuthorDraft] = useState('')
  const [methodDraft, setMethodDraft] = useState<EditorialMethod>('')
  const [sourcesDraft, setSourcesDraft] = useState('')
  const [avisos, setAvisos] = useState<EditorialAviso[]>([])
  const [linkedInText, setLinkedInText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Los campos de autoría se cargan una vez desde la editorial y se guardan juntos.
  useEffect(() => {
    if (!editorial) return
    setNotesDraft(editorial.notes ?? '')
    setAuthorDraft(editorial.authorName ?? '')
    setMethodDraft((editorial.method ?? '') as EditorialMethod)
    setSourcesDraft(editorial.sources ?? '')
    if (editorial.avisos) setAvisos(editorial.avisos)
  }, [editorial?.id, editorial?.notes, editorial?.authorName, editorial?.method, editorial?.sources, editorial?.avisos])

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  if (error || !editorial) return <ErrorState message="Error al cargar editorial" onRetry={refetch} />

  const isDraft = editorial.status === 'draft'
  const notasSuficientes = notesDraft.trim().length >= MIN_NOTAS
  const notasGuardadas = (editorial.notes ?? '').trim().length >= MIN_NOTAS
  const autoriaCambiada =
    notesDraft !== (editorial.notes ?? '') ||
    authorDraft !== (editorial.authorName ?? '') ||
    methodDraft !== ((editorial.method ?? '') as EditorialMethod) ||
    sourcesDraft !== (editorial.sources ?? '')
  const razonesParaNoPublicar: string[] = []
  if (!editorial.content) razonesParaNoPublicar.push('sin texto')
  if (!(editorial.authorName ?? '').trim()) razonesParaNoPublicar.push('sin firma')
  if (!editorial.method) razonesParaNoPublicar.push('sin método')
  if (autoriaCambiada) razonesParaNoPublicar.push('hay cambios sin guardar')

  const handleSaveTitle = async () => {
    try {
      await updateEditorial.mutateAsync({ id: editorial.id, data: { title: titleDraft } })
      setEditingTitle(false)
      toast('success', 'Título actualizado')
    } catch {
      toast('error', 'Error al guardar título')
    }
  }

  const handleSaveContent = async () => {
    try {
      await updateEditorial.mutateAsync({ id: editorial.id, data: { content: contentDraft } })
      setEditingContent(false)
      toast('success', 'Editorial guardada')
    } catch {
      toast('error', 'Error al guardar editorial')
    }
  }

  const handleSaveAutoria = async () => {
    try {
      await updateEditorial.mutateAsync({
        id: editorial.id,
        data: { notes: notesDraft, authorName: authorDraft.trim(), method: methodDraft, sources: sourcesDraft },
      })
      toast('success', 'Notas, firma, método y fuentes guardados')
    } catch {
      toast('error', 'Error al guardar')
    }
  }

  const handleGenerate = async () => {
    try {
      if (autoriaCambiada) await handleSaveAutoria()
      const resultado = await generateEditorial.mutateAsync(editorial.id)
      setAvisos(resultado.avisos ?? [])
      toast('success', 'Borrador redactado desde tus notas: léelo, corrige y fija el método antes de publicar')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al redactar el borrador')
    }
  }

  const handlePublish = async () => {
    try {
      await publishEditorial.mutateAsync(editorial.id)
      toast('success', 'Editorial publicada en Voces Indígenas')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al publicar')
    }
  }

  const handleUnpublish = async () => {
    try {
      await unpublishEditorial.mutateAsync(editorial.id)
      toast('success', 'Editorial despublicada')
    } catch {
      toast('error', 'Error al despublicar')
    }
  }

  const handleCopyLinkedIn = async () => {
    try {
      const result = await getLinkedIn.mutateAsync(editorial.id)
      setLinkedInText(result.text)
    } catch {
      toast('error', 'Error al formatear para LinkedIn')
    }
  }

  const handleCopy = async () => {
    if (!linkedInText) return
    await navigator.clipboard.writeText(linkedInText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Helmet>
        <title>{editorial.title} — Voces Indígenas — Admin</title>
      </Helmet>

      <div className="max-w-3xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <button
            onClick={() => navigate('/admin/editorials')}
            className="text-sm text-neutral-500 hover:text-neutral-700 mt-1"
          >
            ← Voces Indígenas
          </button>
          <div className="flex gap-2 flex-wrap justify-end">
            {isDraft && (
              <Button
                onClick={handlePublish}
                disabled={publishEditorial.isPending || razonesParaNoPublicar.length > 0}
                title={razonesParaNoPublicar.length > 0 ? `No se puede publicar: ${razonesParaNoPublicar.join(', ')}` : undefined}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {publishEditorial.isPending ? 'Publicando…' : 'Publicar'}
              </Button>
            )}
            {!isDraft && (
              <Button
                variant="secondary"
                onClick={handleUnpublish}
                disabled={unpublishEditorial.isPending}
              >
                {unpublishEditorial.isPending ? 'Despublicando…' : 'Volver a borrador'}
              </Button>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="mb-4">
          {isDraft ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              Borrador{razonesParaNoPublicar.length > 0 ? ` · ${razonesParaNoPublicar.join(' · ')}` : ' · lista para publicar'}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Publicado{editorial.publishedAt ? ` · ${new Date(editorial.publishedAt).toLocaleDateString('es-CL')}` : ''}
            </span>
          )}
        </div>

        {/* Title */}
        <div className="mb-6">
          {editingTitle ? (
            <div className="flex gap-2 items-start">
              <input
                className="flex-1 text-2xl font-bold border border-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle() }}
                autoFocus
              />
              <Button onClick={handleSaveTitle} disabled={updateEditorial.isPending}>Guardar</Button>
              <Button variant="secondary" onClick={() => setEditingTitle(false)}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 flex-1">{editorial.title}</h1>
              <button
                onClick={() => { setTitleDraft(editorial.title); setEditingTitle(true) }}
                className="text-xs text-neutral-400 hover:text-neutral-600 mt-1 shrink-0"
              >
                Editar título
              </button>
            </div>
          )}
        </div>

        {/* Notas del autor: la única fuente del borrador */}
        <section className="mb-8 border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <label htmlFor="editorial-notes" className="text-sm font-semibold text-neutral-800">
              Tus notas
            </label>
            <span className={`text-xs ${notasSuficientes ? 'text-neutral-500' : 'text-amber-700'}`}>
              {notesDraft.trim().length} / {MIN_NOTAS} caracteres mínimos
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-2">
            El hecho del que partes, tu lectura y lo que propones. El borrador sale de aquí y de nada más:
            lo que no esté en las notas no estará en la editorial.
          </p>
          <textarea
            id="editorial-notes"
            className="w-full min-h-[200px] border border-neutral-300 rounded p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            disabled={!isDraft}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label htmlFor="editorial-author" className="block text-sm font-semibold text-neutral-800 mb-1">Firma</label>
              <input
                id="editorial-author"
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={authorDraft}
                onChange={e => setAuthorDraft(e.target.value)}
                placeholder="Venancio Coñuepán Mesías"
                disabled={!isDraft}
              />
            </div>
            <div>
              <label htmlFor="editorial-method" className="block text-sm font-semibold text-neutral-800 mb-1">Cómo se hizo</label>
              <select
                id="editorial-method"
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={methodDraft}
                onChange={e => setMethodDraft(e.target.value as EditorialMethod)}
                disabled={!isDraft}
              >
                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <p className="text-xs text-neutral-500 mt-1">{METODOS.find(m => m.value === methodDraft)?.ayuda}</p>
            </div>
          </div>

          <label htmlFor="editorial-sources" className="block text-sm font-semibold text-neutral-800 mt-4 mb-1">Fuentes consultadas</label>
          <textarea
            id="editorial-sources"
            className="w-full min-h-[80px] border border-neutral-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={sourcesDraft}
            onChange={e => setSourcesDraft(e.target.value)}
            placeholder={'Una por línea: medio, título, enlace.'}
            disabled={!isDraft}
          />

          {isDraft && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={handleSaveAutoria} disabled={updateEditorial.isPending || !autoriaCambiada}>
                {updateEditorial.isPending ? 'Guardando…' : 'Guardar notas y autoría'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleGenerate}
                disabled={generateEditorial.isPending || !notasSuficientes}
                title={!notasSuficientes ? `Escribe al menos ${MIN_NOTAS} caracteres de notas` : undefined}
              >
                {generateEditorial.isPending ? 'Redactando…' : editorial.content ? 'Volver a redactar desde mis notas' : 'Redactar borrador desde mis notas'}
              </Button>
            </div>
          )}
        </section>

        {/* Avisos de los candados sobre el borrador */}
        {avisos.length > 0 && (
          <div className="mb-6 border border-amber-200 bg-amber-50 rounded-lg p-4" role="status">
            <p className="text-sm font-semibold text-amber-900 mb-2">Lo que hay que revisar antes de publicar</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900">
              {avisos.map((a, i) => <li key={i}>{a.mensaje}</li>)}
            </ul>
          </div>
        )}

        {/* Content */}
        <div className="mb-6">
          {!editorial.content && !generateEditorial.isPending && (
            <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-lg">
              <p className="text-neutral-500 mb-2">La editorial aún no tiene texto.</p>
              <p className="text-sm text-neutral-400">
                {notasGuardadas || notasSuficientes
                  ? 'Redacta el borrador desde tus notas, o escribe el texto tú.'
                  : `Escribe primero tus notas (al menos ${MIN_NOTAS} caracteres).`}
              </p>
              {isDraft && (
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => { setContentDraft(''); setEditingContent(true) }}
                >
                  Escribir el texto yo
                </Button>
              )}
            </div>
          )}

          {generateEditorial.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <LoadingSpinner />
              <p className="text-sm text-neutral-500">Ordenando tus notas en tu voz…</p>
            </div>
          )}

          {(editorial.content || editingContent) && !generateEditorial.isPending && (
            editingContent ? (
              <div className="flex flex-col gap-3">
                <textarea
                  className="w-full min-h-[480px] border border-neutral-300 rounded p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  value={contentDraft}
                  onChange={e => setContentDraft(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button onClick={handleSaveContent} disabled={updateEditorial.isPending}>
                    {updateEditorial.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingContent(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="relative group">
                <div className="prose prose-neutral max-w-none text-neutral-800 leading-relaxed whitespace-pre-wrap text-base">
                  {editorial.content}
                </div>
                {editorial.authorName && (
                  <p className="mt-6 text-sm text-neutral-500">— {editorial.authorName}</p>
                )}
                <button
                  onClick={() => { setContentDraft(editorial.content); setEditingContent(true) }}
                  className="absolute top-0 right-0 text-xs text-neutral-400 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Editar
                </button>
              </div>
            )
          )}
        </div>

        {/* LinkedIn */}
        {editorial.content && (
          <div className="border-t border-neutral-200 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-700">Copiar para LinkedIn</h2>
              <Button variant="secondary" onClick={handleCopyLinkedIn} disabled={getLinkedIn.isPending}>
                {getLinkedIn.isPending ? 'Preparando…' : 'Generar texto LinkedIn'}
              </Button>
            </div>

            {linkedInText && (
              <div className="relative">
                <pre className="text-sm bg-neutral-50 border border-neutral-200 rounded p-4 whitespace-pre-wrap leading-relaxed text-neutral-700 max-h-64 overflow-y-auto">
                  {linkedInText}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 text-xs bg-white border border-neutral-200 rounded px-2 py-1 hover:bg-neutral-50 transition-colors"
                >
                  {copied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
