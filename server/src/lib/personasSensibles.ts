/**
 * Candado de personas: lo que un texto que escribe el modelo no le pone a una
 * persona, aunque el modelo lo escriba.
 *
 * Son las salvaguardas 2 y 3 de la evaluación de interés legítimo (EILE v1.2,
 * §7), adoptadas como regla editorial por el director el 6-nov-2026 (decisión C1
 * de `.plans/2026-11-06_origen-etnico-menores-victimas.md`). La regla completa va
 * en los prompts (`REGLA_PERTENENCIA` y `REGLA_MENORES_VICTIMAS`, en
 * `prompts/shared.ts`). Este archivo hace cumplir la parte que se puede hacer
 * cumplir sin leer el original.
 *
 * QUÉ HACE. Edita, no rechaza:
 *  1. En la atribución de una cita («Nombre, cargo»), quita del cargo la
 *     etiqueta étnica («activista climática indígena» → «activista
 *     climática»), salvo que el cargo nombre una organización o una comunidad,
 *     o sea una autoridad tradicional: ahí es la organización la que la
 *     presenta, que es lo que la regla admite.
 *  2. En títulos, resúmenes y posts, quita la etiqueta pegada a un nombre:
 *     «el comunero mapuche Juan Pérez» → «el comunero Juan Pérez».
 *  3. Quita el nombre que sigue a «la niña», «el adolescente» o «la víctima»
 *     cuando el texto habla de un delito o de violencia (art. 33, Ley 19.733).
 *     Lo que no sabe editar sin romper la frase («Juan Pérez, de 15 años») lo
 *     cuenta como sospecha, para el log.
 *
 * QUÉ NO HACE. No sabe si el original muestra que la persona se presenta así,
 * así que prefiere no atribuir: es el sesgo que pide la EILE («no basta que un
 * medio lo haya dicho»). Solo mira la etiqueta en minúscula: «Ministerio de los
 * Pueblos Indígenas» o «Pedagogía en Lengua y Cultura Mapuche» son nombres
 * propios y no se tocan. No toca lo colectivo («la comunidad mapuche X», «el
 * pueblo wayuu»), que es un hecho y tiene su propio candado. Es un piso, no una
 * garantía: un nombre de una sola palabra o una etiqueta lejos del nombre pasan.
 *
 * MEDIDO el 6-nov-2026 sobre las 500 publicadas más recientes: 27 atribuciones
 * con etiqueta étnica sin organización y 6 títulos o resúmenes con «etiqueta +
 * nombre» (31 notas); 0 menores o víctimas nombrados. Los casos de los tests
 * tienen la misma forma con nombres inventados: el repo es público.
 */

import { PUEBLOS } from './storyCarouselGuards.js'

export type TipoDeLimpieza = 'pertenencia' | 'menor' | 'victima'

export interface Limpieza {
  texto: string | null
  /** Qué se quitó, una entrada por cada cambio. Sin texto: el log no guarda nombres. */
  cambios: TipoDeLimpieza[]
  /** Un posible menor nombrado que no se supo editar («Nombre, de 15 años»). */
  sospechas: number
}

/**
 * Pueblos que aparecieron como etiqueta sobre personas en la medición del
 * 6-nov-2026 y no están en `PUEBLOS`. Sin palabras corrientes: quedan fuera
 * «mayo» (el mes), «san» y «awá».
 */
const PUEBLOS_EXTRA = [
  'cabecar', 'harakmbut', 'wiradjuri', 'kiowa', 'molbog', 'dayak', 'nomatsigenga', 'nomndaa', 'amuzgo',
  'kanamari', 'triqui', 'kaiowa', 'yoreme', 'achuar', 'waorani', 'mixe', 'chatino', 'tojolabal', 'kaqchikel',
  'cherokee', 'apache', 'mescalero', 'dakota', 'hopi', 'yupik',
]

const CLASE: Record<string, string> = {
  a: '[aáàâä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôö]', u: '[uúùûü]', n: '[nñ]',
}

