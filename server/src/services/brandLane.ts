import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { createLogger } from '../lib/logger.js'
import { config } from '../config.js'
import { getMediumLLM, rateLimitDelay } from './llm.js'
import { senalRegional, deduplicar, tituloDedup, comunaPrincipal } from '../lib/brandRegion.js'
import { utc } from '../lib/sqlTime.js'
import { sensiblesDelTitulo } from '../lib/brandSensitive.js'
import { pareceNombrarPersona, MOTIVO_GENERICO } from '../lib/brandLanguage.js'
import { seleccionarAraucania, reglasDesdeBalance, type Admitida } from '../lib/brandSelection.js'
import { buildTerritorialPrompt, buildMapuchePrompt, type ArticuloJuez } from '../prompts/brandLane.js'
import {
  brandTerritorialResultSchema,
  brandMapucheResultSchema,
  type BrandTerritorialItem,
  type BrandMapucheItem,
} from '../schemas/brandLane.js'
import { communityMembershipCondition, temasVivos } from '../lib/communityVisibility.js'
import { membershipWhere } from './communityReview.js'

/**
 * EL CARRIL DE MARCA (D5 del programa Las Otras Voces). Diseño completo en el
 * repo privado otras-voces, estrategia/d5-criterio-por-marca.md.
 *
 * Solo SUMA: lee lo que el pipeline global ya cerró y escribe en sus propias
 * tablas (story_brand_assessments). NUNCA escribe stories.status, relevance,
 * relevance_pre, date_published, slug, title, summary, issue_id ni cluster_id:
 * Voces Indígenas y toda superficie global quedan idénticas. Un test de contrato
 * lo vigila.
 *
 * Esta entrega cubre la SOMBRA de las dos marcas: candidatas, juicio y
 * selección. En sombra nada se redacta, nada se publica y nada se escribe en
 * D4; lo elegido queda en estado 'selected' para medir (diseño, sección 9).
 *
 * Candados de costo (el 12-oct-2026 el gasto de OpenAI llegó a 35,6 USD/día por
 * reenviar una cola): interruptor global D5_ENABLED; tope de llamadas por marca
 * y día CONTADO EN LA BASE (lotes distintos del día), no en memoria; cada nota
 * se juzga una sola vez y con 2 intentos como máximo; sin pautas cargadas no se
 * llama al modelo.
 */

const log = createLogger('brand_lane')

export type BrandMode = 'off' | 'shadow' | 'enforce'
const MODOS: readonly BrandMode[] = ['off', 'shadow', 'enforce']

export interface BrandCriteria {
  communityId: string
  slug: string
  keywords: string[]
  issueIds: string[]
  criterion: 'territorial' | 'escala_mapuche'
  mode: BrandMode
  rescueMode: BrandMode
  guidelines: string
  guidelinesVersion: number
  relevanceMin: number
  dailyTarget: number
  balance: unknown
  dailyCallCap: number
}

