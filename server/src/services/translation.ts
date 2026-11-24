import { z } from 'zod'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createLogger } from '../lib/logger.js'
import { withRetry, isRetryableLLMError } from '../lib/retry.js'
import { getSmallLLM, rateLimitDelay } from './llm.js'
import prisma from '../lib/prisma.js'
import { truncateQuote } from '../lib/truncateQuote.js'
import { fixCapitalizationOrNull, fixTitleCapitalizationOrNull } from '../lib/title-capitalization.js'
import { limpiarCampos } from '../lib/personasSensibles.js'

const log = createLogger('translation')

/** Reintentos ante red, 429/5xx o respuesta fuera de esquema (ver `isOutputParsingError`). */
const TRANSLATION_RETRIES = 2

// Los campos de salida se llaman DISTINTO que los de entrada, a proposito.
//
// Del 10-may al 12-oct-2026 el esquema pedia `title`, `summary`... —los mismos
// nombres que traia el prompt— y, con `functionCalling` (forzado en a1a2a73
// por compatibilidad con Azure), gpt-4o-mini rellenaba la funcion copiando los
// valores en español sin traducir. Resultado medido en la API publica el
// 12-oct: 3131 de 3958 noticias publicadas con el "ingles" identico al
// castellano. Reproducido en vivo: 3/3 copias con los nombres iguales, 0/3 con
// estos nombres mas el mensaje de sistema. No volver a llamarlos como la entrada.
export const translationSchema = z.object({
  titleLabelEn: z.string().describe('English translation of titleLabel'),
  titleEn: z.string().describe('English translation of title'),
  summaryEn: z.string().describe('English translation of summary'),
  quoteEn: z.string().describe('English translation of quote'),
  marketingBlurbEn: z.string().describe('English translation of marketingBlurb'),
  relevanceSummaryEn: z.string().describe('English translation of relevanceSummary'),
})

// Sin bloque <ROLE>: en este pipeline dispara el filtro de contenido de Azure
// (ver memoria "superficies ocultas del prompt"). Un rol corto por mensaje de
// sistema basta y esta probado.
const SYSTEM_PROMPT =
  'You are a professional Spanish-to-English translator. Every output field must be written in English.'

interface StoryToTranslate {
  titleLabel: string | null
  title: string | null
  summary: string | null
  quote: string | null
  marketingBlurb: string | null
  relevanceSummary: string | null
}