/** Una grafía como patrón que acepta tildes y la eñe, en minúscula. */
function flexible(grafia: string): string {
  return [...grafia]
    .map((c) => {
      if (CLASE[c]) return CLASE[c]
      if (c === ' ') return '\\s+'
      if (c === "'") return "['’]?"
      return c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
    })
    .join('')
}

const INICIO = '(?<![\\p{L}\\p{N}])'
const FIN = '(?![\\p{L}\\p{N}])'

const GRAFIAS = [...PUEBLOS.flat(), ...PUEBLOS_EXTRA].sort((a, b) => b.length - a.length)
/** Un pueblo en minúscula, con plural y compuestos: «mapuches», «shipibo-conibo». */
const PUEBLO = `(?:${GRAFIAS.map(flexible).join('|')})(?:es|s)?(?:-[\\p{Ll}]+)*`
const INDIGENA = '(?:afro-?)?ind[ií]genas?'
const MAYUSCULA = "\\p{Lu}[\\p{L}'’-]*"
/** Un nombre propio de persona: una o dos palabras con mayúscula. */
const NOMBRE = `\\p{Lu}\\p{Ll}[\\p{L}'’-]*(?:\\s+\\p{Lu}\\p{Ll}[\\p{L}'’-]*)?`

/** El cargo nombra una organización o una comunidad: la que presenta a la persona. */
const ORGANIZACION = new RegExp(
  `${INICIO}(comunidad(es)?|lof|asociaci[oó]n|organizaci[oó]n|consejo|naci[oó]n|confederaci[oó]n|federaci[oó]n|` +
    `coordinadora|parlamento|cabildo|resguardo|tribu|alianza|movimiento|frente|uni[oó]n|asamblea|colectivo|` +
    `cooperativa|nation|tribe|council|band|first nations?)${FIN}`,
  'iu',
)
const AUTORIDAD = new RegExp(
  `${INICIO}(lonko|longko|logko|werken|machi|[ñn]idol|nguillatufe|cacique|kimche|autoridad tradicional)${FIN}`,
  'iu',
)
const SE_PRESENTA = /se (identifica|define|reconoce|presenta) como|self-identif/i

/** Palabras que hacen de la etiqueta un complemento y no un rasgo de la persona: «de moda indígena». */
const PREPOSICION = /^(de|del|al|a|por|sobre|en|para|con|contra|entre|hacia|desde|hasta|según|sin)$/i
/** La palabra de antes es colectiva: «comunidad mapuche», «pueblo wayuu», «mujeres indígenas». */
const COLECTIVO = new RegExp(
  '^(comunidad(es)?|lof|pueblos?|naci[oó]n(es)?|territorios?|organizaci[oó]n(es)?|asociaci[oó]n(es)?|consejos?|' +
    'lenguas?|idiomas?|cultura|cosmovisi[oó]n|tierras?|zonas?|regi[oó]n|sector|patrimonio|arte|medicina|' +
    'tradici[oó]n(es)?|conocimientos?|derechos?|movimiento|familias|mujeres|hombres|j[oó]venes|niñ[oa]s|' +
    'educaci[oó]n|salud|justicia|autonom[ií]a|identidad|resistencia|causa|lucha|parlamento|cabildo|resguardo|' +
    'reserva|escuela|radio|ceremonia|festival|feria|museo|centro|communities|community|peoples?|nations?|' +
    'lands?|territory|territories|rights|women|youth|children|groups?|organizations?|councils?|tribes?|' +
    'languages?|culture|knowledge|art|history)$',
  'iu',
)

function palabrasAntes(texto: string, hasta: number, n: number): string[] {
  return texto.slice(0, hasta).split(/[\s,;:()«»"“”]+/).filter(Boolean).slice(-n)
}

/** ¿La etiqueta en esta posición es complemento de otra cosa y no de la persona? */
function esComplemento(texto: string, posicion: number): boolean {
  const antes = palabrasAntes(texto, posicion, 3)
  if (antes.some((p) => PREPOSICION.test(p))) return true
  const ultima = antes[antes.length - 1]
  return ultima !== undefined && COLECTIVO.test(ultima)
}

/**
 * Arregla lo que deja quitar una palabra: dos espacios, un espacio antes de la
 * coma. Sin tocar saltos de línea, que los posts de redes usan.
 */
function ordenarTexto(texto: string): string {
  return texto
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,;.])/g, '$1')
    .replace(/,[ \t]*,/g, ',')
}