/** Verticales con criterio propio encendido (sombra o aplicar). Nunca lanza: sin tabla, ninguna. */
export async function brandCriteriaActivos(): Promise<BrandCriteria[]> {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT b.community_id, c.slug, c.keywords, c.issue_ids, b.criterion, b.mode, b.rescue_mode,
             b.guidelines, b.guidelines_version, b.relevance_min, b.daily_target, b.balance, b.daily_call_cap
        FROM community_brand_criteria b
        JOIN communities c ON c.id = b.community_id
       WHERE b.mode <> 'off' OR b.rescue_mode <> 'off'
    `
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => MODOS.includes(r.mode as BrandMode) && MODOS.includes(r.rescue_mode as BrandMode))
      .map((r) => ({
        communityId: String(r.community_id),
        slug: String(r.slug),
        keywords: (r.keywords as string[]) ?? [],
        issueIds: (r.issue_ids as string[]) ?? [],
        criterion: r.criterion as BrandCriteria['criterion'],
        mode: r.mode as BrandMode,
        rescueMode: r.rescue_mode as BrandMode,
        guidelines: String(r.guidelines ?? ''),
        guidelinesVersion: Number(r.guidelines_version ?? 0),
        relevanceMin: Number(r.relevance_min),
        dailyTarget: Number(r.daily_target ?? 0),
        balance: r.balance ?? {},
        dailyCallCap: Number(r.daily_call_cap ?? 20),
      }))
  } catch (err) {
    log.debug({ err }, 'brand criteria unavailable, treating as off')
    return []
  }
}

/** Comienzo del día UTC: el tope diario se cuenta por día UTC, como los jobs. */
export function inicioDelDia(ahora: Date): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
}

/**
 * Llamadas al modelo hechas hoy por esta marca, contadas en brand_lane_calls:
 * una fila por llamada, escrita ANTES de llamar. Antes se contaban lotes
 * distintos en story_brand_assessments.batch_id, que se pisa al rejuzgar: un
 * lote fallido y rejuzgado el mismo día dejaba de contarse (revisión del
 * 13-oct-2026).
 */
export async function llamadasDeHoy(communityId: string, ahora: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT count(*) AS n FROM brand_lane_calls
     WHERE community_id = ${communityId} AND called_at >= ${utc(inicioDelDia(ahora))}
  `
  return Number(rows[0]?.n ?? 0)
}

/** Motivo apto para guardarse: 20 palabras como máximo (diseño, sección 3) y sin nombres de personas. */
export function motivoSeguro(motivo: string | null | undefined): string | null {
  if (!motivo) return null
  const corto = motivo.split(/\s+/).slice(0, 20).join(' ')
  return pareceNombrarPersona(corto) ? MOTIVO_GENERICO : corto
}

// --- Voces Araucanía: candidatas -------------------------------------------

const VENTANA_CANDIDATAS_DIAS = 14
/** Filas por página al leer la ventana de candidatas, y tope de páginas por corrida. */
const PAGINA = 1000
const MAX_PAGINAS = 30
/** Tope de filas para las consultas que no paginan (rescate de Mapuche). */
const LEER_POR_CORRIDA = 400

interface FilaCandidata {
  id: string
  title: string | null
  source_title: string
  feed_regional: boolean
  brand_date: Date
  date_crawled: Date
}

/**
 * Lo que murió en el pre-filtro en la ventana, sin fila del carril ni rechazo
 * manual, de lo más nuevo a lo más viejo. Pagina por (date_crawled, id): la
 * señal regional se mira en memoria, así que un LIMIT fijo antes de ese filtro
 * dejaba ver solo las horas más recientes de la ventana (revisión del 13-oct).
 */
async function leerVentana(c: BrandCriteria, desde: Date): Promise<FilaCandidata[]> {
  const todas: FilaCandidata[] = []
  let cursor: { fecha: Date; id: string } | null = null
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const despues: Prisma.Sql = cursor ? Prisma.sql`AND (s.date_crawled, s.id) < (${utc(cursor.fecha)}, ${cursor.id})` : Prisma.empty
    const filas: FilaCandidata[] = await prisma.$queryRaw<FilaCandidata[]>`
      SELECT s.id, s.title, s.source_title, (fb.feed_id IS NOT NULL) AS feed_regional,
             COALESCE(s.source_date_published, s.date_crawled) AS brand_date, s.date_crawled
        FROM stories s
        LEFT JOIN feed_brands fb ON fb.feed_id = s.feed_id AND fb.community_id = ${c.communityId}
       WHERE s.status = 'rejected'
         AND s.relevance_pre IS NOT NULL
         AND s.relevance IS NULL
         AND s.cluster_id IS NULL
         AND s.date_crawled >= ${utc(desde)}
         ${despues}
         AND NOT EXISTS (SELECT 1 FROM story_brand_assessments b WHERE b.story_id = s.id AND b.community_id = ${c.communityId})
         AND NOT EXISTS (
               SELECT 1 FROM audit_log a
                WHERE (a.action = 'story.status' AND a.target_id = s.id AND a.metadata->>'to' = 'rejected')
                   OR (a.action = 'story.bulk_status' AND a.metadata->>'to' = 'rejected' AND a.metadata->'ids' @> jsonb_build_array(s.id))
             )
       ORDER BY s.date_crawled DESC, s.id DESC
       LIMIT ${PAGINA}
    `
    todas.push(...filas)
    if (filas.length < PAGINA) return todas
    const ultima: FilaCandidata = filas[filas.length - 1]
    cursor = { fecha: ultima.date_crawled, id: ultima.id }
  }
  log.warn({ slug: c.slug, leidas: todas.length }, 'brand lane: candidate window truncated at MAX_PAGINAS')
  return todas
}