function buildTranslationPrompt(story: StoryToTranslate): string {
  return `Translate the following news story fields from Spanish to English. Preserve the tone, style, and meaning exactly. Keep proper nouns (people names, place names, organization names) unchanged. Return structured JSON.

Fields to translate:
- titleLabel: "${story.titleLabel || ''}"
- title: "${story.title || ''}"
- summary: "${story.summary || ''}"
- quote: "${story.quote || ''}"
- marketingBlurb: "${story.marketingBlurb || ''}"
- relevanceSummary: "${story.relevanceSummary || ''}"`
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Una "traduccion" identica al original no es una traduccion: es el modelo
 * devolviendo lo que recibio. Compara sin distinguir mayusculas ni espacios,
 * porque el guardarrail de capitalizacion toca el titulo despues.
 */
export function isUntranslated(original: string | null | undefined, translated: string | null | undefined): boolean {
  const o = normalize(original)
  const t = normalize(translated)
  return o.length > 0 && t.length > 0 && o === t
}

export class TranslationUnchangedError extends Error {
  constructor(public readonly storyId: string, public readonly fields: string[]) {
    super(`translation came back identical to the Spanish original (${fields.join(', ')})`)
    this.name = 'TranslationUnchangedError'
  }
}

export async function translateStory(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      titleLabel: true,
      title: true,
      summary: true,
      quote: true,
      marketingBlurb: true,
      relevanceSummary: true,
    },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title && !story.summary) {
    log.warn({ storyId }, 'story has no content to translate, skipping')
    return
  }

  const prompt = buildTranslationPrompt(story)
  const llm = getSmallLLM()
  const structuredLlm = llm.withStructuredOutput(translationSchema, { method: 'functionCalling' })

  await rateLimitDelay()
  log.info({ storyId }, 'translating story to English')

  // Reintenta también si la respuesta no calza con el esquema: con Claude,
  // 3 de 30 llegaron con JSON roto el 23-nov-2026 y la noticia quedaba sin
  // inglés. Dos reintentos como tope: cada uno es otra llamada al modelo.
  const result = await withRetry(
    () => structuredLlm.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(prompt)]),
    { retries: TRANSLATION_RETRIES, retryOn: isRetryableLLMError },
  )

  // Guardarrail determinista en el punto de escritura: una instruccion al LLM
  // es blanda, y el test unitario simula el modelo, asi que ninguno de los dos
  // puede atrapar esto.
  //
  // Decide el RESUMEN. Dos o tres oraciones nunca son legitimamente identicas
  // en los dos idiomas: si vuelven iguales es el modelo copiando, venga o no
  // traducido el titulo. El titulo solo NO rechaza: uno hecho de nombres
  // propios («Tapati Rapa Nui 2026») es identico de verdad, y hasta el
  // 20-oct-2026 hundia la nota entera, resumen incluido. El rotulo queda fuera
  // por la misma razon («COP30»). Una noticia sin resumen no tiene con que
  // discriminar y pasa. Falla cerrado: no se escribe nada y la noticia sigue
  // cayendo al español, que es lo mismo que pasaba.
  const copied = (['title', 'summary'] as const).filter(f => isUntranslated(story[f], result[`${f}En`]))
  if (copied.includes('summary')) {
    throw new TranslationUnchangedError(storyId, copied)
  }

  // El traductor es otro modelo y puede volver a poner lo que el candado sacó
  // del español («Mapuche leader …»): el mismo candado de personas, en inglés.
  // Ver lib/personasSensibles.ts.
  const { registro: traduccion, resumen: candadoDePersonas } = limpiarCampos(
    {
      // Mismo guardarrail que la version en espanol: el traductor es otro LLM
      // y comete el mismo error con siglas y toponimos. La lista blanca no
      // depende del idioma — "CONADI" y "Mozambique" se escriben igual en los
      // dos, y para los que cambian de grafia la lista ya trae las dos formas,
      // con tilde y sin ella.
      titleEn: fixTitleCapitalizationOrNull(result.titleEn),
      titleLabelEn: fixCapitalizationOrNull(result.titleLabelEn),
      summaryEn: result.summaryEn || null,
      quoteEn: truncateQuote(result.quoteEn),
      marketingBlurbEn: result.marketingBlurbEn || null,
      relevanceSummaryEn: result.relevanceSummaryEn || null,
    },
    { texto: ['titleEn', 'summaryEn', 'marketingBlurbEn', 'relevanceSummaryEn'], citas: ['quoteEn'] },
  )
  if (candadoDePersonas.hubo) {
    log.warn({ storyId, campos: candadoDePersonas.campos }, 'candado de personas: traducción editada antes de guardar')
  }

  await prisma.story.update({
    where: { id: storyId },
    data: traduccion,
  })

  log.info({ storyId }, 'translation complete')

  // El cuerpo de la nota con claves, si lo hay. Aparte y sin lanzar: que una
  // traducción del cuerpo falle no deshace la del título y el resumen.
  try {
    await translateStoryBody(storyId)
  } catch (err) {
    log.warn({ err, storyId }, 'story body translation failed')
  }
}

// ─── La nota con claves (B3, 25-oct-2026) ───────────────────────────────────

export const bodyTranslationSchema = z.object({
  bajadaEn: z.string().describe('English translation of bajada'),
  quePasoEn: z.string().describe('English translation of quePaso'),
  porQueImportaEn: z.string().describe('English translation of porQueImporta'),
  contextoEn: z.string().describe('English translation of contexto'),
  queSigueEn: z.string().describe('English translation of queSigue; empty string if queSigue is empty'),
})

function buildBodyTranslationPrompt(cuerpo: { bajada: string; quePaso: string; porQueImporta: string; contexto: string; queSigue: string }): string {
  return `Translate the five fields of this Spanish news note into English. Keep every fact, figure, name and attribution exactly as written; translate quotes faithfully and keep them in quotation marks; do not add or remove information. Plain text, no markdown.

<bajada>${cuerpo.bajada}</bajada>
<quePaso>${cuerpo.quePaso}</quePaso>
<porQueImporta>${cuerpo.porQueImporta}</porQueImporta>
<contexto>${cuerpo.contexto}</contexto>
<queSigue>${cuerpo.queSigue}</queSigue>`
}