/** Además, en un cargo, la conjunción que quedó colgando: «líder y», «senadora electa y mujer». */
function ordenarCargo(cargo: string): string {
  return ordenarTexto(
    cargo
      .replace(/\s+(?:y|e)\s+(?:y|e)\s+/g, ' y ')
      .replace(/\s+(?:y|e)\s+(?:mujer|hombre|persona)\s*(?=[,;.]|$)/g, '')
      .replace(/\s+(?:y|e)\s*(?=[,;.]|$)/g, ''),
  ).trim()
}

// ---------------------------------------------------------------------------
// 1 · La atribución de la cita
// ---------------------------------------------------------------------------

const RE_MIEMBRO = new RegExp(
  `\\s*(?:,\\s*|\\s+(?:y|e)\\s+)?(?:miembro|integrante|parte)\\s+del\\s+pueblo\\s+${MAYUSCULA}(?:\\s+${MAYUSCULA})?`,
  'gu',
)
const RE_INDIGENA_EN_CARGO = new RegExp(`\\s+${INICIO}${INDIGENA}${FIN}(?:\\s+(?!de${FIN}|del${FIN}|y${FIN}|e${FIN})${MAYUSCULA}){0,2}`, 'gu')
const RE_PUEBLO_EN_CARGO = new RegExp(`\\s+${INICIO}${PUEBLO}${FIN}(?:\\s+${PUEBLO}${FIN})*`, 'gu')

function quitarDelCargo(cargo: string, cambios: TipoDeLimpieza[]): string {
  let r = cargo.replace(RE_MIEMBRO, () => {
    cambios.push('pertenencia')
    return ''
  })
  for (const re of [RE_INDIGENA_EN_CARGO, RE_PUEBLO_EN_CARGO]) {
    r = r.replace(re, (m, ...args) => {
      const offset = args[args.length - 2] as number
      const texto = args[args.length - 1] as string
      if (esComplemento(texto, offset)) return m
      cambios.push('pertenencia')
      return ''
    })
  }
  return r
}

/**
 * «Nombre, cargo» sin la etiqueta étnica del cargo, salvo que el cargo nombre
 * a la organización o comunidad que presenta a la persona, o sea una autoridad
 * tradicional. Sin coma, es un nombre de persona u organización y no se toca.
 */
export function limpiarAtribucionDeCita(atribucion: string | null | undefined): Limpieza {
  if (!atribucion) return { texto: atribucion ?? null, cambios: [], sospechas: 0 }
  const coma = atribucion.indexOf(',')
  if (coma < 0) return { texto: atribucion, cambios: [], sospechas: 0 }
  const nombre = atribucion.slice(0, coma).trim()
  const cargo = atribucion.slice(coma + 1)
  if (ORGANIZACION.test(cargo) || AUTORIDAD.test(cargo) || SE_PRESENTA.test(cargo)) {
    return { texto: atribucion, cambios: [], sospechas: 0 }
  }
  const cambios: TipoDeLimpieza[] = []
  let limpio = ordenarCargo(` ${quitarDelCargo(cargo, cambios)}`)
  if (cambios.length === 0) return { texto: atribucion, cambios, sospechas: 0 }
  if (/^(mujer|hombre|persona)$/i.test(limpio)) limpio = ''
  return { texto: limpio ? `${nombre}, ${limpio}` : nombre, cambios, sospechas: 0 }
}

// ---------------------------------------------------------------------------
// 2 · Títulos, resúmenes y posts
// ---------------------------------------------------------------------------

const ES_PUEBLO = new RegExp(`^${PUEBLO}$`, 'iu')