/**
 * Inserta como candidatas las notas que murieron en el pre-filtro y tienen señal
 * regional. Las duplicadas por título se insertan ya descartadas, sin costo.
 * Devuelve cuántas filas nuevas quedaron como candidatas.
 */
export async function tomarCandidatasTerritoriales(c: BrandCriteria, ahora: Date): Promise<number> {
  const desde = new Date(ahora.getTime() - VENTANA_CANDIDATAS_DIAS * 86_400_000)
  const filas = await leerVentana(c, desde)
  const conSenal = filas
    .map((f) => ({ ...f, senal: senalRegional({ title: f.title, sourceTitle: f.source_title, feedEsRegional: f.feed_regional }) }))
    .filter((f) => f.senal.signal !== null)
  if (conSenal.length === 0) return 0

  // Títulos ya juzgados por esta marca en la misma ventana: la misma noticia no se paga dos veces.
  const recientes = await prisma.$queryRaw<Array<{ source_title: string }>>`
    SELECT s.source_title FROM story_brand_assessments b JOIN stories s ON s.id = b.story_id
     WHERE b.community_id = ${c.communityId} AND b.created_at >= ${utc(desde)}
  `
  const unicas = deduplicar(conSenal.map((f) => ({ ...f, sourceTitle: f.source_title })), recientes.map((r) => tituloDedup(r.source_title)))
  const tope = config.brandLane.maxCandidatesPerRun
  const elegidas = unicas.slice(0, tope)
  // Las que repiten un titular ya visto se guardan descartadas: así no vuelven a leerse.
  const idsUnicas = new Set(unicas.map((u) => u.id))
  const duplicadas = conSenal.filter((f) => !idsUnicas.has(f.id))

  const fila = (f: (typeof conSenal)[number], state: 'candidate' | 'discarded') => ({
    id: randomUUID(),
    storyId: f.id,
    communityId: c.communityId,
    sourceSignal: f.senal.signal as string,
    matchedTerms: f.senal.matched,
    sensitiveFlagsFilter: sensiblesDelTitulo(f.title, f.source_title),
    brandDate: f.brand_date,
    state,
    discardReason: state === 'discarded' ? 'duplicate' : null,
  })
  await prisma.storyBrandAssessment.createMany({
    data: [...elegidas.map((f) => fila(f, 'candidate')), ...duplicadas.map((f) => fila(f, 'discarded'))],
    skipDuplicates: true,
  })
  return elegidas.length
}

// --- Juicio (las dos marcas) -------------------------------------------------

/** Lote de 8: el formateador propio no corta el último, y el servicio verifica juzgadas = enviadas. */
export const TAMANO_LOTE = 8

interface Pendiente {
  id: string
  storyId: string
  attempts: number
  sourceTitle: string
  sourceContent: string
}

/**
 * Qué orígenes de candidata se juzgan según los modos encendidos: un carril
 * apagado no gasta llamadas en lo que dejó pendiente (revisión del 13-oct).
 */
export function origenesActivos(c: Pick<BrandCriteria, 'criterion' | 'mode' | 'rescueMode'>): string[] {
  if (c.criterion === 'territorial') return c.mode === 'off' ? [] : ['term', 'feed']
  return [...(c.mode === 'off' ? [] : ['keyword']), ...(c.rescueMode === 'off' ? [] : ['rescue'])]
}

