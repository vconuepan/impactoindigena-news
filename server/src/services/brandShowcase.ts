import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { VISIBLE_WHEN_ENFORCED } from '../lib/communityVisibility.js'
import { origenesQuePublican } from '../lib/brandOrigins.js'
import { equilibrarDestacadas, reglasDestacadas, type ReglasDestacadas } from '../lib/brandBalance.js'

/**
 * LA VITRINA DE MARCA (D5, entrega 2): lo que la marca publicó en una vertical y
 * la retención de D4 dejó visible. Diseño: otras-voces, estrategia/
 * d5-criterio-por-marca.md, secciones 6 y 7.
 *
 * Es una lectura APARTE del filtro único (publicCommunityWhere), a propósito: ese
 * filtro lo reutilizan la cola de D4, el autopost y las proyecciones del admin,
 * que nunca deben ver estas notas. Las superficies públicas que la leen (la
 * página de la vertical, el RSS, el digest y la bienvenida) la mezclan por fecha
 * con lo publicado; las que no la leen (señales, opendata) siguen mostrando solo
 * lo publicado: «mientras una superficie no esté adaptada, enforce no la
 * incluye» (diseño, 6.4). Lo vigila community-visibility-contract.test.ts.
 *
 * Una nota está en la vitrina solo si: el carril que la publicó (su origen) está
 * en modo aplicar, su fila de marca está 'published' y su fila de D4 de esta
 * vertical está en auto o released, en cualquier modo de D4 (diseño, 7.2). Pasar
 * el carril a sombra o apagarlo la saca al instante (9.5): la vitrina se lee en
 * cada pedido.
 */

const log = createLogger('brand_showcase')

/**
 * Los orígenes que la vitrina de esta vertical muestra: los de un carril en modo
 * aplicar (lib/brandOrigins.ts, la misma regla con que el carril publica). Vacío
 * si la marca no aplica nada o no hay tabla. Nunca lanza.
 */
export async function origenesDeVitrina(communityId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ criterion: string; mode: string; rescue_mode: string }>>`
      SELECT criterion, mode, rescue_mode FROM community_brand_criteria WHERE community_id = ${communityId}
    `
    const r = Array.isArray(rows) ? rows[0] : undefined
    return r ? origenesQuePublican({ criterion: r.criterion, mode: r.mode, rescueMode: r.rescue_mode }) : []
  } catch (err) {
    log.debug({ err }, 'brand criteria unavailable, showcase off')
    return []
  }
}

/** ¿La marca de esta vertical muestra lo que publica? Algún carril en modo aplicar. Nunca lanza. */
export async function vitrinaEncendida(communityId: string): Promise<boolean> {
  return (await origenesDeVitrina(communityId)).length > 0
}

/**
 * El where de la vitrina: publicada por la marca por un origen en modo aplicar,
 * con su título, slug y fecha de marca, y visible en D4 para esta vertical.
 *
 * `excluir` es el filtro de siempre de la superficie: una nota que ya se ve por
 * ahí (un editor la publicó en el sitio global después de que la marca la
 * publicara) sale con su título original y no se repite con el de marca
 * (revisión del 13-oct).
 */
export function vitrinaWhere(communityId: string, origenes: readonly string[], opts: { desde?: Date; excluir?: Prisma.StoryWhereInput } = {}) {
  const enD4 = { communityReviews: { some: { communityId, reviewState: { in: [...VISIBLE_WHEN_ENFORCED] } } } }
  return {
    communityId,
    state: 'published',
    sourceSignal: { in: [...origenes] },
    brandTitle: { not: null },
    brandSlug: { not: null },
    brandDate: opts.desde ? { not: null, gte: opts.desde } : { not: null },
    story: opts.excluir ? { AND: [enD4, { NOT: opts.excluir }] } : enD4,
  }
}

const VITRINA_SELECT = {
  brandTitle: true,
  brandSummary: true,
  brandSlug: true,
  brandDate: true,
  brandScore: true,
  axis: true,
  place: true,
  sourceSignal: true,
  story: {
    select: {
      id: true,
      sourceUrl: true,
      sourceTitle: true,
      imageUrl: true,
      narrativeFrame: true,
      feedId: true,
      feed: { select: { id: true, title: true, displayTitle: true, issue: { select: { name: true, slug: true } } } },
    },
  },
} as const