/**
 * Cargos y roles de UNA persona, en singular. Lista cerrada a propósito: la
 * primera versión aceptaba cualquier palabra y, medida sobre las 500 notas del
 * 6-nov, tocaba «defensa indígena Ngäbe-Buglé» o «comarca indígena…», que no
 * son personas. Un plural («pescadores indígenas Baniwa») es colectivo y no se
 * toca. Las autoridades tradicionales no están: las presenta su comunidad.
 */
const ROL_PERSONA =
  '(?:l[ií]der|lideresa|dirigent[ea]|comuner[oa]|activista|defensor[a]?|vocer[oa]|artista|artesan[oa]|' +
  'm[uú]sico|m[uú]sica|cantante|cantautor[a]?|poeta|poetisa|escritor[a]?|investigador[a]?|acad[eé]mic[oa]|' +
  'profesor[a]?|docente|maestr[oa]|abogad[oa]|periodista|comunicador[a]?|cineasta|fot[oó]graf[oa]|' +
  'diseñador[a]?|chef|cociner[oa]|atleta|deportista|futbolista|m[eé]dic[oa]|partera|sanador[a]?|joven|mujer|' +
  'hombre|ancian[oa]|abuel[oa]|estudiante|candidat[oa]|senador[a]?|diputad[oa]|concejal[a]?|alcalde(?:sa)?|' +
  'gobernador[a]?|ministr[oa]|president[ea]|congresista|legislador[a]?|constituyente|convencional|' +
  'emprendedor[a]?|empresari[oa]|productor[a]?|agricultor[a]?|campesin[oa]|referente|integrante|miembro|' +
  'representante|actor|actriz|bailar[ií]n|bailarina|curador[a]?|cient[ií]fic[oa]|ingenier[oa]|ge[oó]graf[oa]|' +
  'antrop[oó]log[oa]|historiador[a]?|fil[oó]sof[oa]|pres[oa]|detenid[oa]|imputad[oa]|condenad[oa]|testigo|' +
  'trabajador[a]?|guardaparque|brigadista|comediante|rapero|rapera|influencer|creador[a]?|escultor[a]?|' +
  'pintor[a]?|tejedor[a]?|ceramista|guía|víctima|victima)'
const ROL_PERSONA_EN =
  '(?:leader|activist|artist|lawyer|attorney|candidate|senator|governor|councillor|councilor|congresswoman|' +
  'congressman|representative|actor|actress|writer|author|poet|scholar|researcher|journalist|filmmaker|' +
  'designer|chef|athlete|musician|singer|rapper|teacher|student|woman|man|advocate|organizer|curator|' +
  'photographer|healer|defender|entrepreneur|comedian|model|professor|doctor|nurse|midwife|farmer|fisherman)'

/** La primera letra también en mayúscula, con sus tildes: «Mapuche», «Aymara». */
function conMayuscula(grafia: string): string {
  const c = grafia[0]
  const clase = CLASE[c] ? CLASE[c].slice(1, -1) : c
  return `[${clase}${clase.toUpperCase()}]${flexible(grafia.slice(1))}`
}
/**
 * Pegada a un rol y a un nombre, la etiqueta puede venir con mayúscula: el
 * guardarraíl de mayúsculas del título (`lib/title-capitalization.ts`) escribe
 * «Mapuche» antes de que llegue este candado. Lo encontró el test de
 * `assessStory` el 6-nov-2026.
 */
const PUEBLO_CUALQUIERA = `(?:${GRAFIAS.map(conMayuscula).join('|')})(?:es|s)?(?:-[\\p{L}]+)*`
const ETIQUETAS = `(?:(?:[Ii]nd[ií]genas?|${PUEBLO_CUALQUIERA})${FIN}\\s+)+`
/** «rol + etiquetas + Nombre»: «la lideresa indígena Ana», «el líder indígena kichwa Juan». */
const RE_ROL_ETIQUETA_NOMBRE = new RegExp(`${INICIO}(${ROL_PERSONA})\\s+${ETIQUETAS}(?=(${NOMBRE}))`, 'gu')
/** «artículo + etiqueta + Nombre»: «el mapuche Juan Pérez». */
const RE_ARTICULO_ETIQUETA_NOMBRE = new RegExp(`${INICIO}(el|la|del|al)\\s+${ETIQUETAS}(?=(${NOMBRE}))`, 'gu')
const ETIQUETA_EN =
  `(?:Indigenous|Native|Aboriginal|${GRAFIAS.map((g) => g[0].toUpperCase() + flexible(g.slice(1))).join('|')})`