async function pendientesDeJuicio(c: BrandCriteria, limite: number): Promise<Pendiente[]> {
  const origenes = origenesActivos(c)
  if (origenes.length === 0) return []
  const rows = await prisma.storyBrandAssessment.findMany({
    where: { communityId: c.communityId, state: 'candidate', attempts: { lt: config.brandLane.maxAttempts }, sourceSignal: { in: origenes } },
    orderBy: { createdAt: 'asc' },
    take: limite,
    select: { id: true, storyId: true, attempts: true, story: { select: { sourceTitle: true, sourceContent: true } } },
  })
  return rows.map((r) => ({ id: r.id, storyId: r.storyId, attempts: r.attempts, sourceTitle: r.story.sourceTitle, sourceContent: r.story.sourceContent }))
}

type Juicio =
  | { tipo: 'territorial'; item: BrandTerritorialItem }
  | { tipo: 'mapuche'; item: BrandMapucheItem }

/** Lo que se escribe en la fila según el juicio. Pura, para testearla sin base. */
export function aplicarJuicio(c: Pick<BrandCriteria, 'relevanceMin' | 'criterion'>, j: Juicio): {
  admitted: boolean
  brandScore: number | null
  axis: string | null
  place: string | null
  sensitiveFlagsJudge: string[]
  admissionReason: string | null
  state: 'evaluated' | 'discarded'
  discardReason: string | null
} {
  const item = j.item
  const base = {
    brandScore: item.score,
    axis: item.axis,
    place: j.tipo === 'mapuche' ? j.item.place : null,
    sensitiveFlagsJudge: item.sensitive,
    admissionReason: motivoSeguro(item.reason),
  }
  if (j.tipo === 'territorial') {
    const admitted = j.item.isNews && j.item.aboutRegion && j.item.axis !== null && j.item.score !== null
    if (!admitted) return { ...base, admitted: false, state: 'discarded', discardReason: 'not_admitted' }
    if ((j.item.score ?? 0) < c.relevanceMin) return { ...base, admitted: true, state: 'discarded', discardReason: 'below_min' }
    return { ...base, admitted: true, state: 'evaluated', discardReason: null }
  }
  // Mapuche: la nota de marca ordena; sin eje o sin nota, la fila queda descartada por error de juicio.
  if (j.item.score === null || j.item.axis === null) return { ...base, admitted: false, state: 'discarded', discardReason: 'error' }
  return { ...base, admitted: true, state: 'evaluated', discardReason: null }
}

/**
 * Juzga las candidatas de una marca en lotes, sin pasar el tope del día.
 * Devuelve cuántas llamadas al modelo hizo.
 */
