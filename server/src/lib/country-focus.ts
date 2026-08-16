/**
 * Normalizacion del pais que devuelve el clasificador.
 *
 * El modelo responde con el nombre en español ("Chile", "Brasil"); esto lo
 * lleva a ISO 3166-1 alfa-2, que es lo que guarda `Story.countryFocus`.
 *
 * POR QUE NO SE LE PIDE EL CODIGO AL MODELO: es exactamente el caso de la
 * leccion del 15-ago-2026 con la capitalizacion de titulos. Escribir "Chile"
 * es algo que un LLM hace bien; mapear a "CL" sin equivocarse nunca es una
 * regla binaria, y una regla binaria va en el codigo. Ver
 * `lib/title-capitalization.ts` y `.context/llm-analysis.md`.
 *
 * Lo que no reconoce devuelve null, y null significa "sin pais", que es un
 * valor legitimo: la mayoria de los articulos son regionales o globales.
 * Prefiere no marcar antes que marcar mal — una historia sin marca simplemente
 * no aparece en la seccion de su pais, mientras que una marca equivocada la
 * pone en la seccion de otro.
 */

/**
 * Temas que agrupan por geografia, no por asunto.
 *
 * "Chile Intercultural" es una seccion del sitio como cualquier otra, pero su
 * criterio es el pais. Mezclar los dos ejes hacia que una noticia chilena de
 * derechos terminara solo en Chile y desapareciera de Derechos Indigenas: al
 * 15-ago-2026 habia 94 historias chilenas repartidas en las otras tres
 * secciones y ausentes de la suya.
 *
 * El clasificador NO recibe estos temas como opcion. Ofrecerselos mientras se
 * le pide clasificar por asunto central seria una contradiccion, y los modelos
 * gastan razonamiento tratando de reconciliarlas (`.context/prompting.md`).
 */
export const GEOGRAPHIC_ISSUE_SLUGS = ['chile-indigena'] as const

/** Pais que alimenta cada seccion geografica, en ISO 3166-1 alfa-2. */
export const GEOGRAPHIC_ISSUE_COUNTRY: Record<string, string> = {
  'chile-indigena': 'CL',
}

/** Nombre en español (normalizado, sin tildes ni mayusculas) → ISO 3166-1 alfa-2. */
const BY_NAME: Record<string, string> = {
  chile: 'CL',
  argentina: 'AR',
  bolivia: 'BO',
  brasil: 'BR',
  brazil: 'BR',
  canada: 'CA',
  colombia: 'CO',
  'costa rica': 'CR',
  ecuador: 'EC',
  'el salvador': 'SV',
  guatemala: 'GT',
  guyana: 'GY',
  honduras: 'HN',
  mexico: 'MX',
  nicaragua: 'NI',
  panama: 'PA',
  paraguay: 'PY',
  peru: 'PE',
  surinam: 'SR',
  uruguay: 'UY',
  venezuela: 'VE',
  'estados unidos': 'US',
  'united states': 'US',
  eeuu: 'US',
  'nueva zelanda': 'NZ',
  australia: 'AU',
  noruega: 'NO',
  suecia: 'SE',
  finlandia: 'FI',
  rusia: 'RU',
  india: 'IN',
  nepal: 'NP',
  indonesia: 'ID',
  filipinas: 'PH',
  malasia: 'MY',
  camboya: 'KH',
  bangladesh: 'BD',
  tailandia: 'TH',
  vietnam: 'VN',
  japon: 'JP',
  taiwan: 'TW',
  kenia: 'KE',
  tanzania: 'TZ',
  namibia: 'NA',
  nigeria: 'NG',
  camerun: 'CM',
  congo: 'CD',
  sudafrica: 'ZA',
  mozambique: 'MZ',
  etiopia: 'ET',
  groenlandia: 'GL',
}

/**
 * Valores que el modelo devuelve para decir "ninguno" y que NO son paises.
 * Sin esto, "global" o "varios" entrarian como texto libre a la columna.
 */
const NOT_A_COUNTRY = new Set([
  '', 'ninguno', 'ninguna', 'n/a', 'na', 'global', 'mundial', 'internacional',
  'regional', 'varios', 'multiple', 'multiples', 'america latina', 'latinoamerica',
  'amazonia', 'africa', 'asia', 'europa', 'oceania', 'america', 'desconocido',
])

/** Quita tildes y normaliza para comparar sin depender de como venga escrito. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marcas diacriticas
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Devuelve el codigo ISO 3166-1 alfa-2 del pais, o null si no se reconoce.
 *
 * Acepta tambien un codigo ya normalizado ("CL"), asi que es idempotente: se
 * puede aplicar dos veces sin cambiar el resultado.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null

  const folded = fold(value)
  if (NOT_A_COUNTRY.has(folded)) return null

  const byName = BY_NAME[folded]
  if (byName) return byName

  // Ya viene como codigo ISO.
  const upper = value.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(upper) && Object.values(BY_NAME).includes(upper)) {
    return upper
  }

  return null
}
