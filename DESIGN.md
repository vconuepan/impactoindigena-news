# Sistema de Diseño — Impacto Indígena

## Producto

- **Qué es:** Medio editorial de noticias curadas por IA sobre pueblos indígenas
- **Para quién:** Lectores interesados en cobertura indígena, principalmente Chile y América Latina
- **Categoría:** Editorial digital-native
- **Sitio:** https://impactoindigena.news

## Dirección estética

- **Dirección:** Editorial digital-native con calor cultural
- **Nivel de decoración:** Intencional — watermarks decorativos con opacidad reducida, espacio negativo generoso
- **Mood:** Autoritario sin frialdad. Serio sin ser clínico. Un medio que elige cubrir voces históricamente marginadas — el diseño debe reflejar esa elección con carácter propio.
- **Anti-patrones activos:** Sin strips de color en el header, sin gradientes decorativos en botones, sin purple/violet como acento, sin grids de 3 columnas con íconos circulares, sin "todo centrado".

## Tipografía

### Fuentes

| Rol | Fuente | Peso | Notas |
|-----|--------|------|-------|
| Display / Hero | **Fraunces** | 300–900 variable | Serif literaria con optical size. A 48px+ es expansiva; a 22px es íntima. |
| Body / Artículo | **Lora** | 400–700 variable | Ya self-hosted. No cambiar. Excelente para lectura editorial. |
| UI / Labels | **DM Sans** | 300–700 variable | Reemplaza Nexa Bold en roles pequeños. Mucho más legible a 9–12px. |

### Carga

- **Lora:** Self-hosted en `/fonts/Lora/` (ya configurado, no modificar)
- **Fraunces:** Google Fonts — `https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap`
- **DM Sans:** Google Fonts — `https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&display=swap`

### Escala tipográfica

| Nivel | Fuente | Tamaño | Peso | Uso |
|-------|--------|--------|------|-----|
| Hero | Fraunces | 44–56px | 700 | Titular principal del hero |
| Sección | Fraunces | 28px | 600 | Titular de sección en homepage |
| Card principal | Fraunces | 20–22px | 600 | Card destacada |
| Card secundaria | Fraunces | 15–16px | 600 | Sidebar, cards pequeñas |
| Body | Lora | 16px | 400 | Texto de artículo, line-height 1.75 |
| Body muted | Lora | 15–16px | 400 italic | Bajadas, leads, pull quotes |
| Label nav | DM Sans | 10px | 700 | Categorías en nav y cards, uppercase, tracking 0.12em |
| Metadata | DM Sans | 11–12px | 400–500 | Fuente, fecha, tiempo de lectura |
| UI acciones | DM Sans | 12–13px | 600 | Botones, acciones de header |

### Fuentes prohibidas como primarias

Inter, Roboto, Arial, Helvetica, Montserrat, Poppins, Raleway — no usar como display ni body.

## Colores

### Paleta principal

| Variable | Hex | Uso |
|----------|-----|-----|
| `--brand` | `#0D5F3C` | Verde editorial principal — brand, iconos, headings activos |
| `--brand-mid` | `#166940` | Hover sobre elementos brand |
| `--brand-light` | `#1a7a4a` | Estados secundarios brand |
| `--brand-pale` | `#E8F2EC` | Superficies brand (badges, backgrounds de sección) |
| `--accent` | `#C8473A` | Terracota — CTAs principales, botón Suscribirse, estados activos de alta prioridad |
| `--accent-pale` | `#FBEFEE` | Superficie acento |
| `--bg` | `#FAFAF8` | Background global (blanco cálido, no puro) |
| `--surface` | `#FFFFFF` | Cards, modales, superficies elevadas |
| `--surface-2` | `#F5F5F2` | Superficies secundarias, inputs |
| `--text` | `#1C1917` | Texto principal (negro cálido) |
| `--text-muted` | `#78716C` | Texto secundario, body text en secciones |
| `--text-subtle` | `#A8A29E` | Metadata, placeholders, labels inactivos |
| `--border` | `#E7E5E4` | Bordes de cards, separadores |
| `--border-strong` | `#D6D3D1` | Bordes de inputs, divisores con más peso |

