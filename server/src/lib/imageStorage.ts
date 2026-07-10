import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config.js'
import { createLogger } from './logger.js'

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

/**
 * Downloads an external image (e.g. a source outlet's og:image) and re-hosts
 * it on R2, returning the R2 public URL. Avoids hotlinking third-party images
 * (copyright/hosting control). Returns null on any failure (caller should fall
 * back to the original URL so the story is never left imageless).
 */
export async function rehostExternalImage(imageUrl: string, storyId: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImpactoIndigenaCrawler/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      log.warn({ imageUrl, status: res.status }, 'rehost: source image fetch failed')
      return null
    }
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
    if (!contentType.startsWith('image/')) {
      log.warn({ imageUrl, contentType }, 'rehost: not an image')
      return null
    }
    const declaredLen = Number(res.headers.get('content-length') || '0')
    if (declaredLen && declaredLen > MAX_REHOST_BYTES) {
      log.warn({ imageUrl, declaredLen }, 'rehost: image too large')
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0 || buffer.length > MAX_REHOST_BYTES) {
      log.warn({ imageUrl, size: buffer.length }, 'rehost: empty or oversized image')
      return null
    }
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : 'jpg'
    return await uploadImageToR2(buffer, `oghero-${storyId}.${ext}`, contentType)
  } catch (err) {
    log.warn({ err, imageUrl }, 'rehost: failed to rehost external image')
    return null
  }
}
