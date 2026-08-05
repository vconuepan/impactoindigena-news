import { useState } from 'react'
import { EditPanel, PANEL_BODY, PANEL_FOOTER } from './EditPanel'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { FacebookPost } from '@shared/types'

/**
 * El texto no tiene tope duro en Facebook, pero el feed corta a ~3 líneas con un
 * "Ver más". Estos umbrales avisan cuando el post se pasa de lo que la gente lee,
 * no de lo que la API acepta.
 */
const LONG = 600
const VERY_LONG = 1000

interface FacebookDraftPanelProps {
  open: boolean
  onClose: () => void
  draft: FacebookPost | null
  onPublish: (postId: string) => Promise<void>
  onUpdate: (postId: string, postText: string) => Promise<void>
  publishing?: boolean
}

export function FacebookDraftPanel({
  open,
  onClose,
  draft,
  onPublish,
  onUpdate,
  publishing,
}: FacebookDraftPanelProps) {
  const [editedText, setEditedText] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentText = hasEdited ? editedText : (draft?.postText ?? '')
  const charCount = currentText.length
  const isVeryLong = charCount > VERY_LONG
  const isLong = charCount > LONG

  // Guardar antes de publicar: el texto en pantalla es el que la persona quiere
  // publicar. Publicar el guardado después de una edición publicaría algo que
  // nadie vio.
  const handlePublish = async () => {
    if (!draft) return
    try {
      if (hasEdited && editedText !== draft.postText) {
        setSaving(true)
        await onUpdate(draft.id, editedText)
        setSaving(false)
      }
      await onPublish(draft.id)
    } catch {
      setSaving(false)
    }
  }

  // Cerrar descarta la edición sin guardar y nada más. Borrar el borrador es una
  // acción aparte y con su propio nombre, en la tabla.
  const handleClose = () => {
    setHasEdited(false)
    setEditedText('')
    onClose()
  }

  const storyUrl = draft?.story?.slug
    ? `https://impactoindigena.news/stories/${draft.story.slug}`
    : null

  return (
    <EditPanel open={open} onClose={handleClose} title="Publicar en la Página de Facebook" loading={!draft && open}>
      {draft && (
        <div className="flex flex-col h-full">
          <div className={PANEL_BODY}>
            {/* Story context */}
            <div className="rounded-md bg-neutral-50 border border-neutral-200 p-3 space-y-1">
              <p className="text-sm font-medium text-neutral-900">
                {draft.story?.titleLabel && (
                  <span className="text-brand-600">{draft.story.titleLabel} — </span>
                )}
                {draft.story?.title || 'Sin título'}
              </p>
              <p className="text-xs text-neutral-500">
                {draft.story?.feed.displayTitle || draft.story?.feed.title}
                {draft.story?.issue && <> · {draft.story.issue.name}</>}
                {draft.story?.relevance != null && <> · Relevancia: {draft.story.relevance}/10</>}
              </p>
            </div>

            {draft.status === 'failed' && draft.error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-xs font-medium text-red-800 mb-0.5">Falló al publicar</p>
                <p className="text-xs text-red-700 break-words">{draft.error}</p>
                <p className="text-xs text-red-600 mt-1">
                  Se puede corregir el texto y volver a publicar sin regenerar el borrador.
                </p>
              </div>
            )}

            {/* Post text editor */}
            <div>
              <label htmlFor="fb-post-text" className="block text-sm font-medium text-neutral-700 mb-1">
                Texto de la publicación
              </label>
              <textarea
                id="fb-post-text"
                value={currentText}
                onChange={(e) => {
                  setEditedText(e.target.value)
                  setHasEdited(true)
                }}
                rows={9}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-neutral-400">
                  Las dos primeras líneas son lo único visible antes del &ldquo;Ver más&rdquo;.
                </span>
                <span
                  className={`text-xs font-medium ${
                    isVeryLong ? 'text-red-600' : isLong ? 'text-amber-600' : 'text-neutral-500'
                  }`}
                >
                  {charCount} caracteres
                </span>
              </div>
            </div>

            {/* Link card preview */}
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">Tarjeta de enlace</p>
              <div className="rounded-md border border-neutral-200 overflow-hidden">
                {draft.story?.imageUrl && (
                  <img
                    src={draft.story.imageUrl}
                    alt="Imagen de la tarjeta"
                    className="w-full h-36 object-cover block"
                  />
                )}
                <div className="px-3 py-2 bg-neutral-50">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400">
                    impactoindigena.news
                  </p>
                  <p className="text-sm font-medium text-neutral-800 line-clamp-2">
                    {draft.story?.title || 'Sin título'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Facebook arma esta tarjeta desde {storyUrl ?? 'el enlace de la historia'} al publicar.
                No se sube ninguna imagen aparte, así que el clic lleva al artículo.
              </p>
            </div>
          </div>

          <div className={PANEL_FOOTER}>
            <Button
              onClick={handlePublish}
              disabled={publishing || saving || !currentText.trim()}
              loading={publishing || saving}
            >
              {publishing ? 'Publicando…' : saving ? 'Guardando…' : 'Publicar en la Página'}
            </Button>
            <Button variant="secondary" onClick={handleClose} disabled={publishing || saving}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {!draft && open && (
        <div className="flex-1 flex justify-center items-start pt-12">
          <LoadingSpinner />
        </div>
      )}
    </EditPanel>
  )
}
