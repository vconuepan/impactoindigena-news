import type { PublicStory } from '@shared/types'

const POSITIVE_TAGS = new Set(['uplifting', 'calm'])
const NEGATIVE_TAGS = new Set(['frustrating', 'scary'])

export interface StoryBuckets {
  uplifting: PublicStory[]
  calm: PublicStory[]
  negative: PublicStory[]
}

/**
 * Mix story buckets for a fixed number of slots (homepage sections).
 *
 * At 100%: strictly uplifting only — no backfill from calm or negative.
 * At 0–75%: uplifting+calm are combined as "positive" and mixed with negative
 * using the same ratio logic as before.
 */
export function mixHomepageStories(
  buckets: StoryBuckets,
  slots: number,
  positivity: number,
): PublicStory[] {
  // At 100%, strict uplifting only — return however many we have, up to slots
  if (positivity === 100) {
    return buckets.uplifting.slice(0, slots).sort(byDateDesc)
  }

  // At 0%, strict negative only — no backfill from positive buckets (mirror of
  // the 100% case). Without this, an issue with fewer than `slots` negative
  // stories would leak uplifting/calm into the "Solo noticias pesadas" view.
  if (positivity === 0) {
    return buckets.negative.slice(0, slots).sort(byDateDesc)
  }

  // For all other settings, combine uplifting+calm as "positive"
  const positive = [...buckets.uplifting, ...buckets.calm].sort(byDateDesc)
  const negative = buckets.negative

  const positiveCount = Math.round(slots * positivity / 100)
  const negativeCount = slots - positiveCount

  const picked: PublicStory[] = []
  const usedIds = new Set<string>()

  // Take from positive bucket
  for (const s of positive) {
    if (picked.length >= positiveCount) break
    picked.push(s)
    usedIds.add(s.id)
  }

  // Take from negative bucket
  for (const s of negative) {
    if (picked.length >= positiveCount + negativeCount) break
    if (!usedIds.has(s.id)) {
      picked.push(s)
      usedIds.add(s.id)
    }
  }

  // Fill shortfalls from either bucket
  if (picked.length < slots) {
    for (const s of [...positive, ...negative]) {
      if (picked.length >= slots) break
      if (!usedIds.has(s.id)) {
        picked.push(s)
        usedIds.add(s.id)
      }
    }
  }

  return picked.sort(byDateDesc)
}

/**
 * Pick the hero story from all issue buckets based on positivity.
 * Returns the most recent story from the appropriate emotion pool.
 */
export function pickHero(
  storiesByIssue: Record<string, StoryBuckets>,
  positivity: number,
): PublicStory | null {
  const all: PublicStory[] = []

  for (const buckets of Object.values(storiesByIssue)) {
    if (positivity === 100) {
      all.push(...buckets.uplifting)
    } else if (positivity === 0) {
      all.push(...buckets.negative)
    } else if (positivity > 50) {
      all.push(...buckets.uplifting, ...buckets.calm)
    } else if (positivity < 50) {
      all.push(...buckets.negative)
    } else {
      // 50%: all stories
      all.push(...buckets.uplifting, ...buckets.calm, ...buckets.negative)
    }
  }

  if (all.length === 0) return null

  all.sort(byDateDesc)
  return all[0]
}

/**
 * Filter a flat list of stories based on positivity slider value.
 * Used for issue pages where all stories are fetched and filtered client-side.
 *
 * At 50%: show all stories (no filter).
 * At 100%: show only uplifting stories (not calm).
 * At 0%: show only negative stories.
 * At 75%: show all positive (uplifting+calm) + enough negative to achieve ~75% positive ratio.
 * At 25%: show all negative + enough positive to achieve ~25% positive ratio.
 */
export function filterStoriesByPositivity(
  stories: PublicStory[],
  positivity: number,
): PublicStory[] {
  if (positivity === 50) return stories

  // At 100%, strict uplifting only
  if (positivity === 100) {
    return stories.filter((s) => s.emotionTag === 'uplifting')
  }

  const positive = stories.filter((s) => POSITIVE_TAGS.has(s.emotionTag ?? ''))
  const negative = stories.filter((s) => NEGATIVE_TAGS.has(s.emotionTag ?? ''))

  if (positivity === 0) return negative

  const ratio = positivity / 100

  if (ratio > 0.5) {
    const negativeToShow = Math.round(positive.length * (1 - ratio) / ratio)
    return [...positive, ...negative.slice(0, negativeToShow)].sort(byDateDesc)
  } else {
    const positiveToShow = Math.round(negative.length * ratio / (1 - ratio))
    return [...positive.slice(0, positiveToShow), ...negative].sort(byDateDesc)
  }
}

/**
 * Map positivity slider position to emotion tag filters for server-side pagination.
 * Returns undefined at 50% (no filter — show all stories).
 *
 * The intermediate stops are symmetric "mood bands" over the emotional spectrum
 * (scary < frustrating < calm < uplifting): 25% ("Mayormente pesadas") is the
 * bottom three tags and 75% ("Mayormente positivas") is the top three. Each
 * excludes only the opposite extreme (25% drops 'uplifting'; 75% drops 'scary')
 * while keeping the milder opposite tag, so neither stop over-excludes a pole.
 * Previously 75% returned only ['uplifting','calm'], erasing all heavy stories
 * and leaving the two stops asymmetric.
 */
export function positivityToEmotionTags(positivity: number): string[] | undefined {
  switch (positivity) {
    case 0: return ['frustrating', 'scary']
    case 25: return ['frustrating', 'scary', 'calm']
    case 50: return undefined
    case 75: return ['frustrating', 'calm', 'uplifting']
    case 100: return ['uplifting']
    default: return undefined
  }
}

function byDateDesc(a: PublicStory, b: PublicStory): number {
  const da = new Date(a.datePublished ?? a.dateCrawled).getTime()
  const db = new Date(b.datePublished ?? b.dateCrawled).getTime()
  return db - da
}
