/**
 * Normalizacion determinista de siglas y nombres propios en titulos.
 *
 * POR QUE EXISTE, y por que no basta la regla del esquema:
 *
 * El 10-ago-2026 se reforzo la instruccion de `schemas/llm.ts` para que el
 * modelo tratara las siglas como nombres propios. Se midio cuatro dias despues:
 * de 25 historias rastreadas DESPUES del despliegue, 3 seguian publicando
 * "universidad de chile", "en brasil", "en chile" — 12%, exactamente la misma
 * tasa que antes del cambio. La instruccion no movio la aguja.
 *
 * La leccion: un `.describe()` es una restriccion BLANDA. El modelo la cumple
 * a veces. Para una regla que o se cumple o no —una sigla esta bien escrita o
 * esta mal— hace falta un guardarrail determinista en el codigo.
 *
 * La instruccion del esquema se conserva igual: mejora el primer intento y
 * cubre lo que la lista blanca no conoce. Esto es el cinturon, aquello los
 * tirantes.
 *
 * Se aplica en el unico punto donde el pipeline persiste un titulo
 * (`services/analysis.ts`) y en el script que repara el archivo historico.
 */

/**
 * Siglas y acronimos del dominio, en su forma canonica.
 *
 * Solo entran los que no colisionan con una palabra comun del espanol: una
 * sustitucion ciega de "ine" o "sal" romperia texto legitimo. Ante la duda, se
 * deja fuera — esto prefiere no tocar antes que tocar de mas.
 */
const ACRONYMS = [
  'CONADI', 'CORFO', 'CONAF', 'SERNAPESCA', 'INDAP', 'INAI', 'INPI',
  'ONU', 'OIT', 'OEA', 'CIDH', 'CEPAL', 'UNESCO', 'UNICEF', 'ACNUR',
  'FAO', 'PNUD', 'OMS', 'BID', 'CLPI', 'FPIC', 'REDD',
  'MPF', 'CEDH', 'CNDH', 'FUNAI', 'INCRA', 'IBAMA', 'UFAL',
  'ONG', 'ONGs', 'EE', 'UU', 'GIZ', 'USAID', 'IPBES', 'COP',
]

/**
 * Toponimos y nombres de pueblo. La forma canonica lleva la capitalizacion
 * correcta, incluidas las particulas ("La Araucania").
 */
const PROPER_NOUNS = [
  'Chile', 'Argentina', 'Bolivia', 'Peru', 'Perú', 'Ecuador', 'Colombia',
  'Brasil', 'Mexico', 'México', 'Guatemala', 'Honduras', 'Nicaragua',
  'Panama', 'Panamá', 'Paraguay', 'Uruguay', 'Venezuela', 'Canada', 'Canadá',
  'Sonora', 'Coahuila', 'Chihuahua', 'Oaxaca', 'Chiapas', 'Guerrero',
  'Hidalgo', 'Yucatan', 'Yucatán', 'Michoacan', 'Michoacán', 'Sinaloa',
  'Amazonia', 'Amazonía', 'Patagonia', 'Wallmapu', 'Araucania', 'Araucanía',
  'Temuco', 'Santiago', 'Bariloche', 'Nariño', 'Cauca', 'Vichada',
  'Mapuche', 'Aymara', 'Quechua', 'Rapa Nui', 'Yanomami', 'Guarani', 'Guaraní',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Devuelve el texto con las siglas y nombres propios en su forma canonica.
 *
 * Compara sin distinguir mayusculas y exige limites de palabra, asi que
 * "chilena" o "cooperacion" no se tocan. Si el texto ya viene bien escrito, la
 * sustitucion es un no-op, por eso es seguro aplicarlo a todo titulo.
 */
export function fixCapitalization(text: string): string {
  let out = text

  for (const canonical of [...ACRONYMS, ...PROPER_NOUNS]) {
    const re = new RegExp(`\\b${escapeRegex(canonical)}\\b`, 'gi')
    out = out.replace(re, canonical)
  }

  // "La Araucania" tras el paso anterior puede haber quedado como "la Araucania".
  out = out.replace(/\bla (Araucan(?:i|í)a)\b/g, 'La $1')

  return out
}

/** Variante tolerante a null, para usar directo sobre campos opcionales. */
export function fixCapitalizationOrNull(text: string | null | undefined): string | null {
  if (!text) return null
  return fixCapitalization(text)
}
