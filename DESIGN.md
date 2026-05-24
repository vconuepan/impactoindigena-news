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

### Colores de categoría (sistema multicolor — mantener)

| Categoría | Hex | Tailwind approx |
|-----------|-----|-----------------|
| Cambio Climático y Biodiversidad | `#15803D` | green-700 |
| Derechos de los Pueblos Indígenas | `#EA580C` | orange-600 |
| Empresas Indígenas | `#CA8A04` | yellow-600 |
| Reconciliación y Paz | `#2563EB` | blue-600 |
| Chile Intercultural | `#9333EA` | purple-600 |
| Comunidades | `#DC2626` | red-600 |

Estos colores se usan en: dots de categoría en nav, tags en cards, borders activos en `.issue-nav-link`, `.ruled-heading`.

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

- **Estructura:** Logo centrado, acciones a la derecha (Guardados, Suscribirse, "Apóyanos", idioma), slider Tono a la izquierda
- **Background:** Blanco puro (`#FFFFFF`) — sin strip de color adicional
- **Altura:** 60px
- **Font:** DM Sans para todas las acciones del header
- **Botón Suscribirse:** Terracota (`#C8473A`), pills (`border-radius: 9999px`), `min-height: 44px` — CTA principal
- **Botón Apóyanos (Support us):** Brand verde (`#0D5F3C`), ghost/outline o filled secundario. **Debe tener menor jerarquía visual que Suscribirse** — usar `border: 1px solid` con texto verde y fondo transparente para no competir con el terracota. Referencia: `<LandingCta>`

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

### Watermarks decorativos

- Opacidad máxima: `0.06` (bajar del valor actual si es mayor)
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
