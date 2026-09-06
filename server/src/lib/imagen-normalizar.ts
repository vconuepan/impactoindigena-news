import { createCanvas, loadImage, type Image } from '@napi-rs/canvas'
import { createLogger } from './logger.js'

const log = createLogger('imagen-normalizar')

/**
 * Ancho maximo con el que se guarda cualquier imagen en R2.
 *
 * 1200 es el minimo que Google Discover exige para mostrar la tarjeta grande
 * (STORY_CARD_MIN_WIDTH en storyCard.ts), asi que guardar mas ancho no gana
 * nada: el hero del sitio se muestra a 480 px de alto y en movil a menos.
 *
 * El historial de por que existe este limite: antes se subia el original tal
 * cual cuando ya media 1200 px o mas, y eso puso en R2 fotos de 6000x3376 y
 * 5 MB para tarjetas que en movil se ven a 400 px. Medido el 4-sep-2026, 1.478
 * de los 2.842 objetos del bucket eran PNG y pesaban el 88% del total.
 */
export const ANCHO_MAXIMO = 1200

/**
 * Calidad JPEG.
 *
 * 82 es el punto donde la diferencia visual con el original deja de notarse en
 * una fotografia y el archivo ya bajo un orden de magnitud. Por encima de 90 el
 * peso sube rapido sin que se vea mejor; por debajo de 75 aparecen artefactos
 * en los degradados.
 *
 * NO se usa WebP, que ahorraria un 25% mas, porque estas imagenes terminan
 * siendo el `og:image` de la historia: la vista previa al compartir en WhatsApp,
 * Facebook o LinkedIn. Esas plataformas no renderizan WebP de forma confiable, y
 * una vista previa rota cuesta mas que los kilobytes que ahorra.
 */
export const CALIDAD_JPEG = 82

/**
 * Ahorro minimo para que valga la pena reencodear.
 *
 * Reencodear un JPEG SIEMPRE degrada: la compresion con perdida se aplica sobre
 * una imagen que ya perdio informacion, y esa perdida generacional no se
 * recupera. La condicion anterior era `jpeg.length < original.length` — un solo
 * byte de ahorro bastaba.
 *
 * Simulando la migracion contra las 13 imagenes de la portada el 6-sep-2026, eso
 * daba tres casos de **-0%**: `oghero-eeefd92b` (279 KB), `oghero-11cfa890`
 * (153 KB) y `storycard-78790b57` (74 KB), todos JPEG ya optimizados y ya
 * dentro del ancho maximo. Se habrian reencodeado, perdiendo calidad, para
 * ahorrar unos pocos bytes.
 *
 * Un 10% es el punto donde el ahorro compensa esa perdida. Los PNG sin
 * comprimir, que son el caso que importa, ahorran entre 92% y 93%: pasan de
 * sobra.
 */
const AHORRO_MINIMO = 0.1

/**
 * Normaliza una imagen YA DECODIFICADA a JPEG con ancho acotado.
 *
 * Devuelve null cuando NO conviene: reencodear degrada, asi que se exige que el
 * resultado ahorre al menos AHORRO_MINIMO. Quien la llama sube el original.
 */
export function normalizarDecodificada(img: Image, original: Buffer): Buffer | null {
  const escala = Math.min(1, ANCHO_MAXIMO / img.width)
  const w = Math.round(img.width * escala)
  const h = Math.round(img.height * escala)
  const canvas = createCanvas(w, h)
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  const jpeg = canvas.toBuffer('image/jpeg', CALIDAD_JPEG)
  return jpeg.length <= original.length * (1 - AHORRO_MINIMO) ? jpeg : null
}

/**
 * Igual que la anterior, pero decodificando el buffer.
 *
 * Devuelve null cuando conviene subir el original: o no se pudo decodificar, o
 * el reencodeado no ahorra nada. Nunca lanza — quien la llama sube el original
 * y sigue, porque una imagen pesada es mejor que una historia sin imagen.
 */
export async function normalizar(original: Buffer): Promise<Buffer | null> {
  try {
    const img = await loadImage(original)
    return normalizarDecodificada(img, original)
  } catch (err) {
    log.warn({ err, bytes: original.length }, 'no se pudo decodificar la imagen, se sube el original')
    return null
  }
}
