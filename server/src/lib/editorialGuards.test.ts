import { describe, expect, it } from 'vitest'
import { avisosQueBloquean, revisarEditorial } from './editorialGuards.js'

const notas = 'Diputados aprobó la ley con 124 votos a favor. La expropiación de 1881 sigue sin resolverse.'

const buena =
  'Las comunidades mapuche de Río Negro enfrentan esta semana una ley que agiliza los desalojos. No se trata de orden público, sino de una disputa de propiedad que el Estado dejó abierta en 1881.\n\nA mi juicio, el camino es el de Waitangi.'

describe('revisarEditorial', () => {
  it('una editorial fiel y con los pueblos de sujeto no deja avisos', () => {
    expect(revisarEditorial(buena, { notes: notas, authorName: 'Venancio Coñuepán Mesías' })).toEqual([])
  })

  it('la primera frase con el medio de sujeto bloquea', () => {
    const avisos = revisarEditorial('En Voces Indígenas vemos con preocupación la ley. Las comunidades resisten.', { notes: notas })
    expect(avisos.map((a) => a.tipo)).toContain('agencia')
    expect(avisosQueBloquean(avisos)).toHaveLength(1)
  })

  it('«conflicto mapuche» bloquea', () => {
    const avisos = revisarEditorial('Las comunidades viven el conflicto mapuche desde hace décadas.', {})
    expect(avisos.map((a) => a.tipo)).toEqual(['conflicto'])
  })

  it('hablar de la IA dentro del texto bloquea', () => {
    const avisos = revisarEditorial('Las comunidades resisten. Este texto fue escrito con inteligencia artificial.', {})
    expect(avisos.map((a) => a.tipo)).toEqual(['ia'])
  })

  it('el nombre del autor dentro del texto bloquea: la firma va aparte', () => {
    const avisos = revisarEditorial('Las comunidades resisten.\n\n— Venancio Coñuepán Mesías', { authorName: 'Venancio Coñuepán Mesías' })
    expect(avisos.map((a) => a.tipo)).toEqual(['firma'])
  })

  it('una cifra que no está en las notas solo avisa', () => {
    const avisos = revisarEditorial('Las comunidades suman 300 familias en Neuquén.', { notes: notas })
    expect(avisos.map((a) => a.tipo)).toEqual(['cifra'])
    expect(avisosQueBloquean(avisos)).toEqual([])
  })

  it('sin texto no hay nada que revisar', () => {
    expect(revisarEditorial('   ', { notes: notas })).toEqual([])
  })
})
