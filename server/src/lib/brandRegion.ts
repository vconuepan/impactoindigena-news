/**
 * Red de candidatas del carril territorial de Voces Araucanía (D5).
 *
 * Una nota rechazada por el pipeline global es candidata si su feed está
 * marcado como de la región (feed_brands) o si su título o el título de la
 * fuente nombran una comuna, una provincia o la región. Medido el 13-oct-2026
 * sobre 7.724 historias de 14 días: 360 candidatas únicas, 25,7 por día; 75
 * entran solo por su feed (municipales que no nombran la comuna en el titular).
 * Datos y método: otras-voces, estrategia/datos/d5-listas-2026-10-13.
 *
 * Los nombres que también son palabras o apellidos (Victoria, Lautaro, Freire,
 * Saavedra, Ercilla, Gorbea, Imperial) piden una segunda señal: feed regional
 * o una mención de la región o de la comuna como tal. Medido: las cuatro
 * menciones de «Victoria» sin esa señal eran ajenas (atletismo, fútbol, Lula,
 * elecciones en EE.UU.).
 *
 * El cotejo ignora tildes y mayúsculas y exige palabra completa: es la lección
 * de «cam», que como prefijo calzaba en 92 notas y solo 6 eran la CAM.
 */

/** Comunas (y lugares) cuyo nombre no se confunde con otra cosa. */
export const LUGARES_INEQUIVOCOS = [
  'Angol', 'Collipulli', 'Curacautín', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Purén', 'Renaico', 'Traiguén',
  'Temuco', 'Carahue', 'Cholchol', 'Chol Chol', 'Cunco', 'Curarrehue', 'Galvarino', 'Loncoche', 'Melipeuco',
  'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Puerto Saavedra', 'Teodoro Schmidt',
  'Toltén', 'Vilcún', 'Villarrica', 'Malleco', 'Cautín', 'Araucanía', 'Labranza', 'Licanray', 'Lican Ray',
  'Conguillío', 'Budi',
] as const

/** Comunas cuyo nombre también es palabra común o apellido: necesitan segunda señal. */
export const LUGARES_AMBIGUOS = ['Victoria', 'Lautaro', 'Freire', 'Saavedra', 'Ercilla', 'Gorbea', 'Imperial'] as const

/** Minúsculas sin diacríticos. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function palabraCompleta(termino: string): RegExp {
  const e = normalizar(termino).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![a-z0-9])${e}(?![a-z0-9])`)
}

const RX_INEQUIVOCOS = LUGARES_INEQUIVOCOS.map((t) => [t, palabraCompleta(t)] as const)
const RX_AMBIGUOS = LUGARES_AMBIGUOS.map((t) => [t, palabraCompleta(t)] as const)
const RX_SEGUNDA_SENAL = /(comuna de|municipalidad de|municipio de|alcalde de|alcaldesa de|malleco|araucania|cautin|temuco)/

export interface SenalRegional {
  /** 'feed' si el feed es de la región; si no, 'term'. Null si no es candidata. */
  signal: 'feed' | 'term' | null
  matched: string[]
}

/** Decide si una nota es candidata del carril territorial y por qué. */
export function senalRegional(input: { title: string | null; sourceTitle: string; feedEsRegional: boolean }): SenalRegional {
  const texto = normalizar(`${input.sourceTitle} ${input.title ?? ''}`)
  const matched: string[] = []
  for (const [t, rx] of RX_INEQUIVOCOS) if (rx.test(texto)) matched.push(t)
  const segundaSenal = input.feedEsRegional || RX_SEGUNDA_SENAL.test(texto)
  for (const [t, rx] of RX_AMBIGUOS) if (rx.test(texto) && segundaSenal) matched.push(t)
  if (input.feedEsRegional) return { signal: 'feed', matched }
  if (matched.length > 0) return { signal: 'term', matched }
  return { signal: null, matched: [] }
}

/** Título normalizado para deduplicar: la misma noticia de un municipio y de dos medios. */
export function tituloDedup(sourceTitle: string): string {
  return normalizar(sourceTitle).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Deja la primera aparición de cada título normalizado, en el orden recibido. */
export function deduplicar<T extends { sourceTitle: string }>(notas: T[], yaVistos: Iterable<string> = []): T[] {
  const vistos = new Set(yaVistos)
  const out: T[] = []
  for (const n of notas) {
    const k = tituloDedup(n.sourceTitle)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    out.push(n)
  }
  return out
}