/** En inglés la etiqueta va antes del rol: «Mapuche leader Juan Pérez». */
const RE_ETIQUETA_ROL_NOMBRE_EN = new RegExp(
  `${INICIO}${ETIQUETA_EN}(?:\\s+${ETIQUETA_EN})*\\s+(${ROL_PERSONA_EN})(?=\\s+${NOMBRE})`,
  'gu',
)

function quitarPertenencia(texto: string, cambios: TipoDeLimpieza[]): string {
  let r = texto.replace(RE_ROL_ETIQUETA_NOMBRE, (m, rol: string, nombre: string) => {
    if (ES_PUEBLO.test(nombre.split(/\s+/)[0])) return m
    cambios.push('pertenencia')
    return `${rol} `
  })
  r = r.replace(RE_ARTICULO_ETIQUETA_NOMBRE, (m, articulo: string, nombre: string) => {
    if (ES_PUEBLO.test(nombre.split(/\s+/)[0])) return m
    cambios.push('pertenencia')
    if (articulo === 'del') return 'de '
    if (articulo === 'al') return 'a '
    return ''
  })
  r = r.replace(RE_ETIQUETA_ROL_NOMBRE_EN, (m, rol: string, offset: number, todo: string) => {
    cambios.push('pertenencia')
    // Al comienzo de la oración, el rol hereda la mayúscula de la etiqueta.
    const alComienzo = /(^|[.!?]\s+)$/.test(todo.slice(0, offset))
    return alComienzo ? rol[0].toUpperCase() + rol.slice(1) : rol
  })
  return r
}

// ---------------------------------------------------------------------------
// 3 · Menores y víctimas
// ---------------------------------------------------------------------------

const VIOLENCIA =
  /(asesin|homicid|crimen|delit|detenid|imputad|formalizad|condenad|dispar|balead|herid|agresi|abus|violaci|violad|secuestr|desaparec|muert|tortur|trata |explotaci|golpe|atacad|murder|killed|shot|abuse|rape|kidnap|arrest|charged|assault|traffick|torture)/i
const DELITO_ART_33 =
  /(violaci[oó]n|violad[ao]|abusos? sexual|agresi[oó]n sexual|explotaci[oó]n sexual|trata de personas|estupro|tortur|secuestr|rape|sexual (abuse|assault|exploitation)|traffick|kidnap)/i
const EDAD_MENOR = '(?:1[0-7]|[1-9])'

const RE_MENOR_NOMBRE = new RegExp(
  `${INICIO}((?:el|la|los|las|un|una|the)\\s+)?` +
    `(niñ[oa]|adolescente|menor(?:\\s+de\\s+edad)?|escolar|(?:estudiante|joven)\\s+de\\s+${EDAD_MENOR}\\s+años|` +
    `child|girl|boy|teen(?:ager)?|minor)(,?\\s+)(${NOMBRE})(?=[\\s,.;:)]|$)`,
  'gu',
)
const RE_VICTIMA_NOMBRE = new RegExp(
  `${INICIO}((?:el|la|una|un|the)\\s+)?(v[ií]ctima|victim)(,?\\s+)(${NOMBRE})(?=[\\s,.;:)]|$)`,
  'gu',
)
const RE_NOMBRE_EDAD = new RegExp(`${NOMBRE},\\s+(?:de\\s+${EDAD_MENOR}\\s+años|${EDAD_MENOR})${FIN}`, 'gu')

