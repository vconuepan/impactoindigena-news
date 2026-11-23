import { describe, it, expect } from 'vitest'
import { agruparPorDia, diaUtc } from './NewsDirectoryPage'

describe('directorio de noticias: agrupado por día', () => {
  it('usa el día UTC, el mismo con que el servidor filtra por fecha', () => {
    // 23:30 UTC del 22 es 20:30 en Chile: el filtro «hasta 22» la incluye, así
    // que tiene que salir bajo el 22 y no bajo el día local de nadie.
    expect(diaUtc({ datePublished: '2026-11-22T23:30:00.000Z' })).toBe('2026-11-22')
    expect(diaUtc({ datePublished: null })).toBeNull()
  })

  it('agrupa bloques consecutivos y conserva el orden de la API', () => {
    const grupos = agruparPorDia([
      { datePublished: '2026-11-23T10:00:00.000Z', id: 'a' },
      { datePublished: '2026-11-23T08:00:00.000Z', id: 'b' },
      { datePublished: '2026-11-22T20:00:00.000Z', id: 'c' },
      { datePublished: null, id: 'd' },
    ])
    expect(grupos.map((g) => g.dia)).toEqual(['2026-11-23', '2026-11-22', null])
    expect(grupos[0].stories.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('una página vacía no produce grupos', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
