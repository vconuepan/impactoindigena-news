/**
 * Candados de la nota con claves: lo que el cuerpo de una noticia no puede
 * decir aunque el modelo lo escriba.
 *
 * POR QUÉ EN CÓDIGO. Son reglas binarias, y una instrucción al modelo es
 * blanda (`.context/llm-analysis.md`). El prompt (`prompts/story-body.ts`) las
 * pide igual; estas funciones las hacen cumplir en el punto de escritura.
 *
 * LAS REGLAS. Cuatro vienen del carrusel (`storyCarouselGuards.ts`) y se
 * reutilizan tal cual: cita textual, cifra respaldada, identidad y pueblo
 * respaldados. Tres son propias de un texto largo que se publica como nota:
 *
 * 5. Año futuro: ningún año posterior al de referencia (`future-year.ts`,
 *    el defecto «En 2027, la Cámara aprobó…» del 25-oct-2026).
 * 6. Copia: fuera de la cita, ningún tramo de doce palabras seguidas del
 *    cuerpo está en el original. Chile no tiene excepción de prensa; el
 *    art. 71 B de la Ley 17.336 ampara la cita breve con fuente, título y
 *    autor, no la reproducción. Los Términos §7 prometen no reproducir notas.
 * 7. Agencia: la bajada no abre con el medio, la Fundación ni «nosotros» de
 *    sujeto (regla 1 de lenguaje de la casa; mismo molde que el test de la
 *    misión en `client/src/locales/regla-agencia.test.ts`).
 *
 * Y un aviso informativo de largo por campo, para medir sin cortar nada.
 */

import {
  citaEsTextual,
  cifrasSinRespaldo,
  extraerCitas,
  identidadSinRespaldo,
  normalizar,
  pueblosSinRespaldo,
} from './storyCarouselGuards.js'
import { yearsAfter } from './future-year.js'

/**
 * Lo que el candado de cifras acepta además del artículo: la fecha que el
 * prompt le dio al modelo. Medido en las cuatro primeras franjas en producción
 * (31-oct a 2-nov-2026): 11 de 13 cuerpos bloqueados lo fueron por
 * «cifra:bajada», y la cifra era el día o el año de esa fecha, que el modelo
 * escribe en la bajada porque se le pide «cuándo» y que el texto del artículo
 * no trae. Un día y un año que vienen del feed no son cifras inventadas.
 *
 * El año FUTURO no se quita: `future-year.ts` solo toca «En AAAA,» al inicio
 * de una oración en pretérito y, si duda, no toca; estirarlo a mitad de frase
 * borraría fechas futuras legítimas («la audiencia se fijó para 2027»). Un
 * cuerpo con un año imposible sigue bloqueado, y la ficha sale con el resumen.
 *
 * El titular del medio también va: el prompt se lo da al modelo, y en la quinta
 * franja (2-nov-2026, 23:00Z) el único cuerpo bloqueado lo fue por «casi 400»,
 * que La Tercera escribió en su titular y no en el texto.
 */
export function respaldoConFecha(original: string, fechaTexto: string, titulo = ''): string {
  return `${titulo}\n${original}\n${fechaTexto}`
}

export interface StoryBodyText {
  bajada: string
  quePaso: string
  porQueImporta: string
  contexto: string
  queSigue: string
}

export type CampoCuerpo = keyof StoryBodyText

export type BodyAvisoTipo = 'cita' | 'cifra' | 'identidad' | 'pueblo' | 'anio' | 'copia' | 'agencia' | 'meta' | 'largo'

export interface BodyAviso {
  campo: CampoCuerpo
  tipo: BodyAvisoTipo
  mensaje: string
}

/** Largo pedido por campo, en palabras (el mismo del prompt). */
export const LARGOS: Record<CampoCuerpo, [number, number]> = {
  bajada: [25, 40],
  quePaso: [80, 120],
  porQueImporta: [60, 100],
  contexto: [60, 100],
  queSigue: [0, 60],
}

export const CAMPOS: CampoCuerpo[] = ['bajada', 'quePaso', 'porQueImporta', 'contexto', 'queSigue']

/**
 * Palabras del tramo que no puede coincidir con el original. Era 12 hasta el
 * 2-nov-2026; medido en las cuatro primeras franjas en producción, bloqueó
 * nombres oficiales largos («Plan de Acción Nacional de Canadá para el Decenio
 * Internacional de las Lenguas Indígenas»), que no son copia sino el nombre de
 * la cosa: con su artículo son quince palabras. Con 16 sigue siendo un
 * «fragmento breve» para el art. 71 B.
 */
