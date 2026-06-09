# Plan: Mejoras de plataforma — funcionalidad, diseño y rendimiento

**Fecha:** 2026-06-09
**Origen:** /plan-design-review sobre la plataforma viva (impactoindigena.news)
**Alcance acordado:** Home + página de noticia + rendimiento transversal (D1: opción "Home + noticia + rendimiento")

## Evidencia medida (2026-06-09, producción)

- TTFB home: **1.28s**; HTML 46.3KB; brotli activo ✅
- **Prerender NO se sirve**: home, noticias nuevas y viejas devuelven el mismo shell SPA de 46.312B con `<h1 class="sr-only">Loading stories</h1>` y **OG tags genéricos** → toda noticia compartida en redes muestra preview sin titular ni imagen
- Bundle: `index.js` 391KB (sin comprimir) + CSS 66KB; páginas lazy-loaded ✅
- **Google Fonts desde CDN** (Fraunces + DM Sans): IP del lector a Google + render de texto dependiente de tercero. Lora ya está self-hosted
- **Imágenes de noticias hotlinkeadas** del medio original (RSS enclosure / og:image / scrapers) — flanco copyright (auditoría legal) + sin control de peso/dimensiones
- Atribución de noticias descubiertas por búsqueda: muestra "Google News" en vez del medio real
- UI en inglés cuando el navegador está en inglés, con contenido en español (experiencia mixta)

## Calificaciones del review (7 pasadas)

| Pasada | Nota | Hallazgo principal |
|---|---|---|
| 1. Arquitectura de información | 7/10 | Hero editorial fuerte; atribución "Google News"; footer con ~25 enlaces |
| 2. Estados de interacción | 6/10 | Skeletons ✅; shell "Loading stories" para crawlers; estados error/vacío sin auditar |
| 3. Recorrido del usuario | 5/10 | Arco roto en paso 0: preview genérica al compartir; CTA suscripción fuera del flujo de lectura |
| 4. Riesgo AI slop | 8.5/10 | Pasa: marca inconfundible, ancla visual, sin patrones genéricos |
| 5. Alineación DESIGN.md | 8/10 | Sistema bien implementado; el propio DESIGN.md manda Google Fonts (corregir) |
| 6. Responsive y a11y | 7.5/10 | Móvil intencional, skip-link ✅; idioma UI mixto |
| 7. Decisiones sin resolver | — | 4 resueltas en este review (abajo) |

## Decisiones tomadas (AskUserQuestion, 2026-06-09)

1. **Prerender/OG roto → Opción C: ambos.** OG dinámico desde el backend (cubre el 100% de las noticias al instante) + diagnosticar/arreglar el prerender de CI (HTML completo para lectores y SEO).
2. **Fuentes → self-hostear** Fraunces y DM Sans (como Lora). Actualizar DESIGN.md (sección Carga).
3. **Imágenes → usar la imagen IA propia en el sitio** (la que ya genera el pipeline social), con etiqueta «Ilustración generada con IA». Elimina el hotlink de fotos ajenas (riesgo copyright) y da control total de rendimiento. Requiere alinear Términos §5 (hoy dice que las imágenes IA son solo de redes sociales).
4. **Atribución → mostrar el medio real** derivado del dominio de `sourceUrl` para descubrimientos vía Google News.

## Implementation Tasks

Workstream A — Rendimiento y experiencia:

- [ ] **T1 (P1, CC: ~45min)** — CI/prerender — Diagnosticar por qué el output del prerender no llega al artefacto desplegado y arreglarlo
  - Surgido de: Pass 7 — shell idéntico (46.312B) en home y stories, OG genérico
  - Files: `.github/workflows/deploy-azure-frontend.yml`, `client/vite.config.ts`
  - Verify: `curl -s https://impactoindigena.news/ | grep -c 'stories/'` > 0 y og:title propio en una noticia del sitemap
- [ ] **T2 (P1, CC: ~40min)** — backend OG — Servir HTML con OG reales para `/stories/:slug` no prerenderizadas (ruta backend + rewrite SWA; ya existe `server/src/routes/og.ts` como base)
  - Surfaced by: Pass 3 — preview genérica al compartir
  - Verify: `curl -s .../stories/<slug-nuevo> | grep og:title` muestra el titular
