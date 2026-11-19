import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { isBlueskyConfigured } from '../lib/bluesky.js'
import { isMastodonConfigured } from '../lib/mastodon.js'
import { isTwitterConfigured } from '../lib/twitter.js'
import { findAutoPostCandidates, pickBestStoryForSocial } from '../services/socialMedia.js'
import type { AutoPostChannel } from '../services/socialMedia.js'
import { withheldInEnforcedVerticals } from '../services/communityReview.js'
import {
  generateDraft as generateBlueskyDraft,
  publishPost as publishBlueskyPost,
} from '../services/bluesky.js'
import {
  generateDraft as generateMastodonDraft,
  publishPost as publishMastodonPost,
} from '../services/mastodon.js'
import {
  generateDraft as generateTwitterDraft,
  publishPost as publishTwitterPost,
} from '../services/twitter.js'
import prisma from '../lib/prisma.js'
import {
  generateDraft as generateInstagramDraft,
  publishPost as publishInstagramPost,
} from '../services/instagram.js'
import { isInstagramConfigured } from '../lib/instagram.js'
import {
  generateDraft as generateLinkedInDraft,
  publishPost as publishLinkedInPost,
} from '../services/linkedin.js'
import { isLinkedInConfigured } from '../lib/linkedin.js'
import {
  generateDraft as generateFacebookDraft,
  publishPost as publishFacebookPost,
} from '../services/facebook.js'
import { isFacebookConfigured } from '../lib/facebook.js'

const log = createLogger('social_auto_post')

interface ChannelConfig extends AutoPostChannel {
  /** Un borrador `rejected` no pasó los candados y no se publica. */
  generateDraft: (storyId: string) => Promise<{ id: string; status?: string }>
  publishPost: (postId: string) => Promise<unknown>
}

/**
 * Every channel answers "which of these stories have you already published?"
 * the same way, against its own table. One query per channel instead of one
 * per story, and the same primitive serves both candidate selection and the
 * per-channel skip in the loop below.
 */
type FindManyPublished = (args: {
  where: { storyId: { in: string[] }; status: { in: string[] } }
  select: { storyId: true }
}) => Promise<Array<{ storyId: string }>>

/**
 * `statuses`: los estados que cuentan como «ya resuelto en este canal». En
 * Instagram también `rejected`: una noticia cuyo carrusel o pie no pasó los
 * candados no se vuelve a elegir en cada corrida.
 */
function publishedLookup(findMany: FindManyPublished, statuses: string[] = ['published']) {
  return async (storyIds: string[]): Promise<Set<string>> => {
    if (storyIds.length === 0) return new Set()
    const rows = await findMany({
      where: { storyId: { in: storyIds }, status: { in: statuses } },
      select: { storyId: true },
    })
    return new Set(rows.map((row) => row.storyId))
  }
}

function getEnabledChannels(): ChannelConfig[] {
  const channels: ChannelConfig[] = []

  if (config.bluesky.autoPost.enabled && isBlueskyConfigured()) {
    channels.push({
      name: 'bluesky',
      publishedStoryIds: publishedLookup((args) => prisma.blueskyPost.findMany(args)),
      generateDraft: (storyId) => generateBlueskyDraft(storyId),
      publishPost: (postId) => publishBlueskyPost(postId),
    })
  }

  if (config.mastodon.autoPost.enabled && isMastodonConfigured()) {
    channels.push({
      name: 'mastodon',
      publishedStoryIds: publishedLookup((args) => prisma.mastodonPost.findMany(args)),
      generateDraft: (storyId) => generateMastodonDraft(storyId),
      publishPost: (postId) => publishMastodonPost(postId),
    })
  }

  if (config.twitter.autoPost.enabled && isTwitterConfigured()) {
    channels.push({
      name: 'twitter',
      publishedStoryIds: publishedLookup((args) => prisma.twitterPost.findMany(args)),
      generateDraft: (storyId) => generateTwitterDraft(storyId),
      publishPost: (postId) => publishTwitterPost(postId),
    })
  }

  if (config.instagram.autoPost.enabled && isInstagramConfigured()) {
    channels.push({
      name: 'instagram',
      publishedStoryIds: publishedLookup((args) => prisma.instagramPost.findMany(args), ['published', 'rejected']),
      // Espera el borrador para publicarlo en esta misma corrida (ver
      // GenerateDraftOptions en services/instagram.ts).
      generateDraft: (storyId) => generateInstagramDraft(storyId, { esperar: true }),
      publishPost: (postId) => publishInstagramPost(postId),
    })
  }

  // LinkedIn was configurable but never wired in: LINKEDIN_AUTO_POST_ENABLED
  // existed and did nothing, so turning it on posted nothing. Last in the list
  // because its draft renders carousel slides, which is the slowest of the five.
  if (config.linkedin.autoPost.enabled && isLinkedInConfigured()) {
    channels.push({
      name: 'linkedin',
      publishedStoryIds: publishedLookup((args) => prisma.linkedInPost.findMany(args)),
      generateDraft: (storyId) => generateLinkedInDraft(storyId),
      publishPost: (postId) => publishLinkedInPost(postId),
    })
  }

  if (config.facebook.autoPost.enabled && isFacebookConfigured()) {
    channels.push({
      name: 'facebook',
      publishedStoryIds: publishedLookup((args) => prisma.facebookPost.findMany(args)),
      generateDraft: (storyId) => generateFacebookDraft(storyId),
      publishPost: (postId) => publishFacebookPost(postId),
    })
  }

  return channels
}

