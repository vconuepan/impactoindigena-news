import { runCrawlFeeds } from './crawlFeeds.js'
import { runPreassessStories } from './preassessStories.js'
import { runAssessStories } from './assessStories.js'
import { runSelectStories } from './selectStories.js'
import { runPublishStories } from './publishStories.js'
import { runBlueskyUpdateMetrics } from './blueskyUpdateMetrics.js'
import { runGenerateNewsletter } from './generateNewsletter.js'
import { runSocialAutoPost } from './socialAutoPost.js'
import { runMastodonUpdateMetrics } from './mastodonUpdateMetrics.js'
import { runInstagramUpdateMetrics } from './instagramUpdateMetrics.js'
import { runLinkedInUpdateMetrics } from './linkedinUpdateMetrics.js'
import { runSendNewsletter } from './sendNewsletter.js'
import { runSendPrivateNewsletter } from './sendPrivateNewsletter.js'
import { runScrapeDOCIP } from './scrapeDOCIP.js'
import { runSendCommunityDigest } from './sendCommunityDigest.js'
import { runSendAlerts } from './sendAlerts.js'
import { runGenerateEditorial } from './generateEditorial.js'
import { runGoogleNewsDiscover } from './googleNewsDiscover.js'

export const JOB_HANDLERS: Record<string, () => Promise<void>> = {
  crawl_feeds: runCrawlFeeds,
  preassess_stories: runPreassessStories,
  assess_stories: runAssessStories,
  select_stories: runSelectStories,
  publish_stories: runPublishStories,
  social_auto_post: runSocialAutoPost,
  bluesky_update_metrics: runBlueskyUpdateMetrics,
  generate_newsletter: runGenerateNewsletter,
  mastodon_update_metrics: runMastodonUpdateMetrics,
  instagram_update_metrics: runInstagramUpdateMetrics,
  linkedin_update_metrics: runLinkedInUpdateMetrics,
  send_newsletter: runSendNewsletter,
  send_private_newsletter: runSendPrivateNewsletter,
  scrape_docip: runScrapeDOCIP,
  send_community_digest: runSendCommunityDigest,
  send_alerts: runSendAlerts,
  generate_editorial: runGenerateEditorial,
  google_news_discover: runGoogleNewsDiscover,
}
