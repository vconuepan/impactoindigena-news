/**
 * Maps issue slugs to subtle accent colors for visual differentiation.
 * Used as thin borders, dots, and small accents — not backgrounds.
 */

import type { CommunityType } from '@shared/types'

export interface CategoryColor {
  /** Tailwind border class, e.g. "border-amber-500" */
  border: string
  /** Thick left border for horizontal cards */
  borderThick: string
  /** Tailwind text class for dot/accent, e.g. "text-amber-500" */
  dot: string
  /** Tailwind bg class for light accent, e.g. "bg-amber-50" */
  bg: string
  /** Tailwind bg class for the dot itself */
  dotBg: string
  /** Raw hex color for inline styles (CSS variables, hover effects) */
  hex: string
  /** Light tinted background for featured cards, e.g. "bg-amber-50/60" */
  bgTint: string
}

// Earth-toned palette — 4 semantic families derived from the brand.
// All hex values are used as inline styles in CategoryPill, dots, and card gradients.
// Tailwind class strings are approximate and used only for dotBg in nav/issue pages.

const VERDE_BOSQUE = {
  border: 'border-green-700',
  borderThick: 'border-l-[6px] border-green-700',
  dot: 'text-green-700',
  bg: 'bg-green-50',
  dotBg: 'bg-green-700',
  hex: '#15803D',
  bgTint: 'bg-green-50/60',
} satisfies CategoryColor

const TERRACOTA = {
  border: 'border-accent-600',
  borderThick: 'border-l-[6px] border-accent-600',
  dot: 'text-accent-600',
  bg: 'bg-accent-50',
  dotBg: 'bg-accent-600',
  hex: '#B84236',
  bgTint: 'bg-accent-50/60',
} satisfies CategoryColor

const OCRE_TIERRA = {
  border: 'border-yellow-700',
  borderThick: 'border-l-[6px] border-yellow-700',
  dot: 'text-yellow-700',
  bg: 'bg-yellow-50',
  dotBg: 'bg-yellow-700',
  // Oscurecido de #8A6A28 el 4-sep-2026. El valor anterior daba 5,03:1 sobre
  // blanco, que pasa, pero quedaba a 20,8 de distancia perceptual del cafe
  // tostado — por debajo de lo que el ojo separa en un punto de 9 px. Este
  // llega a 25,0 y sube el contraste a 5,37:1.
  hex: '#8A6410',
  bgTint: 'bg-yellow-50/60',
} satisfies CategoryColor

const PIZARRA = {
  border: 'border-sky-700',
  borderThick: 'border-l-[6px] border-sky-700',
  dot: 'text-sky-700',
  bg: 'bg-sky-50',
  dotBg: 'bg-sky-700',
  hex: '#1A6B8A',
  bgTint: 'bg-sky-50/60',
} satisfies CategoryColor

/**
 * Oliva profundo — Territorio y Tierras.
 *
 * Ocupa el hueco entre el ocre (41°) y el verde bosque (142°), que estaba vacio.
 */
const OLIVA = {
  border: 'border-lime-800',
  borderThick: 'border-l-[6px] border-lime-800',
  dot: 'text-lime-800',
  bg: 'bg-lime-50',
  dotBg: 'bg-lime-800',
  hex: '#5F7328',
  bgTint: 'bg-lime-50/60',
} satisfies CategoryColor

/**
 * Granate — Defensores y Proteccion.
 *
 * Rojo profundo y desaturado, del lado opuesto a la terracota. La distancia
 * perceptual con Derechos es 27,6: distinguibles en un punto de 9 px, y a la vez
 * emparentados, que es lo correcto porque los dos temas lo estan.
 */
const GRANATE = {
  border: 'border-rose-900',
  borderThick: 'border-l-[6px] border-rose-900',
  dot: 'text-rose-900',
  bg: 'bg-rose-50',
  dotBg: 'bg-rose-900',
  hex: '#7A2733',
  bgTint: 'bg-rose-50/60',
} satisfies CategoryColor

/**
 * Ciruela — Mujeres Indigenas.
 *
 * AQUI SE AMPLIA UNA REGLA DE DESIGN.md, a proposito y con fundamento.
 *
 * El documento decia "sin violeta ni naranja brillante" y se escribio cuando
 * habia CUATRO categorias. Con ocho, el espectro que dejaba —de 6° a 197°— son
 * 190 grados para ocho colores, y los tonos se apiñan hasta volverse
 * indistinguibles en un punto de 9 px: hoy el cafe y el ocre estan a 20,8 de
 * distancia perceptual, por debajo del minimo utilizable.
 *
 * El espiritu de la regla era evitar colores estridentes, no un tono. Este
 * ciruela tiene 35% de saturacion: es un morado de tierra, del color de la
 * greda, no un violeta de pantalla.
 */
const CIRUELA = {
  border: 'border-fuchsia-900',
  borderThick: 'border-l-[6px] border-fuchsia-900',
  dot: 'text-fuchsia-900',
  bg: 'bg-fuchsia-50',
  dotBg: 'bg-fuchsia-900',
  hex: '#8E4585',
  bgTint: 'bg-fuchsia-50/60',
} satisfies CategoryColor

