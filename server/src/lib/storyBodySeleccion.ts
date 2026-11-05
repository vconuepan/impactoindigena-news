/**
 * De las noticias recién publicadas, las que se redactan solas: relevancia al
 * menos `minRelevance` (una sin relevancia no entra) y, de esas, las
 * `maxPorCorrida` más relevantes (empate: el orden en que llegaron).
 * `maxPorCorrida <= 0` quita el tope. El resto sale con el resumen y se puede
 * redactar a mano desde el panel.
 */
export function seleccionarParaRedactar(
  filas: { id: string; relevance: number | null }[],
  minRelevance: number,
  maxPorCorrida: number,
): { elegidas: string[]; descartadas: number } {
  const aptas = filas
    .map((f, orden) => ({ ...f, orden }))
    .filter((f) => f.relevance !== null && f.relevance >= minRelevance)
    .sort((a, b) => (b.relevance as number) - (a.relevance as number) || a.orden - b.orden)
  const elegidas = (maxPorCorrida > 0 ? aptas.slice(0, maxPorCorrida) : aptas).map((f) => f.id)
  return { elegidas, descartadas: filas.length - elegidas.length }
}
