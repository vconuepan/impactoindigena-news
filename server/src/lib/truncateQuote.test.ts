import { describe, it, expect } from 'vitest'
import { truncateQuote, MAX_QUOTE_CHARS } from './truncateQuote.js'

describe('truncateQuote', () => {
  it('returns null for null, undefined, and empty input', () => {
    expect(truncateQuote(null)).toBeNull()
    expect(truncateQuote(undefined)).toBeNull()
    expect(truncateQuote('')).toBeNull()
    expect(truncateQuote('   ')).toBeNull()
  })

  it('keeps quotes at or under the limit intact', () => {
    const short = 'La plurinacionalidad debe implicar el goce efectivo de derechos.'
    expect(truncateQuote(short)).toBe(short)
    const exact = 'a'.repeat(MAX_QUOTE_CHARS)
    expect(truncateQuote(exact)).toBe(exact)
  })

  it('drops trailing sentences instead of cutting mid-sentence', () => {
    const s1 = 'Primera oración corta y potente.'
    const s2 = 'Segunda oración que añade contexto adicional importante.'
    const s3 = 'x'.repeat(280) + '.'
    const result = truncateQuote(`${s1} ${s2} ${s3}`)
    expect(result).toBe(`${s1} ${s2}`)
    expect(result!.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS)
  })

  it('keeps only the first sentence when the second overflows', () => {
    const s1 = 'Una declaración con escaso contenido sustantivo no basta.'
    const s2 = 'y'.repeat(290) + '.'
    expect(truncateQuote(`${s1} ${s2}`)).toBe(s1)
  })

  it('hard-cuts with ellipsis when the first sentence alone exceeds the limit', () => {
    const oneLong = 'palabra '.repeat(60).trim() + '.'
    const result = truncateQuote(oneLong)
    expect(result!.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS)
    expect(result!.endsWith('…')).toBe(true)
  })

  it('handles ! ? and … as sentence boundaries', () => {
    const s1 = '¿Hasta cuándo esperaremos?'
    const s2 = 'z'.repeat(290) + '.'
    expect(truncateQuote(`${s1} ${s2}`)).toBe(s1)
  })

  it('trims surrounding whitespace', () => {
    expect(truncateQuote('  cita con espacios  ')).toBe('cita con espacios')
  })
})
