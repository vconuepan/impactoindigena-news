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
 * Se aplica en los dos puntos donde el pipeline persiste un titulo
 * —`services/analysis.ts` (espanol) y `services/translation.ts` (ingles)— y
 * en el script que repara el archivo historico. El segundo se sumo el
 * 15-ago-2026: el traductor es otro LLM y comete el mismo error, pero escribia
 * `titleEn`/`titleLabelEn` sin pasar por aca.
 *
 * SEGUNDA MEDICION, 15-ago-2026: el guardarrail tampoco alcanzo solo. De 12
 * historias rastreadas despues del despliegue, 3 salieron con el defecto
 * ("semarnat", "mozambique", "canada" en minuscula) contra una tasa base de
 * 462/2000 = 23,1%. Dos causas distintas, las dos corregidas aca: el `\b` no
 * entendia acentos (ver NOT_LETTER_BEFORE) y la lista no conocia esos
 * terminos.
 *
 * CUIDADO AL MEDIR ESTE ARCHIVO: correr `fixCapitalization` sobre los titulos
 * publicados para ver "cuantos quedan rotos" da siempre cero y no prueba nada
 * — es la misma lista blanca que aplica el guardarrail, y una lista solo puede
 * fallar en los terminos que no conoce. Hay que mirar la clase completa del
 * defecto: siglas y toponimos en minuscula, esten o no en la lista.
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
  'FILAC', 'SEMARNAT', 'TEPJF', 'CJNG', 'FARC',
]

/**
 * Toponimos y nombres de pueblo. La forma canonica lleva la capitalizacion
 * correcta, incluidas las particulas ("La Araucania").
 */
const PROPER_NOUNS = [
  'Chile', 'Argentina', 'Bolivia', 'Peru', 'Perú', 'Ecuador', 'Colombia',
  'Brasil', 'Mexico', 'México', 'Guatemala', 'Honduras', 'Nicaragua',
  'Panama', 'Panamá', 'Paraguay', 'Uruguay', 'Venezuela', 'Canada', 'Canadá',
  'Costa Rica', 'Nueva York', 'Nueva Zelanda',
  'Sonora', 'Coahuila', 'Chihuahua', 'Oaxaca', 'Chiapas', 'Guerrero',
  'Hidalgo', 'Yucatan', 'Yucatán', 'Michoacan', 'Michoacán', 'Sinaloa',
  'Puebla', 'Tabasco', 'Chubut', 'Neuquen', 'Neuquén', 'Putumayo', 'Guajira',
  'Tarapaca', 'Tarapacá', 'Biobío', 'Choco', 'Chocó', 'Ucayali',
  'Amazonia', 'Amazonía', 'Amazonas', 'Patagonia', 'Wallmapu', 'Araucania', 'Araucanía',
  'Temuco', 'Santiago', 'Bariloche', 'Nariño', 'Cauca', 'Vichada', 'Alaska',
  'India', 'Nepal', 'Indonesia', 'Filipinas', 'Malasia', 'Camboya', 'Bangladesh',
  'Papua', 'Papúa', 'Rusia', 'Australia', 'Kenia', 'Tanzania', 'Namibia',
  'Nigeria', 'Congo', 'Mozambique',
  'Mapuche', 'Aymara', 'Quechua', 'Rapa Nui', 'Yanomami', 'Guarani', 'Guaraní',
  // Sumados el 18-ago-2026: aparecieron en minuscula en titulos publicados.
  // Solo TOPONIMOS. Los nombres de pueblo usados como gentilicio van en
  // minuscula en espanol ("lideresas wayuu", "comunidad huilliche"), y hay un
  // test que lo documenta. Capitalizarlos produce "rana Pehuenche".
  'Maule', 'Ñuble', 'Coquimbo', 'Atacama', 'Antofagasta', 'Valparaiso', 'Valparaíso',
  'Magallanes', 'Aysen', 'Aysén', 'Osorno', 'Valdivia',
  'Arauco', 'Cautin', 'Cautín', 'Malleco', 'Calama', 'Iquique', 'Arica',
  'Jujuy', 'Formosa', 'Rio Negro', 'Río Negro', 'Mendoza',
  'Amazonas', 'Pará', 'Roraima', 'Maranhao', 'Maranhão',
  'Cusco', 'Loreto', 'Madre de Dios', 'Junin', 'Junín',
  'Israel', 'Palestina', 'Groenlandia', 'Noruega', 'Suecia', 'Finlandia',
  'Taiwan', 'Taiwán', 'Vietnam', 'Birmania', 'Etiopia', 'Etiopía', 'Botsuana',
]

