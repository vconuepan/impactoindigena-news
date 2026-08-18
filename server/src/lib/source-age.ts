/**
 * source-age.ts — techo de antiguedad para el material que se publica.
 *
 * DECISION EDITORIAL (17-ago-2026): este es un medio de noticias y no publica
 * material de mas de 18 meses. `config.crawl.maxSourceAgeMonths`.
 *
 * POR QUE HIZO FALTA, con el dato. El filtro de antiguedad existia y funcionaba
 * —`crawler.ts` descarta lo que supera `maxArticleAgeDays` (60)— pero el job de
 * descubrimiento por busqueda NUNCA lo aplico: crea las historias con
 * `prisma.story.create` directo, sin pasar por ese guardia. Resultado medido en
 * la base: de las 61 historias publicadas el 16 y 17 de agosto, **30 tenian el
 * articulo original con mas de 18 meses de antiguedad**, y la mas vieja era del
 * **2 de mayo de 2011**. Casi la mitad de lo publicado en dos dias era archivo
 * presentado como noticia del dia.
 *
 * LA CORRECCION A UN DIAGNOSTICO PROPIO, que vale mas que el arreglo. Al ver
 * titulares como "CORFO lanzo fondo para empresas indigenas con credito largo en
 * 2020" se concluyo que el LLM estaba inventando años, porque el titular
 * original no los traia. Era falso: Bing News SI entrega `pubDate`, y ese
 * articulo **es del 3 de septiembre de 2020**. El modelo estaba fechando el hecho
 * CORRECTAMENTE — avisaba, con la unica herramienta que tenia, que la noticia era
 * vieja. El defecto nunca estuvo en el titular: estuvo en publicar material de
 * archivo. Acusar al modelo habria tapado la causa.
 *
 * `sourceDatePublished` en null NO cuenta como viejo. Sin fecha no hay evidencia
 * de antiguedad, y descartar por sospecha perderia cobertura legitima: los
 * medios que no publican fecha existen. Ese caso se deja pasar a proposito.
 */
import { config } from '../config.js'

/** Milisegundos en un mes, para el calculo aproximado del techo. */
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000

export interface SourceAgeVerdict {
  tooOld: boolean
  /** Antiguedad en meses, redondeada; null si no hay fecha con que calcularla. */
  ageMonths: number | null
}

/**
 * Decide si el articulo original es demasiado viejo para publicarse.
 *
 * Acepta `Date`, cadena ISO, o null/undefined. Sin fecha valida devuelve
 * `tooOld: false` — la ausencia de dato no es prueba de antiguedad.
 */
export function checkSourceAge(
  sourceDatePublished: Date | string | null | undefined,
  now: Date = new Date(),
): SourceAgeVerdict {
  const limitMonths = config.crawl.maxSourceAgeMonths
  if (limitMonths <= 0) return { tooOld: false, ageMonths: null }
  if (!sourceDatePublished) return { tooOld: false, ageMonths: null }

  const date = sourceDatePublished instanceof Date
    ? sourceDatePublished
    : new Date(sourceDatePublished)
  if (isNaN(date.getTime())) return { tooOld: false, ageMonths: null }

  // Una fecha en el futuro es un error de la fuente, no material viejo.
  const ageMs = now.getTime() - date.getTime()
  if (ageMs < 0) return { tooOld: false, ageMonths: 0 }

  const ageMonths = Math.round(ageMs / MS_PER_MONTH)
  return { tooOld: ageMonths > limitMonths, ageMonths }
}

/** Atajo booleano para los puntos donde solo importa la decision. */
export function isSourceTooOld(
  sourceDatePublished: Date | string | null | undefined,
  now?: Date,
): boolean {
  return checkSourceAge(sourceDatePublished, now).tooOld
}
