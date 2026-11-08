import { useTranslation } from 'react-i18next'

// Lo usan las páginas públicas (tema, comunidad y búsqueda). Hasta el
// 8-nov-2026 decía «Previous» y «Next» en un sitio en español. El panel tiene
// el suyo en components/ui/Pagination.tsx.

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-1 mt-8">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-2 text-sm rounded border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={t('pagination.previousPage')}
      >
        {t('pagination.previous')}
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-neutral-400">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-2 text-sm rounded border focus-visible:ring-2 focus-visible:ring-brand-500 ${
              p === page
                ? 'bg-brand-800 text-white border-brand-800'
                : 'border-neutral-200 hover:bg-neutral-50'
            }`}
            aria-current={p === page ? 'page' : undefined}
            aria-label={t('pagination.page', { page: p })}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-2 text-sm rounded border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={t('pagination.nextPage')}
      >
        {t('pagination.next')}
      </button>
    </nav>
  )
}
