/**
 * El aviso de independencia (regla 2): la lista de clientes, el cruce con una
 * nota al leer la ficha y la búsqueda de notas por cliente para el panel.
 * La lógica del cruce vive en lib/avisoClientes.ts y no toca la base.
 *
 * Todo lector tolera que las tablas no existan todavía (las aplica el director
 * a mano): sin tablas no hay aviso, nunca un 500.
 */
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import {
  avisoDeIndependencia,
  clientesMencionados,
  textosDeNota,
  type AvisoIndependencia,
  type ClienteParaCruce,
  type TextosDeNota,
} from '../lib/avisoClientes.js'

const log = createLogger('aviso-clientes')

const TTL_MS = 60_000
let cache: { at: number; clientes: ClienteParaCruce[] } | null = null
let avisadoSinTablas = false

function tablaAusente(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === 'P2021' || code === 'P2022'
}

/** Se llama tras cada cambio de la lista desde el panel. */
export function invalidarListaDeClientes(): void {
  cache = null
}

export async function listaDeClientes(): Promise<ClienteParaCruce[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.clientes
  try {
    const clientes = await prisma.disclosureClient.findMany({
      select: { id: true, name: true, aliases: true, vertical: true, endedOn: true },
    })
    cache = { at: Date.now(), clientes }
    return clientes
  } catch (err) {
    if (!tablaAusente(err)) throw err
    if (!avisadoSinTablas) {
      avisadoSinTablas = true
      log.warn('disclosure_clients no existe: las fichas salen sin aviso hasta que se aplique la migración')
    }
    cache = { at: Date.now(), clientes: [] }
    return []
  }
}

/**
 * El aviso para la ficha de una nota, o null. Nunca lanza: un fallo aquí deja
 * la ficha sin aviso y queda en el log, en vez de tumbar la nota entera.
 */
export async function avisoParaNota(storyId: string, nota: TextosDeNota): Promise<AvisoIndependencia | null> {
  try {
    const clientes = await listaDeClientes()
    if (clientes.length === 0) return null
    const mencionados = clientesMencionados(textosDeNota(nota), clientes)
    if (mencionados.length === 0) return null
    const descartes = await prisma.storyDisclosureDismissal.findMany({
      where: { storyId, clientId: { in: mencionados.map((c) => c.id) } },
      select: { clientId: true },
    })
    return avisoDeIndependencia(mencionados, new Set(descartes.map((d) => d.clientId)))
  } catch (err) {
    log.error({ err, storyId }, 'no se pudo calcular el aviso de independencia; la ficha sale sin él')
    return null
  }
}

export interface NotaConMencion {
  id: string
  slug: string | null
  title: string | null
  datePublished: Date | null
  dismissed: { reason: string; dismissedBy: string; createdAt: Date } | null
}

const LOTE = 500

/**
 * Las notas publicadas que mencionan a un cliente, las más recientes primero,
 * con su descarte si lo tienen. Solo para el panel: recorre las publicadas por
 * lotes con el mismo cruce de la ficha, para que lo que el panel muestra sea
 * exactamente lo que el lector ve.
 */
export async function notasQueMencionan(clientId: string, tope = 200): Promise<NotaConMencion[] | null> {
  const cliente = await prisma.disclosureClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, aliases: true, vertical: true, endedOn: true },
  })
  if (!cliente) return null

  const encontradas: Array<Omit<NotaConMencion, 'dismissed'>> = []
  let cursor: string | undefined
  for (;;) {
    const lote = await prisma.story.findMany({
      where: { status: 'published' },
      orderBy: { id: 'asc' },
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true, slug: true, title: true, datePublished: true,
        sourceTitle: true, summary: true, quote: true, quoteAttribution: true,
        body: { select: { bajada: true, quePaso: true, porQueImporta: true, contexto: true, queSigue: true } },
      },
    })
    for (const n of lote) {
      if (clientesMencionados(textosDeNota(n), [cliente]).length > 0) {
        encontradas.push({ id: n.id, slug: n.slug, title: n.title, datePublished: n.datePublished })
      }
    }
    if (lote.length < LOTE) break
    cursor = lote[lote.length - 1].id
  }

  encontradas.sort((a, b) => (b.datePublished?.getTime() ?? 0) - (a.datePublished?.getTime() ?? 0))
  const recorte = encontradas.slice(0, tope)
  const descartes = await prisma.storyDisclosureDismissal.findMany({
    where: { clientId, storyId: { in: recorte.map((n) => n.id) } },
    select: { storyId: true, reason: true, dismissedBy: true, createdAt: true },
  })
  const porNota = new Map(descartes.map((d) => [d.storyId, d]))
  return recorte.map((n) => {
    const d = porNota.get(n.id)
    return { ...n, dismissed: d ? { reason: d.reason, dismissedBy: d.dismissedBy, createdAt: d.createdAt } : null }
  })
}
