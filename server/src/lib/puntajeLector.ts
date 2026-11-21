/**
 * «Probabilidad de lector real» de un visitante-dia, de 0 a 100, con sus motivos
 * en español. Es una ESTIMACION por señales, no un veredicto.
 *
 * Diseño en docs/propuesta-analytics-bots.md (fase 3, A), aprobado el
 * 20-nov-2026. Parte en 50 y cada señal suma o resta. Ninguna señal decide sola:
 * desde un visitante neutro (50), cambiar una sola deja entre 30 y 65, dentro
 * de «dudoso». Ojo con los PARES: la interaccion suma 10 si hubo y resta 5 si no,
 * asi que su salto es de 15; la red resta 15 si es de nube y suma 5 si no, salto
 * de 20. Con pesos mayores (+15/−10 y −20/+10, la primera version del 21-nov)
 * una sola señal cruzaba el umbral, y la prueba lo atrapo.
 *
 * Funcion pura: se calcula al leer el panel, no al guardar, porque las señales
 * de un dia cambian mientras el dia corre (paginas, interaccion). Cambiar un
 * peso recalcula todo el historico con señales sin tocar la base.
 */

export interface Senales {
  interactuo: boolean
  /** '' si la red no es de nube conocida; el proveedor si lo es. */
  nube: string
  /** Origen de la primera vista del dia: '', 'search', 'social', 'referral', 'newsletter', 'internal'. */
  origen: string
  idioma: 'coherente' | 'incoherente' | 'sin_dato'
  dispositivo: string
  paginas: number
  vioFicha: boolean
  vioBusqueda: boolean
  vioOtra: boolean
}

export type Categoria = 'lector' | 'dudoso' | 'bot'

export interface Resultado {
  puntaje: number
  categoria: Categoria
  /** Lo que sumo (+) y lo que resto (−), en lenguaje simple. */
  motivos: string[]
}

export const UMBRAL_LECTOR = 70
export const UMBRAL_BOT = 30
export const PAGINAS_DE_MAQUINA = 200

export function categoriaDe(puntaje: number): Categoria {
  if (puntaje >= UMBRAL_LECTOR) return 'lector'
  if (puntaje < UMBRAL_BOT) return 'bot'
  return 'dudoso'
}

export function puntuar(s: Senales): Resultado {
  let p = 50
  const motivos: string[] = []
  const suma = (n: number, motivo: string) => {
    p += n
    motivos.push(`${n > 0 ? '+' : '−'}${Math.abs(n)} ${motivo}`)
  }

  if (s.interactuo) suma(10, 'interactuó con la página')
  else suma(-5, 'sin interacción')

  if (s.nube) suma(-15, `red de nube (${s.nube})`)
  else suma(5, 'red que no es de nube')

  if (['search', 'social', 'referral', 'newsletter'].includes(s.origen)) suma(10, 'llegó desde un buscador, una red, otro sitio o el boletín')

  if (s.idioma === 'coherente') suma(10, 'idioma del navegador coherente')
  else if (s.idioma === 'incoherente') suma(-10, 'idioma del navegador ajeno al sitio')

  if (s.dispositivo === 'mobile' || s.dispositivo === 'tablet') suma(5, 'móvil o tableta')

  if (s.paginas > PAGINAS_DE_MAQUINA) suma(-20, `ritmo de máquina (${s.paginas} páginas en el día)`)
  else if (s.paginas >= 2) suma(10, 'vio dos páginas o más')

  if (s.vioFicha) suma(5, 'leyó al menos una noticia')
  if (s.vioBusqueda && !s.vioFicha && !s.vioOtra && !s.interactuo) suma(-20, 'solo abrió la búsqueda, sin interacción')

  const puntaje = Math.max(0, Math.min(100, p))
  return { puntaje, categoria: categoriaDe(puntaje), motivos }
}