export interface NotaDeVitrina {
  brandTitle: string | null
  brandSummary: string | null
  brandSlug: string | null
  brandDate: Date | null
  brandScore: number | null
  axis: string | null
  place: string | null
  sourceSignal: string
  story: {
    id: string
    sourceUrl: string
    sourceTitle: string
    imageUrl: string | null
    narrativeFrame: string | null
    feedId: string
    feed: { id: string; title: string; displayTitle: string | null; issue: { name: string; slug: string } }
  }
}

/** Las notas de la vitrina, de la más nueva a la más vieja. Si la vitrina está apagada, ninguna. */
export async function notasDeVitrina(communityId: string, opts: { take: number; desde?: Date; excluir?: Prisma.StoryWhereInput }): Promise<NotaDeVitrina[]> {
  if (opts.take <= 0) return []
  const origenes = await origenesDeVitrina(communityId)
  if (origenes.length === 0) return []
  return prisma.storyBrandAssessment.findMany({
    where: vitrinaWhere(communityId, origenes, opts),
    select: VITRINA_SELECT,
    orderBy: [{ brandDate: 'desc' }, { id: 'asc' }],
    take: opts.take,
  }) as unknown as Promise<NotaDeVitrina[]>
}

export async function contarVitrina(communityId: string, excluir?: Prisma.StoryWhereInput): Promise<number> {
  const origenes = await origenesDeVitrina(communityId)
  if (origenes.length === 0) return 0
  return prisma.storyBrandAssessment.count({ where: vitrinaWhere(communityId, origenes, { excluir }) })
}

/** El enlace a la ficha de una nota de marca: vive en la vertical, no en /stories (no tiene slug global). */
export function enlaceDeVitrina(communitySlug: string, brandSlug: string): string {
  return `/comunidad/${communitySlug}/n/${brandSlug}`
}

/**
 * La nota de vitrina con la forma de una nota pública del listado. Sin slug
 * global (no es alcanzable por /stories) y sin tema ni relevancia: una multicancha
 * en Angol no puede salir rotulada «Territorio y Tierras» (diseño, 6.6).
 */
export function comoNotaPublica(n: NotaDeVitrina, communitySlug: string) {
  return {
    id: n.story.id,
    slug: null,
    brandSlug: n.brandSlug,
    communitySlug,
    sourceUrl: n.story.sourceUrl,
    sourceTitle: n.story.sourceTitle,
    title: n.brandTitle,
    titleLabel: null,
    datePublished: n.brandDate,
    relevance: null,
    emotionTag: null,
    summary: n.brandSummary,
    quote: null,
    quoteAttribution: null,
    marketingBlurb: null,
    relevanceSummary: null,
    imageUrl: n.story.imageUrl,
    titleEn: null,
    titleLabelEn: null,
    summaryEn: null,
    quoteEn: null,
    marketingBlurbEn: null,
    relevanceSummaryEn: null,
    clusterId: null,
    issue: null,
    feed: n.story.feed,
  }
}

/**
 * Mezcla dos listas ya ordenadas de la más nueva a la más vieja y devuelve la
 * ventana [skip, skip + take). Pura. A igual fecha, primero la de `a`.
 */
export function mezclarPorFecha<A, B>(a: A[], b: B[], fechaA: (x: A) => number, fechaB: (x: B) => number, skip: number, take: number): Array<A | B> {
  const out: Array<A | B> = []
  let i = 0
  let j = 0
  while (out.length < skip + take && (i < a.length || j < b.length)) {
    if (j >= b.length || (i < a.length && fechaA(a[i]) >= fechaB(b[j]))) out.push(a[i++])
    else out.push(b[j++])
  }
  return out.slice(skip, skip + take)
}

/** La ficha de una nota de marca en su vertical. null si no existe, no está visible o la vitrina está apagada. */
export async function fichaDeVitrina(communityId: string, brandSlug: string): Promise<NotaDeVitrina | null> {
  const origenes = await origenesDeVitrina(communityId)
  if (origenes.length === 0) return null
  return prisma.storyBrandAssessment.findFirst({
    where: { ...vitrinaWhere(communityId, origenes), brandSlug },
    select: VITRINA_SELECT,
  }) as unknown as Promise<NotaDeVitrina | null>
}

/**
 * Un ítem de las superficies que eligen pocas notas y arman su propio enlace (el
 * RSS, el digest y la bienvenida): la misma forma para lo publicado y para la
 * vitrina, para mezclarlos por fecha en un solo lugar.
 */
