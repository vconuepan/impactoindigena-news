import { describe, it, expect, vi } from 'vitest'

// El script abre una conexion Prisma al importarse; en el test solo interesa
// la funcion pura de reescritura.
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    story = { findMany: async () => [], update: async () => ({}) }
    $disconnect = async () => {}
  },
}))

const { fixCapitalization } = await import('./fix-title-capitalization.js')

describe('fixCapitalization', () => {
  it('repara los titulares rotos que se encontraron en produccion', () => {
    expect(fixCapitalization('estudio de ufal reveló amenazas crecientes en tierras indígenas')).toBe(
      'estudio de UFAL reveló amenazas crecientes en tierras indígenas'
    )
    expect(fixCapitalization('conadi y corfo financian proyectos productivos indígenas en chile')).toBe(
      'CONADI y CORFO financian proyectos productivos indígenas en Chile'
    )
    expect(fixCapitalization('consultas indígenas avanzan en coahuila con comunidades reunidas')).toBe(
      'consultas indígenas avanzan en Coahuila con comunidades reunidas'
    )
  })

  it('corrige la sigla capitalizada a medias que dejaba el sentence case del cliente', () => {
    expect(fixCapitalization('Mpf pide acción contra el garimpo')).toBe('MPF pide acción contra el garimpo')
    expect(fixCapitalization('Ong pide justicia para pueblos miskitos')).toBe(
      'ONG pide justicia para pueblos miskitos'
    )
    expect(fixCapitalization('Conadi financia proyectos')).toBe('CONADI financia proyectos')
  })

  it('deja intacto lo que ya esta bien escrito', () => {
    const ok = 'CONADI y CORFO financian proyectos productivos indígenas en Chile'
    expect(fixCapitalization(ok)).toBe(ok)
  })

  it('no toca palabras que apenas contienen una sigla o un toponimo', () => {
    // El riesgo real de un reemplazo ciego: romper texto legitimo.
    expect(fixCapitalization('la delegación chilena viajó')).toBe('la delegación chilena viajó')
    expect(fixCapitalization('comunidades peruanas y bolivianas')).toBe('comunidades peruanas y bolivianas')
    expect(fixCapitalization('cooperación entre organizaciones')).toBe('cooperación entre organizaciones')
    expect(fixCapitalization('el mapuchazo del norte')).toBe('el mapuchazo del norte')
  })

  it('respeta los numerales pegados a una sigla', () => {
    expect(fixCapitalization('acuerdos de COP30 sobre bosques')).toBe('acuerdos de COP30 sobre bosques')
  })

  it('normaliza el articulo de La Araucania', () => {
    expect(fixCapitalization('lluvias dañaron la agricultura en la araucanía')).toBe(
      'lluvias dañaron la agricultura en La Araucanía'
    )
  })

  it('no altera un texto sin coincidencias', () => {
    const t = 'jóvenes defienden su territorio ancestral'
    expect(fixCapitalization(t)).toBe(t)
  })
})