### Modo oscuro

| Variable | Hex oscuro |
|----------|------------|
| `--bg` | `#111110` |
| `--surface` | `#1C1917` |
| `--surface-2` | `#292524` |
| `--text` | `#FAFAF8` |
| `--text-muted` | `#A8A29E` |
| `--text-subtle` | `#78716C` |
| `--border` | `#292524` |
| `--border-strong` | `#3D3836` |
| `--brand-pale` | `#0a3d26` |
| `--accent-pale` | `#3d1512` |

### Colores de categoría (paleta tierra editorial)

Cuatro familias derivadas de la marca. Sin violeta ni naranja brillante — todos los tonos son tierra, bosque, agua o terracota.

| Familia | Hex | Categorías |
|---------|-----|-----------|
| Verde bosque | `#15803D` | Cambio Climático y Biodiversidad, Planeta/Clima |
| Terracota | `#B84236` | Derechos de los Pueblos Indígenas, Amenazas urgentes |
| Ocre tierra | `#8A6A28` | Empresas Indígenas, Desarrollo sostenible |
| Pizarra (azul agua) | `#1A6B8A` | Chile Intercultural, Ciencia y tecnología |
| Verde marca (default) | `#0D5F3C` | General, Comunidades, fallback |

Implementación: `client/src/lib/category-colors.ts` — los cinco objetos base (`VERDE_BOSQUE`, `TERRACOTA`, `OCRE_TIERRA`, `PIZARRA`, `VERDE_MARCA`) asignados por slug.

Estos colores se usan en: dots de categoría en nav, tags en cards, borders activos en `.issue-nav-link`, gradientes de cards sin imagen.

### Uso del color acento (terracota `#C8473A`)

- Botón "Suscribirse" (principal CTA)
- Hover en links de artículo dentro de `.prose`
- Estados de error o urgencia
- **No usar** para categorías de noticias (esas tienen su propio sistema multicolor)

## Espaciado

- **Unidad base:** 8px
- **Densidad:** Comfortable — más generoso que el promedio de news aggregators
- **Escala:** `2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)`
- Entre secciones del homepage: mínimo `2xl (48px)`, preferir `3xl (64px)`
- Padding horizontal de contenido: `px-4 md:px-8` en móvil, `px-8 lg:px-12` en desktop

## Layout

- **Enfoque:** Grid editorial — disciplinado pero con espacio para pull quotes y elementos tipográficos
- **Ancho máximo de contenido:** `max-w-4xl` (896px) para homepage, `max-w-2xl` (672px) para artículos
- **Grid homepage:** 2/3 + 1/3 para sección principal, columna única para el hero
- **Ancho máximo del cuerpo de artículo:** 580–640px (optimizado para ~70 chars/línea)

### Border radius

| Escala | Valor | Uso |
|--------|-------|-----|
| `sm` | `4px` | Tags de categoría, badges |
| `md` | `8px` | Cards de stories |
| `lg` | `12px` | Paneles, modales |
| `full` | `9999px` | Botones, pills, dots |

## Movimiento

- **Enfoque:** Minimal-functional — solo transiciones que ayudan a comprender estados
- **Duración:** `micro (100ms)` hover states; `short (150–200ms)` transiciones de color; `medium (250ms)` modales/paneles
- **Easing:** `ease-out` para entradas, `ease-in` para salidas, `ease-in-out` para movimiento
- Respetar `prefers-reduced-motion` — el proyecto ya tiene la media query en `index.css`

## Header

- **Estructura completa (top→bottom):**
  1. **Stats bar** — fondo `var(--brand)`, 32px de alto, DM Sans 10px
  2. **Header principal** — blanco puro `#FFFFFF`, 60px de alto
  3. **Category nav** — bajo el header, separado por `1px solid var(--border)`
