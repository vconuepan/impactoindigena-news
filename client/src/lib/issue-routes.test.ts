import { describe, it, expect } from 'vitest'
import { rutasDeSecciones, type IssueConSubsecciones } from './issue-routes'

/**
 * El payload real de `/api/issues`, reducido a lo que importa acá: seis madres
 * con tres subsecciones cada una y diez madres sin hijas. Medido en producción
 * el 10-sep-2026 — 16 madres, 18 subsecciones, 34 secciones en total.
 */
const REAL: IssueConSubsecciones[] = [
  { slug: 'cambio-climatico', children: [{ slug: 'clima-bosques' }, { slug: 'clima-crisis' }, { slug: 'clima-saberes' }] },
  { slug: 'consulta-y-consentimiento', children: [{ slug: 'consulta-fallos' }, { slug: 'consulta-procesos' }, { slug: 'consulta-protocolos' }] },
  { slug: 'cultura-y-conocimientos-ancestrales', children: [{ slug: 'cultura-arte' }, { slug: 'cultura-lenguas' }, { slug: 'cultura-saberes' }] },
  { slug: 'defensores-y-proteccion', children: [{ slug: 'defensores-criminalizacion' }, { slug: 'defensores-proteccion' }, { slug: 'defensores-violencia' }] },
  { slug: 'derechos-indigenas', children: [{ slug: 'derechos-justicia' }, { slug: 'derechos-reconocimiento' }, { slug: 'derechos-salud' }] },
  { slug: 'territorio-y-tierras', children: [{ slug: 'territorio-despojo' }, { slug: 'territorio-gobierno' }, { slug: 'territorio-titulacion' }] },
  { slug: 'africa', children: [] },
  { slug: 'asia', children: [] },
  { slug: 'chile-indigena', children: [] },
  { slug: 'economias-indigenas', children: [] },
  { slug: 'europa-occidental', children: [] },
  { slug: 'europa-oriental', children: [] },
  { slug: 'latinoamerica', children: [] },
  { slug: 'mujeres-indigenas', children: [] },
  { slug: 'oceania', children: [] },
  { slug: 'sapmi', children: [] },
]

describe('rutasDeSecciones', () => {
  it('incluye las subsecciones, que es el defecto que este modulo corrige', () => {
    const rutas = rutasDeSecciones(REAL)

    // El `map` anterior devolvia 16 y dejaba 18 paginas declaradas en el
    // sitemap sirviendo la portada.
    expect(rutas).toHaveLength(34)
    expect(rutas).toContain('/issues/cultura-arte')
    expect(rutas).toContain('/issues/territorio-titulacion')
  })

  it('incluye tambien las madres', () => {
    const rutas = rutasDeSecciones(REAL)

    expect(rutas).toContain('/issues/cambio-climatico')
    expect(rutas).toContain('/issues/sapmi')
  })

  it('deja cada madre junto a sus hijas, para que el prerender agrupe cache', () => {
    expect(rutasDeSecciones([
      { slug: 'madre', children: [{ slug: 'hija-1' }, { slug: 'hija-2' }] },
      { slug: 'otra' },
    ])).toEqual(['/issues/madre', '/issues/hija-1', '/issues/hija-2', '/issues/otra'])
  })

  it('tolera que `children` no venga: el endpoint podria dejar de enviarlo', () => {
    expect(rutasDeSecciones([{ slug: 'sola' }])).toEqual(['/issues/sola'])
  })

  it('no repite una ruta si un slug aparece dos veces', () => {
    // Una subseccion mal cargada con el slug de su madre generaria dos entradas
    // iguales, y el prerender la renderizaria dos veces.
    expect(rutasDeSecciones([
      { slug: 'repetida', children: [{ slug: 'repetida' }] },
    ])).toEqual(['/issues/repetida'])
  })

  it('descarta el slug vacio, que produciria `/issues/`', () => {
    expect(rutasDeSecciones([{ slug: '' }, { slug: 'buena' }])).toEqual(['/issues/buena'])
  })

  it('devuelve vacio si el endpoint no respondio nada', () => {
    expect(rutasDeSecciones([])).toEqual([])
  })
})
