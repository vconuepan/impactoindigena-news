import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import type { ReviewCode } from '../../lib/admin-api'
import { CODE_LABEL } from '../../lib/review-labels'

interface ReviewHoldDialogProps {
  open: boolean
  count: number
  loading?: boolean
  onClose: () => void
  onConfirm: (code: ReviewCode, note: string) => void
}

/**
 * Retener pide un código: «sensible» o «fuera de ámbito». Lo segundo es el
 * dato que alimenta el criterio por marca (D5). Sin código no hay botón.
 */
export function ReviewHoldDialog({ open, count, loading, onClose, onConfirm }: ReviewHoldDialogProps) {
  const [code, setCode] = useState<ReviewCode | ''>('')
  const [note, setNote] = useState('')

  const cerrar = () => {
    setCode('')
    setNote('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={cerrar} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-neutral-900">
            {count === 1 ? 'Retener esta nota' : `Retener ${count} notas`}
          </DialogTitle>
          <Description className="mt-1 text-sm text-neutral-500">
            Deja de verse en esta marca. En Voces Indígenas no cambia nada.
          </Description>
          <div className="mt-4 space-y-3">
            <Select
              id="review-hold-code"
              label="Motivo"
              value={code}
              onChange={(e) => setCode(e.target.value as ReviewCode | '')}
              placeholder="Elige un motivo"
              options={(Object.keys(CODE_LABEL) as ReviewCode[]).map((c) => ({ value: c, label: CODE_LABEL[c] }))}
            />
            <Textarea
              id="review-hold-note"
              label="Nota (opcional)"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Por qué se retiene, en una línea"
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={cerrar} disabled={loading}>Cancelar</Button>
            <Button variant="danger" disabled={!code} loading={loading} onClick={() => code && onConfirm(code, note.trim())}>
              Retener
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
