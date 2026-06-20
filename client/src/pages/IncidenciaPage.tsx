import { Helmet } from 'react-helmet-async'
import { useAgenda } from '../hooks/useAgenda'
import { SEO, CommonOgTags } from '../lib/seo'
import type { PublicAgendaItem, AgendaItemType } from '@shared/types'

const PAGE_TITLE = 'Incidencia Internacional Indígena'
const PAGE_SUBTITLE =
  'Eventos, convocatorias y oportunidades ante la ONU y el sistema interamericano'
const PAGE_DESC =
  'Agenda de incidencia indígena internacional: eventos y sesiones, convocatorias, oportunidades (becas y fondos) y publicaciones de la ONU, el sistema interamericano y organismos latinoamericanos. En español.'

// Always show the full date (day, month, year) — deadlines must be unambiguous.
function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Santiago',
  })
}

function eventDateLabel(item: PublicAgendaItem): string | null {
  if (!item.startDate) return null
  const start = fullDate(item.startDate)
  if (item.endDate && item.endDate.slice(0, 10) !== item.startDate.slice(0, 10)) {
    return `${start} – ${fullDate(item.endDate)}`
  }
  return start
}

interface SectionMeta {
  key: AgendaItemType
  label: string
  anchor: string
  color: string
}

// Paleta tierra editorial (ver DESIGN.md)
const SECTIONS: SectionMeta[] = [
  { key: 'evento', label: 'Eventos', anchor: 'eventos', color: '#0D5F3C' },
  { key: 'convocatoria', label: 'Convocatorias', anchor: 'convocatorias', color: '#C8473A' },
  { key: 'oportunidad', label: 'Oportunidades', anchor: 'oportunidades', color: '#8A6A28' },
  { key: 'publicacion', label: 'Publicaciones', anchor: 'publicaciones', color: '#1A6B8A' },
]

function Pill({ children, tone }: { children: React.ReactNode; tone: 'new' | 'extended' }) {
  const cls =
    tone === 'new'
      ? 'bg-accent-50 text-accent-700 border-accent-200'
      : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  )
}

function AgendaCard({ item, color }: { item: PublicAgendaItem; color: string }) {
  const isDeadline = item.type === 'convocatoria' || item.type === 'oportunidad'
  const dateLine = isDeadline
    ? item.dueDate
      ? `Cierra: ${fullDate(item.dueDate)}`
      : null
    : item.type === 'evento'
      ? eventDateLabel(item)
      : null

  const TitleTag = item.sourceUrl ? 'a' : 'div'
  const titleProps = item.sourceUrl
    ? { href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <article className="bg-white border border-neutral-200 rounded-lg p-5 hover:border-neutral-300 hover:shadow-sm transition-all">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {dateLine && (
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: isDeadline ? '#C8473A' : color }}
          >
            {dateLine}
          </span>
        )}
        {item.highlightNew && <Pill tone="new">Nuevo</Pill>}
        {item.extendedDeadline && <Pill tone="extended">Plazo extendido</Pill>}
      </div>

      <h3 className="font-fraunces text-lg font-semibold leading-snug text-neutral-900">
        <TitleTag
          {...titleProps}
          className={item.sourceUrl ? 'hover:text-brand-800 transition-colors' : ''}
        >
          {item.title}
          {item.sourceUrl && <span className="text-neutral-400"> ↗</span>}
        </TitleTag>
      </h3>

      {item.summary && (
        <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{item.summary}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-500">{item.sourceName}</span>
        {item.location && <span>· {item.location}</span>}
        {item.docRef && <span>· {item.docRef}</span>}
        {item.countries.length > 0 && <span>· {item.countries.join(', ')}</span>}
      </div>
    </article>
  )
}

export default function IncidenciaPage() {
  const { data, isLoading, isError } = useAgenda()

  const groups: Record<AgendaItemType, PublicAgendaItem[]> = {
    evento: data?.events ?? [],
    convocatoria: data?.calls ?? [],
    oportunidad: data?.opportunities ?? [],
    publicacion: data?.publications ?? [],
  }
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0)

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLE} — {SEO.siteName}</title>
        <meta name="description" content={PAGE_DESC} />
        <meta property="og:title" content={`${PAGE_TITLE} — ${SEO.siteName}`} />
        <meta property="og:description" content={PAGE_DESC} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/incidencia-internacional`} />
        <link rel="canonical" href={`${SEO.siteUrl}/incidencia-internacional`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section-wide">
        <header className="mb-8">
          <h1 className="page-title">{PAGE_TITLE}</h1>
          <p className="text-neutral-500 mt-2 max-w-2xl text-center mx-auto">{PAGE_SUBTITLE}</p>
          {!isLoading && !isError && total > 0 && (
            <nav className="flex flex-wrap items-center justify-center gap-2 mt-5" aria-label="Secciones de la agenda">
              {SECTIONS.filter((s) => groups[s.key].length > 0).map((s) => (
                <a
                  key={s.anchor}
                  href={`#${s.anchor}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-300 px-3 py-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  {s.label} <span className="text-neutral-400">({groups[s.key].length})</span>
                </a>
              ))}
            </nav>
          )}
        </header>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-neutral-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-neutral-500 py-8 text-center" role="alert">
            No se pudo cargar la agenda. Intenta de nuevo en un momento.
          </p>
        )}

        {!isLoading && !isError && total === 0 && (
          <p className="text-neutral-500 py-8 text-center">
            Aún no hay items publicados en la agenda. Vuelve pronto.
          </p>
        )}

        {!isLoading && !isError && total > 0 && (
          <div className="space-y-12">
            {SECTIONS.map((s) => {
              const items = groups[s.key]
              if (items.length === 0) return null
              return (
                <section key={s.key} id={s.anchor} className="scroll-mt-24">
                  <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    {s.label}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {items.map((item) => (
                      <AgendaCard key={item.id} item={item} color={s.color} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
