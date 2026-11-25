import { describe, it, expect } from 'vitest'
import {
  normalizar,
  terminosDe,
  clientesMencionados,
  avisoDeIndependencia,
  textosDeNota,
  motivoRutInvalido,
  type ClienteParaCruce,
} from './avisoClientes.js'

// Organizaciones ficticias: los tests no deben nombrar clientes reales.
const minera: ClienteParaCruce = {
  id: 'c1', name: 'Minera Ejemplo del Norte S.A.', aliases: ['MENSA', 'Ejemplo del Norte'], vertical: 'legal', endedOn: null,
}
const forestal: ClienteParaCruce = {
  id: 'c2', name: 'Forestal Los Robles', aliases: [], vertical: 'ai', endedOn: null,
}
const celulosa: ClienteParaCruce = {
  id: 'c3', name: 'Celulosa Arauco', aliases: [], vertical: 'legal', endedOn: null,
}

describe('normalizar', () => {
  it('quita tildes, mayúsculas y puntuación, y deja bordes para palabra completa', () => {
    expect(normalizar('¡Comunidad Pewenche «Quinquén»!')).toBe(' comunidad pewenche quinquen ')
  })
})

describe('terminosDe', () => {
  it('descarta alias de menos de tres letras', () => {
    expect(terminosDe({ name: 'Asociación Ejemplo', aliases: ['AE', 'A.E.', 'Ejemplo'] }))
      .toEqual(['asociacion ejemplo', 'ejemplo'])
  })
})

describe('clientesMencionados', () => {
  const lista = [minera, forestal, celulosa]

  it('caso positivo: el nombre en el resumen marca al cliente', () => {
    const r = clientesMencionados(
      textosDeNota({ title: 'Consulta indígena en Atacama', summary: 'La comunidad acordó con Minera Ejemplo del Norte S.A. un plan de monitoreo.' }),
      lista,
    )
    expect(r.map((c) => c.id)).toEqual(['c1'])
  })

  it('caso negativo: una nota que no los menciona no marca a nadie', () => {
    const r = clientesMencionados(
      textosDeNota({ title: 'Lof de Temucuicui recupera semillas', summary: 'Familias del lof guardan semillas nativas.' }),
      lista,
    )
    expect(r).toEqual([])
  })

  it('alias: la sigla, sin tildes ni mayúsculas iguales, marca al cliente', () => {
    const r = clientesMencionados(textosDeNota({ quoteAttribution: 'Vocera de mensa' }), lista)
    expect(r.map((c) => c.id)).toEqual(['c1'])
  })

  it('el alias se busca en el cuerpo, aunque el resumen no lo diga', () => {
    const r = clientesMencionados(
      textosDeNota({ summary: 'Una minera firmó un acuerdo.', body: { contexto: 'El proyecto de Ejemplo del Norte lleva diez años.' } }),
      lista,
    )
    expect(r.map((c) => c.id)).toEqual(['c1'])
  })

  it('palabra completa: «Araucanía» no es «Celulosa Arauco», ni «Robles» solo es la forestal', () => {
    const r = clientesMencionados(
      textosDeNota({ summary: 'En La Araucanía, Celulosa Araucana y los robles del sur.' }),
      lista,
    )
    expect(r).toEqual([])
  })

  it('el artículo original completo no entra al cruce', () => {
    const textos = textosDeNota({ title: 'Otra noticia', summary: 'Sin clientes.' })
    expect(textos.join(' ')).not.toContain('Minera')
  })
})

describe('avisoDeIndependencia', () => {
  const ahora = new Date('2026-11-25T12:00:00Z')

  it('sin menciones no hay aviso', () => {
    expect(avisoDeIndependencia([], new Set(), ahora)).toBeNull()
  })

  it('es genérico: no lleva nombre, id ni alias del cliente', () => {
    const aviso = avisoDeIndependencia([minera], new Set(), ahora)
    expect(aviso).toEqual({ verticals: ['legal'], current: true, plural: false })
    expect(JSON.stringify(aviso)).not.toMatch(/Minera|MENSA|c1/)
  })

  it('junta las dos verticales en orden fijo y marca plural con dos organizaciones', () => {
    expect(avisoDeIndependencia([minera, forestal], new Set(), ahora))
      .toEqual({ verticals: ['ai', 'legal'], current: true, plural: true })
  })

  it('una relación terminada dice «fue cliente»', () => {
    const terminada = { ...forestal, endedOn: new Date('2026-06-30T00:00:00Z') }
    expect(avisoDeIndependencia([terminada], new Set(), ahora)?.current).toBe(false)
  })

  it('un falso positivo descartado en esta nota no cuenta', () => {
    expect(avisoDeIndependencia([minera], new Set(['c1']), ahora)).toBeNull()
    expect(avisoDeIndependencia([minera, forestal], new Set(['c1']), ahora))
      .toEqual({ verticals: ['ai'], current: true, plural: false })
  })

  it('una vertical desconocida no produce aviso', () => {
    expect(avisoDeIndependencia([{ ...minera, vertical: 'otra' }], new Set(), ahora)).toBeNull()
  })
})

describe('motivoRutInvalido', () => {
  it('acepta el RUT de una persona jurídica', () => {
    expect(motivoRutInvalido('76.707.746-7')).toBeNull()
    expect(motivoRutInvalido('65191983-5')).toBeNull()
  })

  it('rechaza el RUT de una persona natural', () => {
    expect(motivoRutInvalido('12.345.678-5')).toMatch(/persona natural/)
  })

  it('rechaza un dígito verificador que no corresponde', () => {
    expect(motivoRutInvalido('76.707.746-1')).toMatch(/verificador/)
  })
})
