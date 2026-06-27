import type { AgendaItemType } from '@prisma/client'

/**
 * Curated sources for "Incidencia Internacional Indígena" ingestion (Fase 2a).
 *
 * Only STRUCTURED sources with a reliable type are listed here — no LLM needed:
 * - `ical`  → UN/official session calendars → `evento` (authoritative start/end dates).
 * - `rss`   → type-specific feeds where the AgendaItem type is known from the feed
 *             itself (FILAC categorized feeds, CBD by-section feeds).
 *
 * The list is small and stable, so it lives in code (no `Feed` model, no admin
 * for sources). The admin manages ITEMS, not sources. Extend by adding rows.
 * Source map / rationale: .plans/incidencia-internacional.md.
 */
export interface AgendaSource {
  sourceName: string
  url: string
  kind: 'rss' | 'ical'
  type: AgendaItemType
  lang: string
}

export const AGENDA_SOURCES: AgendaSource[] = [
  // ─── iCal: calendario indígena curado de Docip (alta señal, ~18 futuros) ───
  // Nota: se omiten los iCal crudos de indico.un.org (HRC 885, órganos de
  // tratado 829): explotan en decenas de sub-sesiones granulares; las sesiones
  // clave ya entran curadas vía seed + este calendario.
  {
    sourceName: 'Docip · Calendario indígena',
    url: 'https://calendar.google.com/calendar/ical/c_pkgrek952kh2te4d76f568n2lg%40group.calendar.google.com/public/basic.ics',
    kind: 'ical',
    type: 'evento',
    lang: 'es',
  },

  // ─── RSS: FILAC (español nativo, por tipo) ───
  {
    sourceName: 'FILAC · Convocatorias',
    url: 'https://www.filac.org/category/convocatorias/feed/',
    kind: 'rss',
    type: 'convocatoria',
    lang: 'es',
  },
  {
    sourceName: 'FILAC · Eventos',
    url: 'https://www.filac.org/category/eventos/feed/',
    kind: 'rss',
    type: 'evento',
    lang: 'es',
  },
  {
    sourceName: 'FILAC · Publicaciones',
    url: 'https://www.filac.org/publicaciones-filac/feed/',
    kind: 'rss',
    type: 'publicacion',
    lang: 'es',
  },
  // Se omiten las fuentes CBD (notificaciones/reuniones/informes): códigos
  // administrativos crípticos en inglés, baja señal como agenda indígena.
]
