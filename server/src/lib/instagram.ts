import { config } from '../config.js'
import { createLogger } from './logger.js'
import { withRetry } from './retry.js'

const log = createLogger('instagram')

function isConfigured(): boolean {
  return Boolean(
    config.instagram.accessToken &&
    config.instagram.userId
  )
}

export interface CreatePostResult {
  id: string
  permalink?: string
}

/**
 * Publica un carrusel de imágenes en Instagram.
 * Paso 1: Crear contenedor para cada imagen
 * Paso 2: Crear contenedor del carrusel
 * Paso 3: Publicar el carrusel
 */
export async function createCarouselPost(
  imageUrls: string[],
  caption: string,
): Promise<CreatePostResult> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const { accessToken, userId } = config.instagram
      const baseUrl = `https://graph.instagram.com/v21.0`

      log.info({ captionLength: caption.length, slideCount: imageUrls.length }, 'creating Instagram carousel')

      // Paso 1: Crear contenedor para cada imagen
      const childIds: string[] = []

      for (const imageUrl of imageUrls) {
        const params = new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: 'true',
          media_type: 'IMAGE',
          access_token: accessToken,
        })
        const res = await fetch(`${baseUrl}/${userId}/media?${params}`, {
          method: 'POST',
        })

        const data = await res.json() as any

        if (!res.ok || data.error) {
          throw new Error(`Failed to create carousel item: ${JSON.stringify(data.error || data)}`)
        }

        childIds.push(data.id)
        log.info({ containerId: data.id }, 'carousel item created')

        // Esperar 3 segundos entre cada imagen
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      // Paso 2: Crear contenedor del carrusel
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
        access_token: accessToken,
      })

      const carouselRes = await fetch(`${baseUrl}/${userId}/media?${carouselParams}`, {
        method: 'POST',
      })

      const carouselData = await carouselRes.json() as any

      if (!carouselRes.ok || carouselData.error) {
        throw new Error(`Failed to create carousel container: ${JSON.stringify(carouselData.error || carouselData)}`)
      }

      const carouselId = carouselData.id
      log.info({ carouselId }, 'carousel container created')

      // Esperar 3 segundos antes de publicar
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Paso 3: Publicar el carrusel
      const publishParams = new URLSearchParams({
        creation_id: carouselId,
        access_token: accessToken,
      })

      const publishRes = await fetch(`${baseUrl}/${userId}/media_publish?${publishParams}`, {
        method: 'POST',
      })

      const publishData = await publishRes.json() as any

      if (!publishRes.ok || publishData.error) {
        throw new Error(`Failed to publish carousel: ${JSON.stringify(publishData.error || publishData)}`)
      }

      const postId = publishData.id
      log.info({ postId }, 'Instagram carousel published')

      return { id: postId, permalink: `https://www.instagram.com/p/${postId}/` }
    },
    { retries: 2, baseDelayMs: 3000 },
  )
}

export interface PostMetrics {
  likeCount: number
  commentCount: number
}

/**
 * Fetch engagement metrics for a published Instagram post.
 * Uses the basic media fields — no special insights permission required.
 */
export async function getPostMetrics(instagramPostId: string): Promise<PostMetrics> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const { accessToken } = config.instagram
      const params = new URLSearchParams({
        fields: 'like_count,comments_count',
        access_token: accessToken,
      })
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${instagramPostId}?${params}`,
      )
      const data = await res.json() as any

      if (!res.ok || data.error) {
        throw new Error(`Instagram metrics error: ${JSON.stringify(data.error || data)}`)
      }

      return {
        likeCount: data.like_count ?? 0,
        commentCount: data.comments_count ?? 0,
      }
    },
    { retries: 2, baseDelayMs: 2000 },
  )
}

/**
 * Publica una imagen sencilla en Instagram (sin carrusel).
 * No requiere R2 — la imagen debe ser una URL pública permanente.
 */
export async function createSingleImagePost(
  imageUrl: string,
  caption: string,
): Promise<CreatePostResult> {
  if (!isConfigured()) {
    throw new Error('Instagram credentials not configured.')
  }

  return withRetry(
    async () => {
      const { accessToken, userId } = config.instagram
      const baseUrl = `https://graph.instagram.com/v21.0`

      log.info({ captionLength: caption.length, imageUrl }, 'creating Instagram single-image post')

      // Paso 1: Crear contenedor de la imagen
      const params = new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      })
      const res = await fetch(`${baseUrl}/${userId}/media?${params}`, { method: 'POST' })
      const data = await res.json() as { id?: string; error?: unknown }

      if (!res.ok || data.error) {
        throw new Error(`Failed to create media container: ${JSON.stringify(data.error || data)}`)
      }

      const containerId = data.id!
      log.info({ containerId }, 'media container created')

      // Esperar 3 segundos antes de publicar
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Paso 2: Publicar
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      })
      const publishRes = await fetch(`${baseUrl}/${userId}/media_publish?${publishParams}`, { method: 'POST' })
      const publishData = await publishRes.json() as { id?: string; error?: unknown }

      if (!publishRes.ok || publishData.error) {
        throw new Error(`Failed to publish post: ${JSON.stringify(publishData.error || publishData)}`)
      }

      const postId = publishData.id!
      log.info({ postId }, 'Instagram single-image post published')

      return { id: postId, permalink: `https://www.instagram.com/p/${postId}/` }
    },
    { retries: 2, baseDelayMs: 3000 },
  )
}

export { isConfigured as isInstagramConfigured }