export const VENTANA_COPIA = 16

export function palabras(texto: string): string[] {
  return normalizar(texto).replace(/[^a-z0-9ñ' ]+/g, ' ').split(' ').filter(Boolean)
}

/** Abrir nombrándose a sí mismo, o en primera persona del plural con el medio detrás. */
const EL_MEDIO_DE_SUJETO =
  /^\s*(en\s+)?(voces\s+indigenas|la\s+fundacion|la\s+plataforma|(este|el|un)\s+medio|nosotros|cubrimos|publicamos|seleccionamos|elegimos|curamos|monitoreamos|informamos|contamos|nuestr[oa]s?)\b/

export function abreConElMedio(texto: string): boolean {
  return EL_MEDIO_DE_SUJETO.test(normalizar(texto))
}

/**
 * La nota hablando del artículo en vez de contar la noticia. Medido en la
 * primera ronda (25-oct-2026): «El artículo muestra cómo…» en porQueImporta
 * y «El artículo no menciona pasos…» donde el campo tenía que ir vacío.
 */
// «El artículo 19» es una ley y «el texto» suele ser un proyecto de ley: ni uno
// ni otro es la nota hablando de su fuente. Solo cuenta «el artículo» sin número.
// «El informe», «el reportaje» y «la nota» salieron el 2-nov-2026: medido en
// producción, «el informe» es casi siempre la noticia misma (el informe de una
// ONG que la nota cuenta) y bloqueaba cuerpos fieles.
const HABLA_DEL_ARTICULO = /(^|[^a-z])(el|este|dicho) articulo(?! \d)($|[^a-z])|segun el articulo/

/** Un campo que dice que el artículo no trae el dato tenía que ir vacío. */
const DICE_QUE_NO_HAY = /^(el|este) (articulo|texto|reportaje) no (menciona|indica|detalla|dice|precisa|informa|senala|especifica)/

export function hablaDelArticulo(texto: string): boolean {
  return HABLA_DEL_ARTICULO.test(normalizar(texto))
}

/**
 * Una cita que no está letra por letra en el original pierde las comillas y
 * queda como estilo indirecto: el texto ya trae la atribución («…, advierte
 * Júnior Hekurari»), y sin comillas es una paráfrasis y no palabras puestas en
 * boca de alguien. Medido el 25-oct-2026 con The Guardian: el modelo tradujo
 * la cita al español y la dejó entre comillas en 1 de 2 corridas.
 */
export function sinComillasAjenas(texto: string, original: string): string {
  let salida = texto
  for (const cita of extraerCitas(texto)) {
    if (citaEsTextual(cita, original)) continue
    const escapada = cita.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    salida = salida.replace(new RegExp(`[\\u00AB\\u201C"]${escapada}[\\u00BB\\u201D"]`), cita.trim())
  }
  return salida
}

/**
 * Lo que se corrige en código antes de revisar: espacios, un queSigue que
 * explica que no hay queSigue (se vacía) y las comillas de una cita que no es
 * textual (se quitan). Lo demás se avisa, no se reescribe.
 */
export function limpiarCuerpo(cuerpo: StoryBodyText, original: string): StoryBodyText {
  const limpio = { ...cuerpo }
  for (const campo of CAMPOS) {
    limpio[campo] = sinComillasAjenas((limpio[campo] ?? '').replace(/\s+/g, ' ').trim(), original)
  }
  if (DICE_QUE_NO_HAY.test(normalizar(limpio.queSigue))) limpio.queSigue = ''
  return limpio
}

/** El texto sin lo que va entre comillas, que ya lo revisa el candado de cita. */
function sinCitas(texto: string): string {
  return texto
    .replace(/«[^»]*»/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/"[^"]*"/g, ' ')
}

/**
 * Los tramos de `VENTANA_COPIA` palabras seguidas del texto (fuera de la cita)
 * que están tal cual en el original. Devuelve cada tramo una vez, el primero de
 * una racha, para que el aviso diga dónde empieza la copia.
 */
export function tramosCopiados(texto: string, original: string, ventana = VENTANA_COPIA): string[] {
  const fuente = ' ' + palabras(original).join(' ') + ' '
  const ws = palabras(sinCitas(texto))
  const tramos: string[] = []
  let i = 0
  while (i + ventana <= ws.length) {
    const tramo = ws.slice(i, i + ventana).join(' ')
    if (fuente.includes(' ' + tramo + ' ')) {
      tramos.push(tramo)
      // Saltar la racha entera: la copia de 30 palabras es un aviso, no 19.
      let fin = i + ventana
      while (fin < ws.length && fuente.includes(' ' + ws.slice(fin - ventana + 1, fin + 1).join(' ') + ' ')) fin += 1
      i = fin
    } else {
      i += 1
    }
  }
  return tramos
}

function revisarCampo(campo: CampoCuerpo, texto: string, original: string, anioReferencia: number): BodyAviso[] {
  const avisos: BodyAviso[] = []
  if (!texto.trim()) return avisos

  for (const cita of extraerCitas(texto)) {
    if (!citaEsTextual(cita, original)) {
      avisos.push({
        campo,
        tipo: 'cita',
        mensaje: `La cita «${cita.trim()}» no está tal cual en el artículo original. Si es una traducción o una paráfrasis, va sin comillas, en estilo indirecto.`,
      })
    }
  }

  if (identidadSinRespaldo(texto, original)) {
    avisos.push({
      campo,
      tipo: 'identidad',
      mensaje: 'Dice «indígena», y el artículo original no atribuye identidad indígena a nadie. Usa las palabras del medio.',
    })
  }

  for (const cifra of cifrasSinRespaldo(texto, original)) {
    avisos.push({
      campo,
      tipo: 'cifra',
      mensaje: `La cifra «${cifra}» no aparece en el artículo original. Si es un año o un dato que el medio no da, quítala.`,
    })
  }

  for (const pueblo of pueblosSinRespaldo(texto, original)) {
    avisos.push({
      campo,
      tipo: 'pueblo',
      mensaje: `Nombra al pueblo ${pueblo}, y el artículo original no lo nombra. Usa las palabras del medio.`,
    })
  }

  for (const anio of yearsAfter(texto, anioReferencia)) {
    avisos.push({
      campo,
      tipo: 'anio',
      mensaje: `Fecha en el futuro: «${anio}» es posterior a ${anioReferencia}.`,
    })
  }

  for (const tramo of tramosCopiados(texto, original)) {
    avisos.push({
      campo,
      tipo: 'copia',
      mensaje: `Copia del original fuera de la cita, desde «${tramo}…». Hay que decirlo con palabras propias (art. 71 B).`,
    })
  }

  if (hablaDelArticulo(texto)) {
    avisos.push({
      campo,
      tipo: 'meta',
      mensaje: 'Habla del artículo («el artículo muestra…») en vez de contar la noticia. Atribuye a las personas e instituciones que el medio cita.',
    })
  }

  const n = palabras(texto).length
  const [min, max] = LARGOS[campo]
  if (n < min || n > max) {
    avisos.push({ campo, tipo: 'largo', mensaje: `${n} palabras; se pidieron entre ${min} y ${max}.` })
  }

  return avisos
}

/** Todos los avisos de una nota con claves contra el texto del artículo original. */
export function revisarCuerpo(cuerpo: StoryBodyText, original: string, anioReferencia: number): BodyAviso[] {
  const avisos = CAMPOS.flatMap((campo) => revisarCampo(campo, cuerpo[campo] ?? '', original, anioReferencia))
  if (abreConElMedio(cuerpo.bajada)) {
    avisos.push({
      campo: 'bajada',
      tipo: 'agencia',
      mensaje: 'La bajada abre con el medio de sujeto. El sujeto de la primera frase son los pueblos, las personas o los hechos.',
    })
  }
  return avisos
}

// ---------------------------------------------------------------------------
// Ayuda para quien revisa (5-nov-2026)
// ---------------------------------------------------------------------------

/**
 * Un dato de la nota que el revisor tiene que cotejar con el original.
 *
 * POR QUÉ NO BASTA CON EL CANDADO DE CIFRAS. Los errores de hecho medidos en la
 * quinta franja (Osage «la mayor parte de US$4.700 M», Nepal «COP28») traían
 * cifras que SÍ estaban en el artículo, pero dichas de otra cosa: ningún
 * candado ni segundo paso de modelo los vio. Lo que los atrapa es ver cada
 * cifra y cada nombre de la nota junto a la frase del original donde aparece.
 * Esto no decide nada: pone a la vista lo que una persona tiene que mirar.
 */
export interface PuntoVerificacion {
  campo: CampoCuerpo
  tipo: 'cifra' | 'nombre'
  valor: string
  /** El valor está en el original (la cifra por sus dígitos, el nombre tal cual, sin mayúsculas). */
  enOriginal: boolean
  /** Hasta dos frases del original donde aparece, para leer de qué se habla. */
  contextos: string[]
}

const MAX_PUNTOS = 24
const MAX_CONTEXTOS = 2
const RADIO_CONTEXTO = 80

function recorteAlrededor(texto: string, desde: number, hasta: number): string {
  const ini = Math.max(0, desde - RADIO_CONTEXTO)
  const fin = Math.min(texto.length, hasta + RADIO_CONTEXTO)
  const frase = texto.slice(ini, fin).replace(/\s+/g, ' ').trim()
  return `${ini > 0 ? '…' : ''}${frase}${fin < texto.length ? '…' : ''}`
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function contextosDeCifra(valor: string, original: string): string[] {
  const grupos = valor.match(/\d+/g) ?? []
  if (grupos.length === 0) return []
  // «150,3», «150.3» y «150 3» son la misma cifra para el candado: se busca igual.
  const re = new RegExp(`(?<!\\d)${grupos.join('[.,\\s]{0,2}')}(?!\\d)`, 'g')
  const salida: string[] = []
  for (const m of original.matchAll(re)) {
    salida.push(recorteAlrededor(original, m.index ?? 0, (m.index ?? 0) + m[0].length))
    if (salida.length >= MAX_CONTEXTOS) break
  }
  return salida
}

function contextosDeNombre(valor: string, original: string): string[] {
  const re = new RegExp(escaparRegex(valor), 'gi')
  const salida: string[] = []
  for (const m of original.matchAll(re)) {
    salida.push(recorteAlrededor(original, m.index ?? 0, (m.index ?? 0) + m[0].length))
    if (salida.length >= MAX_CONTEXTOS) break
  }
  return salida
}

/** Nombres propios: una o más palabras con mayúscula, con «de/del/la…» en medio. */
const NOMBRE_PROPIO =
  /\p{Lu}[\p{L}'’-]*(?:\s+(?:(?:de|del|la|las|los|y|van|von)\s+)?\p{Lu}[\p{L}'’-]*)*/gu

/**
 * Las cifras y los nombres propios de la nota, cada uno con las frases del
 * original donde aparece. Cifras primero (ahí cayeron los errores medidos), y
 * al revisor se le muestran antes los que NO están en el original.
 *
 * Un nombre de una sola palabra al inicio de una oración se ignora: es la
 * mayúscula de la frase, no un nombre.
 */
export function puntosDeVerificacion(cuerpo: StoryBodyText, original: string): PuntoVerificacion[] {
  const puntos: PuntoVerificacion[] = []
  const vistos = new Set<string>()

  for (const campo of CAMPOS) {
    const texto = cuerpo[campo] ?? ''
    for (const m of texto.matchAll(/\d+(?:[.,\s]\d+)*/g)) {
      const valor = m[0].trim()
      const clave = `cifra|${valor}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const contextos = contextosDeCifra(valor, original)
      puntos.push({ campo, tipo: 'cifra', valor, enOriginal: contextos.length > 0, contextos })
    }
  }

  for (const campo of CAMPOS) {
    const texto = cuerpo[campo] ?? ''
    for (const m of texto.matchAll(NOMBRE_PROPIO)) {
      const valor = m[0].trim()
      const inicioDeOracion = (m.index ?? 0) === 0 || /[.!?¿¡«"“]\s*$/.test(texto.slice(0, m.index ?? 0))
      if (inicioDeOracion && !/\s/.test(valor)) continue
      const clave = `nombre|${valor.toLowerCase()}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const contextos = contextosDeNombre(valor, original)
      puntos.push({ campo, tipo: 'nombre', valor, enOriginal: contextos.length > 0, contextos })
    }
  }

  const cifras = puntos.filter((p) => p.tipo === 'cifra')
  const nombres = puntos.filter((p) => p.tipo === 'nombre')
  const orden = (a: PuntoVerificacion, b: PuntoVerificacion) => Number(a.enOriginal) - Number(b.enOriginal)
  return [...[...cifras].sort(orden), ...[...nombres].sort(orden)].slice(0, MAX_PUNTOS)
}

/** Los avisos que impiden publicar: todo menos el de largo, que es informativo. */
export function avisosBloqueantes(avisos: BodyAviso[]): BodyAviso[] {
  return avisos.filter((a) => a.tipo !== 'largo')
}