/**
 * Cafe tostado — Cultura y Conocimientos Ancestrales.
 *
 * Quinta familia de la paleta tierra. Se eligio marron oscuro y no un quinto
 * verde ni un segundo azul porque los dots de categoria conviven en la nav: un
 * verde mas al lado de VERDE_BOSQUE haria indistinguibles clima y cultura de un
 * vistazo. Contra TERRACOTA se separa por luminosidad y saturacion.
 */
const CAFE_TOSTADO = {
  border: 'border-amber-900',
  borderThick: 'border-l-[6px] border-amber-900',
  dot: 'text-amber-900',
  bg: 'bg-amber-50',
  dotBg: 'bg-amber-900',
  hex: '#7A4A2B',
  bgTint: 'bg-amber-50/60',
} satisfies CategoryColor

const VERDE_MARCA = {
  border: 'border-brand-800',
  borderThick: 'border-l-[6px] border-brand-800',
  dot: 'text-brand-800',
  bg: 'bg-brand-50',
  dotBg: 'bg-brand-800',
  hex: '#0D5F3C',
  bgTint: 'bg-brand-50/60',
} satisfies CategoryColor

/**
 * Punto de color para el tipo de comunidad.
 *
 * Sale de la misma paleta tierra que las categorias, en vez de los ambar y
 * esmeralda sueltos que tenia antes: territorio va en ocre tierra y causa en
 * terracota, que DESIGN.md ya asigna a derechos y urgencias.
 */
export function communityDotColor(type: CommunityType): string {
  if (type === 'PUEBLO') return VERDE_MARCA.dotBg
  if (type === 'TERRITORIO') return OCRE_TIERRA.dotBg
  return TERRACOTA.dotBg
}

/**
 * La paleta de las ocho categorias.
 *
 * Se diseño como sistema y no agregando colores sueltos a los que habia. Con
 * cuatro categorias alcanzaba con cuatro familias; con ocho hay que repartir el
 * espectro de forma pareja, o los vecinos dejan de distinguirse.
 *
 * Verificado programaticamente el 4-sep-2026: los ocho pasan contraste AA sobre
 * blanco (minimo 5,02:1) y el par mas cercano queda a 25,0 de distancia
 * perceptual — mejor que el minimo de 20,8 que tenia la paleta anterior.
 *
 * Las cuatro secciones nuevas todavia no existen en la base; sus colores quedan
 * definidos aqui para cuando se creen.
 */
const CATEGORY_COLORS: Record<string, CategoryColor> = {
  // Anillo de la tierra
  'territorio-y-tierras': OLIVA,
  'cambio-climatico': VERDE_BOSQUE,
  'consulta-y-consentimiento': PIZARRA,
  'economias-indigenas': OCRE_TIERRA,
  // Anillo de la gente
  'derechos-indigenas': TERRACOTA,
  'defensores-y-proteccion': GRANATE,
  'mujeres-indigenas': CIRUELA,
  'cultura-y-conocimientos-ancestrales': CAFE_TOSTADO,
  // Seccion geografica: no es un tema, asi que lleva el verde institucional y
  // no un color del sistema tematico. Cede el pizarra a Consulta.
  'chile-indigena': VERDE_MARCA,
  latinoamerica: VERDE_MARCA,
  'human-development': OCRE_TIERRA,
  'planet-climate': VERDE_BOSQUE,
  'existential-threats': TERRACOTA,
  'science-technology': PIZARRA,
  'general-news': VERDE_MARCA,
}

const DEFAULT_COLOR: CategoryColor = CATEGORY_COLORS['general-news']

/**
 * Prefijo del slug de una subcategoria -> la madre de la que hereda el color.
 *
 * Las dieciocho subsecciones se nombraron `<madre>-<eje>` justamente para esto:
 * `territorio-despojo` es de Territorio y le corresponde su oliva. Sin este
 * mapa caian todas al verde de marca, que es el fallback, y las tres hijas de
 * una categoria se veian identicas entre si y distintas de su madre.
 */
const PREFIJO_A_MADRE: Record<string, string> = {
  territorio: 'territorio-y-tierras',
  clima: 'cambio-climatico',
  consulta: 'consulta-y-consentimiento',
  derechos: 'derechos-indigenas',
  defensores: 'defensores-y-proteccion',
  cultura: 'cultura-y-conocimientos-ancestrales',
}

export function getCategoryColor(issueSlug: string): CategoryColor {
  const propio = CATEGORY_COLORS[issueSlug]
  if (propio) return propio

  // Una subcategoria hereda el color de su madre. Se prueba solo si el slug
  // tiene mas de un segmento, para no confundir a la madre consigo misma.
  const guion = issueSlug.indexOf('-')
  if (guion > 0) {
    const madre = PREFIJO_A_MADRE[issueSlug.slice(0, guion)]
    if (madre && CATEGORY_COLORS[madre]) return CATEGORY_COLORS[madre]
  }

  return DEFAULT_COLOR
}

/** Convert a hex color like '#fbbf24' to 'rgba(251,191,36,alpha)' */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Shift a hex color's lightness by mixing it toward white (positive)
 * or black (negative). Amount is 0–1.
 */
export function shiftHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const target = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  const mix = (c: number) => Math.round(c + (target - c) * t)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
