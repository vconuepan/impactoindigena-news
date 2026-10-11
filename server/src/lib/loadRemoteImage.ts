import { loadImage, type Image } from '@napi-rs/canvas'
import { downloadExternalImage } from './imageStorage.js'

/**
 * Decodifica una imagen que vive en una URL, bajandola POR LA GUARDIA SSRF.
 *
 * `loadImage(url)` de @napi-rs/canvas pide la URL con `http.get`, sigue las
 * redirecciones por su cuenta y no valida el destino. El carrusel recibe la URL
 * de la imagen de la nota, que puede venir de la pagina de un tercero: una URL
 * hacia 169.254.x.x o hacia 127.0.0.1, o una que redirija hacia alli, la
 * pedia el servidor. `downloadExternalImage` revalida el DNS en cada salto,
 * exige que la respuesta sea una imagen y le pone tope al tamaño.
 *
 * Lanza si la guardia rechaza la URL o la descarga falla; quien llama ya cae a
 * un fondo de color en ese caso, igual que si la imagen no se pudiera decodificar.
 */
export async function loadRemoteImage(url: string): Promise<Image> {
  const descarga = await downloadExternalImage(url)
  if (!descarga) throw new Error(`No se pudo descargar la imagen: ${url}`)
  return loadImage(descarga.buffer)
}