export async function juzgarPendientes(c: BrandCriteria, ahora: Date): Promise<number> {
  if (!c.guidelines.trim()) {
    log.warn({ slug: c.slug }, 'brand guidelines empty: the lane does not call the model')
    return 0
  }
  const hechas = await llamadasDeHoy(c.communityId, ahora)
  const disponibles = Math.max(0, c.dailyCallCap - hechas)
  if (disponibles === 0) {
    log.info({ slug: c.slug, hechas, tope: c.dailyCallCap }, 'brand lane daily call cap reached')
    return 0
  }
  const pendientes = await pendientesDeJuicio(c, disponibles * TAMANO_LOTE)
  let llamadas = 0
  const llm = getMediumLLM()

  for (let i = 0; i < pendientes.length && llamadas < disponibles; i += TAMANO_LOTE) {
    const lote = pendientes.slice(i, i + TAMANO_LOTE)
    const batchId = randomUUID()
    const articulos: ArticuloJuez[] = lote.map((p) => ({ id: p.storyId, title: p.sourceTitle, content: p.sourceContent }))
    const territorial = c.criterion === 'territorial'
    const prompt = territorial ? buildTerritorialPrompt(c.guidelines, articulos) : buildMapuchePrompt(c.guidelines, articulos)
    // Sin withRetry: el modelo ya reintenta los transitorios por dentro (maxRetries
    // en services/llm.ts), y un reintento exterior multiplicaba las llamadas reales
    // por lote fuera del tope diario. Un lote que falla no se reencola en la misma
    // corrida (diseño D5, sección 8): sus notas suman un intento y vuelven en la siguiente.
    //
    // ANTES de llamar: la llamada queda contada y el intento sumado. Si el proceso
    // cae después de pagar, ni la llamada sale del tope ni las notas se reenvían sin
    // límite (revisión del 13-oct-2026).
    await prisma.brandLaneCall.create({ data: { id: batchId, communityId: c.communityId, kind: 'judge', articles: lote.length } })
    await prisma.storyBrandAssessment.updateMany({
      where: { id: { in: lote.map((p) => p.id) } },
      data: { attempts: { increment: 1 }, batchId, evaluatedAt: new Date() },
    })
    llamadas++
    let respuestas: Array<BrandTerritorialItem | BrandMapucheItem> = []
    let error: string | null = null
    try {
      await rateLimitDelay()
      if (territorial) {
        const res = await llm.withStructuredOutput(brandTerritorialResultSchema, { method: 'functionCalling' }).invoke([new HumanMessage(prompt)])
        // LangChain tipa con la entrada del esquema; el parse es idempotente y aplica los .catch por campo.
        respuestas = brandTerritorialResultSchema.parse(res).articles
      } else {
        const res = await llm.withStructuredOutput(brandMapucheResultSchema, { method: 'functionCalling' }).invoke([new HumanMessage(prompt)])
        respuestas = brandMapucheResultSchema.parse(res).articles
      }
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : 'error del modelo'
      log.warn({ slug: c.slug, batchId, err }, 'brand lane batch failed')
    }
    try {
      await prisma.brandLaneCall.update({ where: { id: batchId }, data: { ok: error === null, error } })
    } catch (err) {
      log.warn({ slug: c.slug, batchId, err }, 'brand lane: could not close the call record')
    }

    const porId = new Map(respuestas.map((r) => [r.articleId, r]))
    const ahoraEval = new Date()
    for (const p of lote) {
      const r = porId.get(p.storyId)
      if (!r) {
        // Sin respuesta para esta nota: cuenta como intento; al segundo, queda descartada.
        const attempts = p.attempts + 1
        await prisma.storyBrandAssessment.update({
          where: { id: p.id },
          data: {
            attempts,
            batchId,
            evaluatedAt: ahoraEval,
            lastError: error ?? 'sin respuesta para esta nota en el lote',
            ...(attempts >= config.brandLane.maxAttempts ? { state: 'discarded', discardReason: 'error' } : {}),
          },
        })
        continue
      }
      const j: Juicio = territorial ? { tipo: 'territorial', item: r as BrandTerritorialItem } : { tipo: 'mapuche', item: r as BrandMapucheItem }
      const d = aplicarJuicio(c, j)
      await prisma.storyBrandAssessment.update({
        where: { id: p.id },
        data: {
          ...d,
          attempts: p.attempts + 1,
          batchId,
          model: 'medium',
          guidelinesVersion: c.guidelinesVersion,
          evaluatedAt: ahoraEval,
          lastError: null,
        },
      })
    }
    if (porId.size !== lote.length) log.warn({ slug: c.slug, batchId, enviados: lote.length, juzgados: porId.size }, 'brand lane batch: judged != sent')
  }
  return llamadas
}

// --- Selección ---------------------------------------------------------------

const FRESCURA_HORAS = 72