- **Stats bar** (nueva): muestra métricas de curación en tiempo real. Fondo `#0D5F3C`, texto `rgba(255,255,255,0.65)`, indicador de pulso verde `#4ade80`. Ejemplo: "Revisadas hoy: 847 · Seleccionadas: 23 · Fuentes activas: 214". Vincula a `/metodologia`.
- **Background header:** Blanco puro (`#FFFFFF`)
- **Altura header:** 60px
- **Font:** DM Sans para todas las acciones del header
- **Botón Suscribirse:** Terracota (`#C8473A`), pills (`border-radius: 9999px`), `min-height: 36px` — CTA principal
- **Botón Apóyanos:** Brand verde (`#0D5F3C`), ghost/outline. `border: 1px solid` con texto verde y fondo transparente — menor jerarquía que Suscribirse. Referencia: `<LandingCta>`

## Hero

El hero principal es el primer elemento debajo del header. Es tratamiento de **portada de revista**, no un card.

- **Altura:** 560–600px (no `auto`, no `min-height` pequeño)
- **Imagen:** Full-bleed, `background-size: cover`. Sin borde, sin `border-radius`.
- **Overlay:** `linear-gradient(to top, rgba(13,95,60,0.88) 0%, rgba(13,95,60,0.42) 55%, rgba(13,95,60,0.06) 100%)` — gradiente del brand verde. Base densa (0.88) para legibilidad del titular alineado al fondo; cima casi limpia (0.06) para que la fotografía respire. (Ajustado 2026-06-14 tras audit: el gradiente previo 0.92→0.20 aplanaba la foto.)
- **Watermark:** Patrón geométrico de inspiración indígena, `opacity: 0.04`, posición top-right, `pointer-events: none`
- **Contenido (alineado al fondo del hero):**
  - `hero-eyebrow`: DM Sans 10px 700 uppercase, `color: rgba(255,255,255,0.60)`, con línea decorativa `24×1px` color `var(--accent)` a la izquierda. Incluye la etiqueta de la semana + NarrativeFrame del artículo.
  - `hero-title` (h1): **Fraunces 62px 700, line-height 1.06**, `color: #fff`, `letter-spacing: -0.02em`. Rango: `clamp(42px, 4.5vw, 62px)`.
  - `hero-deck`: Lora 16px, `color: rgba(255,255,255,0.75)`, `max-width: 520px`.
  - `hero-byline`: DM Sans 11px, `color: rgba(255,255,255,0.50)`.
- **Padding contenido:** `padding: 0 56px 56px`
- **Títulos en Title Case** — NUNCA en minúsculas. Los títulos de stories en todo el sitio van en Title Case o Sentence case editorial.
- **Paginación:** Dots en esquina inferior derecha; dot activo se expande a `width: 18px` (pill).

## Componentes clave

### `.issue-nav-link` (categorías en nav)

```css
font-family: DM Sans;
font-size: 10px;
font-weight: 700;
letter-spacing: 0.10em;
text-transform: uppercase;
white-space: nowrap;
padding: 12px 12px; /* px-3 */
border-bottom: 2px solid transparent;
```

### `.ruled-section` (encabezados de sección en homepage)

```css
/* Estructura: dot de categoría + título + "Ver todas →" flush right */
display: flex;
align-items: center;
gap: 14px;
padding: 36px 0 18px;
border-bottom: 2px solid var(--text); /* negro cálido #1C1917 */
margin-bottom: 24px;
```

- **Dot:** 9×9px, color de la categoría correspondiente
- **Título sección:** Fraunces 20px 700, `letter-spacing: -0.01em`
- **Enlace "Ver todas →":** `margin-left: auto`, DM Sans 11px 600, `color: var(--brand)`

### `.editorial-grid-1` (grid primario — hero story + 2 side stories)

