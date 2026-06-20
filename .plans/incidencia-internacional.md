# Incidencia Internacional Indígena — plan y mapa de fuentes

Sección pública (`/incidencia-internacional`) que rastrea **acción** —no noticias—:
eventos/sesiones, convocatorias (calls for input), oportunidades (becas/fondos) y
publicaciones clave de la ONU, el sistema interamericano y organismos
latinoamericanos. **Español-primero.** Inspirado en el boletín semanal de Docip,
pero superándolo: fuentes primarias directas + capa interamericana/LatAm en
español que Docip subrepresenta.

- **Nav/menú corto:** "Incidencia Internacional" · **Título/SEO:** "Incidencia Internacional Indígena"
- **Subtítulo:** *Eventos, convocatorias y oportunidades ante la ONU y el sistema interamericano*
- **Pestañas/secciones:** Eventos · Convocatorias · Oportunidades · Publicaciones

## Modelo de datos (`AgendaItem`)
Tipos: `evento · convocatoria · oportunidad · publicacion`. `dueDate` (fecha
límite) para convocatoria/oportunidad; `startDate`/`endDate` para eventos.
`status` (draft|published) = **gate de confianza**. Campos de ingesta:
`externalId` (dedup iCal UID/hash), `extractionScore` (confianza LLM).
Ver `server/prisma/schema.prisma` (modelo AgendaItem) + migración
`20260619133546_add_agenda_item`.

## Decisiones tomadas
- **Ingesta:** totalmente automática (crawl → extrae → publica → resumen semanal a redes), CON gate de confianza: items de baja confianza o fecha no parseable → draft para revisión rápida; el resto se publica solo.
- **Redes:** resumen semanal (estilo Docip), no por item.
- **Foco:** acción (eventos/convocatorias/oportunidades), NO el stream de noticias (eso ya es el pipeline de Story).

## Mapa de fuentes verificado (sondeo en vivo, jun 2026)

### Feeds directos verificados (enchufables — sin scrape, sin LLM para fechas)

**Español nativo — LatAm / interamericano (diferenciador):**
- FILAC: `https://www.filac.org/category/convocatorias/feed/` · `/eventos/feed/` · `/publicaciones-filac/feed/`
- Servindi: `https://www.servindi.org/feed`
- Debates Indígenas: `https://debatesindigenas.org/feed/`
- IWGIA (es): `https://iwgia.org/es/noticias.feed?type=rss`

**ONU en español:**
- UN News ES (DDHH): `https://news.un.org/feed/subscribe/es/news/topic/human-rights/feed/rss.xml`
- LCIPP / clima (es): `https://lcipp.unfccc.int/es/rss.xml`
- OMPI/WIPO: `https://www.wipo.int/pressroom/es/rss.xml` · reuniones `https://www.wipo.int/rss/index.xml?col=meetings`

**Sesiones ONU oficiales (iCal — más autoritativo que el calendario de Docip):**
- indico.un.org: Consejo DDHH `category/885/events.ics` · EPU `881` · Fondo Voluntario `1091` · órganos de tratado `829/833/800` (también `.atom`)

**Temáticos (RSS por tipo — modelo ideal):**
- CBD: `notifications.aspx` (=convocatorias) · `meetings.aspx` (=eventos) · `reports.aspx` (=publicaciones) bajo `https://www.cbd.int/rss/`
- UNFCCC: `https://unfccc.int/rss.xml`

**Baseline Docip:**
- Calendario público (Google Calendar) iCal: `https://calendar.google.com/calendar/ical/c_pkgrek952kh2te4d76f568n2lg%40group.calendar.google.com/public/basic.ics` (2357 eventos, ~22 futuros)
- Newsletter semanal a venancio@conuepan.cl (mejor fuente de fechas límite de derechos)

### Requieren scrape + LLM (sin feed limpio)
- **OHCHR calls-for-input** (`/es/calls-for-input-listing`): render JS + Cloudflare 403 a curl. Las fechas límite de derechos más accionables. Su RSS oficial (`/es/rss.xml`) es genérico e inútil.
- **CIDH** (oas.org/es/cidh) y **Corte IDH** (corteidh.or.cr): solo sitemap → scrape/diff. Español nativo, alto valor jurídico.
- **FAO, OIT, UNESCO**: solo sitemap.

## Fases
- **Fase 1 (HECHA):** modelo `AgendaItem` + migración SQL + tipos compartidos + ruta `/api/public/agenda` + página `/incidencia-internacional` + nav + sitemap + seed (`server/prisma/seed-agenda.sql`, items reales del Docip Nº501).
- **Fase 2:** ingesta. Registrar los feeds directos (RSS/iCal) reusando el modelo `Feed` + un parser iCal; normalizar a `AgendaItem`; clasificar/traducir al español con LLM solo lo que llega en EN/FR; scrape+LLM para OHCHR/CIDH/CorteIDH con gate de confianza. Job en el scheduler (diario). Admin `/admin/agenda` para revisar drafts.
- **Fase 3:** resumen semanal automático a redes (reusa infra social) + digest email opcional (reusa Newsletter).

## Notas operativas
- Node local 18 rompe build/tests; usar `/opt/homebrew/opt/node@20/bin`. Ver [[project-entorno-node]].
- Migraciones SQL-first: el usuario corre el `.sql` en pgAdmin; luego `db:migrate:resolve` + `db:generate` (server detenido).