/** Selección diaria de Araucanía por reglas fijas. En sombra marca 'selected' para medir. */
export async function seleccionarTerritorial(c: BrandCriteria, ahora: Date): Promise<string[]> {
  const desde = new Date(ahora.getTime() - FRESCURA_HORAS * 3_600_000)
  const hoy = inicioDelDia(ahora)
  const [admitidas, yaHoy] = await Promise.all([
    prisma.storyBrandAssessment.findMany({
      where: { communityId: c.communityId, state: 'evaluated', admitted: true, brandDate: { gte: desde } },
      select: { id: true, storyId: true, brandScore: true, axis: true, matchedTerms: true, brandDate: true },
    }),
    prisma.storyBrandAssessment.findMany({
      where: { communityId: c.communityId, selectedAt: { gte: hoy } },
      select: { axis: true, matchedTerms: true },
    }),
  ])
  const aSel = (r: { axis: string | null; matchedTerms: string[] }) => ({ axis: r.axis ?? '', comuna: comunaPrincipal(r.matchedTerms) })
  const vigentes = await siguenVigentes(admitidas)
  const candidatas: Admitida[] = admitidas
    .filter((r) => vigentes.has(r.storyId))
    .map((r) => ({
      id: r.id,
      brandScore: r.brandScore ?? 0,
      axis: r.axis ?? '',
      comuna: comunaPrincipal(r.matchedTerms),
      brandDate: r.brandDate ?? ahora,
    }))
  // Mientras el día siga abierto, los lugares de región completa se guardan aunque
  // hoy todavía no haya: una corrida temprana no llena el cupo con tensiones
  // (revisión del 13-oct-2026). La última corrida del día los suelta.
  const diaAbierto = ahora.getUTCHours() < config.brandLane.selectionCloseHourUtc
  const ids = seleccionarAraucania(candidatas, reglasDesdeBalance(c), yaHoy.map(aSel), { diaAbierto })
  if (ids.length > 0) {
    await prisma.storyBrandAssessment.updateMany({ where: { id: { in: ids } }, data: { state: 'selected', selectedAt: ahora } })
  }
  return ids
}

/**
 * Antes de elegir, se vuelve a mirar la nota: el juicio puede llegar días
 * después de la candidatura (revisión del 13-oct-2026). Sigue vigente si sigue
 * 'rejected' para el sitio global y nadie la rechazó a mano; las rechazadas a
 * mano quedan descartadas con motivo. Devuelve los storyId vigentes.
 */
export async function siguenVigentes(filas: Array<{ id: string; storyId: string }>): Promise<Set<string>> {
  if (filas.length === 0) return new Set()
  const ids = filas.map((f) => f.storyId)
  const [stories, aMano] = await Promise.all([
    prisma.story.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }),
    rechazadasAMano(ids),
  ])
  const rechazadas = new Set(stories.filter((st) => st.status === 'rejected').map((st) => st.id))
  const manuales = filas.filter((f) => aMano.has(f.storyId)).map((f) => f.id)
  if (manuales.length > 0) {
    await prisma.storyBrandAssessment.updateMany({ where: { id: { in: manuales } }, data: { state: 'discarded', discardReason: 'manual_reject' } })
  }
  return new Set(ids.filter((id) => rechazadas.has(id) && !aMano.has(id)))
}

// --- Voces Mapuche: notas de la vertical y rescate ---------------------------

/** Las notas que ya pertenecen a la vertical se puntúan con la escala de marca, para ordenar las destacadas. */
export async function tomarMiembrosMapuche(c: BrandCriteria, ahora: Date): Promise<number> {
  const desde = new Date(ahora.getTime() - 3 * 86_400_000)
  // La misma pertenencia que la página de la vertical (filtro único), sin la exclusión de D4.
  const pertenencia = membershipWhere({ id: c.communityId, keywords: c.keywords, issueIds: c.issueIds }, await temasVivos())
  const notas = await prisma.story.findMany({
    where: { AND: [pertenencia, { datePublished: { gte: desde } }, { brandAssessments: { none: { communityId: c.communityId } } }] },
    select: { id: true, datePublished: true },
    take: config.brandLane.maxCandidatesPerRun,
  })
  if (notas.length === 0) return 0
  await prisma.storyBrandAssessment.createMany({
    data: notas.map((n) => ({ id: randomUUID(), storyId: n.id, communityId: c.communityId, sourceSignal: 'keyword', brandDate: n.datePublished })),
    skipDuplicates: true,
  })
  return notas.length
}

/**
 * Rescate (decisión 2 del 12-oct-2026: «selecciona» es selección real): notas de
 * la vertical que el selector global descartó con relevancia 5 o más, sin
 * rechazo manual y primarias de su cluster (o sin cluster). Siguen 'rejected'
 * para el sitio global; el carril nunca escribe cluster_id.
 */
