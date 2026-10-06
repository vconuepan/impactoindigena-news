import { createCanvas, loadImage, type Image } from '@napi-rs/canvas'
import { uploadImageToR2 } from './imageStorage.js'
import { createLogger } from './logger.js'

const log = createLogger('imagen-variantes')

/**
 * Variantes web de la imagen de una historia.
 *
 * EL PROBLEMA QUE RESUELVE, medido con PageSpeed el 6-oct-2026 sobre la portada
 * en movil: cada tarjeta pedia la imagen ORIGINAL de R2 —la misma que sirve de
 * `og:image`— para pintarla a 405 px de ancho. Las tarjetas compuestas salen a
 * 2400 px (2x para que el titulo se lea en la vista previa social) y pesan
 * entre 300 y 500 KB; las rehospedadas van a 1200 px y pesan 150 KB. Veinte de
 * esas en una pantalla de 412 px son 4,7 MB que compiten por el ancho de banda
 * con la imagen del hero, y Lighthouse estimaba 2.326 KB de ahorro.
 *
 * LA SOLUCION: junto a cada imagen que sube el pipeline se guardan dos
 * renditions JPEG, de 800 y 1200 px de ancho, con nombre derivado del original:
 *
 *   social/storycard-<id>.jpg  ->  social/storycard-<id>-w800.jpg
 *                              ->  social/storycard-<id>-w1200.jpg
 *
 * El cliente las referencia por CONVENCION, sin consultar nada: deriva las dos
 * URL de `imageUrl` y las declara en `srcset`, dejando el original en `src`
 * como respaldo. Asi `Story.imageUrl` no cambia, el `og:image` sigue siendo el
 * original (WhatsApp y Facebook lo bajan una vez y lo achican ellos) y cero
 * filas de la base se tocan.
 *
 * LOGICA DUPLICADA, A PROPOSITO: `client/src/lib/story-image.ts` deriva las
 * mismas URL. El servidor no puede importar fuera de `src/` (rootDir), asi que
 * el contrato lo vigila `client/src/lib/story-image.test.ts`, que lee ESTE
 * archivo y falla si los anchos o el sufijo dejan de coincidir.
 *
 * Las imagenes anteriores a este cambio no tienen variantes: las genera
 * `scripts/migrations/generar-variantes-web.ts`. Mientras tanto el cliente, si
 * la variante responde 404, quita el `srcset` y carga el original.
 */
export const ANCHOS_VARIANTE_WEB = [800, 1200] as const

/**
 * 80 y no los 82 del original: la variante se ve a la mitad o a un tercio de
 * su tamaño en pantalla, donde la diferencia entre 80 y 82 no existe y los
 * bytes si.
 */
export const CALIDAD_VARIANTE_WEB = 80

/** Las extensiones que el pipeline sube. Lo que no calce no tiene variante. */
const EXTENSION = /\.(jpe?g|png|webp|gif)$/i

/** Nuestro bucket publico. Todo lo que sube el servidor vive bajo `/social/`. */
const URL_DEL_BUCKET = /\.r2\.dev\/social\/[^/?#]+$/i

/** `storycard-abc.png` -> `storycard-abc-w800.jpg`. Siempre JPEG. */
export function nombreDeVariante(nombre: string, ancho: number): string | null {
  if (!EXTENSION.test(nombre)) return null
  return nombre.replace(EXTENSION, `-w${ancho}.jpg`)
}

/**
 * Las URL de las variantes de una imagen nuestra, o null si la imagen no es
 * del bucket (una externa que nunca se rehospedo) o no tiene extension conocida.
 */
export function variantesDeUrl(url: string): { ancho: number; url: string }[] | null {
  if (!URL_DEL_BUCKET.test(url)) return null
  const out: { ancho: number; url: string }[] = []
  for (const ancho of ANCHOS_VARIANTE_WEB) {
    const v = nombreDeVariante(url, ancho)
    if (!v) return null
    out.push({ ancho, url: v })
  }
  return out
}

/** El valor de `srcset` / `imagesrcset` para una imagen nuestra, o null. */
export function srcsetDeUrl(url: string): string | null {
  const vs = variantesDeUrl(url)
  return vs ? vs.map((v) => `${v.url} ${v.ancho}w`).join(', ') : null
}

/**
 * Reescala una imagen YA DECODIFICADA a `ancho` (o la deja como esta si es mas
 * angosta: ampliar no agrega nada) y la codifica en JPEG.
 */
export function varianteWeb(img: Image, ancho: number): Buffer {
  const escala = Math.min(1, ancho / img.width)
  const w = Math.max(1, Math.round(img.width * escala))
  const h = Math.max(1, Math.round(img.height * escala))
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toBuffer('image/jpeg', CALIDAD_VARIANTE_WEB)
}

/**
 * Sube las variantes de una imagen que ACABA de subirse con `nombre`.
 *
 * Nunca lanza y no cambia lo que devuelve quien la llama: una variante que
 * falla deja a la historia con su imagen original, que es exactamente lo que
 * tenia antes de que existiera esto. Devuelve las URL que llegaron a subirse.
 */
export async function subirVariantesWeb(original: Buffer, nombre: string): Promise<string[]> {
  const subidas: string[] = []
  let img: Image
  try {
    img = await loadImage(original)
  } catch (err) {
    log.warn({ err, nombre }, 'variantes: no se pudo decodificar la imagen, se queda sin variantes')
    return subidas
  }
  for (const ancho of ANCHOS_VARIANTE_WEB) {
    const nombreVariante = nombreDeVariante(nombre, ancho)
    if (!nombreVariante) continue
    try {
      const buffer = varianteWeb(img, ancho)
      subidas.push(await uploadImageToR2(buffer, nombreVariante, 'image/jpeg'))
    } catch (err) {
      log.warn({ err, nombre, ancho }, 'variantes: fallo la subida de una variante')
    }
  }
  return subidas
}
