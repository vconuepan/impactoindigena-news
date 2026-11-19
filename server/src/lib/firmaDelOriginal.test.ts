import { describe, it, expect } from 'vitest'
import { emisorRespaldado, firmaDelOriginal } from './firmaDelOriginal.js'

describe('firmaDelOriginal · B4, 19-11-2026', () => {
  it('el periodismo del medio firma como siempre', () => {
    expect(firmaDelOriginal({ medio: 'Radio Kurruf', fecha: '21 de octubre de 2026' })).toBe('Reporteó: Radio Kurruf · 21 de octubre de 2026')
    expect(firmaDelOriginal({ medio: 'Radio Kurruf', fecha: null })).toBe('Reporteó: Radio Kurruf')
  })

  it('un comunicado firma con su organización y el medio que lo publicó', () => {
    expect(firmaDelOriginal({ medio: 'Mapuexpress', comunicadoDe: 'Asociación Indígena Newen', fecha: '3 de noviembre de 2026' }))
      .toBe('Comunicado de Asociación Indígena Newen · Mapuexpress · 3 de noviembre de 2026')
  })

  it('si la organización lo publicó en su propio sitio, no se nombra dos veces', () => {
    expect(firmaDelOriginal({ medio: 'Consejo de Todas las Tierras', comunicadoDe: 'consejo de todas las tierras' }, false))
      .toBe('Comunicado de consejo de todas las tierras')
  })

  it('sin fecha cuando se pide así (el pie de Instagram)', () => {
    expect(firmaDelOriginal({ medio: 'BioBío Chile', fecha: '1 de octubre', comunicadoDe: 'Comunidad X' }, false))
      .toBe('Comunicado de Comunidad X · BioBío Chile')
  })
})

describe('emisorRespaldado · el modelo no puede inventar un emisor', () => {
  const original = 'La Asociación Indígena Newen difundió hoy una declaración pública sobre el proyecto.'

  it('acepta el nombre que el artículo trae, aunque cambien tildes o mayúsculas', () => {
    expect(emisorRespaldado('asociación indígena newen', original)).toBe('asociación indígena newen')
    expect(emisorRespaldado('Asociacion Indigena Newen', original)).toBe('Asociacion Indigena Newen')
  })

  it('descarta un nombre que el artículo no trae', () => {
    expect(emisorRespaldado('Consejo de Todas las Tierras', original)).toBeNull()
  })

  it('descarta vacíos, nulos y textos que no pueden ser un nombre', () => {
    expect(emisorRespaldado(null, original)).toBeNull()
    expect(emisorRespaldado('', original)).toBeNull()
    expect(emisorRespaldado('La', original)).toBeNull()
    expect(emisorRespaldado('a'.repeat(121), 'a'.repeat(200))).toBeNull()
  })
})
