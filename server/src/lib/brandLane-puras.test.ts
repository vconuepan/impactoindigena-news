import { describe, it, expect } from 'vitest'
import { senalRegional, deduplicar, tituloDedup } from './brandRegion.js'
import { sensiblesDelTitulo, TERMINOS_SENSIBLES } from './brandSensitive.js'
import { infraccionesDeLenguaje, pareceNombrarPersona } from './brandLanguage.js'
import { seleccionarAraucania, reglasDesdeBalance, type Admitida } from './brandSelection.js'
import { LISTA_A } from './gate.js'

/**
 * Piezas puras del carril de marca (D5). Los casos salen de la medición del
 * 13-oct-2026 sobre 7.724 historias reales (otras-voces, estrategia/datos/
 * d5-listas-2026-10-13).
 */

describe('senalRegional', () => {
  const sin = (sourceTitle: string) => senalRegional({ title: null, sourceTitle, feedEsRegional: false })

  it('una comuna inequívoca basta, como palabra completa y sin tildes', () => {
    expect(sin('Entregan 410 subsidios habitacionales a familias de Padre Las Casas')).toEqual({ signal: 'term', matched: ['Padre Las Casas'] })
    expect(sin('PUCON se suma al turismo de naturaleza').matched).toEqual(['Pucón'])
    // palabra completa: «Angola» no es Angol
    expect(sin('Angola firma acuerdo petrolero').signal).toBeNull()
  })

  it('un nombre ambiguo sin segunda señal no es candidato (medido: las cuatro «Victoria» eran ajenas)', () => {
    expect(sin('Revive la victoria del Toronto de Benjamín Kuscevic sobre el Montreal').signal).toBeNull()
    expect(sin('Lula: lo que está en juego es la victoria de la democracia').signal).toBeNull()
  })

  it('un nombre ambiguo con segunda señal sí lo es', () => {
    expect(sin('Alcalde de Victoria anuncia nueva multicancha').matched).toEqual(['Victoria'])
    expect(senalRegional({ title: null, sourceTitle: 'Estudiantes de Victoria destacan en ajedrez', feedEsRegional: true })).toEqual({
      signal: 'feed',
      matched: ['Victoria'],
    })
  })

  it('el feed regional basta aunque el titular no nombre la región', () => {
    expect(senalRegional({ title: null, sourceTitle: 'Concurso FONDEVE 2026', feedEsRegional: true })).toEqual({ signal: 'feed', matched: [] })
  })
})

describe('deduplicar', () => {
  it('deja la primera aparición del mismo titular, sin importar tildes, mayúsculas ni puntuación', () => {
    const notas = [
      { id: 'a', sourceTitle: 'Detienen a acusado de femicidio en Renaico' },
      { id: 'b', sourceTitle: 'DETIENEN A ACUSADO DE FEMICIDIO EN RENAICO.' },
      { id: 'c', sourceTitle: 'Otra nota' },
    ]
    expect(deduplicar(notas).map((n) => n.id)).toEqual(['a', 'c'])
    expect(deduplicar(notas, [tituloDedup('Otra nota')]).map((n) => n.id)).toEqual(['a'])
  })
})

describe('sensiblesDelTitulo', () => {
  it('incluye la Lista A completa del gate', () => {
    for (const t of LISTA_A) expect(TERMINOS_SENSIBLES).toContain(t)
  })

  it('marca el femicidio de Renaico por el título (caso de la medición)', () => {
    expect(sensiblesDelTitulo(null, 'Mujer es hallada estrangulada al interior de vivienda en Renaico')).toContain('estrangul')
  })

  it('protege con la misma vara: violencia rural y violencia contra personas', () => {
    expect(sensiblesDelTitulo(null, 'Ataque incendiario destruye maquinaria en predio de Ercilla')).toContain('ataque incendiario')
    expect(sensiblesDelTitulo(null, 'Detienen a cuatro sospechosos de secuestro en Angol')).toContain('secuestr')
  })

  it('no marca una nota sin términos sensibles', () => {
    expect(sensiblesDelTitulo(null, 'Entregan 410 subsidios habitacionales en Padre Las Casas')).toEqual([])
  })
})

