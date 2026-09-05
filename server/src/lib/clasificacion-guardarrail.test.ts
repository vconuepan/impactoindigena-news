import { describe, it, expect } from 'vitest'
import { detectarClasificacionSospechosa } from './clasificacion-guardarrail.js'

const CULTURA = 'cultura-y-conocimientos-ancestrales'
const DEFENSORES = 'defensores-y-proteccion'

describe('detectarClasificacionSospechosa', () => {
  it('marca una licitacion archivada en cultura (regla 2)', () => {
    const s = detectarClasificacionSospechosa(
      'Comunidad gana licitación pública para proveer alimentos',
      CULTURA,
    )
    expect(s).toHaveLength(1)
    expect(s[0].regla).toBe(2)
    expect(s[0].sugerido).toBe('economias-indigenas')
  })

  it('marca un hospital archivado en cultura (regla 3)', () => {
    // El caso real: un centro de recuperación de la Nación Siksika fue a
    // cultura porque la nota hablaba de sanación.
    const s = detectarClasificacionSospechosa('Nación abre hospital intercultural', CULTURA)
    expect(s[0].regla).toBe(3)
    expect(s[0].sugerido).toBe('derechos-indigenas')
  })

  it('marca un pésame archivado en defensores (regla 8)', () => {
    // El caso real: una nota de condolencias por el fallecimiento de una
    // parlamentaria fue a defensores, sin que hubiera agresión alguna.
    const s = detectarClasificacionSospechosa(
      'Jefa nacional expresa sus condolencias tras el fallecimiento de la diputada',
      DEFENSORES,
    )
    expect(s[0].regla).toBe(8)
  })

  it('marca los derechos de la naturaleza en cultura (regla 9)', () => {
    const s = detectarClasificacionSospechosa(
      'Un río es reconocido como sujeto de derecho tras el fallo',
      CULTURA,
    )
    expect(s[0].regla).toBe(9)
    expect(s[0].sugerido).toBe('territorio-y-tierras')
  })

  it('no marca lo que esta bien clasificado', () => {
    const casos: [string, string][] = [
      ['Festival de cine indígena reúne veinte obras', CULTURA],
      ['Cooperativa textil mapuche exporta a Europa', 'economias-indigenas'],
      ['Dirigente baleado durante un desalojo', DEFENSORES],
      ['Comunidad obtiene el título de sus tierras', 'territorio-y-tierras'],
    ]
    for (const [texto, slug] of casos) {
      expect(detectarClasificacionSospechosa(texto, slug), texto).toEqual([])
    }
  })

  it('compara palabras completas, no fragmentos', () => {
    // Sin limite de palabra, "banca" cae dentro de "bancada" y el guardarrail se
    // llena de falsos positivos que hacen que nadie lo mire.
    expect(detectarClasificacionSospechosa('La bancada indígena presentó su obra', CULTURA)).toEqual([])
    expect(detectarClasificacionSospechosa('La banca le negó el crédito', CULTURA)).toHaveLength(1)
  })

  it('reconoce el termino aunque venga sin tilde o en mayusculas', () => {
    for (const t of ['LICITACIÓN', 'licitacion', 'Licitación']) {
      expect(detectarClasificacionSospechosa(`Gana ${t} del municipio`, CULTURA), t).toHaveLength(1)
    }
  })

  it('no dice nada cuando no hay tema asignado ni texto', () => {
    expect(detectarClasificacionSospechosa('cualquier cosa', null)).toEqual([])
    expect(detectarClasificacionSospechosa('', CULTURA)).toEqual([])
  })

  it('una muerte violenta o bajo custodia sigue siendo defensores (regla 8)', () => {
    // Casos reales del archivo: el guardarrail los marcaba como notas
    // protocolares, y son exactamente lo que Defensores cubre.
    const casos = [
      'Fallecimiento de líder misquito bajo custodia en Nicaragua',
      'Confirman el fallecimiento del dirigente asesinado en la comunidad',
      'Fallecimiento tras la emboscada a la marcha indígena',
    ]
    for (const t of casos) {
      expect(detectarClasificacionSospechosa(t, DEFENSORES), t).toEqual([])
    }
    // Y el obituario sin violencia se sigue marcando.
    expect(
      detectarClasificacionSospechosa('Condolencias por el fallecimiento de la diputada', DEFENSORES),
    ).toHaveLength(1)
  })

  it('la inversion de una obra publica no manda cultura a economias (regla 2)', () => {
    // Caso real: "Lota inaugura centro ceremonial mapuche con inversion de 269
    // millones" es cultura; la inversion es el monto de la obra.
    expect(
      detectarClasificacionSospechosa(
        'Lota inaugura centro ceremonial mapuche con inversión de 269 millones',
        CULTURA,
      ),
    ).toEqual([])
  })

  it('una regla reporta una sola vez aunque haya varios terminos', () => {
    const s = detectarClasificacionSospechosa('Licitación, crédito y exportación', CULTURA)
    expect(s.filter((x) => x.regla === 2)).toHaveLength(1)
  })
})
