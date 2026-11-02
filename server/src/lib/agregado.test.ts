import { describe, it, expect } from 'vitest'
import { conPiso, K_MINIMO } from './agregado.js'

describe('conPiso (k ≥ 5 para todo agregado que se publica)', () => {
  it('por debajo del piso no se publica el número', () => {
    expect(conPiso(0)).toBeNull()
    expect(conPiso(1)).toBeNull()
    expect(conPiso(K_MINIMO - 1)).toBeNull()
  })

  it('desde el piso se publica tal cual', () => {
    expect(conPiso(K_MINIMO)).toBe(5)
    expect(conPiso(42)).toBe(42)
  })
})
