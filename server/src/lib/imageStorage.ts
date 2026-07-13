import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config.js'
import { createLogger } from './logger.js'
import { safeAxiosGet } from './safeHttp.js'

const log = createLogger('image-storage')

function getS3Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2.endpoint,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  })
}

/**
 * Sube una imagen (buffer) a Cloudflare R2 y retorna la URL pública.
 */
export async function uploadImageToR2(
  imageBuffer: Buffer,
  filename: string,
  contentType: string = 'image/png',
): Promise<string> {
  const client = getS3Client()

  const key = `social/${filename}`

  log.info({ key, size: imageBuffer.length }, 'uploading image to R2')

  await client.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // 1 año
    }),
  )

  const publicUrl = `${config.r2.publicUrl}/${key}`
  log.info({ publicUrl }, 'image uploaded to R2')

  return publicUrl
}

// Cap on a rehosted external image. og:images are usually < 2 MB; anything
// much larger is likely not a hero photo and not worth storing.
const MAX_REHOST_BYTES = 8_000_000

export interface DownloadedImage {
  buffer: Buffer
  contentType: string
  /** File extension inferred from the content type (no leading dot). */
  ext: string
}

/**
 * Downloads an external image (e.g. a source outlet's og:image) over an
 * SSRF-safe channel, enforcing the size cap and confirming it is actually an
 * image. Returns null on any failure. Shared by rehostExternalImage and the
 * branded-card path so both apply the same fetch/validation rules and only
 * download the bytes once.
 *
 * The image URL is attacker-influenced: it comes from parsing the og:image meta
 * tag out of a third-party source's HTML (see extract-og-image.ts), so a
 * malicious/compromised source could point it at an internal address (cloud
 * metadata at 169.254.169.254, localhost, private ranges) to make the server
 * fetch it. `safeAxiosGet` runs `assertUrlAllowed` (DNS-resolving) on the
 * initial URL and on every redirect hop, closing that hole — the same guard the
 * crawler/extractor use.
 */
export async function downloadExternalImage(imageUrl: string): Promise<DownloadedImage | null> {
  try {
    const res = await safeAxiosGet(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0)' },
      // Hard cap the response body; axios throws if the stream exceeds this.
      maxContentLength: MAX_REHOST_BYTES,
      maxBodyLength: MAX_REHOST_BYTES,
    })
    const contentType = (String(res.headers['content-type'] || '')).split(';')[0].trim()
    if (!contentType.startsWith('image/')) {
      log.warn({ imageUrl, contentType }, 'download: not an image')
      return null
    }
    const buffer = Buffer.from(res.data)
    if (buffer.length === 0 || buffer.length > MAX_REHOST_BYTES) {
      log.warn({ imageUrl, size: buffer.length }, 'download: empty or oversized image')
      return null
    }
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : 'jpg'
    return { buffer, contentType, ext }
  } catch (err) {
    log.warn({ err, imageUrl }, 'download: failed to fetch external image')
    return null
  }
}

/**
 * Downloads an external image (e.g. a source outlet's og:image) and re-hosts
 * it on R2, returning the R2 public URL. Avoids hotlinking third-party images
 * (copyright/hosting control). Returns null on any failure (caller should fall
 * back to the original URL so the story is never left imageless).
 */
export async function rehostExternalImage(imageUrl: string, storyId: string): Promise<string | null> {
  const dl = await downloadExternalImage(imageUrl)
  if (!dl) return null
  try {
    return await uploadImageToR2(dl.buffer, `oghero-${storyId}.${dl.ext}`, dl.contentType)
  } catch (err) {
    log.warn({ err, imageUrl }, 'rehost: failed to upload rehosted image')
    return null
  }
}
