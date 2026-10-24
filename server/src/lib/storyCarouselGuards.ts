/**
 * Candados del carrusel de una noticia: lo que el texto de las láminas no puede
 * decir aunque el modelo (o quien lo edite) lo escriba.
 *
 * POR QUE EN CODIGO. Son reglas binarias, y una instrucción al modelo es blanda:
 * reforzar una regla de formato en el prompt tuvo efecto cero en agosto de 2026.
 * El prompt las pide igual; estas funciones las hacen cumplir en el único punto
 * por donde sale el carrusel, que es el dibujo de las láminas.
 *
 * LAS DOS REGLAS.
 *
 * 1. Una cita entre comillas tiene que estar letra por letra en el artículo
 *    original. Lo que alguien dijo en otro idioma va en estilo indirecto, sin
 *    comillas: una traducción entre comillas le atribuye a la persona palabras
 *    que no dijo.
 *
 * 2. La identidad indígena no se atribuye desde afuera. Si una lámina dice
 *    «indígena» o nombra a un pueblo, el artículo tiene que decirlo. El caso
 *    medido es del 8-sep-2026: la ficha de Voces tituló «familias indígenas»
 *    donde el reportaje de Mongabay hablaba de familias y comunidades locales y
 *    no usaba nunca la palabra.
 *
 * Y una tercera, que salió de la primera prueba con una noticia real
 * (23-oct-2026): el modelo escribió «el 19 de octubre de 2024» donde Mongabay
 * decía «el lunes 19 de octubre», y la noticia es de 2026.
 *
 * 3. Toda cifra de una lámina informativa está en el original. Un año o un
 *    número que el medio no dio es un dato inventado con la firma del medio al
 *    pie. No se aplica a la lectura, que es opinión y puede citar una norma.
 *
 * El texto se compara normalizado (minúsculas, sin tildes, comillas y espacios
 * unificados), así que «Mapuche» encuentra «mapuches» y «Aimara» encuentra
 * «aymara». No es un detector de pueblos ni sirve para clasificar a nadie: solo
 * comprueba que el carrusel no nombre algo que el medio no nombró.
 */

export interface CarouselSlideText {
  titulo: string
  texto: string
}

export type AvisoTipo = 'cita' | 'cifra' | 'identidad' | 'pueblo' | 'espacio'

export interface CarouselAviso {
  /** Índice de la lámina en `laminas` (desde 0), o 'lectura'. */
  lamina: number | 'lectura'
  tipo: AvisoTipo
  mensaje: string
}