export async function tomarRescateMapuche(c: BrandCriteria, ahora: Date): Promise<number> {
  const desde = new Date(ahora.getTime() - VENTANA_CANDIDATAS_DIAS * 86_400_000)
  // Pertenencia por la MISMA condición de la vertical (filtro único), no por una copia en SQL.
  const cond = communityMembershipCondition({ id: c.communityId, keywords: c.keywords, issueIds: c.issueIds }, await temasVivos())
  const notas = await prisma.story.findMany({
    where: {
      AND: [
        cond,
        { status: 'rejected', relevance: { gte: 5 }, dateCrawled: { gte: desde } },
        { brandAssessments: { none: { communityId: c.communityId } } },
      ],
    },
    select: { id: true, clusterId: true, sourceDatePublished: true, dateCrawled: true, cluster: { select: { primaryStoryId: true } } },
    orderBy: { dateCrawled: 'desc' },
    take: LEER_POR_CORRIDA,
  })
  // Primarias de su cluster o sin cluster: el carril no saca de un cluster a una nota que el dedup juntó.
  const primarias = notas.filter((n) => n.clusterId === null || n.cluster?.primaryStoryId === n.id)
  const aMano = await rechazadasAMano(primarias.map((n) => n.id))
  const elegidas = primarias.filter((n) => !aMano.has(n.id)).slice(0, config.brandLane.maxCandidatesPerRun)
  if (elegidas.length === 0) return 0
  await prisma.storyBrandAssessment.createMany({
    data: elegidas.map((n) => ({
      id: randomUUID(),
      storyId: n.id,
      communityId: c.communityId,
      sourceSignal: 'rescue',
      brandDate: n.sourceDatePublished ?? n.dateCrawled,
    })),
    skipDuplicates: true,
  })
  return elegidas.length
}

