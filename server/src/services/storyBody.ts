import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import { publisherFromUrl } from '../lib/publisher.js'
import { buildStoryBodyPrompt } from '../prompts/story-body.js'
import { storyBodySchema, type StoryBodyResult } from '../schemas/llm.js'
import {
  CAMPOS,
  avisosBloqueantes,
  limpiarCuerpo,
  respaldoConFecha,
  revisarCuerpo,
  type BodyAviso,
  type StoryBodyText,
} from '../lib/storyBodyGuards.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'

const log = createLogger('story-body')

/**
 * La nota con claves (plan del 25-oct-2026, B2): el cuerpo de la ficha, desde
 * el artículo original completo, al publicar.
 *
 * FALLO CERRADO. Si un candado bloquea (cita no textual que no se pudo
 * limpiar, cifra, identidad, pueblo, año futuro, copia, agencia, meta), no se
 * escribe nada y la ficha sale como hoy, con el resumen. Nunca un cuerpo a
 * medias. El largo solo avisa.
 *
 * NUNCA LANZA hacia el job de publicación: una nota sin cuerpo no es motivo
 * para no publicarla. Tolera que la tabla no exista (el SQL lo aplica el
 * director) y que la función esté apagada por `STORY_BODY_ENABLED=false`.
 */

export type BodyMethod = 'ia_sin_revision' | 'ia_revisada' | 'humana'
export const BODY_METHODS: readonly BodyMethod[] = ['ia_sin_revision', 'ia_revisada', 'humana']

export type DraftOutcome =
  | { outcome: 'saved'; avisos: BodyAviso[]; words: number }
  | { outcome: 'blocked'; avisos: BodyAviso[] }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: string }

export class StoryBodyError extends Error {
  constructor(message: string, public avisos: BodyAviso[] = []) {
    super(message)
    this.name = 'StoryBodyError'
  }
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago',
})

/** P2021: la tabla no existe todavía en esta base. */
function tablaAusente(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code === 'P2021' || code === 'P2022'
}

export function palabrasDelCuerpo(cuerpo: StoryBodyText): number {
  return CAMPOS.reduce((n, c) => n + (cuerpo[c]?.trim() ? cuerpo[c].trim().split(/\s+/).length : 0), 0)
}

function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  let corte = max
  const codigo = texto.charCodeAt(corte - 1)
  if (codigo >= 0xd800 && codigo <= 0xdbff) corte -= 1
  return texto.slice(0, corte)
}

export async function draftStoryBody(storyId: string): Promise<DraftOutcome> {
  if (!config.storyBody.enabled) return { outcome: 'skipped', reason: 'STORY_BODY_ENABLED=false' }

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true, sourceTitle: true, sourceContent: true, sourceUrl: true,
      sourceDatePublished: true, datePublished: true, dateCrawled: true,
      feed: { select: { title: true, displayTitle: true } },
    },
  })
  if (!story) return { outcome: 'failed', reason: 'Story not found' }

  const publisher = publisherFromUrl(story.sourceUrl, story.feed?.displayTitle || story.feed?.title)
  if (/news\.google\./.test(story.sourceUrl)) {
    return { outcome: 'skipped', reason: 'la URL guardada es de Google News: no se sabe qué medio reporteó' }
  }
  const original = story.sourceContent?.trim() ?? ''
  if (original.length < config.storyBody.minSourceChars) {
    return { outcome: 'skipped', reason: `el original tiene ${original.length} caracteres; hacen falta ${config.storyBody.minSourceChars}` }
  }

  // La fecha va siempre: sin ella, el modelo puso «la elección de 2023» a una
  // nota de The Guardian sobre la elección de este año (medido el 25-oct-2026).
  const fechaRef = story.sourceDatePublished ?? story.datePublished ?? story.dateCrawled
  const fecha = FORMATO_FECHA.format(fechaRef)
  const prompt = buildStoryBodyPrompt({
    sourceTitle: story.sourceTitle,
    sourceContent: recortar(original, config.storyBody.maxSourceChars),
    publisher,
    sourceDate: fecha,
  })

  const tier = config.storyBody.modelTier
  const llm = getLLMByTier(tier).withStructuredOutput(storyBodySchema, { method: 'functionCalling', includeRaw: true })
  await rateLimitDelay()
  let raw: unknown
  let parsed: unknown
  try {
    ;({ raw, parsed } = await withRetry(() => llm.invoke([new HumanMessage(prompt)])))
  } catch (err) {
    log.warn({ err, storyId }, 'story body: el modelo falló')
    return { outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
  const uso = (raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } } | null)?.usage_metadata
  const anio = fechaRef.getFullYear()
  const cuerpo = limpiarCuerpo(parsed as StoryBodyResult, original)
  const avisos = revisarCuerpo(cuerpo, respaldoConFecha(original, fecha, story.sourceTitle), anio)
  const bloqueantes = avisosBloqueantes(avisos)

  if (bloqueantes.length > 0) {
    log.warn({ storyId, bloqueantes: bloqueantes.map((a) => `${a.tipo}:${a.campo}`) }, 'story body: bloqueado por los candados, la ficha sale con el resumen')
    return { outcome: 'blocked', avisos }
  }

  const data = {
    bajada: cuerpo.bajada,
    quePaso: cuerpo.quePaso,
    porQueImporta: cuerpo.porQueImporta,
    contexto: cuerpo.contexto,
    queSigue: cuerpo.queSigue,
    // Un cuerpo nuevo vuelve a cero: sin traducción, sin revisión.
    bajadaEn: null, quePasoEn: null, porQueImportaEn: null, contextoEn: null, queSigueEn: null,
    method: 'ia_sin_revision' as BodyMethod,
    reviewedBy: '',
    model: config.llm.provider === 'azure' ? config.llm.azure.deployments[tier] : tier,
    inputTokens: uso?.input_tokens ?? 0,
    outputTokens: uso?.output_tokens ?? 0,
    sourceChars: original.length,
  }
  try {
    await prisma.storyBody.upsert({ where: { storyId }, create: { storyId, ...data }, update: data })
  } catch (err) {
    if (tablaAusente(err)) {
      log.warn({ storyId }, 'story body: la tabla story_bodies no existe todavía (falta aplicar el SQL)')
      return { outcome: 'skipped', reason: 'falta aplicar el SQL de story_bodies' }
    }
    throw err
  }
  const words = palabrasDelCuerpo(cuerpo)
  log.info({ storyId, words, inputTokens: data.inputTokens, outputTokens: data.outputTokens, avisos: avisos.length }, 'story body saved')
  return { outcome: 'saved', avisos, words }
}