/**
 * Toponimos que llevan articulo. Se corrigen despues de la pasada principal,
 * que deja el nombre bien pero el articulo en minuscula ("la Araucania").
 */
const ARTICLED = ['Araucania', 'Araucanía', 'Guajira']

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Limites de palabra que entienden el espanol.
 *
 * NO se usa `\b`, y esa es la correccion del 15-ago-2026. El `\b` de
 * JavaScript define "caracter de palabra" como `[A-Za-z0-9_]`, asi que una
 * vocal acentuada cuenta como separador. Consecuencia medida en produccion:
 * toda entrada que TERMINA en vocal acentuada —Peru, Panama, Canada,
 * Guarani— nunca llegaba a coincidir, porque `\b` exigia un borde entre la
 * vocal final y el espacio siguiente, y entre dos no-caracteres de palabra no
 * hay borde. Se publico un titular con "canada" en minuscula el 15-ago a las
 * 00:03 UTC, con Canada ya en la lista.
 *
 * Los lookarounds Unicode arreglan las dos direcciones y de paso cierran un
 * falso positivo que `\b` tenia abierto: la palabra "bide" ya no se convierte
 * en "BIDe".
 */
const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])'

/**
 * Pone en mayuscula la primera letra del titulo.
 *
 * POR QUE FALTABA, y por que es el hueco mas visible que tuvo este archivo:
 * la instruccion del esquema dice "capitalizacion estilo oracion: minusculas
 * salvo nombres propios", y el modelo la cumple al pie de la letra —incluida
 * la primera letra—. La instruccion nunca la exceptuo. Medido el 18-ago-2026
 * sobre 200 titulos publicados: **148 empezaban en minuscula, el 74%**, de
 * forma sostenida dia tras dia. `DESIGN.md` prohibe eso desde el 12-jun-2026
 * ("Titulos en Title Case — NUNCA en minusculas").
 *
 * Se aclaro tambien la instruccion del esquema, pero eso es el cinturon: la
 * leccion de este archivo es que una instruccion al LLM es BLANDA, y una regla
 * binaria necesita el codigo.
 *
 * NO toca palabras con mayuscula interna: "iPhone" o "eSports" quedan igual,
 * porque capitalizar ahi seria romper un nombre propio, no arreglarlo.
 */
function capitalizeFirstLetter(text: string): string {
  const i = text.search(/\p{L}/u)
  if (i === -1) return text

  // Si la primera palabra ya trae una mayuscula adentro, es intencional.
  const primeraPalabra = text.slice(i).split(/[\s\u00A0]/, 1)[0]
  if (/\p{Lu}/u.test(primeraPalabra)) return text

  return text.slice(0, i) + text[i].toUpperCase() + text.slice(i + 1)
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
    const re = new RegExp(`${NOT_LETTER_BEFORE}${escapeRegex(canonical)}${NOT_LETTER_AFTER}`, 'giu')
    out = out.replace(re, canonical)
  }

  // "La Araucania" tras el paso anterior puede haber quedado como "la Araucania".
  for (const name of ARTICLED) {
    const re = new RegExp(`${NOT_LETTER_BEFORE}la (${escapeRegex(name)})${NOT_LETTER_AFTER}`, 'gu')
    out = out.replace(re, 'La $1')
  }

  return out
}

/** Variante tolerante a null, para usar directo sobre campos opcionales. */
export function fixCapitalizationOrNull(text: string | null | undefined): string | null {
  if (!text) return null
  return fixCapitalization(text)
}

/**
 * Igual que `fixCapitalization`, pero ademas pone en mayuscula la primera letra.
 *
 * SOLO para titulares. Las etiquetas (`titleLabel`) van en minuscula a
 * proposito —en produccion son "cacería subsistencia", "territorios
 * ancestrales"— y capitalizarlas romperia el kicker de la tarjeta.
 */
export function fixTitleCapitalization(text: string): string {
  return fixCapitalization(capitalizeFirstLetter(text))
}

/** Variante tolerante a null de `fixTitleCapitalization`. */
export function fixTitleCapitalizationOrNull(text: string | null | undefined): string | null {
  if (!text) return null
  return fixTitleCapitalization(text)
}
