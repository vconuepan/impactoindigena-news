import type { ReviewCode, ReviewMode, ReviewState } from './admin-api'
import type { BadgeVariant } from './constants'

/** Etiquetas en castellano de la revisión por marca. Una sola fuente para la pantalla y el panel. */

export const MODE_LABEL: Record<ReviewMode, string> = { off: 'Apagado', shadow: 'Sombra', enforce: 'Aplicar' }

export const STATE_LABEL: Record<ReviewState, string> = {
  auto: 'Automática',
  pending: 'Pendiente',
  released: 'Liberada',
  held: 'Retenida',
}

export const STATE_BADGE: Record<ReviewState, BadgeVariant> = { auto: 'green', pending: 'yellow', released: 'blue', held: 'red' }

export const CODE_LABEL: Record<ReviewCode, string> = { sensitive: 'Sensible', out_of_scope: 'Fuera de ámbito' }

/** Nombre de marca por slug de vertical; lo demás, el slug. */
export const MARCA_LABEL: Record<string, string> = {
  mapuche: 'Voces Mapuche',
  'wallmapu-araucania': 'Voces Araucanía',
}

export function marcaLabel(slug: string): string {
  return MARCA_LABEL[slug] ?? slug
}

/** Misma normalización que el gate (server/src/lib/gate.ts): minúsculas y sin diacríticos. */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Siglas de hasta este largo se comparan como palabra completa; lo demás, como prefijo (igual que el gate). */
export const LARGO_SIGLA = 3

/**
 * El término como se lee, no como está en la lista. Las listas del gate usan
 * raíces («desaloj», «detenid», «homicid») para cubrir plurales y
 * conjugaciones; en pantalla se muestra la palabra real de la nota que disparó
 * («desalojo», «detenidos»). Si no está en el texto que tenemos (p. ej. disparó
 * en el cuerpo de la fuente), queda la raíz. Las siglas van en mayúsculas.
 */
export function terminoVisible(termino: string, texto?: string): string {
  if (termino.includes(' ')) return termino
  if (termino.length <= LARGO_SIGLA) return termino.toUpperCase()
  if (!texto) return termino
  const raiz = normalizar(termino)
  for (const palabra of texto.match(/\p{L}+/gu) ?? []) {
    if (normalizar(palabra).startsWith(raiz)) return palabra.toLowerCase()
  }
  return termino
}

/** El texto corto que evaluó el gate (título, etiqueta, resumen), para buscar en él el término real. */
export function textoCorto(story: { title: string | null; titleLabel: string | null; sourceTitle: string; summary: string | null }): string {
  return [story.title || story.sourceTitle, story.titleLabel, story.summary].filter((p): p is string => !!p && p.trim().length > 0).join('\n')
}

/**
 * Una razón del gate, legible: 'frame:confrontacion' → «Encuadre: confrontación»,
 * 'listA:condena' → «Lista A: condena», 'listB+corroborated:policia' → «Lista B (corroborada): policia»,
 * 'listB+B:tribunal' → «Lista B (dos familias): tribunal» (regla B+B, 11-oct-2026).
 * Con `texto`, el término se muestra como aparece en la nota (ver terminoVisible).
 */
export function razonLabel(razon: string, texto?: string): { texto: string; variant: BadgeVariant } {
  if (razon === 'learning_mode') return { texto: 'Modo aprendizaje', variant: 'gray' }
  const [tipo, ...resto] = razon.split(':')
  const termino = tipo === 'frame' ? resto.join(':') : terminoVisible(resto.join(':'), texto)
  switch (tipo) {
    case 'frame':
      return { texto: `Encuadre: ${termino}`, variant: 'red' }
    case 'listA':
      return { texto: `Lista A: ${termino}`, variant: 'orange' }
    case 'listB+corroborated':
      return { texto: `Lista B (corroborada): ${termino}`, variant: 'yellow' }
    case 'listB+B':
      return { texto: `Lista B (dos familias): ${termino}`, variant: 'yellow' }
    case 'listB':
      return { texto: `Lista B: ${termino}`, variant: 'gray' }
    // Carril de marca (D5): la bandera del juez es una categoría, no una palabra de la nota.
    case 'carril-juez':
      return { texto: `Carril (juez): ${BANDERA_LABEL[resto.join(':')] ?? resto.join(':')}`, variant: 'orange' }
    case 'carril-filtro':
      return { texto: `Carril (filtro): ${termino}`, variant: 'orange' }
    default:
      return { texto: razon, variant: 'gray' }
  }
}

/** Banderas sensibles del juez del carril de marca (D5), legibles. */
export const BANDERA_LABEL: Record<string, string> = {
  menores: 'menores',
  victimas: 'víctimas',
  violencia: 'violencia',
  proceso_penal: 'proceso penal',
  operativo: 'operativo',
}

