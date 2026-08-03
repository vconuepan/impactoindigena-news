import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { isBlueskyConfigured } from '../lib/bluesky.js'
import { isMastodonConfigured } from '../lib/mastodon.js'
import { isTwitterConfigured } from '../lib/twitter.js'
import { findAutoPostCandidates, pickBestStoryForSocial } from '../services/socialMedia.js'
import type { AutoPostChannel } from '../services/socialMedia.js'
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

const log = createLogger('social_auto_post')

interface ChannelConfig extends AutoPostChannel {
  generateDraft: (storyId: string) => Promise<{ id: string }>
  publishPost: (postId: string) => Promise<unknown>
}

/**
 * Every channel answers "which of these stories have you already published?"
 * the same way, against its own table. One query per channel instead of one
 * per story, and the same primitive serves both candidate selection and the
 * per-channel skip in the loop below.
 */
type FindManyPublished = (args: {
  where: { storyId: { in: string[] }; status: string }
  select: { storyId: true }
}) => Promise<Array<{ storyId: string }>>

function publishedLookup(findMany: FindManyPublished) {
  return async (storyIds: string[]): Promise<Set<string>> => {
    if (storyIds.length === 0) return new Set()
    const rows = await findMany({
      where: { storyId: { in: storyIds }, status: 'published' },
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
      publishedStoryIds: publishedLookup((args) => prisma.instagramPost.findMany(args)),
      generateDraft: (storyId) => generateInstagramDraft(storyId),
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
      const alreadyPosted = await channel.publishedStoryIds([storyId])
      if (alreadyPosted.has(storyId)) {
        log.info({ channel: channel.name, storyId }, 'story already posted to channel, skipping')
        continue
      }

      log.info({ channel: channel.name, storyId }, 'generating draft')
      const draft = await channel.generateDraft(storyId)

      log.info({ channel: channel.name, postId: draft.id }, 'publishing')
      await channel.publishPost(draft.id)

      log.info({ channel: channel.name, storyId }, 'auto-post published successfully')

      await new Promise((resolve) => setTimeout(resolve, 2000))
    } catch (err) {
      log.error({ err, channel: channel.name, storyId }, 'auto-post failed for channel')
    }
  }

  log.info('social auto-post job complete')
}
