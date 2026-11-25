/**
 * Regla 2 de la independencia editorial: el medio avisa cuando una nota informa
 * sobre un cliente de impactoindigena.ai o de impactoindigena.legal.
 *
 * Fuente de la regla: impactoindigena/docs/DEFINICION_TRES_VERTICALES_Y_CASA_2026-11-25.md,
 * §2 bis, confirmada por el director el 25-nov-2026 y publicada en «Quiénes somos».
 * Decisión del director del mismo día: el aviso es GENÉRICO, nunca nombra a la
 * organización (la identidad del cliente de un estudio puede estar cubierta por
 * el secreto profesional). Por eso lo que sale de aquí hacia la ficha no lleva
 * nombre, id ni alias: solo la vertical, si la relación sigue y si son varias.
 *
 * Todo es determinista, sin modelo: una lista que mantiene una persona contra
 * el texto que publicamos. La lista nombra organizaciones, nunca personas, y no
 * dice nada del origen de nadie: dice de quién es cliente, no quién es indígena.
 */

export type VerticalCliente = 'ai' | 'legal'
export const VERTICALES_CLIENTE: readonly VerticalCliente[] = ['ai', 'legal'] as const

export interface ClienteParaCruce {
  id: string
  name: string
  aliases: string[]
  vertical: string
  endedOn: Date | null
}

/** Lo único que la ficha pública recibe. Sin nombre: decisión del 25-nov. */
export interface AvisoIndependencia {
  verticals: VerticalCliente[]
  /** true si al menos una relación sigue vigente («es cliente»); false: «fue cliente». */
  current: boolean
  /** true si son dos o más organizaciones («organizaciones que son clientes»). */
  plural: boolean
}

/** Un término más corto que esto marcaría media base («AA», «BC»). */
export const MIN_LARGO_TERMINO = 3

/**
 * Minúsculas, sin tildes ni diéresis, todo lo que no sea letra o número pasa a
 * espacio, y con un espacio en cada borde para buscar palabra completa con
 * `includes(' término ')`. Así «Celulosa Arauco» no aparece en «Araucanía» y
 * «CODELCO» aparece en «la estatal Codelco,».
 */
export function normalizar(texto: string): string {
  const plano = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
  return plano ? ` ${plano} ` : ' '
}

/** Nombre y alias normalizados, sin los que quedan bajo el largo mínimo. */
export function terminosDe(cliente: Pick<ClienteParaCruce, 'name' | 'aliases'>): string[] {
  const vistos = new Set<string>()
  for (const crudo of [cliente.name, ...cliente.aliases]) {
    const t = normalizar(crudo).trim()
    if (t.replace(/ /g, '').length >= MIN_LARGO_TERMINO) vistos.add(t)
  }
  return [...vistos]
}

/** Los clientes cuyo nombre o algún alias aparece, como palabra completa, en alguno de los textos. */
export function clientesMencionados<C extends ClienteParaCruce>(
  textos: Array<string | null | undefined>,
  clientes: C[],
): C[] {
  const unido = normalizar(textos.filter((t): t is string => typeof t === 'string' && t.length > 0).join(' \n '))
  if (unido.trim() === '') return []
  return clientes.filter((c) => terminosDe(c).some((t) => unido.includes(` ${t} `)))
}

function esVigente(c: Pick<ClienteParaCruce, 'endedOn'>, ahora: Date): boolean {
  return c.endedOn === null || c.endedOn.getTime() > ahora.getTime()
}

/**
 * El aviso de una nota, o null si no corresponde. `descartados` son los ids de
 * cliente que un administrador marcó como falso positivo EN ESTA nota.
 */
export function avisoDeIndependencia(
  mencionados: ClienteParaCruce[],
  descartados: ReadonlySet<string> = new Set(),
  ahora: Date = new Date(),
): AvisoIndependencia | null {
  const vivos = mencionados.filter(
    (c) => !descartados.has(c.id) && (VERTICALES_CLIENTE as readonly string[]).includes(c.vertical),
  )
  if (vivos.length === 0) return null
  const verticals = VERTICALES_CLIENTE.filter((v) => vivos.some((c) => c.vertical === v))
  const organizaciones = new Set(vivos.map((c) => normalizar(c.name).trim()))
  return {
    verticals,
    current: vivos.some((c) => esVigente(c, ahora)),
    plural: organizaciones.size > 1,
  }
}

/** Los textos de la nota contra los que se cruza: lo que publicamos, más el título del medio. */
export interface TextosDeNota {
  title?: string | null
  sourceTitle?: string | null
  summary?: string | null
  quote?: string | null
  quoteAttribution?: string | null
  body?: {
    bajada?: string | null
    quePaso?: string | null
    porQueImporta?: string | null
    contexto?: string | null
    queSigue?: string | null
  } | null
}

/**
 * El artículo original completo (`sourceContent`) queda fuera a propósito: la
 * extracción trae menús, «notas relacionadas» y avisos del medio, y un cliente
 * nombrado en la barra lateral no es una nota que informe sobre él. El cuerpo
 * entra aunque esté oculto por no estar revisado (C7): es parte de la nota.
 */
export function textosDeNota(n: TextosDeNota): Array<string | null | undefined> {
  return [
    n.title, n.sourceTitle, n.summary, n.quote, n.quoteAttribution,
    n.body?.bajada, n.body?.quePaso, n.body?.porQueImporta, n.body?.contexto, n.body?.queSigue,
  ]
}

/**
 * Candado de «solo organizaciones» para el RUT, cuando se anota: en Chile las
 * personas naturales tienen RUT bajo 50.000.000 y las personas jurídicas sobre
 * (empresas, comunidades y asociaciones de la Ley 19.253, órganos del Estado).
 * Devuelve el motivo del rechazo, o null si el RUT sirve.
 */
export function motivoRutInvalido(rut: string): string | null {
  const limpio = rut.replace(/[.\s]/g, '').toUpperCase()
  const m = /^(\d{7,9})-?([\dK])$/.exec(limpio)
  if (!m) return 'El RUT debe tener la forma 76.707.746-7.'
  const cuerpo = m[1]
  const dv = m[2]
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  if (dv !== esperado) return 'El dígito verificador del RUT no corresponde.'
  if (Number(cuerpo) < 50_000_000) {
    return 'Ese RUT es de una persona natural. La lista solo admite organizaciones.'
  }
  return null
}
