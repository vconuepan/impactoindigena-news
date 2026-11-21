/**
 * Señales de un beacon que se reducen ANTES de guardarse.
 *
 * Regla de la Fundacion (CLAUDE.md, «El origen etnico es dato sensible»): un
 * navegador configurado en quechua o mapudungun revela con alta probabilidad el
 * origen etnico de quien lee. Por eso el idioma se usa solo en el momento y se
 * guarda reducido a «coherente / incoherente / sin_dato». El codigo de la lengua
 * no se escribe en ninguna parte.
 */

export type Coherencia = 'coherente' | 'incoherente' | 'sin_dato'

/** Idiomas del sitio y de su audiencia. */
const DEL_SITIO = new Set(['es', 'pt', 'en'])

/**
 * Lenguas indigenas de las Americas y de otros pueblos que cubre el sitio. Un
 * navegador en estas lenguas es lector, no robot: cuenta como coherente, y por
 * eso mismo nunca se guarda cual era.
 */
const INDIGENAS = new Set([
  'qu', 'quz', 'quy', 'qub', 'ay', 'aym', 'gn', 'grn', 'gug', 'arn', 'nah', 'nhe', 'nhn', 'yua', 'quc', 'cak',
  'mam', 'tzo', 'tzh', 'zap', 'mix', 'oto', 'maz', 'chr', 'nv', 'oj', 'cr', 'iu', 'kl', 'mi', 'haw', 'se', 'rap',
])

/** Idioma principal del encabezado Accept-Language, reducido a coherencia. */
export function coherenciaIdioma(acceptLanguage: string | undefined | null): Coherencia {
  if (!acceptLanguage || !acceptLanguage.trim()) return 'sin_dato'
  const primero = acceptLanguage.split(',')[0].split(';')[0].trim().toLowerCase()
  const base = primero.split('-')[0]
  if (!base || base === '*') return 'sin_dato'
  return DEL_SITIO.has(base) || INDIGENAS.has(base) ? 'coherente' : 'incoherente'
}

export type TipoPagina = 'ficha' | 'busqueda' | 'otra'

export function tipoDePagina(path: string): TipoPagina {
  if (/^\/(en\/)?stories\//.test(path)) return 'ficha'
  if (/^\/(en\/)?search\/?$/.test(path)) return 'busqueda'
  return 'otra'
}