describe('infraccionesDeLenguaje', () => {
  it('bloquea el cumplimiento del 169 atribuido a una empresa, no la obligación del Estado', () => {
    expect(infraccionesDeLenguaje('La minera asegura que cumple con el Convenio 169 en su proyecto')).toContain('169-empresa')
    expect(infraccionesDeLenguaje('Las comunidades exigen que el Estado cumpla el Convenio 169')).toEqual([])
  })

  it('bloquea vocabulario DEI, afiliación GSDA y respaldo inflado de la Fundación', () => {
    expect(infraccionesDeLenguaje('Un programa de diversidad de proveedores en Temuco')).toContain('dei-diversidad-de-proveedores')
    expect(infraccionesDeLenguaje('La Fundación es associate member de la alianza')).toContain('gsda-afiliacion-no-aprobada')
    expect(infraccionesDeLenguaje('La Fundación Empresas Indígenas forma parte del consejo')).toContain('respaldo-de-la-fundacion')
  })

  it('deja pasar un texto regional común', () => {
    expect(infraccionesDeLenguaje('El Gobierno Regional aprueba fondos para caminos rurales en Malleco')).toEqual([])
  })
})

describe('pareceNombrarPersona', () => {
  it('detecta un nombre y apellido', () => {
    expect(pareceNombrarPersona('La dirigenta Jeny Parra denuncia falta de consulta')).toBe(true)
  })
  it('no confunde lugares ni instituciones con personas', () => {
    expect(pareceNombrarPersona('Hecho en Padre Las Casas que afecta a la región')).toBe(false)
    expect(pareceNombrarPersona('Decisión del Gobierno Regional sobre la Nueva Imperial')).toBe(false)
    expect(pareceNombrarPersona('Inversión regional del Plan Despega')).toBe(false)
  })
})

describe('seleccionarAraucania', () => {
  const reglas = reglasDesdeBalance({
    dailyTarget: 3,
    relevanceMin: 5,
    balance: { regionCompletaMin: 0.5, mapucheChilenoMaxDia: 1, porComunaMaxDia: 1 },
  })
  const d = new Date('2026-10-12T12:00:00Z')
  const a = (id: string, brandScore: number, axis: string, comuna: string | null = null): Admitida => ({ id, brandScore, axis, comuna, brandDate: d })

  it('respeta el cupo, el umbral y el orden por nota', () => {
    const r = seleccionarAraucania([a('x', 4, 'region_completa'), a('r1', 6, 'region_completa', 'Angol'), a('r2', 5, 'region_completa', 'Pucón')], reglas)
    expect(r).toEqual(['r1', 'r2'])
  })

  it('reserva al menos la mitad para la región completa aunque las tensiones puntúen más alto', () => {
    const r = seleccionarAraucania(
      [a('t1', 8, 'pobreza_desarrollo', 'Temuco'), a('t2', 8, 'regionalismo_centralismo', 'Angol'), a('t3', 7, 'pobreza_desarrollo', 'Lumaco'), a('r1', 5, 'region_completa', 'Pucón'), a('r2', 5, 'region_completa', 'Cunco')],
      reglas,
    )
    expect(r).toHaveLength(3)
    expect(r.filter((id) => id.startsWith('r'))).toHaveLength(2)
  })

  it('como máximo una por día del eje mapuche y chileno', () => {
    const r = seleccionarAraucania([a('m1', 9, 'mapuche_chileno', 'Temuco'), a('m2', 8, 'mapuche_chileno', 'Angol'), a('r1', 5, 'region_completa', 'Pucón')], reglas)
    expect(r).toEqual(['m1', 'r1'])
    expect(seleccionarAraucania([a('m2', 8, 'mapuche_chileno')], reglas, [{ axis: 'mapuche_chileno', comuna: null }])).toEqual([])
  })

  it('no repite comuna si hay alternativa, y la repite si no la hay', () => {
    expect(seleccionarAraucania([a('r1', 6, 'region_completa', 'Angol'), a('r2', 6, 'region_completa', 'Angol'), a('r3', 5, 'region_completa', 'Pucón')], reglas)).toEqual(['r1', 'r3', 'r2'])
    expect(seleccionarAraucania([a('r1', 6, 'region_completa', 'Angol'), a('r2', 6, 'region_completa', 'Angol')], reglas)).toEqual(['r1', 'r2'])
  })

  it('descuenta lo ya elegido hoy', () => {
    const ya = [{ axis: 'region_completa', comuna: 'Temuco' }, { axis: 'region_completa', comuna: 'Angol' }]
    expect(seleccionarAraucania([a('r1', 6, 'region_completa', 'Pucón'), a('r2', 6, 'region_completa', 'Cunco')], reglas, ya)).toEqual(['r1'])
  })
})
