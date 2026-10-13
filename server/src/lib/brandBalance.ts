/**
 * Destacadas de Voces Mapuche con equilibrio (diseño D5, sección 5). Función
 * pura: elige cuáles de las notas recientes de la vertical van a un punto de
 * destacadas (panel de señales, bienvenida, digest, cabecera). Ordena y no
 * quita: el listado de la vertical sigue cronológico y completo, y si las
 * reglas no se pueden cumplir con lo que hay, se relajan antes que dejar un
 * lugar vacío.
 *
 * Reglas, todas de la semilla `balance` de community_brand_criteria:
 *   - confrontacionMaxDestacadas (0,3334): el encuadre «confrontación» en un
 *     tercio como máximo. Regla propia declarada en el diseño, no del marco.
 *   - porFeedMaxDestacadas (3, de cada 10): diversidad de fuentes, la
 *     aproximación del diseño a «las distintas posiciones políticas dentro del
 *     propio pueblo», que no se etiquetan (decisión 4 del director).
 *   - ejeDirectorMinDestacadas (1): al menos una de los cinco ejes del director
 *     (lengua, saber, economía propia, propuestas, protagonismo), si la hay.
 *   - puelmapuMinDestacadas (1): al menos una del Puelmapu, si la hubo. Regla
 *     propia declarada, de la decisión del 3 de octubre (el Wallmapu entero).
 * Las otras dos tensiones del marco (tradicional y urbano; sur williche y la
 * Araucanía) no tienen una regla numérica en el diseño: se miden en la sombra.
 */

export const EJES_DEL_DIRECTOR = ['lengua', 'saber', 'economia_propia', 'propuestas', 'protagonismo'] as const

export interface Destacable {
  id: string
  /** Nota de marca; sin nota, va al final. */
  nota: number | null
  eje: string | null
  lugar: string | null
  encuadre: string | null
  feed: string | null
  fecha: Date
}

export interface ReglasDestacadas {
  confrontacionMax: number
  porFeedMaxDe10: number
  ejeDirectorMin: number
  puelmapuMin: number
}

export function reglasDestacadas(balance: unknown): ReglasDestacadas {
  const b = (balance ?? {}) as Record<string, unknown>
  const num = (k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d)
  return {
    confrontacionMax: num('confrontacionMaxDestacadas', 0.3334),
    porFeedMaxDe10: num('porFeedMaxDestacadas', 3),
    ejeDirectorMin: num('ejeDirectorMinDestacadas', 1),
    puelmapuMin: num('puelmapuMinDestacadas', 1),
  }
}

const ordenar = (a: Destacable, b: Destacable) => (b.nota ?? -1) - (a.nota ?? -1) || b.fecha.getTime() - a.fecha.getTime()

/** Elige `n` destacadas con las reglas; devuelve los ids en orden de nota y, a igual nota, de fecha. */
export function equilibrarDestacadas(notas: Destacable[], n: number, reglas: ReglasDestacadas): string[] {
  if (n <= 0 || notas.length === 0) return []
  const orden = [...notas].sort(ordenar)
  const maxConf = Math.floor(n * reglas.confrontacionMax)
  const maxFeed = Math.max(1, Math.ceil((n * reglas.porFeedMaxDe10) / 10))
  const elegidas: Destacable[] = []
  const cuenta = (pred: (x: Destacable) => boolean) => elegidas.filter(pred).length
  const cabe = (x: Destacable, relajar: boolean) =>
    !elegidas.includes(x) &&
    (relajar || x.encuadre !== 'confrontacion' || cuenta((e) => e.encuadre === 'confrontacion') < maxConf) &&
    (relajar || !x.feed || cuenta((e) => e.feed === x.feed) < maxFeed)

  // Primero, los mínimos: la mejor de los ejes del director y la mejor del Puelmapu, si las hay.
  const minimos: Array<[number, (x: Destacable) => boolean]> = [
    [reglas.ejeDirectorMin, (x) => (EJES_DEL_DIRECTOR as readonly string[]).includes(x.eje ?? '')],
    [reglas.puelmapuMin, (x) => x.lugar === 'puelmapu'],
  ]
  for (const [min, es] of minimos) {
    for (const x of orden) {
      if (elegidas.length >= n || cuenta(es) >= min) break
      if (es(x) && cabe(x, false)) elegidas.push(x)
    }
  }
  // Después, por nota, con los topes; y si faltan lugares, sin topes: ordena, no quita.
  for (const relajar of [false, true]) {
    for (const x of orden) {
      if (elegidas.length >= n) break
      if (cabe(x, relajar)) elegidas.push(x)
    }
  }
  return elegidas.sort(ordenar).map((x) => x.id)
}
