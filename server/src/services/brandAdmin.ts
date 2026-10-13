import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { evaluateGate } from '../lib/gate.js'
import { isReviewMode, type ReviewMode } from '../lib/communityVisibility.js'
import { marcaFor } from './communityReview.js'
import { inicioDelDia } from './brandLane.js'
import { writeAuditLog, type AuditActor } from './audit.js'

/**
 * La pantalla «Criterio por marca» (D5, entrega 2, ítem 11): el estado de cada
 * marca, la vista previa «si encendieras» y el interruptor. Diseño: otras-voces,
 * estrategia/d5-criterio-por-marca.md, sección 9.4. Las métricas completas de la
 * sombra (M1 a M9) viven en el script de otras-voces; aquí va lo que el director
 * necesita para decidir el interruptor.
 */

const log = createLogger('brand_admin')

export class BrandError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

const DIAS_VISTA_PREVIA = 7

export interface PanelDeMarca {
  slug: string
  name: string
  communityId: string
  criterion: 'territorial' | 'escala_mapuche'
  mode: ReviewMode
  rescueMode: ReviewMode
  guidelinesVersion: number
  tienePautas: boolean
  dailyCallCap: number
  dailyTarget: number
  relevanceMin: number
  /** El modo de D4 de la vertical: «aplicar» exige que D4 la revise (diseño, 7.1). */
  d4Mode: ReviewMode
  hoy: { llamadas: number; juzgadas: number; elegidas: number; publicadas: number }
  /** Lo elegido en 7 días, como si la marca estuviera en modo aplicar con el aprendizaje apagado. */
  siEncendieras: { elegidas: number; visibles: number; aLaCola: number; dias: number }
}

interface FilaCriterio {
  community_id: string
  slug: string
  name: string
  criterion: string
  mode: string
  rescue_mode: string
  guidelines_version: number
  largo: number
  daily_call_cap: number
  daily_target: number
  relevance_min: number
  d4_mode: string | null
}

async function filasDeCriterio(slug?: string): Promise<FilaCriterio[]> {
  const rows = await prisma.$queryRaw<FilaCriterio[]>`
    SELECT b.community_id, c.slug, c.name, b.criterion, b.mode, b.rescue_mode, b.guidelines_version,
           length(b.guidelines) AS largo, b.daily_call_cap, b.daily_target, b.relevance_min, m.mode AS d4_mode
      FROM community_brand_criteria b
      JOIN communities c ON c.id = b.community_id
      LEFT JOIN community_review_modes m ON m.community_id = b.community_id
     ORDER BY c.slug
  `
  return slug ? rows.filter((r) => r.slug === slug) : rows
}

/** Los orígenes que se publicarían con la marca encendida: lo de término y feed, o el rescate. */
function origenesQuePublicarian(criterion: string): string[] {
  return criterion === 'territorial' ? ['term', 'feed'] : ['rescue']
}

/**
 * ¿Quedaría visible una elegida si se encendiera? Sin banderas del juez ni del
 * filtro, y sin que el gate la retenga con el aprendizaje apagado (Araucanía se
 * enciende después de apagarlo, diseño 7.5). Pura.
 */
export function quedariaVisible(
  e: { titulo: string; resumen: string | null; encuadre: string | null; juez: string[]; filtro: string[] },
  slug: string,
): boolean {
  if (e.juez.length + e.filtro.length > 0) return false
  const g = evaluateGate({ narrativeFrame: e.encuadre, text: [e.titulo, e.resumen].filter(Boolean).join('\n') }, { learningMode: false, marca: marcaFor(slug) })
  return !g.held
}