/** Ids que una persona rechazó a mano desde el admin: el carril nunca los rescata. */
export async function rechazadasAMano(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT x.id FROM unnest(${ids}::text[]) AS x(id)
     WHERE EXISTS (
             SELECT 1 FROM audit_log a
              WHERE (a.action = 'story.status' AND a.target_id = x.id AND a.metadata->>'to' = 'rejected')
                 OR (a.action = 'story.bulk_status' AND a.metadata->>'to' = 'rejected' AND a.metadata->'ids' @> jsonb_build_array(x.id))
           )
  `
  return new Set(rows.map((r) => r.id))
}

const DIAS_DEFICIT = 30

/**
 * Orden del rescate, pura: primero los ejes que la vertical mostró menos en los
 * últimos 30 días (diseño, sección 5: «con prioridad a los ejes en déficit»),
 * después la nota de marca y, a igual nota, la más reciente.
 */
export function ordenarRescate<T extends { axis: string | null; brandScore: number | null; brandDate: Date | null }>(
  evaluadas: T[],
  cuentaPorEje: Map<string, number>,
): T[] {
  const cuenta = (eje: string | null) => (eje ? cuentaPorEje.get(eje) ?? 0 : Number.POSITIVE_INFINITY)
  return [...evaluadas].sort(
    (a, b) =>
      cuenta(a.axis) - cuenta(b.axis) ||
      (b.brandScore ?? 0) - (a.brandScore ?? 0) ||
      (b.brandDate?.getTime() ?? 0) - (a.brandDate?.getTime() ?? 0),
  )
}

/**
 * Cuántas notas de cada eje mostró la vertical en 30 días: las suyas, puntuadas
 * con la escala de marca, más lo que el carril ya rescató.
 */
export async function ejesDeLaVertical(communityId: string, ahora: Date): Promise<Map<string, number>> {
  const desde = new Date(ahora.getTime() - DIAS_DEFICIT * 86_400_000)
  const rows = await prisma.$queryRaw<Array<{ axis: string; n: bigint | number }>>`
    SELECT axis, count(*) AS n
      FROM story_brand_assessments
     WHERE community_id = ${communityId}
       AND axis IS NOT NULL
       AND brand_date >= ${utc(desde)}
       AND ((source_signal = 'keyword' AND state IN ('evaluated', 'selected', 'published'))
         OR (source_signal = 'rescue' AND state IN ('selected', 'published')))
     GROUP BY axis
  `
  return new Map(rows.map((r) => [r.axis, Number(r.n)]))
}

/** Selección del rescate: nota de marca ≥ umbral, hasta el cupo del día, primero los ejes en déficit. */
export async function seleccionarRescate(c: BrandCriteria, ahora: Date): Promise<string[]> {
  const hoy = inicioDelDia(ahora)
  const yaHoy = await prisma.storyBrandAssessment.count({ where: { communityId: c.communityId, sourceSignal: 'rescue', selectedAt: { gte: hoy } } })
  const cupo = Math.max(0, c.dailyTarget - yaHoy)
  if (cupo === 0) return []
  const todas = await prisma.storyBrandAssessment.findMany({
    where: { communityId: c.communityId, sourceSignal: 'rescue', state: 'evaluated', brandScore: { gte: c.relevanceMin } },
    select: { id: true, storyId: true, brandScore: true, axis: true, brandDate: true },
  })
  if (todas.length === 0) return []
  const vigentes = await siguenVigentes(todas)
  const evaluadas = todas.filter((r) => vigentes.has(r.storyId))
  if (evaluadas.length === 0) return []
  const ids = ordenarRescate(evaluadas, await ejesDeLaVertical(c.communityId, ahora))
    .slice(0, cupo)
    .map((r) => r.id)
  await prisma.storyBrandAssessment.updateMany({ where: { id: { in: ids } }, data: { state: 'selected', selectedAt: ahora } })
  return ids
}

// --- Corrida -----------------------------------------------------------------

export interface BrandLaneReport {
  slug: string
  mode: BrandMode
  rescueMode: BrandMode
  candidatas: number
  llamadas: number
  seleccionadas: number
  /** Sin candidatas nuevas en 24 horas: el pre-filtro falló el 99 % de los lotes durante meses sin que nadie lo viera. */
  sinCandidatas24h: boolean
}

const HORAS_ALERTA = 24

/** true si la marca no recibió candidatas nuevas en las últimas 24 horas. */
export async function sinCandidatasRecientes(communityId: string, ahora: Date): Promise<boolean> {
  const ultima = await prisma.storyBrandAssessment.findFirst({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return !ultima || ahora.getTime() - ultima.createdAt.getTime() > HORAS_ALERTA * 3_600_000
}

/** Una corrida del carril para cada marca encendida. Con D5_ENABLED=false no hace nada. */
export async function runBrandLaneOnce(ahora: Date = new Date()): Promise<BrandLaneReport[]> {
  if (!config.brandLane.enabled) {
    log.info('D5_ENABLED is false: the brand lane does nothing')
    return []
  }
  const reports: BrandLaneReport[] = []
  for (const c of await brandCriteriaActivos()) {
    let candidatas = 0
    let seleccionadas = 0
    if (c.criterion === 'territorial' && c.mode !== 'off') {
      candidatas += await tomarCandidatasTerritoriales(c, ahora)
    }
    if (c.criterion === 'escala_mapuche') {
      if (c.mode !== 'off') candidatas += await tomarMiembrosMapuche(c, ahora)
      if (c.rescueMode !== 'off') candidatas += await tomarRescateMapuche(c, ahora)
    }
    const llamadas = await juzgarPendientes(c, ahora)
    if (c.criterion === 'territorial' && c.mode !== 'off') seleccionadas += (await seleccionarTerritorial(c, ahora)).length
    if (c.criterion === 'escala_mapuche' && c.rescueMode !== 'off') seleccionadas += (await seleccionarRescate(c, ahora)).length
    const sinCandidatas24h = await sinCandidatasRecientes(c.communityId, ahora)
    const report = { slug: c.slug, mode: c.mode, rescueMode: c.rescueMode, candidatas, llamadas, seleccionadas, sinCandidatas24h }
    if (sinCandidatas24h) log.warn(report, 'brand lane: no new candidates in 24 hours')
    else log.info(report, 'brand lane run')
    reports.push(report)
  }
  return reports
}
