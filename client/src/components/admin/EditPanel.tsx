import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { ReactNode } from 'react'

interface EditPanelProps {
  open: boolean
  onClose: () => void
  title: string
  loading?: boolean
  error?: boolean
  children: ReactNode
}

/**
 * Slide-over panel shell. Children should use PANEL_BODY for the scrollable
 * area and PANEL_FOOTER for the fixed bottom bar. Wrap both in a <form> so
 * the submit button in the footer belongs to the form.
 */
export function EditPanel({ open, onClose, title, loading, error, children }: EditPanelProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 flex max-w-full">
        <DialogPanel className="w-screen max-w-lg bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
            <DialogTitle className="text-lg font-semibold text-neutral-900 truncate pr-4">
              {title}
            </DialogTitle>
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 text-neutral-500" />
            </button>
          </div>
          {loading && (
            <div className="flex-1 flex justify-center items-start pt-12"><LoadingSpinner /></div>
          )}
          {error && (
            <div className="flex-1 p-4"><p className="text-sm text-red-600">Failed to load data.</p></div>
          )}
          {!loading && !error && children}
        </DialogPanel>
      </div>
    </Dialog>
  )
}

/** Scrollable form field area inside the panel. */
export const PANEL_BODY = 'flex-1 overflow-y-auto p-4 space-y-4'

/** Fixed footer bar at the bottom of the panel (outside scroll). */
export const PANEL_FOOTER = 'shrink-0 border-t border-neutral-200 px-4 py-3 flex gap-3'
