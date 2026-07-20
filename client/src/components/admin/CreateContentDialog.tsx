import { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateContentDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (title: string) => Promise<void>
  type: 'newsletter' | 'podcast'
  loading?: boolean
}

export function CreateContentDialog({ open, onClose, onSubmit, type, loading }: CreateContentDialogProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(title)
    setTitle('')
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-sm w-full rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-neutral-900 mb-4">
            New {type === 'newsletter' ? 'Newsletter' : 'Podcast'}
          </DialogTitle>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="content-title"
              label="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Enter ${type} title`}
              required
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={loading} disabled={!title.trim()}>Create</Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
