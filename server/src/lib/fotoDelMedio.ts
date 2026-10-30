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
 * POR QUÉ CASI NUNCA ES `oghero-` EN LAS NOTICIAS QUE VAN A INSTAGRAM. El job
 * de publicación (`jobs/publishStories.ts`) le pone a cada noticia UNA imagen
 * para el sitio: a las destacadas (relevancia ≥ `heroAiMinRelevance`, hoy 8)
 * una ilustración de IA, sin pedir siquiera la og:image; a las demás, la
 * og:image del medio, rehospedada tal cual si mide 1200 px o más y, si no,
 * fundida en la tarjeta compuesta. El job social elige por relevancia, así
 * que elige destacadas, y del 29 al 30-oct sus carruseles salieron sin foto
 * aunque el medio sí tenía una. Por eso `services/storyCarousel.ts`, cuando
 * esta tabla dice «no», va a buscar la og:image al artículo original.
 *
 * Es lógica duplicada con el cliente, que no puede importar fuera de su `src/`.
 * Los prefijos nacen en `storyCard.ts` e `imageStorage.ts`.
 */

/**
 * Ancho real mínimo de una foto que va a una lámina (1080 px de ancho). Es el
 * mismo tope con que `imageStorage.ts` descarta una foto del cuerpo al
 * rehospedarla; acá se aplica también a la de la portada, que puede llegar
 * en vivo desde el sitio del medio sin haber pasado por ese filtro.
 */
export const FOTO_ANCHO_MINIMO = 480

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
