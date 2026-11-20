/**
 * Calculos puros de los dos bloques nuevos del panel de analitica (20-nov-2026):
 * lo que el filtro de robots descarta y las cargas de fichas sin JavaScript.
 * Separados del componente para poder probarlos.
 */

export type Fila = { surface: string; family: string; agent: string; count: number }

export const ETIQUETA_FAMILIA: Record<string, string> = {
  navegador: 'Navegador',
  buscador: 'Buscadores',
  ia_busqueda: 'IA que busca y cita',
  ia_entrenamiento: 'IA que entrena modelos',
  vista_previa: 'Vistas previas de enlaces',
  seo_monitoreo: 'SEO y monitoreo',
  automatizacion: 'Navegadores sin pantalla y librerías',
  otro_robot: 'Otros robots (incluye buscadores falsos)',
  sin_ua: 'Sin user-agent',
}

/** Orden de presentacion: lo que es buena noticia primero, lo dudoso al final. */
const ORDEN = ['buscador', 'vista_previa', 'ia_busqueda', 'ia_entrenamiento', 'seo_monitoreo', 'automatizacion', 'otro_robot', 'sin_ua']

export interface ResumenFamilia {
  family: string
  etiqueta: string
  /** Robots que ejecutaron JavaScript y mandaron el beacon (antes se tiraban). */
  beacons: number
  /** Cargas de fichas servidas por el backend. */
  fichas: number
}

export function resumenPorFamilia(filas: Fila[]): ResumenFamilia[] {
  const mapa = new Map<string, ResumenFamilia>()
  for (const f of filas) {
    if (f.family === 'navegador') continue
    const r = mapa.get(f.family) ?? { family: f.family, etiqueta: ETIQUETA_FAMILIA[f.family] ?? f.family, beacons: 0, fichas: 0 }
    if (f.surface === 'beacon') r.beacons += f.count
    else if (f.surface === 'ficha_html') r.fichas += f.count
    mapa.set(f.family, r)
  }
  return [...mapa.values()].sort((a, b) => {
    const ia = ORDEN.indexOf(a.family), ib = ORDEN.indexOf(b.family)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

/** Los agentes con mas peticiones (ambas superficies sumadas), sin navegadores. */
export function agentesPrincipales(filas: Fila[], n = 10): Array<{ agent: string; family: string; count: number }> {
  const mapa = new Map<string, { agent: string; family: string; count: number }>()
  for (const f of filas) {
    if (f.family === 'navegador') continue
    const k = `${f.family}|${f.agent}`
    const r = mapa.get(k) ?? { agent: f.agent, family: f.family, count: 0 }
    r.count += f.count
    mapa.set(k, r)
  }
  return [...mapa.values()].sort((a, b) => b.count - a.count).slice(0, n)
}

export interface CargasSinJs {
  /** Cargas de ficha cuyo User-Agent dice ser un navegador. */
  conCaraDeNavegador: number
  /** De esas, las que ejecutaron JavaScript y mandaron el beacon (entradas a fichas en page_views). */
  conJs: number
  sinJs: number
  /** % de las cargas con cara de navegador que nunca ejecutaron JavaScript. */
  pctSinJs: number
}

export function cargasSinJs(filas: Fila[], fichasConJs: number): CargasSinJs {
  const conCaraDeNavegador = filas
    .filter((f) => f.surface === 'ficha_html' && f.family === 'navegador')
    .reduce((s, f) => s + f.count, 0)
  // La cache del borde puede servir una ficha sin pasar por el backend, asi que
  // las vistas con JS pueden superar a las cargas contadas: nunca negativo.
  const sinJs = Math.max(0, conCaraDeNavegador - fichasConJs)
  const pctSinJs = conCaraDeNavegador > 0 ? Math.round((sinJs / conCaraDeNavegador) * 100) : 0
  return { conCaraDeNavegador, conJs: Math.min(fichasConJs, conCaraDeNavegador), sinJs, pctSinJs }
}

export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}
