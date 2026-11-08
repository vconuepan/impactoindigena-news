import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatShortDate, formatDateWithTime, formatDate, formatRelativeTime } from './constants'

afterEach(() => {
  vi.useRealTimers()
})

describe('las fechas del panel van en español de Chile', () => {
  // Hasta el 8-nov-2026 la cola del panel, en español, mostraba «Nov 8».
  const FECHA = '2026-11-08T15:30:00Z' // 12:30 en Santiago

  it('fecha corta', () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') })
    expect(formatShortDate(FECHA)).toMatch(/^8 nov/)
  })

  it('fecha con hora y fecha completa', () => {
    expect(formatDateWithTime(FECHA)).toMatch(/8 nov.*12:30/)
    expect(formatDate(FECHA)).toMatch(/8 nov.*2026.*12:30/)
  })

  it('ninguna sale en inglés', () => {
    for (const f of [formatShortDate, formatDateWithTime, formatDate]) {
      expect(f(FECHA)).not.toMatch(/Nov|AM|PM/)
    }
  })
})

describe('el tiempo relativo', () => {
  const ahora = new Date('2026-11-08T12:00:00Z')
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()

  it('en el panel, en español', () => {
    vi.useFakeTimers({ now: ahora })
    expect(formatRelativeTime(hace(0))).toBe('recién')
    expect(formatRelativeTime(hace(5))).toBe('hace 5 min')
    expect(formatRelativeTime(hace(120))).toBe('hace 2 h')
    expect(formatRelativeTime(hace(3 * 24 * 60))).toBe('hace 3 d')
  })

  it('en el widget embebible, que está entero en inglés, sigue en inglés', () => {
    vi.useFakeTimers({ now: ahora })
    expect(formatRelativeTime(hace(5), undefined, 'en')).toBe('5m ago')
    expect(formatRelativeTime(hace(120), undefined, 'en')).toBe('2h ago')
  })
})