async function panel(f: FilaCriterio, ahora: Date): Promise<PanelDeMarca> {
  const hoy = inicioDelDia(ahora)
  const desde = new Date(ahora.getTime() - DIAS_VISTA_PREVIA * 86_400_000)
  const [llamadas, juzgadas, elegidasHoy, publicadasHoy, semana] = await Promise.all([
    prisma.brandLaneCall.count({ where: { communityId: f.community_id, calledAt: { gte: hoy } } }),
    prisma.storyBrandAssessment.count({ where: { communityId: f.community_id, evaluatedAt: { gte: hoy } } }),
    prisma.storyBrandAssessment.count({ where: { communityId: f.community_id, selectedAt: { gte: hoy } } }),
    prisma.storyBrandAssessment.count({ where: { communityId: f.community_id, publishedAt: { gte: hoy } } }),
    prisma.storyBrandAssessment.findMany({
      where: { communityId: f.community_id, selectedAt: { gte: desde }, sourceSignal: { in: origenesQuePublicarian(f.criterion) } },
      select: {
        brandTitle: true,
        brandSummary: true,
        sensitiveFlagsJudge: true,
        sensitiveFlagsFilter: true,
        story: { select: { sourceTitle: true, title: true, summary: true, narrativeFrame: true } },
      },
    }),
  ])
  const visibles = semana.filter((e) =>
    quedariaVisible(
      {
        titulo: e.brandTitle ?? e.story.title ?? e.story.sourceTitle,
        resumen: e.brandSummary ?? e.story.summary,
        encuadre: e.story.narrativeFrame,
        juez: e.sensitiveFlagsJudge,
        filtro: e.sensitiveFlagsFilter,
      },
      f.slug,
    ),
  ).length
  return {
    slug: f.slug,
    name: f.name,
    communityId: f.community_id,
    criterion: f.criterion as PanelDeMarca['criterion'],
    mode: isReviewMode(f.mode) ? f.mode : 'off',
    rescueMode: isReviewMode(f.rescue_mode) ? f.rescue_mode : 'off',
    guidelinesVersion: Number(f.guidelines_version),
    tienePautas: Number(f.largo ?? 0) > 0,
    dailyCallCap: Number(f.daily_call_cap),
    dailyTarget: Number(f.daily_target),
    relevanceMin: Number(f.relevance_min),
    d4Mode: isReviewMode(f.d4_mode) ? f.d4_mode : 'off',
    hoy: { llamadas, juzgadas, elegidas: elegidasHoy, publicadas: publicadasHoy },
    siEncendieras: { elegidas: semana.length, visibles, aLaCola: semana.length - visibles, dias: DIAS_VISTA_PREVIA },
  }
}

export async function panelesDeMarca(ahora: Date = new Date()): Promise<PanelDeMarca[]> {
  return Promise.all((await filasDeCriterio()).map((f) => panel(f, ahora)))
}

export async function panelDeMarca(slug: string, ahora: Date = new Date()): Promise<PanelDeMarca | null> {
  const [f] = await filasDeCriterio(slug)
  return f ? panel(f, ahora) : null
}

export interface ElegidaDeMarca {
  storyId: string
  titulo: string
  eje: string | null
  nota: number | null
  lugar: string | null
  origen: 'territorial' | 'rescate' | 'palabras_clave'
  estado: string
  motivo: string | null
  banderas: string[]
  fecha: Date | null
  brandSlug: string | null
}