/** Minúsculas, sin tildes, comillas y espacios unificados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B\u00B4`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quita la puntuación de los bordes, que el autor de la lámina pone o saca. */
function recortarPuntuacion(texto: string): string {
  return texto.replace(/^[\s.,;:¡!¿?…'"-]+|[\s.,;:¡!¿?…'"-]+$/g, '')
}

// ---------------------------------------------------------------------------
// Regla 1 · citas textuales
// ---------------------------------------------------------------------------

/** Los fragmentos entre comillas de un texto: «…», “…” y "…". */
export function extraerCitas(texto: string): string[] {
  const citas: string[] = []
  const patrones = [/\u00AB([^\u00BB]+)\u00BB/g, /\u201C([^\u201D]+)\u201D/g, /"([^"]+)"/g]
  for (const patron of patrones) {
    for (const m of texto.matchAll(patron)) citas.push(m[1])
  }
  return citas
}

/**
 * ¿Está la cita letra por letra en el original? Una elipsis («…» o «...»)
 * separa fragmentos, y cada uno tiene que estar.
 */
export function citaEsTextual(cita: string, original: string): boolean {
  const fuente = normalizar(original)
  const fragmentos = normalizar(cita)
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map(recortarPuntuacion)
    .filter(Boolean)
  if (fragmentos.length === 0) return true
  return fragmentos.every((f) => fuente.includes(f))
}

// ---------------------------------------------------------------------------
// Regla 2 · identidad y pueblos
// ---------------------------------------------------------------------------

/**
 * Pueblos que se nombran en la cobertura de Voces, cada uno con sus grafías.
 * Los once de la Ley 19.253 (art. 1°) van primero, con las identidades
 * territoriales mapuche; después, los que más aparecen en la prensa de la
 * región y del mundo.
 *
 * Quedan fuera a propósito los nombres que también son palabra corriente,
 * porque harían saltar el candado por un verbo: «Cree» (cree), «Nasa» (NASA),
 * «Maya» (nombre de pila), «Toba» (el lago), «Diné» (dine) y «Ona» (ona).
 */
const PUEBLOS: string[][] = [
  ['mapuche'],
  ['aymara', 'aimara'],
  ['rapa nui', 'rapanui'],
  ['atacameno', 'lickanantay', 'likan antai', 'lican antay'],
  ['quechua', 'kichwa', 'quichua'],
  ['colla', 'koya'],
  ['diaguita'],
  ['chango'],
  ['kawesqar', 'kaweskar', 'kawashkar', 'alacalufe'],
  ['yagan', 'yamana'],
  ["selk'nam", 'selknam'],
  ['lafkenche', 'lafquenche'],
  ['pehuenche', 'pewenche'],
  ['huilliche', 'williche'],
  ['nagche', 'wenteche', 'pikunche', 'picunche'],
  ['guarani'],
  ['wayuu'],
  ['shuar'],
  ['ashaninka'],
  ['yanomami'],
  ['mayangna', 'mayagna', 'sumu'],
  ['miskitu', 'miskito', 'misquito'],
  ['garifuna'],
  ['embera'],
  ['guna', 'kuna'],
  ['qom'],
  ['wichi'],
  ['awajun'],
  ['shipibo'],
  ['munduruku'],
  ['kayapo'],
  ['guajajara'],
  ['xavante'],
  ['ticuna', 'tikuna'],
  ['arhuaco'],
  ['kogui'],
  ['wiwa'],
  ['misak'],
  ['zenu'],
  ['pemon'],
  ['warao'],
  ['lenca'],
  ['raramuri', 'tarahumara'],
  ['yaqui'],
  ['purepecha'],
  ['otomi', 'hnahnu'],
  ['tsotsil', 'tzotzil'],
  ['tseltal', 'tzeltal'],
  ['zapoteco', 'zapotec'],
  ['mixteco', 'mixtec'],
  ['nahua', 'nahuatl'],
  ['inuit'],
  ['sami', 'saami'],
  ['maori'],
  ['navajo'],
  ['lakota'],
  ['ojibwe', 'anishinaabe'],
  ['mohawk', 'kanienkehaka'],
]

/** Plural opcional en castellano: mapuches, aimaras, guaraníes. */
function patronDe(grafia: string): RegExp {
  const base = grafia.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z])${base}(s|es)?($|[^a-z])`)
}

const PATRONES_PUEBLOS = PUEBLOS.map((grafias) => ({
  nombre: grafias[0],
  patrones: grafias.map(patronDe),
}))

/** Palabras con que una lámina atribuye identidad indígena. */
const IDENTIDAD_EN_LAMINA = [
  /(^|[^a-z])indigenas?($|[^a-z])/,
  /(^|[^a-z])indigenous($|[^a-z])/,
  /(^|[^a-z])pueblos? originarios?($|[^a-z])/,
  /(^|[^a-z])primeras naciones($|[^a-z])/,
  /(^|[^a-z])first nations?($|[^a-z])/,
  /(^|[^a-z])aborigen(es)?($|[^a-z])/,
]

/** Lo que en el original respalda decir «indígena»: la palabra o un pueblo. */
const IDENTIDAD_EN_FUENTE = /indigen|originari|aborig|first nation|primeras naciones|native american|autoctono/

function nombraPueblo(textoNormalizado: string, patrones: RegExp[]): boolean {
  return patrones.some((p) => p.test(textoNormalizado))
}

/** Los pueblos que nombra un texto y que el original no nombra. */
export function pueblosSinRespaldo(texto: string, original: string): string[] {
  const t = normalizar(texto)
  const fuente = normalizar(original)
  return PATRONES_PUEBLOS
    .filter(({ patrones }) => nombraPueblo(t, patrones) && !nombraPueblo(fuente, patrones))
    .map(({ nombre }) => nombre)
}

/** ¿Dice el texto «indígena» (o equivalente) sin que el original lo respalde? */
export function identidadSinRespaldo(texto: string, original: string): boolean {
  const t = normalizar(texto)
  if (!IDENTIDAD_EN_LAMINA.some((p) => p.test(t))) return false
  const fuente = normalizar(original)
  if (IDENTIDAD_EN_FUENTE.test(fuente)) return false
  return !PATRONES_PUEBLOS.some(({ patrones }) => nombraPueblo(fuente, patrones))
}

/**
 * El tema de Voces para la píldora de la portada, o vacío si el original no lo
 * respalda. El tema lo asigna la IA de Voces: «Derechos Indígenas» sobre una
 * nota que nunca dice «indígena» (el caso Intag) le pondría a la portada la
 * etiqueta que el medio no puso.
 */
export function temaRespaldado(tema: string, original: string): string {
  if (!tema) return ''
  if (identidadSinRespaldo(tema, original) || pueblosSinRespaldo(tema, original).length > 0) return ''
  return tema
}

// ---------------------------------------------------------------------------
// Regla 3 · cifras
// ---------------------------------------------------------------------------

/**
 * Las cifras de un texto, partidas en sus grupos de dígitos: «23.211», «23 211»
 * y «23,211» dan los mismos grupos, así que se comparan sin importar cómo
 * separe los miles cada medio.
 */
function gruposDeDigitos(texto: string): string[] {
  return texto.match(/\d+/g) ?? []
}

/** Las cifras de la lámina que no aparecen en el original. */
export function cifrasSinRespaldo(texto: string, original: string): string[] {
  const enFuente = new Set(gruposDeDigitos(original))
  const faltan = new Set<string>()
  for (const m of texto.matchAll(/\d+(?:[.,\s]\d+)*/g)) {
    if (gruposDeDigitos(m[0]).some((g) => !enFuente.has(g))) faltan.add(m[0].trim())
  }
  return [...faltan]
}

// ---------------------------------------------------------------------------
// Revisión de un carrusel completo
// ---------------------------------------------------------------------------

function revisarLamina(
  lamina: CarouselSlideText,
  indice: number | 'lectura',
  original: string,
): CarouselAviso[] {
  const avisos: CarouselAviso[] = []
  const texto = `${lamina.titulo}\n${lamina.texto}`

  for (const cita of extraerCitas(texto)) {
    if (!citaEsTextual(cita, original)) {
      avisos.push({
        lamina: indice,
        tipo: 'cita',
        mensaje: `La cita «${cita.trim()}» no está tal cual en el artículo original. Si es una traducción o una paráfrasis, va sin comillas, en estilo indirecto.`,
      })
    }
  }

  if (identidadSinRespaldo(texto, original)) {
    avisos.push({
      lamina: indice,
      tipo: 'identidad',
      mensaje: 'Dice «indígena», y el artículo original no atribuye identidad indígena a nadie. Usa las palabras del medio.',
    })
  }

  if (indice !== 'lectura') {
    for (const cifra of cifrasSinRespaldo(texto, original)) {
      avisos.push({
        lamina: indice,
        tipo: 'cifra',
        mensaje: `La cifra «${cifra}» no aparece en el artículo original. Si es un año o un dato que el medio no da, quítala.`,
      })
    }
  }

  for (const pueblo of pueblosSinRespaldo(texto, original)) {
    avisos.push({
      lamina: indice,
      tipo: 'pueblo',
      mensaje: `Nombra al pueblo ${pueblo}, y el artículo original no lo nombra. Usa las palabras del medio.`,
    })
  }

  return avisos
}

/** Todos los avisos de un carrusel contra el texto del artículo original. */
export function revisarCarrusel(
  laminas: CarouselSlideText[],
  lectura: CarouselSlideText | null,
  original: string,
): CarouselAviso[] {
  const avisos = laminas.flatMap((l, i) => revisarLamina(l, i, original))
  if (lectura) avisos.push(...revisarLamina(lectura, 'lectura', original))
  return avisos
}
