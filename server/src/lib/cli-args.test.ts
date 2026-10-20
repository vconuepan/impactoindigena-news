import { describe, it, expect } from 'vitest'
import { parseLimitArg, CliArgError } from './cli-args.js'

describe('parseLimitArg', () => {
  it('sin --limit no hay límite', () => {
    expect(parseLimitArg([])).toBeNull()
    expect(parseLimitArg(['--apply'])).toBeNull()
  })

  it('acepta --limit N y --limit=N, en cualquier posición', () => {
    expect(parseLimitArg(['--limit', '20'])).toBe(20)
    expect(parseLimitArg(['--limit=20'])).toBe(20)
    expect(parseLimitArg(['--apply', '--limit', '20'])).toBe(20)
    expect(parseLimitArg(['--apply', '--limit=20'])).toBe(20)
    expect(parseLimitArg(['--limit=3', '--apply'])).toBe(3)
  })

  it('--limit 0 es cero, no «sin límite»', () => {
    expect(parseLimitArg(['--limit', '0'])).toBe(0)
    expect(parseLimitArg(['--limit=0'])).toBe(0)
  })

  it('aborta si --limit viene sin valor', () => {
    // Hasta el 20-oct-2026 estos tres daban NaN y, con --apply, traducían todo.
    expect(() => parseLimitArg(['--limit'])).toThrow(CliArgError)
    expect(() => parseLimitArg(['--limit'])).toThrow(/sin valor/)
    expect(() => parseLimitArg(['--limit='])).toThrow(/sin valor/)
    expect(() => parseLimitArg(['--limit', '--apply'])).toThrow(/sin valor/)
  })

  it('aborta si el valor no es un entero mayor o igual a cero, y lo nombra', () => {
    expect(() => parseLimitArg(['--limit', 'veinte'])).toThrow(CliArgError)
    expect(() => parseLimitArg(['--limit', 'veinte'])).toThrow(/«veinte»/)
    expect(() => parseLimitArg(['--limit', '-5'])).toThrow(/«-5»/)
    expect(() => parseLimitArg(['--limit=-5'])).toThrow(/«-5»/)
    expect(() => parseLimitArg(['--limit', '2.5'])).toThrow(/entero/)
    expect(() => parseLimitArg(['--limit', '20abc'])).toThrow(/entero/)
    expect(() => parseLimitArg(['--limit', '1e3'])).toThrow(/entero/)
    expect(() => parseLimitArg(['--limit', ' 20'])).toThrow(/entero/)
  })

  it('el mensaje de error dice cómo se usa', () => {
    expect(() => parseLimitArg(['--limit', 'x'])).toThrow(/--limit 20 o --limit=20/)
  })
})
