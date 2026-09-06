import { gzipSync } from 'node:zlib'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config.js'
import { createLogger } from './logger.js'
import { buildHomepagePayload } from '../routes/public/homepage.js'

const log = createLogger('homepage-snapshot')

/** Nombre fijo: el cliente lo pide siempre igual y R2 lo sobrescribe en su sitio. */
export const HOMEPAGE_SNAPSHOT_KEY = 'homepage.json'

/**
 * Cuanto puede cachear el navegador y el borde. Un minuto, igual que el
 * endpoint: el snapshot se regenera al publicar, no cada minuto, pero un TTL
 * corto deja que un despliegue o una republicacion se vean pronto.
 */
const SNAPSHOT_MAX_AGE = 60

/**
 * Publica en R2 la respuesta de la portada, ya comprimida.
 *
 * POR QUE EXISTE. El Static Web App esta en East US 2 y el App Service en Chile
 * Central, asi que cada llamada a /api/* viaja a Virginia y vuelve. Medido el
 * 5-sep-2026: `/api/homepage` a traves del sitio da 1,54-1,76 s de TTFB, y el
 * MISMO App Service consultado directo responde en 0,11-0,34 s. El proxy pone
 * mas de un segundo por llamada, y ese segundo esta dentro del LCP porque la
 * portada no pinta el hero hasta que llegan los datos.
 *
 * R2 ya sirve todas las imagenes del sitio desde el borde de Cloudflare.
 * Medido contra este mismo payload: TTFB 0,68-0,81 s contra 2,99 s del
 * endpoint, servido desde Sao Paulo en vez de Virginia.
 *
 * SE SUBE COMPRIMIDO A MANO. R2 no comprime al vuelo: sirve el objeto tal como
 * se guardo. Con `ContentEncoding: gzip` el navegador lo descomprime solo, y
 * quien no acepte gzip recibe el original -Cloudflare lo descomprime en el
 * borde-. Verificado: 516 KB crudos, 118 KB en el cable.
 */
export async function publishHomepageSnapshot(): Promise<{ bytes: number } | null> {
  if (!config.r2.endpoint || !config.r2.accessKeyId) {
    log.debug('R2 no configurado, se omite el snapshot de portada')
    return null
  }

  try {
    const payload = await buildHomepagePayload()
    const json = Buffer.from(JSON.stringify(payload), 'utf8')
    const gz = gzipSync(json, { level: 9 })

    const client = new S3Client({
      region: 'auto',
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    })

    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: HOMEPAGE_SNAPSHOT_KEY,
        Body: gz,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        CacheControl: `public, max-age=${SNAPSHOT_MAX_AGE}`,
      }),
    )

    log.info(
      { crudo: json.length, comprimido: gz.length, key: HOMEPAGE_SNAPSHOT_KEY },
      'snapshot de portada publicado en R2',
    )
    return { bytes: gz.length }
  } catch (err) {
    // Nunca tumba a quien lo llama: el endpoint sigue sirviendo la portada y el
    // cliente cae a el cuando el snapshot falta o esta viejo.
    log.error({ err }, 'no se pudo publicar el snapshot de portada')
    return null
  }
}
