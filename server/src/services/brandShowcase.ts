import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { VISIBLE_WHEN_ENFORCED } from '../lib/communityVisibility.js'

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
 * Una nota está en la vitrina solo si: la marca está en modo aplicar, su fila de
 * marca está 'published' y su fila de D4 de esta vertical está en auto o
 * released, en cualquier modo de D4 (diseño, 7.2). Apagar la marca la saca al
 * instante (9.5): la vitrina se lee en cada pedido.
 */

const log = createLogger('brand_showcase')

/** ¿La marca de esta vertical muestra lo que publica? Modo aplicar en el carril o en el rescate. Nunca lanza. */
export async function vitrinaEncendida(communityId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ mode: string; rescue_mode: string }>>`
      SELECT mode, rescue_mode FROM community_brand_criteria WHERE community_id = ${communityId}
    `
    const r = Array.isArray(rows) ? rows[0] : undefined
    return !!r && (r.mode === 'enforce' || r.rescue_mode === 'enforce')
  } catch (err) {
    log.debug({ err }, 'brand criteria unavailable, showcase off')
    return false
  }
}

/** El where de la vitrina: publicada por la marca y visible en D4 para esta vertical. */
export function vitrinaWhere(communityId: string, desde?: Date) {
  return {
    communityId,
    state: 'published',
    ...(desde ? { brandDate: { gte: desde } } : {}),
    story: { communityReviews: { some: { communityId, reviewState: { in: [...VISIBLE_WHEN_ENFORCED] } } } },
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
export async function notasDeVitrina(communityId: string, opts: { take: number; desde?: Date }): Promise<NotaDeVitrina[]> {
  if (opts.take <= 0 || !(await vitrinaEncendida(communityId))) return []
  return prisma.storyBrandAssessment.findMany({
    where: vitrinaWhere(communityId, opts.desde),
    select: VITRINA_SELECT,
    orderBy: [{ brandDate: 'desc' }, { id: 'asc' }],
    take: opts.take,
  }) as unknown as Promise<NotaDeVitrina[]>
}

export async function contarVitrina(communityId: string): Promise<number> {
  if (!(await vitrinaEncendida(communityId))) return 0
  return prisma.storyBrandAssessment.count({ where: vitrinaWhere(communityId) })
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
  if (!(await vitrinaEncendida(communityId))) return null
  return prisma.storyBrandAssessment.findFirst({
    where: { ...vitrinaWhere(communityId), brandSlug },
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
  opts: { take: number; desde?: Date },
): Promise<ItemDeSuperficie[]> {
  const notas = await notasDeVitrina(community.id, opts)
  return notas
    .filter((n) => n.brandSlug)
    .map((n) => ({
      id: n.story.id,
      title: n.brandTitle ?? n.story.sourceTitle,
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
