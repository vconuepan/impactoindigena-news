import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { NAV_ITEMS, type NavItem } from '../../config/admin-nav'

/**
 * Command palette (⌘K / Ctrl+K) for jumping between the ~20 admin destinations
 * without reaching for the sidebar. Reuses the same nav source and icons, so it
 * never drifts from the sidebar. Fuzzy-ish filtering by label + section.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const results = q === ''
    ? NAV_ITEMS
    : NAV_ITEMS.filter(
        (item) =>
          item.name.toLowerCase().includes(q) || item.section.toLowerCase().includes(q),
      )

  function go(item: NavItem | null) {
    if (!item) return
    navigate(item.href)
    onClose()
  }

  // Reset the query whenever the palette closes so it reopens clean.
  function handleClose() {
    onClose()
    setQuery('')
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50 admin-warm">
      <DialogBackdrop className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh]">
        <DialogPanel className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
          <Combobox onChange={go} immediate>
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4">
              <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
              <ComboboxInput
                autoFocus
                placeholder="Ir a…"
                className="w-full bg-transparent py-3.5 text-sm text-neutral-900 placeholder-neutral-400 outline-none"
                onChange={(e) => setQuery(e.target.value)}
                displayValue={() => ''}
              />
              <kbd className="hidden sm:inline-block rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                esc
              </kbd>
            </div>

            <ComboboxOptions static className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500">
                  Sin resultados para “{query}”.
                </p>
              ) : (
                results.map((item) => (
                  <ComboboxOption
                    key={item.href}
                    value={item}
                    className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-700 data-[focus]:bg-brand-50 data-[focus]:text-brand-800"
                  >
                    <item.icon className="h-5 w-5 shrink-0 text-neutral-400 group-data-[focus]:text-brand-700" aria-hidden="true" />
                    <span className="font-medium">{item.name}</span>
                    <span className="ml-auto text-xs text-neutral-400">{item.section}</span>
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Combobox>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