function quitarMenoresYVictimas(texto: string, cambios: TipoDeLimpieza[]): { texto: string; sospechas: number } {
  let r = texto
  if (VIOLENCIA.test(r)) {
    r = r.replace(RE_MENOR_NOMBRE, (m, articulo: string | undefined, rol: string, sep: string, nombre: string) => {
      if (ES_PUEBLO.test(nombre.split(/\s+/)[0])) return m
      cambios.push('menor')
      return `${articulo ?? ''}${rol}`
    })
  }
  if (DELITO_ART_33.test(r)) {
    r = r.replace(RE_VICTIMA_NOMBRE, (m, articulo: string | undefined, rol: string) => {
      cambios.push('victima')
      return `${articulo ?? ''}${rol}`
    })
  }
  const sospechas = VIOLENCIA.test(r) ? [...r.matchAll(RE_NOMBRE_EDAD)].length : 0
  return { texto: r, sospechas }
}

/**
 * Título, resumen, blurb o post, sin etiquetas étnicas sobre personas ni
 * menores o víctimas nombrados. Con `esCita`, solo lo segundo: una cita no se
 * reescribe por la pertenencia (cambiaría lo que alguien dijo), pero el nombre
 * de un menor o de una víctima sale también de una cita.
 */
export function limpiarTextoSobrePersonas(
  texto: string | null | undefined,
  { esCita = false }: { esCita?: boolean } = {},
): Limpieza {
  if (!texto) return { texto: texto ?? null, cambios: [], sospechas: 0 }
  const cambios: TipoDeLimpieza[] = []
  const sinEtiquetas = esCita ? texto : quitarPertenencia(texto, cambios)
  const { texto: final, sospechas } = quitarMenoresYVictimas(sinEtiquetas, cambios)
  return { texto: cambios.length > 0 ? ordenarTexto(final) : texto, cambios, sospechas }
}

// ---------------------------------------------------------------------------
// Varios campos de una vez, para el punto de escritura
// ---------------------------------------------------------------------------

export interface ResumenDeLimpieza {
  /** Campo → qué se quitó. Sin texto: es lo que va al log. */
  campos: Record<string, { cambios: TipoDeLimpieza[]; sospechas: number }>
  hubo: boolean
}

/**
 * Limpia los campos de texto de un registro antes de guardarlo: los de `texto`
 * enteros, los de `citas` solo de menores y víctimas, y los de `atribuciones`
 * como «Nombre, cargo». Los campos que no se nombran no se tocan. Devuelve un
 * registro nuevo; el original no se toca.
 */
export function limpiarCampos<T extends object>(
  registro: T,
  campos: { texto?: (keyof T)[]; citas?: (keyof T)[]; atribuciones?: (keyof T)[] },
): { registro: T; resumen: ResumenDeLimpieza } {
  const salida: Record<string, unknown> = { ...(registro as Record<string, unknown>) }
  const resumen: ResumenDeLimpieza = { campos: {}, hubo: false }
  const anotar = (campo: keyof T, l: Limpieza) => {
    if (l.cambios.length === 0 && l.sospechas === 0) return
    salida[campo as string] = l.texto
    resumen.campos[campo as string] = { cambios: l.cambios, sospechas: l.sospechas }
    resumen.hubo = true
  }
  const comoTexto = (v: unknown) => (typeof v === 'string' ? v : null)
  for (const c of campos.texto ?? []) anotar(c, limpiarTextoSobrePersonas(comoTexto(registro[c])))
  for (const c of campos.citas ?? []) anotar(c, limpiarTextoSobrePersonas(comoTexto(registro[c]), { esCita: true }))
  for (const c of campos.atribuciones ?? []) anotar(c, limpiarAtribucionDeCita(comoTexto(registro[c])))
  return { registro: salida as T, resumen }
}

/** El texto de un post de redes, limpio, y el resumen para el log si hubo cambios. */
export function limpiarPost(texto: string): { texto: string; resumen: ResumenDeLimpieza } {
  const { registro, resumen } = limpiarCampos({ post: texto }, { texto: ['post'] })
  return { texto: registro.post, resumen }
}