- [ ] **T3 (P1, CC: ~1h)** — imágenes — Hero de noticia con imagen IA propia + etiqueta «Ilustración generada con IA»; dejar de hotlinkear fotos de medios
  - Surfaced by: Pass 7 + auditoría legal (hotlink = flanco copyright)
  - Files: `server/src/jobs/publishStories.ts`, `client/src/pages/StoryPage.tsx`, `client/src/components/StoryCard.tsx`, Términos §5
  - Verify: img src apunta a R2 propio; etiqueta visible
- [ ] **T4 (P2, CC: ~30min)** — fuentes — Self-hostear Fraunces + DM Sans; quitar fonts.googleapis.com; actualizar DESIGN.md
  - Verify: `curl -s https://impactoindigena.news/ | grep -c fonts.googleapis` == 0
- [ ] **T5 (P2, CC: ~30min)** — atribución — Mostrar medio real (dominio de sourceUrl) en noticias descubiertas vía Google News
  - Files: `server/src/jobs/googleNewsDiscover.ts`, componentes de fuente en client
- [ ] **T6 (P2, CC: ~30min)** — conversión — Bloque de suscripción al final del artículo (estilo DESIGN.md, acento terracota)
  - Surfaced by: Pass 3 — CTA fuera del flujo de lectura
- [ ] **T7 (P3, CC: ~20min)** — footer — Podar ~25 enlaces a grupos curados (principio de sustracción)
- [ ] **T8 (P3, CC: ~15min)** — i18n — Default de UI en español (contenido es es; UI en inglés solo con toggle explícito)
- [ ] **T9 (P3, CC: ~30min)** — estados — Auditar/diseñar estados de error y vacío de home y noticia (API caída)
- [ ] **T10 (P3, CC: ~15min)** — caching — Revisar cache-control (hoy max-age=30) tras arreglar prerender

Workstream B — Cumplimiento (de la auditoría de políticas, pendiente de orden de ejecución):

- [ ] **B1 (P1)** — Borrado/anonimización real del email al darse de baja de alertas (hoy soft-delete) — `server/src/services/alerts.ts`
- [ ] **B2 (P1)** — Tope técnico de longitud a la cita (schema `.max()` + prompt) — `server/src/schemas/llm.ts`, `server/src/prompts/assess.ts`
- [ ] **B3 (P2)** — Declarar cookies técnicas de Azure (ARRAffinity) en /cookies y la consulta de búsqueda enviada a OpenAI en /privacy
- [ ] **B4 (P2)** — `member_email` → httpOnly o eliminarla — `server/src/routes/auth-public.ts`
- [ ] **B5 (P2)** — Alinear hero de /privacy («nada se almacena») con la realidad de localStorage
- [ ] **B6 (P2)** — Verificar proveedor LLM real en Azure y alinear tabla de encargados; limpiar `render.yaml` legado

## NOT in scope (diferido con razón)

- Review de búsqueda, guías, mapa, glosario y páginas evergreen — segunda pasada
- Dark mode audit — sin evidencia de uso aún
- Admin UI — interno, no afecta lectores
- Mockups de rediseño — el diseño visual aprobó (8.5/10 en AI-slop); los gaps son de infraestructura/flujo, no visuales
- Migración de analítica o cambios de stack

## What already exists (reusar, no reinventar)

- DESIGN.md completo (Fraunces/Lora/DM Sans, paleta, anti-patrones) — fuente de verdad
- Skeletons anti-CLS, `ruled-heading`, colores por categoría, prerender + inyección OG en `vite.config.ts` (arreglar, no reescribir)
- Pipeline de imagen IA (gpt-image-2 + R2) ya operativo para redes — T3 lo reutiliza
- `server/src/routes/og.ts` como base para T2

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score: 6.5/10 → 8/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0 (las 4 decisiones del review quedaron resueltas; T/B tasks pendientes de ejecución)
- **VERDICT:** DESIGN REVIEWED — listo para implementar T1-T3 (P1); eng review opcional antes de T1-T2 por tocar CI/routing
