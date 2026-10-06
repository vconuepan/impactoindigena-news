/**
 * De donde viene la imagen que encabeza una historia.
 *
 * EL DEFECTO QUE ESTO CORRIGE (7-sep-2026): la pagina de historia rotulaba
 * «Ilustracion generada con IA» toda imagen alojada en nuestro bucket, con la
 * condicion `/\.r2\.dev\//` sobre la URL. Pero al bucket suben tres cosas
 * distintas, y dos de ellas nacen de la fotografia del medio citado. Medido en
 * la portada del 7-sep: de 154 imagenes, **112 llevaban un rotulo falso**.
 *
 * Aplicada a una foto de prensa, la etiqueta miente dos veces: le dice al lector
 * que un hecho real no lo es, y le quita la autoria al medio y a quien la tomo,
 * justo en el sitio que invoca el art. 71 B de la Ley 17.336 para citar. El
 * art. 71 B exige mencionar fuente, titulo y autor; rotular la foto ajena como
 * ilustracion propia va en la direccion contraria.
 *
 * COMO SE DISTINGUEN. El servidor bautiza cada objeto segun su origen, asi que
 * el nombre —no el dominio— es la señal:
 *
 * | Prefijo         | Quien la hizo                          | Donde se decide |
 * |-----------------|----------------------------------------|-----------------|
 * | `oghero-`       | el medio; se rehospeda tal cual        | `storyCard.ts` y `imageStorage.ts` |
 * | `storycard-`    | el medio, con nuestra marca encima     | `storyCard.ts` (fuente angosta) |
 * | `<uuid>-<ms>`   | nuestra generacion de imagenes         | `imageGen.ts` |
 *
 * Es logica duplicada entre el servidor que sube y el cliente que rotula, y por
 * eso `story-image.test.ts` lee el fuente del servidor y falla si los prefijos
 * dejan de coincidir. Sin esa red, renombrar un objeto en el servidor volveria
 * a poner el rotulo falso sin que nada avise.
 *
 * Lo correcto de fondo seria que la historia guardara su origen en la base en
 * vez de deducirlo del nombre. No se hizo porque exige migracion y backfill de
 * miles de filas; esto acierta hoy y en todo el historico.
 */

export type OrigenImagen =
  /** Generada por nosotros con IA. */
  | 'ia'
  /** Fotografia del medio citado, rehospedada sin alterar. */
  | 'medio'
  /** Tarjeta con nuestra marca, compuesta a partir de la imagen del medio. */
  | 'compuesta'
  /** Servida por el medio desde su propio dominio; no pasa por nuestro bucket. */
  | 'externa'

/** Nuestro bucket publico. Todo lo que sube el servidor vive bajo `/social/`. */
const BUCKET = /\.r2\.dev\//

/** El prefijo con que el servidor bautiza la imagen rehospedada del medio. */
export const PREFIJO_MEDIO = 'oghero-'

/** El prefijo de la tarjeta compuesta a partir de la imagen del medio. */
export const PREFIJO_COMPUESTA = 'storycard-'

/**
 * Clasifica la imagen de una historia. Devuelve `null` si no hay imagen, para
 * que quien llame distinga «no hay que rotular nada» de «no se pudo clasificar».
 */
export function origenDeImagen(imageUrl: string | null | undefined): OrigenImagen | null {
  if (!imageUrl) return null
  if (!BUCKET.test(imageUrl)) return 'externa'

  // El nombre del objeto, sin la ruta ni la cadena de consulta.
  const nombre = imageUrl.split('?')[0].split('#')[0].split('/').pop() ?? ''

  if (nombre.startsWith(PREFIJO_MEDIO)) return 'medio'
  if (nombre.startsWith(PREFIJO_COMPUESTA)) return 'compuesta'
  return 'ia'
}

/**
 * La clave i18n del rotulo que le corresponde a cada origen. `null` cuando no
 * hay nada que rotular.
 *
 * Las tres que devuelven texto llevan `{{publisher}}` salvo la de IA, que es la
 * unica imagen sin medio al que acreditar. Va aparte del JSX para que la
 * decision se pueda probar sin montar la pagina entera.
 */
export function claveDeRotulo(origen: OrigenImagen | null): string | null {
  switch (origen) {
    case 'ia':
      return 'storyPage.aiImage'
    case 'compuesta':
      return 'storyPage.composedImage'
    case 'medio':
    case 'externa':
      // La externa tambien es del medio: la unica diferencia es que no llego a
      // rehospedarse. Antes no llevaba rotulo alguno y por tanto tampoco
      // credito, aunque es justo el caso en que la foto sigue siendo suya.
      return 'storyPage.sourceImage'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Variantes web
// ---------------------------------------------------------------------------

/**
 * Anchos de las renditions que el servidor guarda junto a cada imagen
 * (`server/src/lib/imagen-variantes.ts`): `x.jpg` -> `x-w800.jpg`, `x-w1200.jpg`.
 *
 * EL DEFECTO QUE ESTO CORRIGE (PageSpeed movil, 6-oct-2026): las tarjetas
 * pedian el ORIGINAL de R2 -la tarjeta compuesta sale a 2400 px y pesa 300-500
 * KB- para pintarlo a 405 px. Veinte de esas en una pantalla de 412 px eran
 * 4,7 MB compitiendo con la imagen del hero; Lighthouse estimaba 2.326 KB de
 * ahorro. Con `srcset` el navegador elige la de 800 (tarjeta a 2x) o la de
 * 1200 (hero), y el original queda en `src` como respaldo.
 *
 * ES LOGICA DUPLICADA con el servidor, que no puede importar fuera de `src/`.
 * `story-image.test.ts` lee el archivo del servidor y falla si los anchos, el
 * sufijo o la extension dejan de coincidir.
 *
 * Las imagenes anteriores al 6-oct-2026 no tienen variantes hasta que corra
 * `migration:variantes-web`; quien pinte con `srcset` debe quitarlo si la
 * variante responde 404 y dejar que cargue `src`. Ver `CardImage`.
 */
export const ANCHOS_VARIANTE_WEB = [800, 1200] as const

/** Las extensiones que el pipeline sube. Lo que no calce no tiene variante. */
const EXTENSION = /\.(jpe?g|png|webp|gif)$/i

/** Un objeto de nuestro bucket: solo bajo `/social/` hay variantes. */
const OBJETO_DEL_BUCKET = /\.r2\.dev\/social\/[^/?#]+$/i

/** La URL de la variante de `ancho` px, o null si la imagen no es nuestra. */
export function varianteWeb(imageUrl: string, ancho: number): string | null {
  if (!OBJETO_DEL_BUCKET.test(imageUrl) || !EXTENSION.test(imageUrl)) return null
  return imageUrl.replace(EXTENSION, `-w${ancho}.jpg`)
}

/**
 * El `srcset` de una imagen nuestra: `...-w800.jpg 800w, ...-w1200.jpg 1200w`.
 * Null para una imagen externa o sin extension conocida: esa va solo en `src`.
 */
export function srcSetDeImagen(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  const partes: string[] = []
  for (const ancho of ANCHOS_VARIANTE_WEB) {
    const v = varianteWeb(imageUrl, ancho)
    if (!v) return null
    partes.push(`${v} ${ancho}w`)
  }
  return partes.join(', ')
}
