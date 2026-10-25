/**
 * Años imposibles en los textos del análisis.
 *
 * El 25-oct-2026 se midió en la API pública que noticias frescas salían con
 * «En 2027, la Cámara de Diputados aprobó…» en el resumen. La causa estaba en
 * la fuente —una bajada con errata, «23 de octubre de 2027», en una nota del
 * 23-oct-2026— y en el prompt, que a una noticia fresca no le daba ninguna
 * fecha con que contrastarla. Peor: la fecha que el modelo leía del artículo
 * sobrescribía `sourceDatePublished`, así que la errata podía quedar guardada
 * como fecha de origen.
 *
 * Una instrucción al modelo es blanda (ver «Title Capitalization Guardrail» en
 * `.context/llm-analysis.md`). Estas funciones son deterministas y se aplican
 * en el punto de escritura, en `services/analysis.ts`. Todas son puras.
 */

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Interpreta la fecha de publicación que devuelve el modelo.
 *
 * - Vacía, inválida o el centinela 1970 («no la encontré»): `undefined`, y el
 *   campo no se toca.
 * - Posterior a hoy (con un día de tolerancia por zonas horarias): `undefined`.
 *   Una fecha de publicación futura es imposible por construcción; hasta el
 *   25-oct-2026 se aceptaba y pisaba la fecha que traía el feed.
 */
export function parseLlmPublicationDate(raw: string | null | undefined, now: Date = new Date()): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return undefined
  if (d.getTime() > now.getTime() + DIA_MS) return undefined
  return d
}

const ANIO = /(?<!\d)(20[2-9]\d)(?!\d)/g

/** Años distintos, ordenados, mencionados en el texto y posteriores al de referencia. */
export function yearsAfter(text: string | null | undefined, referenceYear: number): number[] {
  if (!text) return []
  const found = new Set<number>()
  for (const m of text.matchAll(ANIO)) {
    const y = Number(m[1])
    if (y > referenceYear) found.add(y)
  }
  return [...found].sort((a, b) => a - b)
}

// Tercera persona del pretérito: «aprobó», «firmaron», «dijeron», más los
// irregulares frecuentes. Las palabras que terminan en «ó» son casi siempre
// verbos en pretérito; las que terminan en «-aron/-ieron/-eron», siempre.
const PRETERITO =
  /(?<!\p{L})(\p{L}+(?:ó|aron|ieron|eron)|fue|hubo|dio|hizo|puso|tuvo|vino|vio|dijo|quiso|supo|pudo|trajo|estuvo|anduvo|murió)(?!\p{L})/u

// Futuro y condicional («será», «realizarán», «podría»), y presentes que
// anuncian algo por venir («convoca», «prevé», «proyecta»). Si aparecen, la
// oración puede hablar legítimamente de un año posterior.
const FUTURO =
  /(?<!\p{L})(\p{L}+(?:rá|rán|ría|rían)|prevé|prevén|proyecta|proyectan|planea|planean|planifica|busca|buscan|convoca|convocan|anuncia|anuncian|pretende|pretenden|prepara|preparan|propone|proponen)(?!\p{L})/u

function esRelatoDePasado(oracion: string): boolean {
  return PRETERITO.test(oracion) && !FUTURO.test(oracion)
}

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase('es') + s.slice(1)
}

/**
 * Quita el marcador de año histórico cuando ese año es imposible.
 *
 * El prompt pide a las noticias de un año o más que arranquen con «En 2023,
 * líderes mapuches firmaron…» o terminen «…estrenaron documental en 2023».
 * El modelo repite esa plantilla con el año que encuentra, y si lo que
 * encuentra es una errata o el año de un presupuesto venidero, sale «En 2027,
 * la Cámara aprobó…» en una nota de 2026. Un hecho relatado en pretérito no
 * puede ser de un año posterior al de publicación: el marcador se quita y la
 * oración queda sin fechar, que es lo que corresponde a una noticia fresca.
 *
 * Solo toca UNA forma: «En AAAA, » encabezando una oración que relata en
 * pretérito sin ningún verbo en futuro. Ahí el año fecha al verbo, y un
 * pretérito en un año posterior al de publicación es imposible.
 *
 * La otra forma de la plantilla, « en AAAA» al cerrar la oración, NO se toca
 * a propósito: ahí el año suele fechar al objeto y no al verbo, y en los 78
 * casos medidos el 25-oct-2026 salían legítimos como «Se planeó un panel de
 * alto nivel en 2027» o «acordó celebrar la conferencia en 2028». Tampoco se
 * tocan «presupuesto 2027», «Plan 2024-2038», «Chile será sede del Foro 2027»
 * ni «En 2027, se realizará el foro». Si duda, no toca: lo que queda lo mide
 * `yearsAfter`, que se registra en el log.
 */
export function stripImpossibleHistoricalYear(text: string, referenceYear: number): string {
  // Oraciones: se cortan en . ! ? seguidos de espacio; el separador se conserva.
  const partes = text.split(/(?<=[.!?])\s+/u)
  const salida = partes.map((oracion) => {
    const inicio = oracion.match(/^En (20[2-9]\d),\s+/u)
    if (inicio && Number(inicio[1]) > referenceYear && esRelatoDePasado(oracion)) {
      return capitalizar(oracion.slice(inicio[0].length))
    }
    return oracion
  })
  return salida.join(' ')
}

/** Variante tolerante a null, para usar directo sobre campos opcionales. */
export function stripImpossibleHistoricalYearOrNull(
  text: string | null | undefined,
  referenceYear: number,
): string | null {
  if (!text) return null
  return stripImpossibleHistoricalYear(text, referenceYear)
}