/** Lo elegido por la marca en los últimos días, de lo más nuevo a lo más viejo. */
export async function elegidasDeMarca(communityId: string, ahora: Date = new Date()): Promise<ElegidaDeMarca[]> {
  const desde = new Date(ahora.getTime() - DIAS_VISTA_PREVIA * 86_400_000)
  const rows = await prisma.storyBrandAssessment.findMany({
    where: { communityId, selectedAt: { gte: desde } },
    orderBy: { selectedAt: 'desc' },
    take: 100,
    select: {
      storyId: true,
      brandTitle: true,
      brandSlug: true,
      axis: true,
      brandScore: true,
      place: true,
      sourceSignal: true,
      state: true,
      discardReason: true,
      sensitiveFlagsJudge: true,
      sensitiveFlagsFilter: true,
      selectedAt: true,
      story: { select: { sourceTitle: true, title: true } },
    },
  })
  return rows.map((r) => ({
    storyId: r.storyId,
    titulo: r.brandTitle ?? r.story.title ?? r.story.sourceTitle,
    eje: r.axis,
    nota: r.brandScore,
    lugar: r.place,
    origen: r.sourceSignal === 'rescue' ? 'rescate' : r.sourceSignal === 'keyword' ? 'palabras_clave' : 'territorial',
    estado: r.state,
    motivo: r.discardReason,
    banderas: [...r.sensitiveFlagsJudge, ...r.sensitiveFlagsFilter],
    fecha: r.selectedAt,
    brandSlug: r.brandSlug,
  }))
}

/**
 * Cambia el modo de la marca o de su rescate. Solo administradores (lo exige la
 * ruta). Se niega:
 *   - sin pautas cargadas, a sombra o aplicar: el juez no tendría criterio;
 *   - a aplicar, si D4 no revisa la vertical (diseño, 7.1): lo de marca se ve solo
 *     con su fila de D4 en auto o released;
 *   - al rescate de una marca territorial, que no lo tiene.
 * «D5 solo suma» (diseño, 9.4) no se comprueba aquí porque está garantizado por
 * construcción: la vitrina es una lectura aparte que se mezcla con lo publicado
 * sin quitar nada (services/brandShowcase.ts). Lo vigila el test del listado de
 * la vertical (routes/public/communities-brand.test.ts).
 */
export async function cambiarModoDeMarca(args: {
  slug: string
  mode?: ReviewMode
  rescueMode?: ReviewMode
  actor: AuditActor
}): Promise<{ from: { mode: ReviewMode; rescueMode: ReviewMode }; to: { mode: ReviewMode; rescueMode: ReviewMode } }> {
  const [f] = await filasDeCriterio(args.slug)
  if (!f) throw new BrandError(404, 'Esta vertical no tiene criterio de marca')
  const actual = { mode: (isReviewMode(f.mode) ? f.mode : 'off') as ReviewMode, rescueMode: (isReviewMode(f.rescue_mode) ? f.rescue_mode : 'off') as ReviewMode }
  const nuevo = { mode: args.mode ?? actual.mode, rescueMode: args.rescueMode ?? actual.rescueMode }

  if (f.criterion === 'territorial' && nuevo.rescueMode !== 'off') {
    throw new BrandError(409, 'Voces Araucanía no tiene rescate: su criterio es territorial')
  }
  const enciende = nuevo.mode !== 'off' || nuevo.rescueMode !== 'off'
  if (enciende && Number(f.largo ?? 0) === 0) {
    throw new BrandError(409, 'Sin pautas cargadas: el juez no tendría criterio. Carga pautas-v1.sql antes de encender.')
  }
  const aplica = nuevo.mode === 'enforce' || nuevo.rescueMode === 'enforce'
  if (aplica && !(isReviewMode(f.d4_mode) && f.d4_mode !== 'off')) {
    throw new BrandError(409, 'D4 no revisa esta vertical: lo que entra por marca no tendría a dónde ir. Pon D4 en sombra antes de aplicar.')
  }

  await prisma.$executeRaw`
    UPDATE community_brand_criteria
       SET mode = ${nuevo.mode}, rescue_mode = ${nuevo.rescueMode}, updated_by = ${args.actor.userId ?? null}, updated_at = NOW()
     WHERE community_id = ${f.community_id}
  `
  await writeAuditLog({
    actor: args.actor,
    action: 'brand.mode',
    targetType: 'community',
    targetId: f.community_id,
    metadata: { slug: f.slug, from: actual, to: nuevo },
  })
  log.info({ slug: f.slug, from: actual, to: nuevo }, 'brand mode changed')
  return { from: actual, to: nuevo }
}