export interface ItemDeSuperficie {
  id: string
  /** Para elegir destacadas (Voces Mapuche): la nota, su encuadre y su feed. */
  storyId: string
  encuadre: string | null
  feedId: string | null
  title: string
  url: string
  summary: string | null
  sourceTitle: string | null
  fecha: Date | null
  /** Para el RSS: el tema de lo publicado; la vertical, en lo de marca (no lleva tema). */
  categoria: string
}

/** Los ítems de la vitrina de una vertical, con su enlace absoluto a la ficha. */
export async function itemsDeVitrina(
  community: { id: string; slug: string; name: string },
  siteUrl: string,
  opts: { take: number; desde?: Date; excluir?: Prisma.StoryWhereInput },
): Promise<ItemDeSuperficie[]> {
  const notas = await notasDeVitrina(community.id, opts)
  // Sin título de marca no hay vitrina: nunca el titular crudo de la fuente.
  return notas
    .filter((n) => n.brandSlug && n.brandTitle)
    .map((n) => ({
      id: n.story.id,
      storyId: n.story.id,
      encuadre: n.story.narrativeFrame,
      feedId: n.story.feedId,
      title: n.brandTitle as string,
      url: `${siteUrl}${enlaceDeVitrina(community.slug, n.brandSlug as string)}`,
      summary: n.brandSummary,
      sourceTitle: n.story.feed.displayTitle || n.story.feed.title,
      fecha: n.brandDate,
      categoria: community.name,
    }))
}

/** Mezcla lo publicado con la vitrina, de lo más nuevo a lo más viejo, y deja `take`. */
export function mezclarItems(publicadas: ItemDeSuperficie[], deMarca: ItemDeSuperficie[], take: number): ItemDeSuperficie[] {
  const f = (x: ItemDeSuperficie) => x.fecha?.getTime() ?? 0
  return mezclarPorFecha(publicadas, deMarca, f, f, 0, take) as ItemDeSuperficie[]
}

// --- Destacadas de Voces Mapuche (D5, ítem 9) -----------------------------------

/**
 * Las reglas de destacadas de una vertical, si su marca ordena destacadas: solo la
 * escala Mapuche en modo aplicar (diseño D5, 9.4: «Mapuche primero, el orden de
 * destacadas»). Para las demás, null: el orden de siempre. Nunca lanza.
 */
export async function reglasDeDestacadas(communityId: string): Promise<ReglasDestacadas | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ criterion: string; mode: string; balance: unknown }>>`
      SELECT criterion, mode, balance FROM community_brand_criteria WHERE community_id = ${communityId}
    `
    const r = Array.isArray(rows) ? rows[0] : undefined
    return r && r.criterion === 'escala_mapuche' && r.mode === 'enforce' ? reglasDestacadas(r.balance) : null
  } catch {
    return null
  }
}

export interface CandidataDestacada {
  storyId: string
  encuadre: string | null
  feedId: string | null
  fecha: Date | null
}

/**
 * Elige `n` destacadas entre candidatas ordenadas de la más nueva a la más vieja.
 * Con la escala Mapuche en modo aplicar, con la regla de equilibrio
 * (lib/brandBalance.ts) y la nota de marca de cada una; si no, las `n` más
 * recientes, como siempre. Ordena y no quita: el listado sigue completo.
 */
export async function elegirDestacadas<T>(communityId: string, candidatas: T[], n: number, de: (x: T) => CandidataDestacada): Promise<T[]> {
  const reglas = await reglasDeDestacadas(communityId)
  if (!reglas || candidatas.length === 0) return candidatas.slice(0, n)
  const ids = candidatas.map((x) => de(x).storyId)
  const notas = await prisma.storyBrandAssessment.findMany({
    where: { communityId, storyId: { in: ids } },
    select: { storyId: true, brandScore: true, axis: true, place: true },
  })
  const porId = new Map(notas.map((a) => [a.storyId, a]))
  const elegidos = equilibrarDestacadas(
    candidatas.map((x) => {
      const c = de(x)
      const a = porId.get(c.storyId)
      return { id: c.storyId, nota: a?.brandScore ?? null, eje: a?.axis ?? null, lugar: a?.place ?? null, encuadre: c.encuadre, feed: c.feedId, fecha: c.fecha ?? new Date(0) }
    }),
    n,
    reglas,
  )
  const porStory = new Map(candidatas.map((x) => [de(x).storyId, x]))
  return elegidos.map((id) => porStory.get(id)).filter((x): x is T => x !== undefined)
}

/** Cuántas candidatas se leen para elegir destacadas: las de la semana alcanzan de sobra. */
export const CANDIDATAS_DESTACADAS = 30