Layout para la sección principal de cada categoría. Reemplaza el grid de cards homogéneas.

```css
display: grid;
grid-template-columns: 1.7fr 1fr;
grid-template-rows: 1fr 1fr;
gap: 1px;                    /* los 1px crean separadores sin bordes explícitos */
background: var(--border);   /* el gap 1px sobre este fondo = línea de separación */
border: 1px solid var(--border);
border-radius: 6px;
overflow: hidden;
```

- **Main story** ocupa `grid-row: 1 / 3` — imagen 3:2 + contenido bajo ella
- **Side stories** ocupan 1 fila cada una — imagen 16:9 + contenido compacto
- Todas las celdas tienen `background: var(--surface)` (así el `gap 1px` sobre el fondo borde = líneas editoriales)

### `.ruled-heading` (divisores de sección)

Mantener tal cual — es un elemento distintivo del sistema.

### `.pull-quote`

```css
font-family: Fraunces;
font-size: 22–26px;
font-weight: 400;
font-style: italic;
line-height: 1.4;
border-top: 2px solid var(--brand);
```

### Drop cap (`.drop-cap::first-letter`)

```css
font-family: Fraunces;
font-weight: 700;
font-size: 4.5rem;
color: var(--brand); /* #0D5F3C */
```

### `.narrative-frame-tag` (NUEVO — AI-native signal)

Muestra el marco narrativo clasificado por la IA bajo cada tag de categoría en las story cards.

```css
font-family: 'DM Sans', sans-serif;
font-size: 10px;
font-style: italic;
font-weight: 400;
color: var(--text-muted);    /* #78716C — legible, no fantasma */
margin-bottom: 8px;
display: inline-flex;
align-items: center;
gap: 6px;
cursor: help;                /* tooltip al hover */
```

Estructura: marcador `IA` (8px, semibold, uppercase, opacity 0.55) + línea separadora `10×1px` + label itálico.
Texto del label: `Protagonismo` / `Resiliencia` / `Alianza` / `Confrontación`.

El marcador `IA` hace explícito que el marco lo determinó el sistema — es la señal AI-native a nivel de card. (Ajustado 2026-06-14 tras audit: la versión previa a 9px gris `--text-subtle` era invisible en pantalla.)

Al hacer hover: tooltip `title` = "Marco narrativo identificado por IA: {label}".

**Regla:** Mostrar en TODAS las cards de stories que tengan `narrativeFrame` definido (≠ null). Si `narrativeFrame` es null, no mostrar nada — no placeholder.

### `.editorial-seal` (NUEVO — jerarquía sin badge)

Sello circular del logo como marca de agua en imágenes de stories con `relevanceScore ≥ 8`.

```css
position: absolute;
bottom: 10px;
right: 10px;
width: 36px;
height: 36px;
opacity: 0.32;   /* subido de 0.18 (audit 2026-06-14): a 0.18 era indistinguible sobre la foto */
pointer-events: none;
user-select: none;
```

SVG: versión simplificada del sello del logo — círculo exterior + estrella de 7 puntas interior, trazo blanco sobre cualquier fondo de imagen.

**Regla:** Solo historias con `relevanceScore ≥ 8`. No mostrar si la imagen no carga (fallback: ocultar).

### `.statement-section` (sección misión — reemplaza el CTA genérico)

Reemplaza la sección "Construimos puentes..." con tratamiento editorial en brand verde.

```css
background: var(--brand);    /* #0D5F3C */
padding: 64px 56px;
border-radius: 6px;
position: relative;
overflow: hidden;
/* Decoración: 2 círculos concentrados en esquina */
```

- **Eyebrow:** DM Sans 10px 700 uppercase, `color: rgba(255,255,255,0.45)`, con línea dorada `20×1px` a la izquierda
- **Texto principal:** Fraunces `clamp(28px, 2.8vw, 38px)` 300 italic, `color: rgba(255,255,255,0.95)`, `max-width: 680px`
- **CTA:** `border: 1px solid rgba(255,255,255,0.30)`, border-radius pill, DM Sans 13px 600 blanco

