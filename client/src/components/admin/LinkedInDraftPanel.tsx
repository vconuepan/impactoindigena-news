import { useState } from 'react'
import { EditPanel, PANEL_BODY, PANEL_FOOTER } from './EditPanel'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { LinkedInPost } from '@shared/types'

interface LinkedInDraftPanelProps {
  open: boolean
  onClose: () => void
  draft: LinkedInPost | null
  onPublish: (postId: string) => Promise<void>
  onUpdate: (postId: string, postText: string) => Promise<void>
  onDelete: (postId: string) => Promise<void>
  publishing?: boolean
}

export function LinkedInDraftPanel({ open, onClose, draft, onPublish, onUpdate, onDelete, publishing }: LinkedInDraftPanelProps) {
  const [editedText, setEditedText] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)

  const currentText = hasEdited ? editedText : (draft?.postText ?? '')
  const charCount = currentText.length
  const isOverLimit = charCount > 3000
  const isNearLimit = charCount > 2700

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

  const handleCancel = async () => {
    if (draft) {
      try { await onDelete(draft.id) } catch {}
    }
    setHasEdited(false)
    onClose()
  }

  const handleClose = () => {
    setHasEdited(false)
    onClose()
  }

  return (
    <>
    <EditPanel open={open} onClose={handleClose} title="Post to LinkedIn" loading={!draft && open}>
      {draft && (
        <div className="flex flex-col h-full">
          <div className={PANEL_BODY}>
            {/* Story context */}
            <div className="rounded-md bg-neutral-50 border border-neutral-200 p-3 space-y-1">
              <p className="text-sm font-medium text-neutral-900">
                {draft.story?.titleLabel && (
                  <span className="text-brand-600">{draft.story.titleLabel} — </span>
                )}
                {draft.story?.title || 'Untitled'}
              </p>
              <p className="text-xs text-neutral-500">
                {draft.story?.feed.displayTitle || draft.story?.feed.title}
                {draft.story?.issue && <> · {draft.story.issue.name}</>}
                {draft.story?.relevance != null && <> · Relevance: {draft.story.relevance}/10</>}
              </p>
            </div>

            {/* Slide previews (multi-image gallery) */}
            {draft.slideUrls && draft.slideUrls.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-700 mb-2">
                  Galería ({draft.slideUrls.length} imágenes)
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {draft.slideUrls.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setZoomIndex(i)}
                      className="shrink-0 rounded border border-neutral-200 overflow-hidden focus-visible:ring-2 focus-visible:ring-brand-500 hover:opacity-90 transition-opacity"
                      title={`Ampliar imagen ${i + 1}`}
                    >
                      <img src={url} alt={`Imagen ${i + 1}`} className="h-28 w-[5.6rem] object-cover block" />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 mt-1">Toca una imagen para verla en grande. Se publica como galería deslizable.</p>
              </div>
            )}

            {/* Post text editor */}
            <div>
              <label htmlFor="li-post-text" className="block text-sm font-medium text-neutral-700 mb-1">
                Post Text
              </label>
              <textarea
                id="li-post-text"
                value={currentText}
                onChange={(e) => { setEditedText(e.target.value); setHasEdited(true) }}
                rows={8}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-neutral-400">
                  {draft.slideUrls && draft.slideUrls.length > 0
                    ? 'Se publica como galería de imágenes con el enlace de la historia en el texto.'
                    : 'LinkedIn genera una tarjeta de enlace a partir de la URL de la historia.'}
                </span>
                <span className={`text-xs font-medium ${isOverLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-neutral-500'}`}>
                  {charCount}/3000
                </span>
              </div>
            </div>
          </div>

          <div className={PANEL_FOOTER}>
            <Button
              onClick={handlePublish}
              disabled={isOverLimit || publishing || saving || !currentText.trim()}
              loading={publishing || saving}
            >
              {publishing ? 'Publishing...' : saving ? 'Saving...' : 'Post to LinkedIn'}
            </Button>
            <Button variant="secondary" onClick={handleCancel} disabled={publishing || saving}>
              Cancel
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

    {zoomIndex !== null && draft?.slideUrls?.[zoomIndex] && (
      <div
        className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
        onClick={() => setZoomIndex(null)}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={() => setZoomIndex(null)}
          className="absolute top-4 right-5 text-white/80 hover:text-white text-4xl leading-none"
          aria-label="Cerrar"
        >×</button>
        {zoomIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setZoomIndex(zoomIndex - 1) }}
            className="absolute left-3 md:left-8 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl leading-none px-2"
            aria-label="Imagen anterior"
          >‹</button>
        )}
        <img
          src={draft.slideUrls[zoomIndex]}
          alt={`Imagen ${zoomIndex + 1}`}
          className="max-h-[88vh] max-w-[92vw] rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        {zoomIndex < draft.slideUrls.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setZoomIndex(zoomIndex + 1) }}
            className="absolute right-3 md:right-8 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-5xl leading-none px-2"
            aria-label="Imagen siguiente"
          >›</button>
        )}
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-sm">
          {zoomIndex + 1} / {draft.slideUrls.length}
        </span>
      </div>
    )}
    </>
  )
}
