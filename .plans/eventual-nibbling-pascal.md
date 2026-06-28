# Incidencia Internacional — Fase 2b (scrape OHCHR + enriquecimiento LLM)

## Context

La sección "Incidencia Internacional Indígena" (`/incidencia-internacional`) ya está EN VIVO con la
Fase 2a: ingesta estructurada SIN LLM (Docip iCal + FILAC RSS), curaduría draft-first, y filtros de
junk / antigüedad / tema indígena / licitaciones. Dos limitaciones visibles hoy:

1. **Las convocatorias FILAC entran "sin fecha"** (`dueDate=null`, `extractionScore` bajo): el plazo
   límite vive en el cuerpo del artículo, no en el RSS. Sin fecha no son accionables ni publicables.
2. **Varios eventos entran con título en inglés** (calendario Docip: "International Day of the World's
   Indigenous Women and Girls"), incoherente con un sitio español-primero.

Y falta la fuente jurídica de mayor valor: los **llamados a contribuciones del sistema universal**
(OHCHR calls-for-input), con plazos accionables y calls específicos indígenas (FPIC, Relator indígena,
EMRIP, salud reproductiva de mujeres indígenas ante el HRC63).

**Fase 2b** mete el LLM al pipeline para (a) **extraer la fecha límite** de lo ya ingerido, (b)
**traducir** a español los títulos no-ES, y suma (c) **OHCHR calls-for-input** como fuente nueva
(scrape estructurado). Resultado: una agenda con fechas reales, en español, y con los plazos jurídicos
del sistema ONU.

## Decisiones del usuario (AskUserQuestion, 2026-06-27)
- **Alcance:** "Enriquecer lo existente + OHCHR" (LLM extrae fechas + traduce; suma OHCHR filtrado por tema indígena).
- **Traducción:** "Sí, traducir a español" (guardar el original en `titleOriginal`).

## Hallazgos de fuentes (verificados en vivo, jun 2026)
- **OHCHR calls-for-input** (`https://www.ohchr.org/en/calls-for-input-listing`): **accesible**, listado HTML
  estático (15/página, ~1188 total, paginado), con **deadline inline** ("30 September 2026") + entidad/mandato
  + enlace de detalle, ordenado por deadline. Acceso **intermitente** (a veces 403) → manejar con buen
  user-agent + reintentos + degradación por fuente. **No necesita LLM para fechas** (deadline parseable); el
  LLM solo traduce.
- **CIDH** (oas.org) y **Corte IDH** (corteidh.or.cr): acceso intermitente/Cloudflare, valor medio →
  **fuera de alcance de 2b** (CIDH se evaluará en 2c con el mismo patrón `persistDrafts`).
- EMRIP/UNPFII/Relator: sus sesiones ya llegan vía Docip/indico.un.org (Fase 2a); sus *calls* llegan vía OHCHR.

## Lo que se reutiliza (verificado, archivo:línea)
- Persistencia + dedup: `server/src/services/agendaIngest.ts` `persist()` (create-if-absent por `externalId`, captura P2002) y `AgendaItemDraft`, `startOfTodayUTC()`, `isIndigenousRelevant()`/`haystack()`.
- Scrapers HTML (patrón a copiar): `server/src/services/biobioScraper.ts`, `conadiScraper.ts` (axios + `crawlLimiter.run` + `withRetry` + user-agent navegador + `cheerio.load`).
- Extracción del detalle: `server/src/services/extractor.ts` `extractContent(url, options)` / `fetchPage` (user-agent, `withRetry`, `isAllowedUrl` SSRF, cap 5 MB). **Usar solo tiers locales** (fetch + readability); NO escalar al tier API de pago (Diffbot/PipFeed) — para agenda el dato está en el HTML.
- LLM: `server/src/services/llm.ts` `getSmallLLM()` + `rateLimitDelay()`; structured output `llm.withStructuredOutput(zod,{method:'functionCalling'}).invoke([new HumanMessage(prompt)])`. Patrón completo en `server/src/services/translation.ts`.
- Prompt-injection (OBLIGATORIO): `server/src/prompts/shared.ts` `UNTRUSTED_CONTENT_GUARD` + `sanitizeUntrustedContent()`. Envolver TODO contenido externo (HTML del detalle, title/summary de agenda) antes del LLM.
- URL dedup: `server/src/utils/urlNormalization.ts` `normalizeUrl()`.
- Modelo `AgendaItem` (`schema.prisma` ~658-690): ya tiene `dueDate`, `titleOriginal`, `docRef`, `extractionScore`, `tags[]`. **NO se necesita migración.**
- Job `ingest_agenda` (diario 4 AM, ya sembrado en `scripts/seed-jobs.ts`): se extiende `runIngestAgenda`. **NO se necesita job nuevo ni INSERT en `job_runs`.**

## Arquitectura (3 componentes)

### 1. Fuente OHCHR — scrape estructurado, sin LLM para fechas
- **CREAR `server/src/services/ohchrScraper.ts`**: `scrapeOhchrCalls(maxPages): Promise<AgendaItemDraft[]>`.
  - axios + `crawlLimiter.run` + `withRetry` + user-agent navegador; `cheerio.load` por página.
  - Por ítem: title, URL de detalle, entidad/mandato, **deadline inline** → `parseEnglishDate()` (devuelve `null` ante formato desconocido / "ongoing"; en rangos toma la fecha final; construye **fin-de-día UTC** `T23:59:59Z`).
  - **Filtro**: solo `dueDate` futuro (≥ `startOfTodayUTC()`) **y** `isIndigenousRelevant(title + entidad)` (el haystack incluye la entidad/mandato para no perder recall en títulos genéricos de relatorías/EMRIP).
  - Draft: `type:'convocatoria'`, `lang:'en'`, `externalId: ohchr:${normalizeUrl(url)}`, `status:'draft'`, `extractionScore ~0.8`, `sourceName:'ACNUDH · Llamados'`.
  - **Robustez**: paginar `maxPages` (≈4) con **parada temprana** cuando una página solo trae deadlines pasados (supuesto: orden ascendente por deadline — tratar como supuesto, no hecho; si no, confiar en `maxPages` + filtro de ventana). 403/drift → `catch → []` por página, conservar lo ya acumulado.

### 2. Enriquecimiento LLM — extracción de fechas (lo ya ingerido sin `dueDate`)
- **CREAR `server/src/services/agendaEnrich.ts`**: `enrichAgendaItems({dateLimit, translateLimit})`.
  - **Pasada A (fecha)** — query: `type IN (convocatoria,oportunidad) AND dueDate IS NULL AND tags hasNot 'sys:llm-dated'`, `take: dateLimit`.
    - `fetchPage(sourceUrl)` (tiers locales) → texto → `sanitizeUntrustedContent` + `UNTRUSTED_CONTENT_GUARD` → `getSmallLLM().withStructuredOutput(extractAgendaDetailsSchema)`.
    - Update **no-clobber** (solo si el admin no lo fijó): set `dueDate`/`startDate`/`type`/`location`/`summary` si la confianza supera umbral; subir `extractionScore`. Marcar `tags push 'sys:llm-dated'` (incluso si no halló fecha real → no reintentar). **Si el fetch FALLÓ (403/timeout/vacío): NO marcar** (reintentar otro día; el `limit` actúa de tope).

### 3. Enriquecimiento LLM — traducción a español
- **Pasada B (traducción)** en `agendaEnrich.ts` — query: `titleOriginal IS NULL AND tags hasNot 'sys:llm-translated'`, `take: translateLimit`.
  - **Pre-filtro de costo** (heurística barata): si el texto es claramente español (diacríticos `á é í ó ú ñ ¿ ¡` / stopwords ES) → marcar `sys:llm-translated` y saltar la llamada. Ante duda, llamar al LLM.
  - LLM con `translateAgendaSchema {isSpanish, titleEs, summaryEs}`. Si `isSpanish=false`: `titleOriginal=title`, `title=titleEs`, `summary=summaryEs ?? summary`. Marcar `sys:llm-translated`.
  - **Orden**: la extracción de fecha (A) corre **antes** que la traducción (B) — A trabaja sobre el contenido en idioma original y puede ajustar `type`.

### Soporte
- **EDITAR `server/src/schemas/agenda.ts`**: añadir `extractAgendaDetailsSchema` (`dueDate/startDate/endDate/type/location/summary/confidence`) y `translateAgendaSchema` (`isSpanish/titleEs/summaryEs`). Formato/longitudes en `.describe()` (no en el prompt).
- **CREAR `server/src/prompts/agenda.ts`**: `buildExtractAgendaPrompt(content)` y `buildTranslateAgendaPrompt(title, summary)` — estilo declarativo GPT-5, XML scaffolding, con `UNTRUSTED_CONTENT_GUARD` + sanitización.
- **EDITAR `server/src/services/agendaIngest.ts`**: extraer/exportar `persistDrafts(drafts): IngestResult` (refactor del `persist` privado) para que OHCHR lo comparta; exportar `ingestOhchr()` (scrape + `persistDrafts`). Exportar `isIndigenousRelevant`/`startOfTodayUTC` si el scraper los importa.
- **EDITAR `server/src/config.ts`**: bloque `agenda` → `ohchrEnabled`, `ohchrMaxPages` (4), `enrichDateLimit` (20), `enrichTranslateLimit` (20), con override por env.
- **EDITAR `server/src/jobs/ingestAgenda.ts`**: `runIngestAgenda` orquesta `ingestAgenda()` → `ingestOhchr()` → `enrichAgendaItems()` (este último en **try/catch aislado** para no perder la señal de ingesta si el LLM falla).
- **EDITAR salida pública `server/src/routes/public/agenda.ts`** (o el mapeo en `services/agenda.ts`): filtrar los tags con prefijo `sys:` antes de devolverlos (la API pública hoy los expone crudos; `IncidenciaPage.tsx` no los renderiza, pero la API sí debe limpiarlos).

## Decisiones finas
- **Idempotencia sin migración**: tags reservados `sys:llm-dated` / `sys:llm-translated`. Guards de campo como red de seguridad (`dueDate!=null`, `titleOriginal!=null`). Filtrar `sys:` en la API pública.
- **Costo acotado**: `getSmallLLM` + `rateLimitDelay`, secuencial con try/catch por ítem; `limit` por corrida; pre-filtro de idioma evita pagar por FILAC (ya ES).
- **No pisar al admin**: el enrich solo escribe campos que sigan nulos.
- **`extractContent`/`fetchPage` solo tiers locales** (sin Diffbot): si falla, `dueDate` queda `null` sin gasto de API.
- **Reglas de proyecto**: `createLogger('agenda-*')` (nunca `console.log`); `withRetry` en HTTP/LLM; constantes en `config.ts`; American English en UI; prompts no confiables siempre envueltos.

## Verificación
- **Tests** (vitest, `vi.hoisted()` para mocks): `ohchrScraper.test.ts` (fixtures HTML, `parseEnglishDate` incl. rangos/"ongoing", parada temprana, dedup por URL normalizada, filtro futuro+tema) y `agendaEnrich.test.ts` (idempotencia por tags `sys:`, gate de idioma, no-clobber de `dueDate`/`titleOriginal`, fetch fallido no marca).
- **Typecheck + suite server**: `PATH=node@20 npx tsc -b --noEmit` + `npx vitest run` (objetivo: verde, sin regresiones).
- **Dry-run local**: correr `scrapeOhchrCalls(1)` contra el sitio real (o fixture) y `enrichAgendaItems` contra 1-2 ítems FILAC sin fecha; revisar `dueDate`/`titleOriginal` resultantes.
- **Tras deploy** (sin paso de DB del usuario): `/admin/agenda` → "Ingestar ahora" → verificar (consulta solo-lectura) que (a) entran calls OHCHR indígenas con fecha, (b) las convocatorias FILAC ahora tienen `dueDate`, (c) los títulos en inglés quedaron en español con `titleOriginal` poblado.

## Fuera de alcance (futuro)
- **2c**: scraper CIDH/Corte IDH (mismo patrón `persistDrafts`), traducción FR→ES.
- **Fase 3**: resumen semanal a redes (un post) + digest email (`buildDigestHtml` + Brevo).
- Documentación de cierre: nota en `.context/` (o `.plans/incidencia-internacional.md`) y, si cambió la conducta de dominio (paso de enriquecimiento/traducción/fuente OHCHR), actualizar el spec vía `/allium`.

## Sin acción de DB del usuario
Esta fase **no** requiere migración ni `job_runs`: usa campos existentes del modelo y extiende el job actual. El único paso manual tras desplegar es el habitual **"Ingestar ahora"** en el admin.
