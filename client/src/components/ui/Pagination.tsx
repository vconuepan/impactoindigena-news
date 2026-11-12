import { Button } from './Button'

// El paginador del PANEL. Hasta el 11-nov-2026 decia «Previous / Next» y «Show»
// en un panel que ya fecha en es-CL (LOCALE_PANEL, ecdaa34). El panel no pasa
// por i18next: los textos van fijos en español. El de las paginas publicas,
// traducido, es components/Pagination.tsx; los nombres accesibles son los mismos.
const TEXTOS = {
  navegacion: 'Paginación',
  mostrar: 'Mostrar',
  anterior: 'Anterior',
  siguiente: 'Siguiente',
  paginaAnterior: 'Página anterior',
  paginaSiguiente: 'Página siguiente',
  pagina: (n: number) => `Página ${n}`,
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  onPageSizeChange?: (size: number) => void
}

export function Pagination({ page, totalPages, onPageChange, pageSize, onPageSizeChange }: PaginationProps) {
  if (totalPages <= 1 && !onPageSizeChange) return null

  const pages = getPageNumbers(page, totalPages)

  return (
    <nav className="flex items-center justify-center gap-2 mt-4" aria-label={TEXTOS.navegacion}>
      {onPageSizeChange && (
        <div className="flex items-center gap-1.5 mr-4">
          <label htmlFor="page-size" className="text-sm text-neutral-500">{TEXTOS.mostrar}</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}

      {totalPages > 1 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={TEXTOS.paginaAnterior}
          >
            {TEXTOS.anterior}
          </Button>

          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-neutral-400">
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => onPageChange(p as number)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={TEXTOS.pagina(p as number)}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={TEXTOS.paginaSiguiente}
          >
            {TEXTOS.siguiente}
          </Button>
        </>
      )}
    </nav>
  )
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)
  return pages
}
