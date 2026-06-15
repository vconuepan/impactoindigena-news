/**
 * Maps issue slugs to subtle accent colors for visual differentiation.
 * Used as thin borders, dots, and small accents — not backgrounds.
 */

import type { CommunityType } from '@shared/types'

/** Returns a Tailwind bg class for the community-type indicator dot. */
export function communityDotColor(type: CommunityType): string {
  if (type === 'PUEBLO') return 'bg-brand-600'
  if (type === 'TERRITORIO') return 'bg-amber-500'
  return 'bg-emerald-600'
}

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
  hex: '#8A6A28',
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

const VERDE_MARCA = {
  border: 'border-brand-800',
  borderThick: 'border-l-[6px] border-brand-800',
  dot: 'text-brand-800',
  bg: 'bg-brand-50',
  dotBg: 'bg-brand-800',
  hex: '#0D5F3C',
  bgTint: 'bg-brand-50/60',
} satisfies CategoryColor

const CATEGORY_COLORS: Record<string, CategoryColor> = {
  'cambio-climatico': VERDE_BOSQUE,
  'derechos-indigenas': TERRACOTA,
  'desarrollo-sostenible-y-autodeterminado': OCRE_TIERRA,
  'chile-indigena': PIZARRA,
  'human-development': OCRE_TIERRA,
  'planet-climate': VERDE_BOSQUE,
  'existential-threats': TERRACOTA,
  'science-technology': PIZARRA,
  'general-news': VERDE_MARCA,
}

const DEFAULT_COLOR: CategoryColor = CATEGORY_COLORS['general-news']

export function getCategoryColor(issueSlug: string): CategoryColor {
  return CATEGORY_COLORS[issueSlug] ?? DEFAULT_COLOR
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
