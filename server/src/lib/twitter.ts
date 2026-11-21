import { config } from '../config.js'
import { createLogger } from './logger.js'
import { withRetry } from './retry.js'
import { safeAxiosGet } from './safeHttp.js'

const log = createLogger('twitter')

function isConfigured(): boolean {
  return Boolean(
    config.twitter.apiKey &&
    config.twitter.apiSecret &&
    config.twitter.accessToken &&
    config.twitter.accessTokenSecret
  )
}

export interface CreateTweetResult {
  id: string
  url: string
}

/**
 * Descarga una imagen desde una URL y retorna el buffer.
 */
// Tope de imagen de la API de X (5 MB).
const MAX_TWEET_IMAGE_BYTES = 5_000_000

/**
 * Descarga la imagen de la noticia con la guardia SSRF en la URL y en cada
 * redireccion (`safeAxiosGet`). La URL puede ser la og:image de un tercero; antes
 * era un `fetch` crudo que seguia redirecciones sin revisar. Exportada para
 * probarla.
 */
export async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await safeAxiosGet(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 10_000,
    maxContentLength: MAX_TWEET_IMAGE_BYTES,
    maxBodyLength: MAX_TWEET_IMAGE_BYTES,
  })
  const contentType = String(res.headers['content-type'] || '').split(';')[0].trim()
  if (!contentType.startsWith('image/')) throw new Error(`Not an image: ${contentType || 'sin content-type'}`)
  return Buffer.from(res.data)
}

/**
 * Crea un tweet con texto e imagen opcional usando Twitter API v2 con OAuth 1.0a.
 */
export async function createTweet(text: string, imageUrl?: string): Promise<CreateTweetResult> {
  if (!isConfigured()) {
    throw new Error('Twitter credentials not configured.')
  }

  return withRetry(
    async () => {
      const { TwitterApi } = await import('twitter-api-v2')

      const client = new TwitterApi({
        appKey: config.twitter.apiKey,
        appSecret: config.twitter.apiSecret,
        accessToken: config.twitter.accessToken,
        accessSecret: config.twitter.accessTokenSecret,
      })

      log.info({ textLength: text.length, hasImage: !!imageUrl }, 'creating tweet')

      let mediaId: string | undefined

      // Subir imagen si existe
      if (imageUrl) {
        try {
          const imageBuffer = await fetchImageBuffer(imageUrl)
          const mediaUpload = await client.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' })
          mediaId = mediaUpload
          log.info({ mediaId }, 'image uploaded to Twitter')
        } catch (err) {
          log.warn({ err }, 'failed to upload image to Twitter, posting without image')
        }
      }

      const tweetOptions: any = { text }
      if (mediaId) {
        tweetOptions.media = { media_ids: [mediaId] }
      }

      const result = await client.v2.tweet(tweetOptions)

      const tweetId = result.data.id
      const url = `https://x.com/ImpactoIndigena/status/${tweetId}`

      log.info({ tweetId, url }, 'tweet created')
      return { id: tweetId, url }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface TweetMetrics {
  likeCount: number
  retweetCount: number
  replyCount: number
  quoteCount: number
}

export async function getTweetMetrics(tweetId: string): Promise<TweetMetrics> {
  if (!isConfigured()) {
    throw new Error('Twitter credentials not configured.')
  }

  return withRetry(
    async () => {
      const { TwitterApi } = await import('twitter-api-v2')

      const client = new TwitterApi({
        appKey: config.twitter.apiKey,
        appSecret: config.twitter.apiSecret,
        accessToken: config.twitter.accessToken,
        accessSecret: config.twitter.accessTokenSecret,
      })

      const tweet = await client.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics'],
      })

      const metrics = tweet.data.public_metrics

      return {
        likeCount: metrics?.like_count ?? 0,
        retweetCount: metrics?.retweet_count ?? 0,
        replyCount: metrics?.reply_count ?? 0,
        quoteCount: metrics?.quote_count ?? 0,
      }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

export { isConfigured as isTwitterConfigured }