/** Lote del job de publicación: cuenta, nunca lanza. */
export async function draftStoryBodies(ids: string[]): Promise<{ saved: number; blocked: number; skipped: number; failed: number }> {
  const cuenta = { saved: 0, blocked: 0, skipped: 0, failed: 0 }
  if (!config.storyBody.enabled || ids.length === 0) return cuenta
  for (const id of ids) {
    try {
      const r = await draftStoryBody(id)
      cuenta[r.outcome]++
    } catch (err) {
      cuenta.failed++
      log.warn({ err, storyId: id }, 'story body: error inesperado')
    }
  }
  log.info({ stories: ids.length, ...cuenta }, 'story bodies drafted')
  return cuenta
}

export async function getStoryBody(storyId: string) {
  try {
    return await prisma.storyBody.findUnique({ where: { storyId } })
  } catch (err) {
    if (tablaAusente(err)) return null
    throw err
  }
}

/**
 * El editor corrige el texto o lo da por revisado. Editar o revisar sube el
 * método a `ia_revisada` con quién lo hizo; `humana` solo se fija explícito.
 * Lo editado vuelve a pasar por los candados: lo que bloquea no se guarda.
 */
export async function updateStoryBody(
  storyId: string,
  cambios: Partial<StoryBodyText> & { method?: BodyMethod; reviewedBy?: string },
): Promise<{ avisos: BodyAviso[] }> {
  const existente = await getStoryBody(storyId)
  if (!existente) throw new StoryBodyError('Esta noticia no tiene nota con claves')
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { sourceTitle: true, sourceContent: true, sourceDatePublished: true, datePublished: true, dateCrawled: true } })
  if (!story) throw new StoryBodyError('Story not found')

  const cuerpo: StoryBodyText = {
    bajada: cambios.bajada ?? existente.bajada,
    quePaso: cambios.quePaso ?? existente.quePaso,
    porQueImporta: cambios.porQueImporta ?? existente.porQueImporta,
    contexto: cambios.contexto ?? existente.contexto,
    queSigue: cambios.queSigue ?? existente.queSigue,
  }
  const original = story.sourceContent ?? ''
  const fechaRef = story.sourceDatePublished ?? story.datePublished ?? story.dateCrawled
  const anio = fechaRef.getFullYear()
  const avisos = revisarCuerpo(cuerpo, respaldoConFecha(original, FORMATO_FECHA.format(fechaRef), story.sourceTitle), anio)
  const bloqueantes = avisosBloqueantes(avisos)
  if (bloqueantes.length > 0) {
    throw new StoryBodyError(`No se guarda: ${bloqueantes.map((a) => a.mensaje).join(' ')}`, avisos)
  }
  const textoCambio = CAMPOS.some((c) => cambios[c] !== undefined && cambios[c] !== existente[c])
  const reviewedBy = (cambios.reviewedBy ?? existente.reviewedBy).trim()
  const method: BodyMethod = cambios.method ?? (textoCambio || reviewedBy ? 'ia_revisada' : (existente.method as BodyMethod))
  await prisma.storyBody.update({
    where: { storyId },
    data: {
      ...cuerpo,
      method,
      reviewedBy,
      // Un texto cambiado deja la traducción vieja atrás: se vuelve a traducir.
      ...(textoCambio ? { bajadaEn: null, quePasoEn: null, porQueImportaEn: null, contextoEn: null, queSigueEn: null } : {}),
    },
  })
  return { avisos }
}
