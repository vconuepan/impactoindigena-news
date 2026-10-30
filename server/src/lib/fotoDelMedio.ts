/**
 * La foto real de una noticia, si la hay, para la portada del carrusel.
 *
 * Decisión del director, 29-oct-2026: la portada vuelve a llevar foto, y solo
 * puede ser la del medio que reporteó, con crédito «Foto: <medio>». Nunca una
 * imagen de IA: el 24-oct salió una portada con uniformados y una
 * retroexcavadora que el artículo de Radio Kurruf no reporta, y el 25-oct se
 * retiró la generación de imágenes del carrusel.
 *
 * Cada noticia guarda UNA imagen (`story.imageUrl`), y el servidor la bautiza
 * según su origen; el nombre, no el dominio, es la señal. Es la misma tabla que
 * rotula la imagen en el sitio (`client/src/lib/story-image.ts`):
 *
 * | Prefijo         | Quién la hizo                          | ¿Va al carrusel? |
 * |-----------------|----------------------------------------|------------------|
 * | `oghero-`       | el medio; se rehospeda tal cual        | sí               |
 * | `ogfoto-`       | el medio; una foto del cuerpo (`story_images`) | sí      |
 * | (otro dominio)  | el medio, servida desde su propio sitio| sí               |
 * | `storycard-`    | el medio, con nuestra marca y el título| no: ya trae texto|
 * | `<uuid>-<ms>`   | nuestra generación de imágenes         | no: es IA        |
 *
 * Es lógica duplicada con el cliente, que no puede importar fuera de su `src/`.
 * Los prefijos nacen en `storyCard.ts` e `imageStorage.ts`.
 */

/** Nuestro bucket público. Todo lo que sube el servidor vive bajo `/social/`. */
const BUCKET = /\.r2\.dev\//

export const PREFIJO_MEDIO = 'oghero-'
/** Las fotos del cuerpo del artículo, rehospedadas al publicar (`imageStorage.ts`). */
export const PREFIJO_FOTO_ARTICULO = 'ogfoto-'
export const PREFIJO_COMPUESTA = 'storycard-'

export type OrigenImagen = 'medio' | 'externa' | 'compuesta' | 'ia'

export function origenDeImagen(imageUrl: string | null | undefined): OrigenImagen | null {
  if (!imageUrl) return null
  if (!BUCKET.test(imageUrl)) return 'externa'
  const nombre = imageUrl.split('?')[0].split('#')[0].split('/').pop() ?? ''
  if (nombre.startsWith(PREFIJO_MEDIO) || nombre.startsWith(PREFIJO_FOTO_ARTICULO)) return 'medio'
  if (nombre.startsWith(PREFIJO_COMPUESTA)) return 'compuesta'
  return 'ia'
}

/**
 * La URL de la foto del medio, o `null` si la noticia no tiene foto real:
 * sin imagen, imagen de IA o tarjeta compuesta. Con `null` la portada sale
 * con el fondo de marca, como hasta hoy.
 */
export function fotoDelMedio(imageUrl: string | null | undefined): string | null {
  const origen = origenDeImagen(imageUrl)
  return origen === 'medio' || origen === 'externa' ? imageUrl! : null
}
