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

// ---------------------------------------------------------------------------
// El aviso fuera de la ficha: redes, boletín y carrusel
// ---------------------------------------------------------------------------
//
// Formato aprobado por el director el 25-nov-2026. Las mismas frases que la
// ficha (`storyPage.independence` en client/src/locales/es.json), sin nombre ni
// enlace: el enlace a la ficha que ya lleva cada post muestra el aviso completo.

const DOMINIO_VERTICAL: Record<VerticalCliente, string> = {
  ai: 'impactoindigena.ai',
  legal: 'impactoindigena.legal',
}

function verticalesEnTexto(aviso: AvisoIndependencia): string {
  return aviso.verticals.map((v) => DOMINIO_VERTICAL[v]).join(' y de ')
}

/** La frase de la ficha: «Esta nota menciona a una organización que es cliente de …». */
export function fraseDelAviso(aviso: AvisoIndependencia): string {
  const quien = aviso.plural
    ? aviso.current ? 'organizaciones que son o fueron clientes' : 'organizaciones que fueron clientes'
    : aviso.current ? 'una organización que es cliente' : 'una organización que fue cliente'
  return `Esta nota menciona a ${quien} de ${verticalesEnTexto(aviso)}.`
}

export const PREFIJO_AVISO_LARGO = 'Aviso de independencia: '
export const PREFIJO_AVISO_CORTO = 'Aviso: la nota menciona '

/**
 * `larga`: Mastodon, Facebook, LinkedIn, el pie de Instagram y el boletín.
 * `corta`: X y Bluesky, donde cada carácter le quita espacio al gancho.
 */
export function textoDelAviso(aviso: AvisoIndependencia | null, forma: 'larga' | 'corta'): string | null {
  if (!aviso || aviso.verticals.length === 0) return null
  if (forma === 'larga') {
    const frase = fraseDelAviso(aviso)
    return PREFIJO_AVISO_LARGO + frase.charAt(0).toLowerCase() + frase.slice(1)
  }
  const quien = aviso.plural
    ? aviso.current ? 'a clientes o exclientes' : 'a exclientes'
    : aviso.current ? 'a un cliente' : 'a un excliente'
  return `${PREFIJO_AVISO_CORTO}${quien} de ${verticalesEnTexto(aviso)}.`
}

function esLineaDeAviso(linea: string): boolean {
  const t = linea.trim()
  return t.startsWith(PREFIJO_AVISO_LARGO) || t.startsWith(PREFIJO_AVISO_CORTO)
}

/** El texto sin las líneas de aviso que agregó el código (las dos formas). */
export function sinAvisoDeIndependencia(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !esLineaDeAviso(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export interface OpcionesDelAviso {
  /** Tope de caracteres del texto entero. El que cede es el cuerpo, nunca el aviso ni la cola. */
  tope?: number
  /** Entre el cuerpo y el aviso. Por defecto, un párrafo aparte. */
  separador?: string
  /** Final del texto que no se recorta (enlaces, «Reporteó»). Si el texto no termina así, no hay cola. */
  cola?: string
  /** true: el aviso va después de la cola; false (por defecto): antes. */
  alFinal?: boolean
}

/**
 * Pone el aviso que corresponde HOY y saca el que ya no corresponde. Idempotente:
 * se llama al armar el borrador y otra vez al publicar, así que una edición en el
 * panel no lo borra y un cliente agregado o descartado entre medio queda al día.
 * Mismo método que `withAiLabel`: si no cabe, se acorta el cuerpo, nunca el aviso.
 */
export function conAvisoDeIndependencia(texto: string, aviso: string | null, o: OpcionesDelAviso = {}): string {
  const separador = o.separador ?? '\n\n'
  let cuerpo = sinAvisoDeIndependencia(texto)
  let cola = ''
  if (o.cola && cuerpo.endsWith(o.cola)) {
    cola = o.cola
    cuerpo = cuerpo.slice(0, cuerpo.length - cola.length).trimEnd()
  }
  const espacio = (o.tope ?? Infinity) - (aviso ? separador.length + aviso.length : 0) - cola.length
  if (cuerpo.length > espacio) {
    let corte = Math.max(0, espacio - 1)
    const codigo = cuerpo.charCodeAt(corte - 1)
    if (codigo >= 0xd800 && codigo <= 0xdbff) corte -= 1 // no partir un emoji
    cuerpo = cuerpo.slice(0, corte).trimEnd() + '…'
  }
  if (!aviso) return cuerpo + cola
  return o.alFinal ? `${cuerpo}${cola}${separador}${aviso}` : `${cuerpo}${separador}${aviso}${cola}`
}