### `.guides-section` (sección guías — fondo brand-pale)

Las guías de referencia jurídica van sobre fondo `var(--brand-pale)`, no blanco genérico.

```css
background: var(--brand-pale);  /* #E8F2EC */
padding: 40px;
border-radius: 6px;
```

Grid interno: 3 columnas. Cards con `background: var(--surface)`, `border: 1px solid rgba(13,95,60,0.12)`.

### Watermarks decorativos

- Opacidad máxima: `0.06` en cuerpo de artículo; `0.04` en secciones de homepage
- Máximo 1 watermark visible por viewport
- Siempre `pointer-events: none; user-select: none;`

## Contraste (WCAG 2.2 AA)

| Combinación | Ratio | Estado |
|-------------|-------|--------|
| `#0D5F3C` sobre blanco | ~9.2:1 | ✓ AAA |
| `#C8473A` sobre blanco | ~4.6:1 | ✓ AA |
| `#1C1917` sobre `#FAFAF8` | ~16:1 | ✓ AAA |
| `#78716C` sobre blanco | ~4.5:1 | ✓ AA |

## Decisiones

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-04-18 | Display: Fraunces reemplaza Nexa Bold | Nexa es corporativa. Fraunces tiene peso literario y optical size variable. |
| 2026-04-18 | UI: DM Sans reemplaza Nexa Bold en labels pequeños | Legibilidad a 9–12px es notablemente mejor. |
| 2026-04-18 | Body: Lora se mantiene | Ya self-hosted, genuinamente buena para editorial. |
| 2026-04-18 | Verde: `#0D5F3C` reemplaza `#1a7a4a` | Más profundo y autoritario. Menos "verde de app". |
| 2026-04-18 | Acento terracota `#C8473A` para CTAs | Separa los CTAs del sistema de colores de categorías. Conecta con paleta tierra/indígena. |
| 2026-04-18 | Fondo `#FAFAF8` (blanco cálido) | Reduce contraste agresivo de blanco puro. Más editorial. |
| 2026-04-18 | Eliminar strip rosado del header | No tenía precedente en el sistema. El header va en blanco puro. |
| 2026-04-18 | Sistema multicolor de categorías: mantener | Distintivo y funcional. No cambiar. |
| 2026-06-12 | Stats bar verde encima del header | Hace visible la inteligencia AI desde el primer pixel. Inspirado en The Markup. |
| 2026-06-12 | Hero cinemático 560-600px con overlay verde | El hero actual actúa como card. Tratar como portada de revista: Fraunces 62px, full-bleed, gradiente profundo. |
| 2026-06-12 | Títulos de stories en Title Case — nunca lowercase | Los slugs-as-titles en producción eran error editorial. Regla explícita. |
| 2026-06-12 | NarrativeFrame visible en cards (`.narrative-frame-tag`) | El sistema clasifica `protagonismo/resiliencia/alianza/confrontación` pero ningún lector lo sabe. Hacerlo visible es la definición de AI-native. |
| 2026-06-12 | Editorial seal en historias score ≥ 8 | Jerarquía visual sin badge genérico "FEATURED". El sello del logo como marca de excelencia editorial. |
| 2026-06-12 | Editorial grid 1.7fr/1fr con gap 1px | Reemplaza el grid de cards homogéneas. Las líneas de 1px crean separadores sin bordes explícitos — estilo NYT/Guardian. |
| 2026-06-12 | Sección misión en brand verde `.statement-section` | El CTA anterior ("Construimos puentes...") no tenía identidad visual. Fondo verde editorial con Fraunces italic refuerza la voz institucional. |
| 2026-06-12 | Guías en fondo brand-pale `.guides-section` | Las guías jurídicas son contenido premium. El fondo verde pálido las distingue visualmente del feed de noticias. |
