import { useState } from 'react'
import { EditPanel, PANEL_BODY, PANEL_FOOTER } from './EditPanel'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { TwitterPost } from '@shared/types'

/** X/Twitter hard limit for a standard post. */
const CHAR_LIMIT = 280
const NEAR_LIMIT = 260

interface TwitterDraftPanelProps {
  open: boolean
  onClose: () => void
  draft: TwitterPost | null
  onPublish: (postId: string) => Promise<void>
  onUpdate: (postId: string, postText: string) => Promise<void>
  publishing?: boolean
}

export function TwitterDraftPanel({
  open,
  onClose,
  draft,
  onPublish,
  onUpdate,
  publishing,
}: TwitterDraftPanelProps) {
  const [editedText, setEditedText] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const currentText = hasEdited ? editedText : (draft?.postText ?? '')
  const charCount = currentText.length
  const isOverLimit = charCount > CHAR_LIMIT
  const isNearLimit = charCount > NEAR_LIMIT

  // Save before publishing, because the text on screen is what the user means
  // to post. The two must move together: publishing the stored text after an
  // edit would post something the user did not see.
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

  // Closing discards the unsaved edit and nothing else. Deleting the draft is
  // a separate, explicitly labeled action in the table.
  const handleClose = () => {
    setHasEdited(false)
    setEditedText('')
    onClose()
  }

  return (
    <>
      <EditPanel open={open} onClose={handleClose} title="Publicar en X/Twitter" loading={!draft && open}>
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
                    Un post fallido no se republica desde aquí: elimínalo en la tabla y genera el
                    borrador de nuevo.
                  </p>
                </div>
              )}

              {/* Image preview */}
              {draft.imageUrl && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 mb-2">Imagen</p>
                  <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    className="rounded border border-neutral-200 overflow-hidden focus-visible:ring-2 focus-visible:ring-brand-500 hover:opacity-90 transition-opacity"
                    title="Ampliar imagen"
                  >
                    <img src={draft.imageUrl} alt="Imagen del post" className="h-32 w-auto object-cover block" />
                  </button>
                  <p className="text-xs text-neutral-400 mt-1">Se adjunta al publicar.</p>
                </div>
              )}

              {/* Post text editor */}
              <div>
                <label htmlFor="tw-post-text" className="block text-sm font-medium text-neutral-700 mb-1">
                  Texto del post
                </label>
                <textarea
                  id="tw-post-text"
                  value={currentText}
                  onChange={(e) => {
                    setEditedText(e.target.value)
                    setHasEdited(true)
                  }}
                  rows={6}
                  disabled={draft.status !== 'draft'}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none disabled:bg-neutral-50 disabled:text-neutral-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-neutral-400">
                    El enlace de la historia ya viene en el texto y cuenta para el límite.
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      isOverLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-neutral-500'
                    }`}
                  >
                    {charCount}/{CHAR_LIMIT}
                  </span>
                </div>
              </div>
            </div>

            <div className={PANEL_FOOTER}>
              <Button
                onClick={handlePublish}
                disabled={
                  isOverLimit ||
                  publishing ||
                  saving ||
                  !currentText.trim() ||
                  draft.status !== 'draft'
                }
                loading={publishing || saving}
              >
                {publishing ? 'Publicando…' : saving ? 'Guardando…' : 'Publicar en X'}
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

      {zoomed && draft?.imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-neutral-900/85 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-5 text-white/80 hover:text-white text-4xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
          <img
            src={draft.imageUrl}
            alt="Imagen del post"
            className="max-h-[88vh] max-w-[92vw] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
