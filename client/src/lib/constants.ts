import type { StoryStatus, EmotionTag, JobName } from '@shared/types'

export type BadgeVariant = 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'pink' | 'orange'

export const STATUS_VARIANTS: Record<StoryStatus, BadgeVariant> = {
  fetched: 'gray',
  pre_analyzed: 'blue',
  analyzed: 'yellow',
  selected: 'purple',
  published: 'green',
  rejected: 'red',
  trashed: 'orange',
}

export const EMOTION_VARIANTS: Record<EmotionTag, BadgeVariant> = {
  uplifting: 'green',
  frustrating: 'orange',
  scary: 'red',
  calm: 'blue',
}

export const JOB_DISPLAY_NAMES: Record<JobName, string> = {
  crawl_feeds: 'Crawl Feeds',
  preassess_stories: 'Pre-assess Stories',
  assess_stories: 'Assess Stories',
  select_stories: 'Select Stories',
  publish_stories: 'Publish Stories',
  social_auto_post: 'Social Auto-Post',
  bluesky_update_metrics: 'Bluesky Metrics',
  mastodon_update_metrics: 'Mastodon Metrics',
  instagram_update_metrics: 'Instagram Metrics',
  linkedin_update_metrics: 'LinkedIn Metrics',
  generate_newsletter: 'Generate Newsletter',
  send_newsletter: 'Send Newsletter',
  send_private_newsletter: 'Send Private Newsletter',
  scrape_docip: 'Scrape DOCIP',
  send_community_digest: 'Send Community Digest',
  send_alerts: 'Send Alerts',
  generate_editorial: 'Generate Editorial',
  google_news_discover: 'Google News Discover',
}

/** Pipeline execution order for sorting jobs in the UI. */
export const JOB_PIPELINE_ORDER: JobName[] = [
  'crawl_feeds',
  'google_news_discover',
  'preassess_stories',
  'assess_stories',
  'select_stories',
  'publish_stories',
  'social_auto_post',
  'bluesky_update_metrics',
  'mastodon_update_metrics',
  'instagram_update_metrics',
  'linkedin_update_metrics',
  'generate_newsletter',
  'send_newsletter',
  'send_private_newsletter',
  'scrape_docip',
  'send_community_digest',
  'send_alerts',
  'generate_editorial',
]

const STATUS_LABELS: Partial<Record<string, string>> = {
  pre_analyzed: 'Pre',
}

export function formatStatus(status: string): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status]
  return status
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const currentYear = new Date().getFullYear()

/** Date only, no time. Omits year if current year. */
export function formatShortDate(dateStr: string | null, timeZone = 'America/Santiago'): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone }
  if (date.getFullYear() !== currentYear) opts.year = 'numeric'
  return date.toLocaleDateString('en-US', opts)
}

/** Date with time. Omits year if current year. */
export function formatDateWithTime(dateStr: string | null, timeZone = 'America/Santiago'): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }
  if (date.getFullYear() !== currentYear) opts.year = 'numeric'
  return date.toLocaleDateString('en-US', opts)
}

/** Full date with time and year. For edit views. */
export function formatDate(dateStr: string | null, timeZone = 'America/Santiago'): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
}

/** Relative time string, e.g. "5m ago", "2h ago", "3d ago". */
export function formatRelativeTime(dateStr: string | null, timeZone = 'America/Santiago'): string {
  if (!dateStr) return '—'
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}
