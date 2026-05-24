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

const CATEGORY_COLORS: Record<string, CategoryColor> = {
  'cambio-climatico': {
    border: 'border-emerald-400',
    borderThick: 'border-l-[6px] border-emerald-400',
    dot: 'text-emerald-500',
    bg: 'bg-emerald-50',
    dotBg: 'bg-emerald-400',
    hex: '#34d399',
    bgTint: 'bg-emerald-50/60',
  },
  'derechos-indigenas': {
    border: 'border-orange-400',
    borderThick: 'border-l-[6px] border-orange-400',
    dot: 'text-orange-500',
    bg: 'bg-orange-50',
    dotBg: 'bg-orange-400',
    hex: '#fb923c',
    bgTint: 'bg-orange-50/60',
  },
  'desarrollo-sostenible-y-autodeterminado': {
    border: 'border-amber-400',
    borderThick: 'border-l-[6px] border-amber-400',
    dot: 'text-amber-500',
    bg: 'bg-amber-50',
    dotBg: 'bg-amber-400',
    hex: '#fbbf24',
    bgTint: 'bg-amber-50/60',
  },
  'chile-indigena': {
    border: 'border-violet-400',
    borderThick: 'border-l-[6px] border-violet-400',
    dot: 'text-violet-500',
    bg: 'bg-violet-50',
    dotBg: 'bg-violet-400',
    hex: '#a78bfa',
    bgTint: 'bg-violet-50/60',
  },
  'human-development': {
    border: 'border-amber-400',
    borderThick: 'border-l-[6px] border-amber-400',
    dot: 'text-amber-500',
    bg: 'bg-amber-50',
    dotBg: 'bg-amber-400',
    hex: '#fbbf24',
    bgTint: 'bg-amber-50/60',
  },
  'planet-climate': {
    border: 'border-teal-400',
    borderThick: 'border-l-[6px] border-teal-400',
    dot: 'text-teal-500',
    bg: 'bg-teal-50',
    dotBg: 'bg-teal-400',
    hex: '#2dd4bf',
    bgTint: 'bg-teal-50/60',
  },
  'existential-threats': {
    border: 'border-red-400',
    borderThick: 'border-l-[6px] border-red-400',
    dot: 'text-red-500',
    bg: 'bg-red-50',
    dotBg: 'bg-red-400',
    hex: '#f87171',
    bgTint: 'bg-red-50/60',
  },
  'science-technology': {
    border: 'border-indigo-400',
    borderThick: 'border-l-[6px] border-indigo-400',
    dot: 'text-indigo-500',
    bg: 'bg-indigo-50',
    dotBg: 'bg-indigo-400',
    hex: '#818cf8',
    bgTint: 'bg-indigo-50/60',
  },
  'general-news': {
    border: 'border-brand-400',
    borderThick: 'border-l-[6px] border-brand-400',
    dot: 'text-brand-500',
    bg: 'bg-brand-50',
    dotBg: 'bg-brand-400',
    hex: '#f472b6',
    bgTint: 'bg-brand-50/60',
  },
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