/** Los términos que dispararon (sin el encuadre, el modo aprendizaje ni las categorías del juez del carril), para resaltar. */
export function terminosDe(razones: string[], señales: string[]): string[] {
  const terminos = new Set<string>()
  for (const r of [...razones, ...señales]) {
    const i = r.indexOf(':')
    if (i < 0 || r.startsWith('frame:') || r.startsWith('carril-juez:')) continue
    const t = r.slice(i + 1).trim()
    if (t) terminos.add(t)
  }
  return [...terminos]
}

/**
 * Etiqueta del puntaje de la cola. El 2 sale de la Lista A o de la señal del
 * carril de marca (D5). El 1 tiene dos orígenes desde el 13-oct-2026:
 * B+B, o el encuadre «confrontación» solo (sin términos de las listas), que se
 * bajó de 3 a 1 tras medir que 39 de 44 eran disputas sin riesgo. Se distinguen
 * por las razones, para que el editor sepa qué está liberando.
 */
export function puntajeLabel(score: number, reasons: string[] = []): { texto: string; variant: BadgeVariant } {
  if (score >= 3) return { texto: '3 · encuadre y lista', variant: 'red' }
  if (score === 2) {
    // El 2 también lo da la señal sensible del carril de marca (D5) sin término de la Lista A.
    const carril = !reasons.some((r) => r.startsWith('listA:')) && reasons.some((r) => r.startsWith('carril-'))
    return { texto: carril ? '2 · carril' : '2 · lista A', variant: 'orange' }
  }
  if (score === 1) {
    const soloEncuadre = reasons.includes('frame:confrontacion') && !reasons.some((r) => r.startsWith('listB+B:'))
    return { texto: soloEncuadre ? '1 · solo encuadre' : '1 · B+B', variant: 'yellow' }
  }
  return { texto: '0', variant: 'gray' }
}

export interface Fragmento {
  texto: string
  marcado: boolean
}

/**
 * Parte el texto en fragmentos marcando las palabras que disparó el gate, con
 * la misma regla que él: raíz como prefijo de palabra, sigla como palabra
 * completa, término de varias palabras como secuencia; y sin diacríticos, así
 * que «detencion» marca «detención». Antes se usaba un regex sobre el texto
 * original y las palabras con tilde se quedaban sin resaltar.
 */
export function marcarTerminos(texto: string, terminos: string[]): Fragmento[] {
  if (!texto || terminos.length === 0) return [{ texto, marcado: false }]
  const tokens = texto.match(/\p{L}+|[^\p{L}]+/gu) ?? []
  const marcado = new Array<boolean>(tokens.length).fill(false)
  const esPalabra = tokens.map((t) => /\p{L}/u.test(t))
  const norm = tokens.map((t) => normalizar(t))
  const coincide = (i: number, parte: string, prefijo: boolean) =>
    esPalabra[i] && (prefijo ? norm[i].startsWith(parte) : norm[i] === parte)
  for (const termino of terminos) {
    const partes = normalizar(termino).split(/\s+/).filter(Boolean)
    if (partes.length === 0) continue
    const esSigla = partes.length === 1 && partes[0].length <= LARGO_SIGLA
    for (let i = 0; i < tokens.length; i++) {
      if (!esPalabra[i]) continue
      // cada parte, salvo la última, es palabra completa; la última, prefijo (o completa si es sigla)
      let j = i
      let ok = true
      const indices: number[] = []
      for (let k = 0; k < partes.length; k++) {
        while (j < tokens.length && !esPalabra[j]) j++
        const ultima = k === partes.length - 1
        if (j >= tokens.length || !coincide(j, partes[k], ultima && !esSigla)) {
          ok = false
          break
        }
        indices.push(j)
        j++
      }
      // Se marca el tramo entero, separadores incluidos, para que «huelga de hambre» sea un solo fragmento.
      if (ok) for (let x = indices[0]; x <= indices[indices.length - 1]; x++) marcado[x] = true
    }
  }
  // Fundir tokens contiguos con la misma marca.
  const out: Fragmento[] = []
  tokens.forEach((t, i) => {
    const prev = out[out.length - 1]
    if (prev && prev.marcado === marcado[i]) prev.texto += t
    else out.push({ texto: t, marcado: marcado[i] })
  })
  return out
}

/** Origen de una nota que entró a la vertical por la marca (D5, diseño 7.7). */
export const ORIGEN_LABEL: Record<'territorial' | 'rescate', string> = {
  territorial: 'Entró por criterio territorial',
  rescate: 'Rescatada por escala Mapuche',
}

/**
 * La nota como se mostraría en la vertical: si entró por la marca, con su título
 * y su resumen de marca (la nota cruda del pre-filtro no tiene propios).
 */
export function storyVisible<S extends { title: string | null; summary: string | null; titleLabel: string | null }>(item: {
  story: S
  marca?: { title: string | null; summary: string | null } | null
}): S {
  if (!item.marca) return item.story
  return { ...item.story, title: item.marca.title ?? item.story.title, summary: item.marca.summary ?? item.story.summary, titleLabel: null }
}
