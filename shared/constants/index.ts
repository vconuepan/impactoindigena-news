import type { StoryStatus, EmotionTag, JobName, FeedRegion } from '../types/index.js'

export const STORY_STATUSES: StoryStatus[] = [
  'fetched',
  'pre_analyzed',
  'analyzed',
  'selected',
  'published',
  'rejected',
  'trashed',
]

export const EMOTION_TAGS: EmotionTag[] = [
  'uplifting',
  'frustrating',
  'scary',
  'calm',
]

export const JOB_NAMES: JobName[] = [
  'crawl_feeds',
  'preassess_stories',
  'assess_stories',
  'select_stories',
  'publish_stories',
  'social_auto_post',
  'bluesky_update_metrics',
  'mastodon_update_metrics',
  'generate_newsletter',
]

export const FEED_REGIONS: { value: FeedRegion; label: string }[] = [
  { value: 'north_america', label: 'North America' },
  { value: 'western_europe', label: 'Western Europe' },
  { value: 'eastern_europe', label: 'Eastern Europe' },
  { value: 'middle_east_north_africa', label: 'Middle East & North Africa' },
  { value: 'sub_saharan_africa', label: 'Sub-Saharan Africa' },
  { value: 'south_southeast_asia', label: 'South & Southeast Asia' },
  { value: 'pacific', label: 'Pacific' },
  { value: 'latin_america', label: 'Latin America' },
  { value: 'global', label: 'Global' },
]

export const FEED_REGION_LABELS: Record<FeedRegion, string> = Object.fromEntries(
  FEED_REGIONS.map(r => [r.value, r.label])
) as Record<FeedRegion, string>

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/**
 * Piso de relevancia para publicar. Es el mismo valor que `SELECT_RELEVANCE_MIN`
 * en el servidor (`server/src/config.ts`, default 5); el servidor no importa
 * `shared/`, asi que si cambia alla hay que cambiarlo aca.
 *
 * El cliente lo usa para NO mostrar como bajada el `relevanceSummary` de una
 * nota que quedo por debajo: ese texto explica por que la nota no es relevante
 * («…sin impacto indigena») y, en una tarjeta, se lee como bajada. Medido el
 * 5-oct-2026 en vivo: entre el 20 y el 24 % de lo publicado estaba bajo el piso
 * y 17 de 300 tarjetas mostraban una explicacion de descarte.
 */
export const RELEVANCE_PUBLISH_MIN = 5
