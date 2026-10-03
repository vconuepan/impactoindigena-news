/**
 * Gate de sensibilidad editorial (riesgo numero 1 del programa Las Otras Voces).
 *
 * POR QUE EXISTE. El pipeline publica solo, sin compuerta humana. Para la
 * mirada global eso funciona. Para las marcas que cubren el conflicto en el
 * Wallmapu (Voces Mapuche, Voces Araucania) una nota sobre un atentado, un
 * desalojo o una victima tiene que pasar por un editor antes de salir. Esta
 * funcion decide, de forma determinista y testeable, si una historia puede
 * publicarse sola (`auto_publish`) o queda retenida (`held_for_review`).
 * Codifica el protocolo editorial, seccion 7 (`estrategia/protocolo-editorial-FINAL.md`
 * del programa; el documento se versiona junto con este codigo al jubilar el fork).
 *
 * DE DONDE VIENE. Se escribio y probo en el fork `otras-voces` (B3 del plan,
 * 2026-07-05) y se porto aqui el 2026-10-03 por decision D1 del director:
 * del fork se rescata solo esta pieza. Todavia NO esta cableada al job de
 * publicacion: es una funcion pura a la espera de la retencion por marca.
 *
 * REGLAS. Una historia se RETIENE cuando se cumple cualquiera de:
 *  - modo aprendizaje encendido (las primeras semanas todo va a revision);
 *  - el encuadre narrativo del clasificador es `confrontacion`;
 *  - el texto contiene un termino de la Lista A (siempre sensible);
 *  - el texto contiene un termino de la Lista B Y hay una senal que lo
 *    corrobore (un acierto de Lista A o el encuadre `confrontacion`). La Lista B
 *    sola NO retiene, para no saturar la cola: una nota cultural sobre una machi pasa.
 *
 * Regla de oro (seccion 7.3): ante la duda, revision humana. El clasificador se
 * sesga al falso positivo. El encuadre narrativo (LLM) es la senal primaria; las
 * palabras clave son el respaldo determinista. El cotejo ignora tildes y dispara
 * al inicio de palabra, asi que atrapa plurales e inflexiones («imputados»,
 * «atentados») sin disparar por coincidencias dentro de otra palabra («toma»
 * dentro de «automatico»).
 *
 * SIGLAS. Un termino de hasta tres letras se coteja como PALABRA COMPLETA, no
 * como prefijo. Medido el 2026-10-03 sobre 787 notas publicadas: «cam» como
 * prefijo disparaba en 92 textos, casi todos por «cambio», «camara», «caminos»
 * y «campesinas», y ninguno por la CAM. Con la palabra completa dispara solo
 * en las menciones reales. Lo mismo vale para «pdi», «nna» y para las siglas
 * del Puelmapu que se sumen («ram»).
 */

export type GateDecision = 'auto_publish' | 'held_for_review'

/** Marcas del programa. La calibracion por marca esta reservada, aun no ramifica. */
export type MarcaKey = 'indigenas' | 'mapuche' | 'araucania'

export interface GateResult {
  decision: GateDecision
  held: boolean
  /** Razones de bloqueo legibles por maquina: 'learning_mode', 'frame:confrontacion', 'listA:atentado'. */
  reasons: string[]
  /** Aciertos que no bloquean pero que el editor debe ver (Lista B sin corroborar). */
  signals: string[]
}

export interface GateInput {
  /** Encuadre narrativo del clasificador, si existe. */
  narrativeFrame?: string | null
  /** Texto visible concatenado: titulo + etiqueta + resumen + contenido de la fuente. */
  text: string
}

export interface GateOptions {
  learningMode: boolean
  /** Reservado para calibrar por marca (mapuche y araucania son estrictas). Aun no ramifica. */
  marca?: MarcaKey
}

// Protocolo editorial, seccion 7.1. Lista A: SIEMPRE disparan (alto riesgo).
export const LISTA_A: string[] = [
  'atentado', 'terrorista', 'terrorismo', 'antiterrorista', 'ley antiterrorista',
  'usurpacion', 'usurpador', 'invasor', 'weichafe', 'presos politicos', 'encapuchados',
  'horda', 'allanamiento', 'operativo policial', 'gope', 'comando jungla', 'formalizado',
  'imputado', 'prision preventiva', 'condenado', 'querella', 'homicidio', 'asesinato',
  'baleado', 'emboscada', 'victima fatal', 'herido de bala', 'amenaza de muerte',
  'extorsion', 'menor', 'nino', 'nina', 'adolescente', 'nna', 'victima', 'testigo',
  'abuso', 'violacion', 'violencia sexual', 'suicidio', 'huelga de hambre',
  'muerte en custodia', 'doxxing',
]

// Protocolo editorial, seccion 7.2. Lista B: disparan SOLO con corroboracion.
export const LISTA_B: string[] = [
  'forestal', 'forestales', 'predio', 'fundo', 'machi', 'lonko', 'werken', 'comunero',
  'conadi', 'indh', 'recuperacion', 'toma', 'ocupacion', 'territorio ancestral',
  'wallmapu', 'cam', 'resistencia mapuche', 'weichan auka mapu', 'macrozona sur',
  'carabineros', 'pdi', 'fiscalia', 'violencia rural', 'agricultor', 'transportista',
  'trabajador forestal',
]

/** Minusculas sin diacriticos (é→e, ñ→n): el cotejo ignora tildes. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Largo maximo de un termino que se trata como sigla y se coteja entero. */
const LARGO_SIGLA = 3

/**
 * Verdadero si `term` aparece en `haystack` (ambos ya normalizados): al inicio de
 * una palabra para los terminos normales (admite plurales e inflexiones), y como
 * palabra completa para las siglas de hasta LARGO_SIGLA letras.
 */
function matches(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const esSigla = term.length <= LARGO_SIGLA && !term.includes(' ')
  const cierre = esSigla ? '($|[^a-z0-9])' : ''
  return new RegExp(`(^|[^a-z0-9])${escaped}${cierre}`).test(haystack)
}

export function evaluateGate(input: GateInput, options: GateOptions): GateResult {
  const reasons: string[] = []
  const signals: string[] = []
  const text = normalize(input.text || '')
  const isConfrontacion = input.narrativeFrame === 'confrontacion'

  if (options.learningMode) reasons.push('learning_mode')
  if (isConfrontacion) reasons.push('frame:confrontacion')

  const listAHits = LISTA_A.filter((t) => matches(text, t))
  for (const t of listAHits) reasons.push(`listA:${t}`)

  const listBHits = LISTA_B.filter((t) => matches(text, t))
  const corroborated = listAHits.length > 0 || isConfrontacion
  for (const t of listBHits) {
    if (corroborated) reasons.push(`listB+corroborated:${t}`)
    else signals.push(`listB:${t}`)
  }

  const held = reasons.length > 0
  return {
    decision: held ? 'held_for_review' : 'auto_publish',
    held,
    reasons,
    signals,
  }
}
