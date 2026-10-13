/**
 * Selección diaria del carril territorial de Voces Araucanía (D5), por reglas
 * fijas y sin LLM. Decisión del director del 12-oct-2026 (decisión 5):
 *   - cupo diario (daily_target, propuesto 3);
 *   - al menos la mitad de «región completa» (los seis temas que el protocolo
 *     1.1 nombra en pie de igualdad). Mientras el día sigue abierto, esos
 *     lugares se guardan aunque todavía no haya; al cierre se sueltan;
 *   - como máximo una por día del eje «mapuche y chileno», que ya llega a la
 *     vertical por sus palabras clave;
 *   - no dos de la misma comuna si hay alternativa.
 * La escala ordena dentro de cada eje y decide quién pasa el umbral; la cuota
 * decide la mezcla. Sin cuota, las tensiones (7-8) desplazarían siempre a la
 * región completa (5-6) y la vertical volvería a ser la del conflicto, que es
 * lo que el protocolo prohíbe («sin reducir la región a su conflicto»).
 */

export interface Admitida {
  id: string
  brandScore: number
  axis: string
  /** Comuna principal (la primera que nombra), o null. */
  comuna: string | null
  brandDate: Date
}

export interface ReglasSeleccion {
  dailyTarget: number
  relevanceMin: number
  regionCompletaMin: number
  mapucheChilenoMaxDia: number
  porComunaMaxDia: number
}

export function reglasDesdeBalance(c: { dailyTarget: number; relevanceMin: number; balance: unknown }): ReglasSeleccion {
  const b = (c.balance ?? {}) as Record<string, unknown>
  const num = (k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d)
  return {
    dailyTarget: c.dailyTarget,
    relevanceMin: c.relevanceMin,
    regionCompletaMin: num('regionCompletaMin', 0.5),
    mapucheChilenoMaxDia: num('mapucheChilenoMaxDia', 1),
    porComunaMaxDia: num('porComunaMaxDia', 1),
  }
}

/**
 * Elige hasta `dailyTarget - yaElegidasHoy` notas. Orden: nota de marca
 * descendente y, a igual nota, la más reciente. Devuelve los ids elegidos.
 */
export function seleccionarAraucania(
  admitidas: Admitida[],
  reglas: ReglasSeleccion,
  yaElegidasHoy: Array<Pick<Admitida, 'axis' | 'comuna'>> = [],
  opts: { diaAbierto?: boolean } = {},
): string[] {
  const cupo = Math.max(0, reglas.dailyTarget - yaElegidasHoy.length)
  if (cupo === 0) return []
  const orden = [...admitidas]
    .filter((a) => a.brandScore >= reglas.relevanceMin)
    .sort((a, b) => b.brandScore - a.brandScore || b.brandDate.getTime() - a.brandDate.getTime())

  const elegidas: Admitida[] = []
  const hoy = [...yaElegidasHoy]
  const cuenta = (pred: (x: Pick<Admitida, 'axis' | 'comuna'>) => boolean) => hoy.filter(pred).length
  const minRegion = Math.ceil(reglas.dailyTarget * reglas.regionCompletaMin)

  const puede = (a: Admitida, relajarComuna: boolean): boolean => {
    if (a.axis === 'mapuche_chileno' && cuenta((x) => x.axis === 'mapuche_chileno') >= reglas.mapucheChilenoMaxDia) return false
    if (!relajarComuna && a.comuna && cuenta((x) => x.comuna === a.comuna) >= reglas.porComunaMaxDia) return false
    // Reservar los lugares de región completa mientras falten: si quedan en esta
    // corrida, o si el día sigue abierto y pueden llegar en una corrida posterior.
    const faltanRegion = minRegion - cuenta((x) => x.axis === 'region_completa')
    const lugaresLibres = reglas.dailyTarget - hoy.length
    if (a.axis !== 'region_completa' && faltanRegion > 0 && lugaresLibres <= faltanRegion) {
      const quedanRegion = orden.some((o) => o.axis === 'region_completa' && !elegidas.includes(o))
      if (quedanRegion || opts.diaAbierto) return false
    }
    return true
  }

  for (const relajar of [false, true]) {
    for (const a of orden) {
      if (elegidas.length >= cupo) break
      if (elegidas.includes(a) || !puede(a, relajar)) continue
      elegidas.push(a)
      hoy.push(a)
    }
  }
  return elegidas.map((a) => a.id)
}