export async function runSocialAutoPost(): Promise<void> {
  log.info('starting social auto-post job')

  const channels = getEnabledChannels()
  if (channels.length === 0) {
    log.info('no social media channels enabled for auto-posting')
    return
  }

  log.info({ channels: channels.map((c) => c.name) }, 'enabled channels')

  const lookbackHours = config.socialAutoPost.lookbackHours
  const candidates = await findAutoPostCandidates(lookbackHours, channels)

  if (candidates.length === 0) {
    log.info('no candidate stories found for social posting')
    return
  }

  log.info({ candidateCount: candidates.length }, 'found candidate stories')

  const { storyId, reasoning } = await pickBestStoryForSocial(candidates)
  log.info({ storyId, reasoning }, 'best story selected for social media')

  for (const channel of channels) {
    try {
      const resultado = await publicarEnCanal(channel, storyId, candidates)
      // La elegida es la misma para todos los canales: si una vertical en
      // enforce la retuvo durante la corrida, no sale en ninguno.
      if (resultado.estado === 'retenida' && resultado.storyId === storyId) break
      if (resultado.estado === 'publicada') await new Promise((resolve) => setTimeout(resolve, 2000))
    } catch (err) {
      log.error({ err, channel: channel.name, storyId }, 'auto-post failed for channel')
    }
  }

  log.info('social auto-post job complete')
}

type ResultadoCanal = {
  estado: 'publicada' | 'omitida' | 'rechazada' | 'retenida'
  storyId: string
}

/**
 * Publica en un canal la elegida y, si los candados rechazan su borrador,
 * prueba con la siguiente mejor candidata (B21, 19-nov-2026).
 *
 * Antes un rechazo dejaba al canal sin publicar en esa franja: del 6 al 19-nov
 * Instagram perdio 9 de 27 franjas (33 %) con 48 a 86 candidatas por corrida.
 * Ninguna regla cambia: el siguiente borrador pasa por los mismos candados. La
 * siguiente la elige el mismo criterio editorial (`pickBestStoryForSocial`)
 * entre las candidatas que este canal no publico, no rechazo y no probo en esta
 * corrida. Tope: `config.socialAutoPost.intentosPorCanal` intentos en total.
 * Los demas canales no cambian de noticia.
 */
async function publicarEnCanal(channel: ChannelConfig, primera: string, candidates: string[]): Promise<ResultadoCanal> {
  const configurado = config.socialAutoPost.intentosPorCanal
  const tope = Number.isFinite(configurado) && configurado >= 1 ? configurado : 1
  const probadas = new Set<string>()
  let storyId = primera

  for (let intento = 1; ; intento++) {
    if (intento === 1 && (await channel.publishedStoryIds([storyId])).has(storyId)) {
      log.info({ channel: channel.name, storyId }, 'story already posted (or rejected) on channel, skipping')
      return { estado: 'omitida', storyId }
    }
    probadas.add(storyId)

    log.info({ channel: channel.name, storyId, intento }, 'generating draft')
    const draft = await channel.generateDraft(storyId)

    if (draft.status !== 'rejected') {
      // Candidates were filtered minutes ago (LLM pick, drafts, 2 s between
      // channels): a vertical in enforce may have withheld the story since.
      // Check again right before each publish, which cannot be undone.
      if ((await withheldInEnforcedVerticals([storyId])).has(storyId)) {
        log.warn({ channel: channel.name, storyId }, 'story withheld by a vertical in enforce during the run; auto-post stopped')
        return { estado: 'retenida', storyId }
      }

      log.info({ channel: channel.name, postId: draft.id }, 'publishing')
      await channel.publishPost(draft.id)
      log.info({ channel: channel.name, storyId, intento }, 'auto-post published successfully')
      return { estado: 'publicada', storyId }
    }

    // El carrusel o el pie no pasó los candados: no se publica, y el motivo
    // queda en el post para verlo en el panel.
    log.warn({ channel: channel.name, storyId, postId: draft.id, intento }, 'draft rejected by the carousel guards; not published')
    if (intento >= tope) {
      log.warn({ channel: channel.name, intentos: intento }, 'tope de intentos alcanzado: el canal no publica en esta corrida')
      return { estado: 'rechazada', storyId }
    }

    const resueltas = await channel.publishedStoryIds(candidates)
    const quedan = candidates.filter((id) => !probadas.has(id) && !resueltas.has(id))
    if (quedan.length === 0) {
      log.info({ channel: channel.name }, 'no quedan candidatas para este canal: no publica en esta corrida')
      return { estado: 'rechazada', storyId }
    }

    const siguiente = await pickBestStoryForSocial(quedan)
    log.info({ channel: channel.name, storyId: siguiente.storyId, reasoning: siguiente.reasoning, intento: intento + 1 }, 'siguiente candidata tras el rechazo')
    storyId = siguiente.storyId
  }
}