/**
 * Traduce el cuerpo de la nota con claves, si existe y no está traducido.
 * Mismo guardarraíl que el resumen: si `quePaso` vuelve igual al español, el
 * modelo copió y no se escribe nada. Tolera que la tabla no exista todavía.
 * Nunca lanza hacia `translateStory`: una nota sin cuerpo en inglés cae al
 * español, que es lo que ya pasaba.
 */
export async function translateStoryBody(storyId: string): Promise<'translated' | 'skipped' | 'copied'> {
  let cuerpo
  try {
    cuerpo = await prisma.storyBody.findUnique({
      where: { storyId },
      select: { bajada: true, quePaso: true, porQueImporta: true, contexto: true, queSigue: true, quePasoEn: true },
    })
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code === 'P2021' || code === 'P2022') return 'skipped'
    throw err
  }
  if (!cuerpo || cuerpo.quePasoEn) return 'skipped'

  const llm = getSmallLLM()
  const structuredLlm = llm.withStructuredOutput(bodyTranslationSchema, { method: 'functionCalling' })
  await rateLimitDelay()
  const result = await withRetry(
    () => structuredLlm.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(buildBodyTranslationPrompt(cuerpo))]),
    { retries: TRANSLATION_RETRIES, retryOn: isRetryableLLMError },
  )

  if (isUntranslated(cuerpo.quePaso, result.quePasoEn)) {
    log.warn({ storyId }, 'story body translation came back identical to the Spanish original, not written')
    return 'copied'
  }
  await prisma.storyBody.update({
    where: { storyId },
    data: {
      bajadaEn: result.bajadaEn || null,
      quePasoEn: result.quePasoEn || null,
      porQueImportaEn: result.porQueImportaEn || null,
      contextoEn: result.contextoEn || null,
      queSigueEn: cuerpo.queSigue ? result.queSigueEn || null : '',
    },
  })
  log.info({ storyId }, 'story body translated')
  return 'translated'
}

/**
 * Retoma las noticias publicadas hace poco que siguen sin título en inglés.
 *
 * `translateStoriesBatch` solo corre sobre lo que se acaba de publicar: si la
 * traducción fallaba (3 de 30 el 23-nov-2026, entre ellas la destacada de la
 * portada), nada volvía a intentarla y la noticia quedaba en español con el
 * sitio en inglés. Acotado en días y en cantidad para que una noticia que falla
 * siempre no gaste llamadas sin fin: deja de intentarse cuando sale de la
 * ventana. Solo mira `titleEn` vacío; las copias del español las sigue
 * cubriendo `scripts/backfill-translations.ts`.
 */
export async function translateRecentUntranslated(opts: {
  days: number
  limit: number
  exclude?: string[]
}): Promise<{ pending: number; translated: number; failed: number }> {
  if (opts.days <= 0 || opts.limit <= 0) return { pending: 0, translated: 0, failed: 0 }

  const since = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000)
  const pendientes = await prisma.story.findMany({
    where: {
      status: 'published',
      titleEn: null,
      datePublished: { gte: since },
      OR: [{ title: { not: null } }, { summary: { not: null } }],
      ...(opts.exclude && opts.exclude.length > 0 ? { id: { notIn: opts.exclude } } : {}),
    },
    select: { id: true },
    orderBy: [{ relevance: { sort: 'desc', nulls: 'last' } }, { datePublished: 'desc' }],
    take: opts.limit,
  })

  if (pendientes.length === 0) return { pending: 0, translated: 0, failed: 0 }

  log.info({ count: pendientes.length, days: opts.days }, 'retomando traducciones pendientes de días anteriores')
  const { translated, failed } = await translateStoriesBatch(pendientes.map(s => s.id))
  return { pending: pendientes.length, translated, failed }
}

export async function translateStoriesBatch(storyIds: string[]): Promise<{ translated: number; failed: number }> {
  let translated = 0
  let failed = 0

  for (const storyId of storyIds) {
    try {
      await translateStory(storyId)
      translated++
    } catch (err) {
      log.error({ err, storyId }, 'failed to translate story')
      failed++
    }
  }

  return { translated, failed }
}
