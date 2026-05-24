/**
 * CasosSection — "Casos en curso" editorial groupings band.
 *
 * Sits between SpotlightBand and the issue feed on the homepage.
 * Shows all active ongoing cases with title, description preview,
 * and story count. Renders nothing when there are no active cases.
 */
import { Link } from 'react-router-dom'
import type { CaseListItem } from '../lib/api'

interface Props {
  cases: CaseListItem[]
}

export default function CasosSection({ cases }: Props) {
  if (cases.length === 0) return null

  return (
    <div
      className="w-full border-b border-neutral-200"
      style={{ backgroundColor: '#FAFAF8' }}
      role="region"
      aria-label="Casos en curso"
    >
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-5">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800 whitespace-nowrap font-dm-sans">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-amber-500 opacity-50 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            Casos en curso
          </span>
          <div className="flex-1 border-t border-neutral-300" aria-hidden="true" />
          <Link
            to="/casos"
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors font-dm-sans focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
          >
            Ver todos &rarr;
          </Link>
        </div>

        {/* Case cards */}
        <div className="flex flex-col gap-3 md:flex-row md:gap-4">
          {cases.map((c) => (
            <Link
              key={c.id}
              to={`/caso/${c.slug}`}
              className="group flex-1 rounded-lg bg-white p-4 md:p-5 transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-amber-500"
              style={{
                borderTop: '2px solid #f59e0b',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.12), 0 2px 4px rgba(0,0,0,0.04)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-amber-900 transition-colors leading-snug line-clamp-2 font-fraunces">
                  {c.title}
                </h3>
                {c.description && (
                  <p className="mt-2 text-xs text-neutral-500 leading-relaxed line-clamp-2 font-lora">
                    {c.description}
                  </p>
                )}
                {c.storyCount > 0 && (
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 font-dm-sans">
                    {c.storyCount} {c.storyCount === 1 ? 'nota' : 'notas'}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
